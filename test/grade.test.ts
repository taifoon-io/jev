import { describe, expect, it, vi } from 'vitest';
import { facts, grade, record, verify, evaluatorCall, RUBRIC_v1 } from '../src/index.js';
import { encodeCall } from '../src/abi.js';
import { ANSWER_LOG_RECORD } from '../src/record.js';
import { keccakHex } from '../src/hash.js';

import d88 from './fixtures/decision-exec88-1790493351706-abea2dbbfd.json' with { type: 'json' };
import logs86 from './fixtures/getlogs-answers-exec86.json' with { type: 'json' };
import decided86 from './fixtures/getlogs-decided-exec86.json' with { type: 'json' };
type Mock = ReturnType<typeof vi.fn> & { mock: { calls: Array<[string, RequestInit]> } };
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
  it('asks the four RUBRIC_v1 questions once with your key, composes complete, and the receipt verifies offline', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: Object.fromEntries(CLEAN.map((a) => [a.id, { choice: a.value, confidence: a.confidence, probabilities: a.probabilities }])) }), { status: 200 })) as unknown as Mock;
    const r = await grade({ subject: 'job-1', evidence: { task: 'return 2+2', delivered: '4' }, key: 'apikey_x', fetch: f as never, at: 1 });
    expect(f).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(f.mock.calls[0]![1]!.body));
    expect(f.mock.calls[0]![0]).toBe('https://api.typesafe.ai/v1/systemone');
    expect(Object.keys(sent.questions)).toEqual(RUBRIC_v1.asked.map((q) => q.id));
    expect(sent.state).toBe(r.input);
    expect(r.verdict).toBe('complete');
    expect(r.model).toBe('jev-1.13.0');
    expect(r.answers!.ending!.probabilities).toEqual({ complete: 0.9, reject: 0.03, expire: 0, needs_review: 0.07 });
    expect(r.not_asked).toEqual(['scope_ok', 'severity']);
    expect(r.answersRecord!.credential_path).toBe('caller-credential');
    expect(r.via).toMatchObject({ connection: 'key', trial: null });
    const v = await verify(r, { chain: false });
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
    const tampered = { ...r, verdict: 'reject' as const };
    expect((await verify(tampered, { chain: false })).checks.verdict).toBe(false);
  });
  it('a failed deterministic check is final: reject, Jev never asked, nothing to record', async () => {
    const f = vi.fn();
    const r = await grade({ subject: 'job-3', evidence: 'x', key: 'apikey_x', fetch: f as never, facts: facts({ delivered: true, checks: { proof_verifies: false, amount: true } }) });
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
  it('a custom rubric composes with its own rule', async () => {
    const r = await grade({ subject: 's', evidence: 'x', rubric: { version: 'MY_v1', questions: [{ id: 'ok', text: 'Is it ok?', options: ['yes', 'no'] }], compose: (_f, a) => ({ verdict: a?.ok?.value === 'yes' ? 'complete' : 'reject', auto: true, forced: null, reasons: ['mine'], scores: { spec_met: null, unsupported_claim: null, scope_ok: null, cheat_shaped: null, ending: null, severity: null } }) },
      answers: [{ id: 'ok', value: 'yes', confidence: 0.9, probabilities: { yes: 0.9, no: 0.1 } }] });
    expect(r.rubric).toBe('MY_v1');
    expect(r.verdict).toBe('complete');
  });
});

// _FREE_GRADES_v1_: no TypeSafe key of the caller's own → the caller's free grades on the coordination layer
describe('grade() without a key: the free grades on the layer', () => {
  const layerAnswer = (status = 200, left = 2) => vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(status === 200
    ? { ok: true, judge_called: true, model: 'jev-1.13.0', receipt: { answers: Object.fromEntries(CLEAN.map((a) => [a.id, a])) }, quota: { grades: { free: 3, left } } }
    : { ok: false, code: 'payment_required', error: 'one Jev grade is 0.05 USDC with x402' }), { status })) as unknown as Mock;

  it('claims a free grade: POST /v1/judge/compose with the evidence, the answers composed here, the receipt says trial and what is left', async () => {
    const f = layerAnswer();
    const r = await grade({ subject: 's', evidence: 'task: reply yes. reply: yes', fetch: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://coord.taifoon.dev/v1/judge/compose');
    expect(JSON.parse(String(init.body)).state).toContain('reply: yes');
    expect((init.headers as Record<string, string>)['x-taifoon-client']).toBe('@taifoon/jev');
    expect((init.headers as Record<string, string>)['x-api-key']).toBeUndefined();
    expect(r.verdict).toBe('complete');
    expect(r.model).toBe('jev-1.13.0');
    expect(r.via).toMatchObject({ connection: 'trial', trial: { calls: 3, left: 2 } });
  });

  it('the same answers compose to the same decision as answers supplied by hand (one rubric, one receipt shape)', async () => {
    const free = await grade({ subject: 's', evidence: 'x', at: 1, fetch: layerAnswer() as unknown as typeof fetch });
    const supplied = await grade({ subject: 's', evidence: 'x', at: 1, answers: CLEAN.map((a) => ({ ...a, value: String(a.value) })), model: 'jev-1.13.0' });
    expect(free.decision!.digest).toBe(supplied.decision!.digest);
  });

  it('past the free grades: a 402 that names the three ways on', async () => {
    await expect(grade({ subject: 's', evidence: 'x', fetch: layerAnswer(402) as unknown as typeof fetch })).rejects.toMatchObject({ status: 402, message: expect.stringMatching(/TypeSafe key.*Taifoon key.*x402/) });
  });

  it('a Taifoon key pays past the free grades (sent as x-api-key); a layer URL can be named', async () => {
    const f = layerAnswer();
    await grade({ subject: 's', evidence: 'x', layerKey: 'tfr_test', layer: 'https://layer.example', fetch: f as unknown as typeof fetch });
    expect(f.mock.calls[0]![0]).toBe('https://layer.example/v1/judge/compose');
    expect((f.mock.calls[0]![1].headers as Record<string, string>)['x-api-key']).toBe('tfr_test');
  });

  it('with a TypeSafe key the layer is never called; with layer:false and no key there is no grade', async () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('typesafe') ? { model: 'jev-1.13.0', answers: Object.fromEntries(CLEAN.map((a) => [a.id, a])) } : {}), { status: 200 })) as unknown as Mock;
    await grade({ subject: 's', evidence: 'x', key: 'ts_key', fetch: f as unknown as typeof fetch });
    expect(f.mock.calls.every(([u]) => u.startsWith('https://api.typesafe.ai'))).toBe(true);
    await expect(grade({ subject: 's', evidence: 'x', layer: false })).rejects.toThrow(/TypeSafe key/);
  });

  it('a rubric that asks other questions than the layer answers needs a key of the caller', async () => {
    const f = layerAnswer();
    await expect(grade({ subject: 's', evidence: 'x', fetch: f as unknown as typeof fetch, rubric: { version: 'MY_v1', questions: [{ id: 'ok', text: 'Is it ok?', options: ['yes', 'no'] }] } })).rejects.toThrow(/also asks ok: pass \{ key \}/);
    expect(f).not.toHaveBeenCalled();
  });

  it('a hard fail is still decided by the facts alone (the layer is not called)', async () => {
    const f = layerAnswer();
    const r = await grade({ subject: 's', evidence: 'x', facts: facts({ delivered: false }), fetch: f as unknown as typeof fetch });
    expect(r.verdict).toBe('reject');
    expect(f).not.toHaveBeenCalled();
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
