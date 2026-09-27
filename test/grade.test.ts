import { describe, expect, it, vi } from 'vitest';
import { facts, grade, record, verify, evaluatorCall, RUBRIC_v1 } from '../src/index.js';
import { encodeCall } from '../src/abi.js';
import { ANSWER_LOG_RECORD } from '../src/record.js';
import { keccakHex } from '../src/hash.js';

import d88 from './fixtures/decision-exec88-1790493351706-abea2dbbfd.json' with { type: 'json' };
import logs86 from './fixtures/getlogs-answers-exec86.json' with { type: 'json' };
import decided86 from './fixtures/getlogs-decided-exec86.json' with { type: 'json' };
type Mock = ReturnType<typeof vi.fn> & { mock: { calls: Array<[string, RequestInit]> } };
const reply = (answers: Array<Record<string, unknown>>) => new Response(JSON.stringify({ ok: true, model: 'jev', upstreamModel: 'jev-1.13.0', answers, latency_ms: 812, trial: { calls: 3, used: 1, left: 2 } }), { status: 200 });
const ans = (id: string, value: string, probabilities: Record<string, number>, confidence: number) => ({ id, kind: 'choice', schema_ok: true, value, confidence, probabilities });
const CLEAN = [ans('spec_met', 'yes', { yes: 0.93, no: 0.07 }, 0.86), ans('unsupported_claim', 'no', { yes: 0.04, no: 0.96 }, 0.92), ans('ending', 'complete', { complete: 0.9, reject: 0.03, expire: 0, needs_review: 0.07 }, 0.83), ans('cheat_shaped', 'no', { yes: 0.02, no: 0.98 }, 0.96)];

describe('grade()', () => {
  it('the golden run: execution 88 re-derives through grade() — same decision digest as on chain, needs_review', async () => {
    const d = (d88 as unknown as { decision: { input: string; subject: { ref: string; label: string }; answers: never; model: string; input_digest: string; subject_id: string; digest: string; confidence_bps: number } }).decision;
    const input: string = d.input; const k = input.indexOf('\n\nfacts code established');
    const det = /- (proof\.verify\.v5) \(code read the whole reply, not the excerpt\): (.*)\n/.exec(input)!;
    const r = await grade({ subject: { chainId: 36927, ref: d.subject.ref, label: d.subject.label }, evidence: input.slice(0, k),
      facts: facts({ delivered: true, checks: { reply_held: true, inclusion: () => true }, det: { class: det[1]!, why: det[2]! } }), answers: d.answers, model: d.model });
    expect(r.inputDigest).toBe(d.input_digest);
    expect(r.subjectId).toBe(d.subject_id);
    expect(r.decision!.digest).toBe(d.digest);
    expect(r.decision!.confidenceBps).toBe(d.confidence_bps);
    expect(r.verdict).toBe('needs_review');
    expect(evaluatorCall('virtuals-erc8183', 1, r, r)).toBeNull();
  });
  it('trial: asks the four RUBRIC_v1 questions once, composes complete, and the receipt verifies offline', async () => {
    const f = vi.fn(async () => reply(CLEAN)) as unknown as Mock;
    const r = await grade({ subject: 'job-1', evidence: { task: 'return 2+2', delivered: '4' }, trial: true, fetch: f as never, at: 1 });
    expect(f).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(f.mock.calls[0]![1]!.body));
    expect(f.mock.calls[0]![0]).toBe('https://typesafe.taifoon.dev/v1/trial');
    expect(sent.questions.map((q: { id: string }) => q.id)).toEqual(RUBRIC_v1.asked.map((q) => q.id));
    expect(sent.state).toBe(r.input);
    expect(r.verdict).toBe('complete');
    expect(r.model).toBe('jev-1.13.0');
    expect(r.answers!.ending!.probabilities).toEqual({ complete: 0.9, reject: 0.03, expire: 0, needs_review: 0.07 });
    expect(r.not_asked).toEqual(['scope_ok', 'severity']);
    expect(r.answersRecord!.credential_path).toBe('trial');
    expect(r.via).toEqual({ connection: 'trial', latency_ms: 812, trial: { calls: 3, left: 2 } });
    const v = await verify(r, { chain: false });
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
    const tampered = { ...r, verdict: 'reject' as const };
    expect((await verify(tampered, { chain: false })).checks.verdict).toBe(false);
  });
  it('key: goes to api.typesafe.ai with the caller’s key and the TypeSafe question schema', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: Object.fromEntries(CLEAN.map((a) => [a.id, { choice: a.value, confidence: a.confidence, probabilities: a.probabilities }])) }), { status: 200 })) as unknown as Mock;
    const r = await grade({ subject: 'job-2', evidence: 'x', key: 'apikey_test', fetch: f as never });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer apikey_test');
    expect(JSON.parse(String(init!.body)).questions.ending).toEqual({ type: 'choice', instructions: RUBRIC_v1.asked[2]!.text, criteria: { complete: 'complete', reject: 'reject', expire: 'expire', needs_review: 'needs_review' } });
    expect(JSON.parse(String(init!.body)).model).toBe('jev-1.13.0');   // pinned: never the moving jev-latest alias
    expect(r.answersRecord!.credential_path).toBe('caller-credential');
    expect(JSON.stringify(r)).not.toContain('apikey_test');
  });
  it('a failed deterministic check is final: reject, Jev never asked, nothing to record', async () => {
    const f = vi.fn();
    const r = await grade({ subject: 'job-3', evidence: 'x', trial: true, fetch: f as never, facts: facts({ delivered: true, checks: { proof_verifies: false, amount: true } }) });
    expect(f).not.toHaveBeenCalled();
    expect(r).toMatchObject({ verdict: 'reject', forced: 'hard_fail', decision: null });
    await expect(record(r)).rejects.toThrow(/hard fail/);
    expect(evaluatorCall('virtuals-erc8183', 7, r.verdict, '0x' + '1'.repeat(64) as `0x${string}`)!.fn).toBe('reject(uint256,bytes32,bytes)');
  });
  it('a check that throws counts as "could not be checked"; above the price cap complete is held', async () => {
    const fa = await facts({ delivered: true, checks: { a: () => { throw new Error('rpc down'); } }, priceUsdc: 80 });
    expect(fa).toEqual({ delivered: true, checksOk: null, checks: { a: null }, priceUsdc: 80 });
    const r = await grade({ subject: 'job-4', evidence: 'x', facts: fa, answers: CLEAN.map((a) => ({ ...a, value: String(a.value) })), model: 'jev-1.13.0' });
    expect(r.verdict).toBe('needs_review');
    expect(r.reasons.at(-1)).toMatch(/above the auto-complete cap/);
  });
  it('the trial’s 4,000-character limit: the evidence is cut, never the facts section', async () => {
    const f = vi.fn(async () => reply(CLEAN));
    const r = await grade({ subject: 'job-5', evidence: 'é\n"'.repeat(3000), trial: true, fetch: f as never, facts: facts({ delivered: true, checks: { ok: true } }) });
    expect(JSON.stringify(r.input).length).toBeLessThanOrEqual(4000);
    expect(r.input).toContain('- ok: passed');
  });
  it('asks nothing without a key or trial; a custom rubric composes with its own rule', async () => {
    await expect(grade({ subject: 's', evidence: 'x' })).rejects.toThrow(/key.*trial/);
    const r = await grade({ subject: 's', evidence: 'x', rubric: { version: 'MY_v1', questions: [{ id: 'ok', text: 'Is it ok?', options: ['yes', 'no'] }], compose: (_f, a) => ({ verdict: a?.ok?.value === 'yes' ? 'complete' : 'reject', auto: true, forced: null, reasons: ['mine'], scores: { spec_met: null, unsupported_claim: null, scope_ok: null, cheat_shaped: null, ending: null, severity: null } }) },
      answers: [{ id: 'ok', value: 'yes', confidence: 0.9, probabilities: { yes: 0.9, no: 0.1 } }] });
    expect(r.rubric).toBe('MY_v1');
    expect(r.verdict).toBe('complete');
  });
});

describe('record()', () => {
  it('devnet: two ready calls to the two logs; send() sends them in order', async () => {
    const r = await grade({ subject: { chainId: 8453, ref: '0x' + '5b'.repeat(32) }, evidence: 'x', answers: CLEAN.map((a) => ({ ...a, value: String(a.value) })), model: 'jev-1.13.0', at: 1 });
    const sent: string[] = [];
    const out = await record(r, { send: async (c) => { sent.push(c.fn); return '0x' + String(sent.length).repeat(64); } });
    expect(out.status).toBe('sent');
    expect(sent).toEqual(['JevAnswerLog.record', 'JevDecisionLog.record']);
    expect(out.calls[0]!.to).toBe('0xD8c1d8188Fc8EE388792f6EB3B3dbd4f341Ba8e3');
    expect(out.calls[1]!.to).toBe('0x1D622511862DD7DEffB8fEeBc225E0FAdA1e9A05');
    expect(r.answersRecord!.use_case).toBe('compose.answers');
    expect(out.calls[0]!.data).toBe(encodeCall(ANSWER_LOG_RECORD, [keccakHex('compose.answers'), r.subjectId, r.inputDigest, r.answersDigest!, r.decision!.digest, 'jev-1.13.0', `urn:jev:answers:${r.answersDigest}`]));
    expect(keccakHex('compose.answers')).toBe('0xcd6a31d63f65b0332f996a3d27a906aaacec242f09275c40175debae88ecab84'); // the useCase topic of tx 0x9a38cf55…
  });
  it('network is a flag: none · base (the Base logs since 0.1.1) · both', async () => {
    const r = await grade({ subject: 'b', evidence: 'x', answers: CLEAN.map((a) => ({ ...a, value: String(a.value) })) });
    expect(await record(r, { network: 'none' })).toMatchObject({ status: 'none', calls: [] });
    const base = await record(r, { network: 'base' });
    expect(base.status).toBe('ready');
    expect(base.calls.map((c) => `${c.chainId}:${c.to}`)).toEqual(['8453:0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d', '8453:0x209490d6A0FFC5368A42b0c2208BDCda853f6a92']);
    const both = await record(r, { network: 'both' });
    expect(both.calls.map((c) => `${c.chainId}:${c.fn}`)).toEqual(['36927:JevAnswerLog.record', '36927:JevDecisionLog.record', '8453:JevAnswerLog.record', '8453:JevDecisionLog.record']);
    expect(both.calls[0]!.data).toBe(both.calls[2]!.data);
    const send = vi.fn(async () => '0xtx');
    const sent = await record(r, { network: 'both', send });
    expect(send).toHaveBeenCalledTimes(4);
    expect(sent.status).toBe('sent');
  });
});

describe('verify()', () => {
  it('on Base the answer row is found through recordedAt, then that one block', async () => {
    const digest = '0x6c7e6d2977689f1c9639a377b165f998d1160cc30eca8ff4f1fedc793db2f52d';
    type RpcBody = { method: string; params: Array<{ to?: string; data?: string; address?: string; fromBlock?: string; toBlock?: string }> };
    const calls: RpcBody[] = [];
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as RpcBody; calls.push(b);
      if (b.method === 'eth_call') return new Response(JSON.stringify({ result: '0x' + (51_900_000).toString(16).padStart(64, '0') }));
      if (b.method === 'eth_blockNumber') return new Response(JSON.stringify({ result: '0x' + (51_900_010).toString(16) }));
      return new Response(JSON.stringify({ result: [] }));
    });
    const v = await verify(digest, { fetch: f as never, network: 'base' });
    expect(v.onChain.chainId).toBe(8453);
    expect(calls[0]!.params[0]!.to).toBe('0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d');
    expect(calls[0]!.params[0]!.data).toBe('0x' + keccakHex('recordedAt(bytes32)').slice(2, 10) + digest.slice(2));
    expect(calls[1]!.params[0]!).toMatchObject({ address: '0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d', fromBlock: '0x' + (51_900_000).toString(16), toBlock: '0x' + (51_900_000).toString(16) });
  });
  it('a bare answers digest finds its JevAnswered log (execution 86, tx 0x9a38cf55…)', async () => {
    const f = vi.fn(async (...args: unknown[]) => new Response(JSON.stringify(String((args[1] as RequestInit | undefined)?.body).includes('0x1D622511862DD7DEffB8fEeBc225E0FAdA1e9A05') ? decided86 : logs86)));
    const v = await verify('0x6c7e6d2977689f1c9639a377b165f998d1160cc30eca8ff4f1fedc793db2f52d', { fetch: f as never });
    expect(v.ok).toBe(true);
    expect(v.onChain.answers[0]).toMatchObject({ tx: '0x9a38cf5541bb82a8a6e2e5cf1a96ed25fdc46921c351506da83023f5dec1a61b', trusted: true, decisionDigest: '0x781b0fce9c3438c5f720ac53c82897de8da1c7f0dee9ddd4dde7a422cb693667', model: 'jev-1.13.0' });
    expect(v.onChain.answers[0]!.recorder.toLowerCase()).toBe('0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc');
    expect(v.checks.decisionOnChain).toBe(true);
    expect(v.onChain.decisions[0]).toMatchObject({ tx: '0x687ba9d73d5789a2df9d9d09e94b6ed005447d7f5ece97f9226ea0d51f514ee4', index: 0, confidenceBps: 2700 });
  });
});
