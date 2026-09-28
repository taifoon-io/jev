import { describe, expect, it } from 'vitest';
import * as published from '@taifoon/jev-wilson';
import * as vendored from '../src/wilson.js';
import src from '../src/wilson.ts?raw';

// src/wilson.ts is @taifoon/jev-wilson's pricing, vendored by scripts/vendor-wilson.mjs so @taifoon/jev keeps zero
// runtime dependencies. It must give the published package's numbers, bit for bit.
describe('src/wilson.ts is @taifoon/jev-wilson', () => {
  it('same constants', () => {
    expect([vendored.Z, vendored.MAX_PREMIUM_RATIO, vendored.RATIO_SCALE]).toEqual([published.Z, published.MAX_PREMIUM_RATIO, published.RATIO_SCALE]);
  });
  it('same interval and premium on every record up to n = 120, at two prices', () => {
    for (let n = 0; n <= 120; n++) for (let k = 0; k <= n; k++) {
      expect(vendored.wilson(k, n)).toEqual(published.wilson(k, n));
      if (n === 0) continue;
      for (const price of [1_500_000n, 10n ** 19n]) expect(vendored.premium({ k, n }, { price })).toEqual(published.premium({ k, n }, { price }));
    }
  });
  it('imports nothing', () => { expect(src).not.toMatch(/^\s*import\s|require\(/m); });
});
