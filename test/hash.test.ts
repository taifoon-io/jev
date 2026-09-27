import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { keccak256 as vKeccak, toHex as vToHex } from 'viem';
import { keccakHex, sha256Hex, toHex, utf8 } from '../src/hash.js';

const samples = Array.from({ length: 300 }, (_, n) => 'ż€a'.repeat(n % 7) + 'x'.repeat(n));
describe('hash', () => {
  it('sha256 equals node:crypto for 300 inputs across block boundaries', () => {
    for (const s of samples) expect(sha256Hex(s)).toBe('0x' + createHash('sha256').update(s).digest('hex'));
  });
  it('keccak256 equals viem for 300 inputs across the 136-byte rate', () => {
    for (const s of samples) expect(keccakHex(s)).toBe(vKeccak(vToHex(utf8(s))));
    expect(keccakHex('')).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });
  it('hex round trip', () => { expect(toHex(new Uint8Array([0, 15, 255]))).toBe('0x000fff'); });
});
