import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as published from '@taifoon/jev-wilson';
import * as ours from '../src/wilson.js';

// src/wilson.ts re-exports @taifoon/jev-wilson, a runtime dependency of this package: one implementation of the
// pricing, so the SDK, the layer and the pool contracts price a seller from the same numbers.
describe('src/wilson.ts is @taifoon/jev-wilson', () => {
  it('re-exports the same functions and constants', () => {
    for (const k of ['Z', 'MAX_PREMIUM_RATIO', 'RATIO_SCALE', 'wilson', 'wilsonUpperFailure', 'premiumAmount', 'premium'] as const) {
      expect((ours as Record<string, unknown>)[k]).toBe((published as Record<string, unknown>)[k]);
    }
  });
  it('declares the package as a runtime dependency, in a range the installed version satisfies', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const range: string = pkg.dependencies['@taifoon/jev-wilson'];
    const installed: string = JSON.parse(readFileSync(new URL('../node_modules/@taifoon/jev-wilson/package.json', import.meta.url), 'utf8')).version;
    expect(range).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(installed.split('.')[0]).toBe(range.slice(1).split('.')[0]);
    expect(pkg.devDependencies?.['@taifoon/jev-wilson']).toBeUndefined();
  });
});
