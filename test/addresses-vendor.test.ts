import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error: plain .mjs script, no types
import { found, render, OUT, REGISTRY } from '../scripts/vendor-addresses.mjs';
import { CONTRACTS } from '../src/contracts.js';

// src/addresses.ts is vendored from the address registry so @taifoon/jev keeps zero runtime dependencies.
describe.skipIf(!found())('src/addresses.ts is the registry', () => {
  it('equals what the registry renders (run node scripts/vendor-addresses.mjs when it drifts)', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(render(JSON.parse(readFileSync(REGISTRY, 'utf8'))));
  });
});

describe('CONTRACTS keeps its published values', () => {
  it('the logs, the evaluator seats and the devnet hook', () => {
    expect(CONTRACTS.devnet.answerLog).toEqual({ address: '0xD8c1d8188Fc8EE388792f6EB3B3dbd4f341Ba8e3', fromBlock: 1_106_754 });
    expect(CONTRACTS.devnet.decisionLog).toEqual({ address: '0x1D622511862DD7DEffB8fEeBc225E0FAdA1e9A05', fromBlock: 981_099 });
    expect(CONTRACTS.devnet.judgeAdapter).toBe('0xbd4c9e797a8DBbfdde9C77bc5A5b21ACf611Db8f');
    expect(CONTRACTS.devnet.assuranceHook).toBe('0x7110c8951d17b69054395742e265bbd98259564a');
    expect(CONTRACTS.base.answerLog).toEqual({ address: '0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d', fromBlock: 51_863_008 });
    expect(CONTRACTS.base.decisionLog).toEqual({ address: '0x209490d6A0FFC5368A42b0c2208BDCda853f6a92', fromBlock: 51_856_200 });
    expect([CONTRACTS.base.virtualsErc8183, CONTRACTS.base.virtualsMemoAcpRouter, CONTRACTS.base.bitagentErc8183])
      .toEqual(['0x238E541BfefD82238730D00a2208E5497F1832E0', '0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0', '0x5009ABB3A309115a4a682C66BAf3BC9E0329BaB7']);
  });
});
