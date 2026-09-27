import { describe, expect, it, vi } from 'vitest';
import { pipeline, factsFromEvidence, protocolFor, parseJob, STEPS, verify } from '../src/index.js';
import { readable, type Evidence, type QueueRow } from '../src/pipeline.js';

// real layer responses, 2026-09-27: the queue (three devnet rows mislabelled 8453 + one BitAgent row), the BitAgent
// job's evidence pack, and the seller's pool quote
import queue from './fixtures/pipeline/queue.json' with { type: 'json' };
import ev7287 from './fixtures/pipeline/evidence-bitagent-7287.json' with { type: 'json' };
import quote from './fixtures/pipeline/quote-0x1112.json' with { type: 'json' };

const ans = (id: string, value: string, probabilities: Record<string, number>, confidence: number) => ({ id, kind: 'choice', schema_ok: true, value, confidence, probabilities });
const CLEAN = [ans('spec_met', 'yes', { yes: 0.93, no: 0.07 }, 0.86), ans('unsupported_claim', 'no', { yes: 0.04, no: 0.96 }, 0.92), ans('ending', 'complete', { complete: 0.9, reject: 0.03, expire: 0, needs_review: 0.07 }, 0.83), ans('cheat_shaped', 'no', { yes: 0.02, no: 0.98 }, 0.96)];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

/** A fake layer + trial: routes by URL, records every request. */
function layer(over: Record<string, (init?: RequestInit) => Response> = {}) {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    for (const [k, h] of Object.entries(over)) if (url.includes(k)) return h(init);
    if (url.includes('/v1/judge/queue')) return json(queue);
    if (url.includes('/v1/judge/evidence/8453/bitagent%3A8453%3A7287')) return json(ev7287);
    if (url.includes('/v1/pools/quote')) return json(quote);
    if (url.includes('api.typesafe.ai/v1/systemone')) return json({ model: 'jev-1.13.0', answers: Object.fromEntries(CLEAN.map((a) => [a.id, { choice: a.value, confidence: a.confidence, probabilities: a.probabilities }])) });
    return json({ ok: false, error: `unrouted ${url}` }, 404);
  });
  return { f: f as unknown as typeof fetch, seen };
}

describe('pipeline() on the coordination layer', () => {
  it('runs all eight steps on the first READABLE queue row, skipping the mislabelled devnet rows', async () => {
    const { f, seen } = layer();
    const t = await pipeline({ fetch: f, key: 'apikey_x' });
    expect(t.steps.map((s) => s.id)).toEqual(STEPS.map((s) => s.id));
    expect(t.steps.filter((s) => !s.ok)).toEqual([]);
    expect(t.job).toEqual({ chainId: 8453, jobId: 'bitagent:8453:7287', seller: '0x1112889be806840a66419ea1e8d4dd21852993e5' });
    expect(t.receipt!.verdict).toBe('complete');
    expect(t.recorded!.calls.map((c) => c.fn)).toEqual(['JevAnswerLog.record', 'JevDecisionLog.record']);
    expect(t.quote!.premium_ratio).toBe(0.39033428790216534);            // 0 incorrect of 6 settled: Wilson-high = z²/(n+z²)
    expect(t.verification!.ok).toBe(true);
    // no relayer key: nothing was written to the layer
    expect(seen.some((s) => s.url.includes('/v1/judge/answers/record'))).toBe(false);
    // the quote asked for the job's own budget on Base
    const q = seen.find((s) => s.url.includes('/v1/pools/quote'))!;
    expect(JSON.parse(String(q.init!.body))).toEqual({ seller: '0x1112889be806840a66419ea1e8d4dd21852993e5', price_usdc: 1.5, chainId: 8453 });
  });

  it('with a relayer key, POSTs the jev.answer.v1 record to /v1/judge/answers/record with X-API-Key', async () => {
    const { f, seen } = layer({ '/v1/judge/answers/record': () => json({ ok: true, digest: '0xabc', anchor: { status: 'queued' } }) });
    const t = await pipeline({ fetch: f, key: 'apikey_x', job: '8453:bitagent:8453:7287', relayerKey: 'test-key' });
    const post = seen.find((s) => s.url.endsWith('/v1/judge/answers/record'))!;
    expect((post.init!.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect(JSON.parse(String(post.init!.body)).v ?? JSON.parse(String(post.init!.body)).use_case).toBeTruthy();
    expect(t.layerRecord).toMatchObject({ digest: '0xabc' });
  });

  it('a before() gate that says no skips the step and the rest still runs', async () => {
    const { f, seen } = layer();
    const t = await pipeline({ fetch: f, key: 'apikey_x', job: '8453:bitagent:8453:7287', before: (s) => s.id !== 'premium' });
    expect(t.steps.find((s) => s.id === 'premium')!.skipped).toMatch(/gate/);
    expect(seen.some((s) => s.url.includes('/v1/pools/quote'))).toBe(false);
    expect(t.verification!.ok).toBe(true);
  });

  it('saying no to a REQUIRED step stops the run cleanly (no crash in the steps that need it)', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const t = await pipeline({ layer: false, fetch: f, evidence: { subject: 'x', state: 's' }, before: (s) => s.id !== 'facts' });
    expect(t.steps.map((s) => s.id)).toEqual(['pick', 'evidence', 'facts']);
    expect(t.steps[2]).toMatchObject({ stopped: true });
    expect(t.receipt).toBeNull();
  });

  it('stops at the failing step and says why', async () => {
    const { f } = layer({ '/v1/judge/evidence': () => json({ ok: false, error: 'a decimal id on 8453' }, 400) });
    const t = await pipeline({ fetch: f, job: '8453:0xdead' });
    expect(t.steps.map((s) => [s.id, s.ok])).toEqual([['pick', true], ['evidence', false]]);
    expect(t.steps[1]!.error).toMatch(/400 a decimal id on 8453/);
    expect(t.receipt).toBeNull();
  });
});

describe('pipeline() independent of the layer', () => {
  it('your own pack + your answers: no request at all, receipt verifies, calls ready, premium skipped', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const t = await pipeline({ layer: false, fetch: f, evidence: { subject: 'my-protocol:job-7', state: 'task: summarise X\ndelivered: a summary of X', checks: { schema_ok: true } }, answers: CLEAN.map(({ id, value, confidence, probabilities }) => ({ id, value, confidence, probabilities })) });
    expect(f).not.toHaveBeenCalled();
    expect(t.receipt!.verdict).toBe('complete');
    expect(t.steps.find((s) => s.id === 'premium')!.skipped).toMatch(/independent/);
    expect(t.recorded!.status).toBe('ready');
    expect((await verify(t.receipt!, { chain: false })).ok).toBe(true);
  });

  it('a failed check is a hard reject: Jev is never asked and there is nothing to record', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const t = await pipeline({ layer: false, fetch: f, key: 'apikey_x', evidence: { subject: 'x', state: 'task: hash it', checks: { digest_recomputes: false } } });
    expect(f).not.toHaveBeenCalled();
    expect(t.receipt!.verdict).toBe('reject');
    expect(t.steps.find((s) => s.id === 'record')!.skipped).toMatch(/nothing to record/);
  });

  it('refuses independent mode without a pack', async () => {
    await expect(pipeline({ layer: false })).rejects.toThrow(/needs `evidence`/);
  });
});

describe('pipeline() bound to a tenant (the Moonbeam shape)', () => {
  it('subject + caller: the receipt is about (Base, the hook, the job) and names the tenant', async () => {
    const hook = '0xc0578657Eda85e0a246771aa1839ce79b54eE80d'; const jobId = '0x' + 'ab'.repeat(32);
    const t = await pipeline({ layer: false, evidence: { subject: jobId, state: 'task: x\ndelivered: x' }, answers: CLEAN.map(({ id, value, confidence, probabilities }) => ({ id, value, confidence, probabilities })),
      subject: (j) => ({ chainId: 8453, at: hook, ref: j.jobId }), caller: 'moonbeam', protocol: 'assurance-hook' });
    expect(t.receipt!.answersRecord!.caller).toBe('moonbeam');
    const plain = await pipeline({ layer: false, evidence: { subject: jobId, state: 'task: x\ndelivered: x' }, answers: CLEAN.map(({ id, value, confidence, probabilities }) => ({ id, value, confidence, probabilities })) });
    expect(t.receipt!.subjectId).not.toBe(plain.receipt!.subjectId);   // the hook is part of the subject
  });
});

describe('no key, no Jev', () => {
  it('without a key or answers the grade step fails and says where to get a key; nothing else is called', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const t = await pipeline({ layer: false, fetch: f, evidence: { subject: 'x', state: 'task: y' } });
    expect(f).not.toHaveBeenCalled();
    expect(t.steps.at(-1)).toMatchObject({ id: 'grade', ok: false });
    expect(t.steps.at(-1)!.error).toMatch(/TYPESAFE_KEY/);
  });
});

describe('the pieces', () => {
  it('factsFromEvidence reads delivery, deadline and the USDC price from a real pack', () => {
    expect(factsFromEvidence(ev7287 as unknown as Evidence)).toEqual({ delivered: true, checks: { submitted_before_deadline: true }, priceUsdc: 1.5 });
  });
  it('readable() drops the queue rows whose evidence URL the layer itself refuses', () => {
    expect((queue.rows as QueueRow[]).map(readable)).toEqual([false, false, false, true]);
  });
  it('protocolFor / parseJob', () => {
    expect(protocolFor('bitagent:8453:7287')).toEqual({ protocol: 'bitagent-erc8183', id: '7287' });
    expect(protocolFor('81100')).toEqual({ protocol: 'virtuals-erc8183', id: '81100' });
    expect(protocolFor('memo-9')).toBeNull();
    expect(parseJob('8453:bitagent:8453:7287')).toEqual({ chainId: 8453, jobId: 'bitagent:8453:7287' });
    expect(parseJob('81100')).toEqual({ chainId: 8453, jobId: '81100' });
  });
});
