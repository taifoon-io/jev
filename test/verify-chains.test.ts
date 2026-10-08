// verify() on every chain with Jev logs, offline: a fake warmbed and a fake chain stand in. Plus one live devnet read
// (the execution 86 answer row on chain 36927; set JEV_OFFLINE=1 to skip it). Nothing here reads a mainnet.
import { beforeEach, describe, expect, it } from 'vitest';
import { CHAIN_NAMES, JEV_CHAINS, chainIdOf, jevLogsOn } from '../src/chains.js';
import { JevChainError } from '../src/errors.js';
import { clearRpcCache, rpcCall } from '../src/rpc.js';
import { RPC_FALLBACK } from '../src/rpc-fallback.js';
import { verify } from '../src/verify.js';
import logs86 from './fixtures/getlogs-answers-exec86.json' with { type: 'json' };
import decided86 from './fixtures/getlogs-decided-exec86.json' with { type: 'json' };

const DIGEST = '0x6c7e6d2977689f1c9639a377b165f998d1160cc30eca8ff4f1fedc793db2f52d';
type Body = { method: string; params: Array<{ to?: string; address?: string; fromBlock?: string; toBlock?: string }> };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

/** A fake warmbed (rotation = the given urls) and a fake chain holding the execution 86 rows at their blocks. */
function world(chainId: number, urls: Record<string, 'ok' | 429 | 503 | 'revert' | 'down'>, opts: { recorded?: boolean } = {}) {
  // the execution 86 rows, moved to blocks just after this chain's deploy block
  const at = jevLogsOn(chainId)?.answerLog.fromBlock ?? 1_000_000; const ANSWER_BLOCK = at + 10;
  const moved = (fx: unknown, b: number) => ({ ...(fx as object), result: (fx as { result: object[] }).result.map((l) => ({ ...l, blockNumber: '0x' + b.toString(16) })) });
  const seen: Array<{ url: string; body?: Body }> = [];
  const f = (async (u: string, init?: RequestInit) => {
    if (u.includes('/warmbed/chain/')) { seen.push({ url: u }); return json(Object.keys(urls).map((url) => ({ url, logs_span_ok: 2000 }))); }
    const body = JSON.parse(String(init?.body)) as Body; seen.push({ url: u, body });
    const mode = urls[u];
    if (mode === 'down') throw new TypeError('fetch failed');
    if (mode === 429 || mode === 503) return json({}, mode);
    if (mode === 'revert') return json({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } });
    const logsAt = jevLogsOn(chainId)!;
    if (body.method === 'eth_blockNumber') return json({ result: '0x' + (ANSWER_BLOCK + 100).toString(16) });
    if (body.method === 'eth_call') return json({ result: '0x' + (opts.recorded === false ? 0 : ANSWER_BLOCK).toString(16).padStart(64, '0') });
    const p = body.params[0]!;
    if (opts.recorded === false) return json({ result: [] });
    if (p.address === logsAt.decisionLog.address) return json(moved(decided86, ANSWER_BLOCK - 1));
    return json(moved(logs86, ANSWER_BLOCK));
  }) as unknown as typeof fetch;
  return { f, seen };
}

describe('chains', () => {
  it('names and ids resolve; an unknown name is a bad_input error', () => {
    expect(chainIdOf('base')).toBe(8453);
    expect(chainIdOf('Arbitrum One')).toBe(42161);
    expect(chainIdOf('monad')).toBe(143);
    expect(chainIdOf('5042')).toBe(5042);
    expect(chainIdOf(36927)).toBe(36927);
    expect(() => chainIdOf('nowhere')).toThrow(JevChainError);
  });
  it('the devnet comes first, then Base; every Jev chain has an RPC fallback', () => {
    expect(JEV_CHAINS.slice(0, 2)).toEqual([36927, 8453]);
    for (const c of JEV_CHAINS) expect(RPC_FALLBACK[c]?.call.length, String(c)).toBeGreaterThan(0);
    for (const c of [4663, 3692781]) expect(RPC_FALLBACK[c]?.call.length, String(c)).toBeGreaterThan(0);
  });
});

describe('verify() on each chain with Jev logs', () => {
  beforeEach(() => clearRpcCache());
  for (const chainId of JEV_CHAINS) {
    it(`${CHAIN_NAMES[chainId] ?? chainId}: reads its own logs through warmbed's rotation, recorded`, async () => {
      const { f, seen } = world(chainId, { [`https://rpc.test/${chainId}`]: 'ok' });
      const v = await verify(DIGEST, { network: chainId, fetch: f });
      expect(v.onChain.chainId).toBe(chainId);
      expect(v.onChain.status).toBe('recorded');
      expect(v.checks.answersOnChain).toBe(true);
      expect(v.checks.decisionOnChain).toBe(true);
      expect(seen[0]!.url).toContain(`/warmbed/chain/${chainId}/rotation`);
      const logs = jevLogsOn(chainId)!;
      const first = seen.find((s) => s.body)!.body!;
      if (chainId === 36927) expect(first.params[0]!.address).toBe(logs.answerLog.address); // the devnet: one range read
      else { expect(first.method).toBe('eth_call'); expect(first.params[0]!.to).toBe(logs.answerLog.address); } // recordedAt first
    });
  }
  it('not recorded: the chain answered and holds no row', async () => {
    const { f } = world(42161, { 'https://rpc.test/a': 'ok' }, { recorded: false });
    const v = await verify(DIGEST, { network: 'arbitrum', fetch: f });
    expect(v.onChain.status).toBe('not_recorded');
    expect(v.problems).toEqual(['not recorded on Arbitrum One (42161)']);
    expect(v.ok).toBe(false);
  });
  it('a chain without Jev logs: not_deployed, and nothing is read', async () => {
    const { f, seen } = world(4663, {});
    const v = await verify(DIGEST, { network: 'robinhood', fetch: f });
    expect(v.onChain.status).toBe('not_deployed');
    expect(seen).toEqual([]);
  });
  it('429, 5xx and a dead endpoint move to the next; the read still lands', async () => {
    const { f, seen } = world(8453, { 'https://r429': 429, 'https://r503': 503, 'https://down': 'down', 'https://ok': 'ok' });
    const v = await verify(DIGEST, { network: 'base', fetch: f });
    expect(v.onChain.status).toBe('recorded');
    expect(seen.filter((s) => s.body).slice(0, 4).map((s) => s.url)).toEqual(['https://r429', 'https://r503', 'https://down', 'https://ok']);
  });
  it('every endpoint failing is rpc_unavailable, not "not recorded"', async () => {
    const { f } = world(8453, { 'https://r429': 429 });
    const v = await verify(DIGEST, { network: 'base', fetch: f, rpc: 'https://r429' });
    expect(v.onChain.status).toBe('rpc_unavailable');
    expect(v.problems[0]).toMatch(/^RPC unavailable on Base \(8453\)/);
  });
  it('--rpc (a comma list) replaces the rotation: warmbed is not asked', async () => {
    const { f, seen } = world(5042, { 'https://mine-a': 503, 'https://mine-b': 'ok' });
    const v = await verify(DIGEST, { network: 'arc', fetch: f, rpc: 'https://mine-a,https://mine-b' });
    expect(v.onChain.status).toBe('recorded');
    expect(seen.some((s) => s.url.includes('/warmbed/'))).toBe(false);
  });
  it('a revert is thrown at once, never retried on the next endpoint', async () => {
    const { f, seen } = world(8453, { 'https://rev': 'revert', 'https://ok': 'ok' });
    await expect(rpcCall(['https://rev', 'https://ok'], f, 'eth_call', [{}])).rejects.toMatchObject({ code: 'reverted' });
    expect(seen.map((s) => s.url)).toEqual(['https://rev']);
  });
  it('warmbed down: the static list carries the read', async () => {
    const calls: string[] = [];
    const f = (async (u: string) => { calls.push(u); if (u.includes('/warmbed/')) throw new TypeError('fetch failed'); return json({ result: '0x' + '0'.repeat(64) }); }) as unknown as typeof fetch;
    const v = await verify(DIGEST, { network: 'monad', fetch: f });
    expect(v.onChain.status).toBe('not_recorded');
    expect(calls[1]).toBe(RPC_FALLBACK[143]!.logs[0] ?? RPC_FALLBACK[143]!.call[0]);
  });
});

describe.skipIf(process.env.JEV_OFFLINE === '1')('live: the devnet (36927), never a mainnet', () => {
  it('finds the execution 86 answer and decision rows on the devnet', async () => {
    const v = await verify(DIGEST, { network: 'devnet' });
    expect(v.onChain.status).toBe('recorded');
    expect(v.onChain.answers[0]!.tx).toBe('0x9a38cf5541bb82a8a6e2e5cf1a96ed25fdc46921c351506da83023f5dec1a61b');
    expect(v.checks.decisionOnChain).toBe(true);
  }, 60_000);
});
