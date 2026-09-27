// Every adapter against calldata a real transaction carried. For account-abstraction transactions (ERC-4337
// handleOps) the adapter's call sits inside the outer input; the test finds it there, at the recorded offset.
import { describe, expect, it } from 'vitest';
import { encodeCall } from '../src/abi.js';
import { evaluatorCall } from '../src/evaluator/index.js';
import { CONTRACTS } from '../src/contracts.js';

type Case = { name: string; protocol: string; verdict: 'complete' | 'reject' | null; seat?: 'platform'; chainId: number; hash: string; to: string; inner_at: number | null; args: Array<string | boolean>; input: string; sig: string };
import recorded from './fixtures/evaluator-calls.json' with { type: 'json' };
const { cases } = recorded as unknown as { cases: Case[] };
const D = '0x' + 'ab'.repeat(32);

describe.each(cases.filter((c) => c.verdict))('$name', (c) => {
  it(`evaluatorCall re-encodes the recorded call (${c.hash.slice(0, 12)}…)`, () => {
    const [id, a1, a2] = c.args;
    let call;
    if (c.protocol === 'assurance-hook') call = evaluatorCall('assurance-hook', id as string, c.verdict!, D, { to: c.to });
    else if (c.protocol === 'judge-adapter') call = evaluatorCall('judge-adapter', id as string, Number(a1) === 1 ? 'complete' : 'reject', c.args[3] as `0x${string}`);
    else if (c.protocol === 'virtuals-erc8183') call = evaluatorCall('virtuals-erc8183', id as string, c.verdict!, a1 as `0x${string}`);
    else if (c.protocol === 'virtuals-memo-acp') call = evaluatorCall('virtuals-memo-acp', id as string, a1 ? 'complete' : 'reject', D, { reason: a2 as string });
    else call = evaluatorCall('bitagent-erc8183', id as string, a1 ? 'complete' : 'reject', D, { seat: 'platform' });
    expect(call).not.toBeNull();
    if (c.inner_at === null) { expect(call!.data).toBe(c.input); expect(call!.to.toLowerCase()).toBe(c.to.toLowerCase()); }
    else expect(c.input.slice(c.inner_at, c.inner_at + call!.data.length - 2)).toBe(call!.data.slice(2));
  });
});
describe('the rest of each adapter', () => {
  it('an inner call also names its target in the outer input', () => {
    for (const c of cases.filter((x) => x.inner_at !== null)) {
      const target = c.protocol === 'virtuals-erc8183' ? CONTRACTS.base.virtualsErc8183 : CONTRACTS.base.virtualsMemoAcpRouter;
      expect(c.input.toLowerCase()).toContain(target.slice(2).toLowerCase());
    }
  });
  it('BitAgent AgenticCommerce shares the (uint256,bytes32,bytes) layout: its recorded submit re-encodes', () => {
    const s = cases.find((c) => c.sig.includes('submit'))!;
    expect(encodeCall('submit(uint256,bytes32,bytes)', [BigInt(s.args[0] as string), s.args[1] as string, s.args[2] as string])).toBe(s.input);
    const call = evaluatorCall('bitagent-erc8183', 8941, 'reject', D)!;
    expect(call.to).toBe(CONTRACTS.base.bitagentErc8183);
    expect(call.data).toBe(encodeCall('reject(uint256,bytes32,bytes)', [8941n, D, '0x']));
  });
  it('assurance-hook reject carries the digest; judge-adapter complete is code 1 mode 2', () => {
    const id = '0x' + '5b'.repeat(32);
    expect(evaluatorCall('assurance-hook', id, 'reject', D, { to: '0xc0578657Eda85e0a246771aa1839ce79b54eE80d' })!.data).toBe(`0x04f999c7${'5b'.repeat(32)}${'ab'.repeat(32)}`);
    expect(evaluatorCall('judge-adapter', id, 'complete', D)!.data).toBe(encodeCall('postVerdict(bytes32,uint8,uint8,bytes32)', [id, 1, 2, D]));
  });
  it('needs_review ends nothing; bad input is refused', () => {
    expect(evaluatorCall('virtuals-erc8183', 1, 'needs_review', D)).toBeNull();
    expect(() => evaluatorCall('virtuals-erc8183', 1, 'complete', '0x12' as `0x${string}`)).toThrow(/digest/);
    expect(() => evaluatorCall('assurance-hook', 1, 'complete', D, { to: '0x' + '1'.repeat(40) })).toThrow(/32-byte/);
    expect(() => evaluatorCall('assurance-hook', D, 'complete', D)).toThrow(/opts.to/);
    expect(() => evaluatorCall('nope' as never, 1, 'complete', D)).toThrow(/unknown protocol/);
  });
  it('takes a receipt directly', () => {
    const call = evaluatorCall('virtuals-erc8183', 6579, { verdict: 'reject' }, { decision: { digest: D as `0x${string}` } })!;
    expect(call.fn).toBe('reject(uint256,bytes32,bytes)');
  });
});
