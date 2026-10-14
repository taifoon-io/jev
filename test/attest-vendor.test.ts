import { describe, expect, it } from 'vitest';
// @ts-expect-error: plain .mjs script, no types
import { problems } from '../scripts/vendor-attest.mjs';

// src/attest.ts is the attestation helper @taifoon/assurance and the SDKs carry, byte for byte (sha-pinned).
describe('src/attest.ts is the shared attestation helper', () => {
  it('equals its pin, and the source where the source is present (run node scripts/vendor-attest.mjs when it drifts)', () => {
    expect(problems()).toEqual([]);
  });
});
