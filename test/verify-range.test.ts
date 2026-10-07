import { describe, expect, it } from 'vitest';
import { logsAround, rangeCapOf } from '../src/verify.js';

// A fake Base endpoint: refuses ranges wider than `cap` blocks the way mainnet.base.org does, and holds logs at `at`.
function endpoint(cap: number, at: number[], head = 52_000_000) {
  const calls: Array<[number, number]> = [];
  const f = (async (_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body);
    if (method === 'eth_blockNumber') return { json: async () => ({ result: '0x' + head.toString(16) }) };
    const a = parseInt(params[0].fromBlock, 16), b = parseInt(params[0].toBlock, 16);
    calls.push([a, b]);
    if (b - a + 1 > cap) return { json: async () => ({ error: { message: `eth_getLogs is limited to a ${cap} range` } }) };
    const result = at.filter((n) => n >= a && n <= b).map((n) => ({ transactionHash: '0x' + n.toString(16), blockNumber: '0x' + n.toString(16), topics: [], data: '0x' }));
    return { json: async () => ({ result }) };
  }) as unknown as typeof fetch;
  return { f, calls };
}
const isAt = (n: number) => (l: { blockNumber: string }) => parseInt(l.blockNumber, 16) === n;

describe('logsAround (public Base endpoints cap eth_getLogs)', () => {
  it('reads a cap out of the refusal', () => {
    expect(rangeCapOf('eth_getLogs: eth_getLogs is limited to a 500 range')).toBe(500);
    expect(rangeCapOf('block range is limited to 100 block range')).toBe(100);
    expect(rangeCapOf('execution reverted')).toBeNull();
  });
  it('finds the decision one block before its answer in one call, under a 500-block cap', async () => {
    const { f, calls } = endpoint(500, [51_903_684]);
    const got = await logsAround('rpc', f, '0x0', [], 51_903_685, 51_903_685 - 4000, 51_903_685 + 4000, isAt(51_903_684));
    expect(got.some(isAt(51_903_684))).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls.every(([a, b]) => b - a + 1 <= 500)).toBe(true);
  });
  it('walks outward and shrinks to a smaller cap the endpoint names', async () => {
    const { f, calls } = endpoint(100, [51_900_000]);
    const got = await logsAround('rpc', f, '0x0', [], 51_903_685, 51_903_685 - 4000, 51_903_685 + 4000, isAt(51_900_000));
    expect(got.some(isAt(51_900_000))).toBe(true);
    expect(calls.filter(([a, b]) => b - a + 1 <= 100).length).toBeGreaterThan(0);
  });
  it('returns what it read when nothing matches, never past the head', async () => {
    const { f, calls } = endpoint(500, [], 51_903_700);
    const got = await logsAround('rpc', f, '0x0', [], 51_903_685, 51_903_685 - 1000, 51_903_685 + 4000, () => false);
    expect(got).toEqual([]);
    expect(Math.max(...calls.map(([, b]) => b))).toBe(51_903_700);
  });
});
