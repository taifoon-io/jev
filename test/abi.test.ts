import { describe, expect, it } from 'vitest';
import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, parseAbi } from 'viem';
import { decode, encode, encodeCall, selector } from '../src/abi.js';

describe('abi', () => {
  it('encodes static and dynamic mixes exactly as viem does', () => {
    const types = ['bytes32', 'uint256', 'uint16', 'bool', 'address', 'string', 'bytes', 'string'] as const;
    const values = ['0x' + 'ab'.repeat(32), 123456789n, 2700, true, '0xD8c1d8188Fc8EE388792f6EB3B3dbd4f341Ba8e3', 'jev-1.13.0 · żółw', '0xdeadbeef' + '00'.repeat(40), ''] as const;
    expect(encode([...types], [...values])).toBe(encodeAbiParameters(types.map((type) => ({ type })), values as never));
  });
  it('calldata and selectors match viem', () => {
    expect(selector('complete(bytes32)')).toBe('0x83ccfb84');
    const abi = parseAbi(['function signMemo(uint256 memoId, bool isApproved, string reason)']);
    expect(encodeCall('signMemo(uint256,bool,string)', [1000001628n, true, 'jev complete'])).toBe(encodeFunctionData({ abi, functionName: 'signMemo', args: [1000001628n, true, 'jev complete'] }));
  });
  it('decodes what it encodes', () => {
    const types = ['address', 'bytes32', 'string', 'uint256', 'bool'] as const;
    const data = encodeAbiParameters(types.map((type) => ({ type })), ['0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', '0x' + '11'.repeat(32), 'https://x.y/z', 42n, true]);
    const ours = decode([...types], data);
    const theirs = decodeAbiParameters(types.map((type) => ({ type })), data);
    expect(String(ours[0]).toLowerCase()).toBe(String(theirs[0]).toLowerCase());
    expect(ours.slice(1)).toEqual(theirs.slice(1));
  });
});
