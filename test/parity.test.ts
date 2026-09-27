// In the development tree this holds the SDK to the hosted judge's own module: same rubric hash,
// same thresholds, same composition over a grid of answers, same receipt hash. In a published copy the hosted module
// is not there and the suite is skipped; the golden runs in records/grade tests still bind the SDK to the chain.
import { describe, expect, it } from 'vitest';
import { RUBRIC_v1, jevStateOf, receiptBody, receiptHashOf, type Answer, type Facts } from '../src/rubric.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h: any = await import(new URL('../../src/judge-compose.ts', import.meta.url).href).catch(() => null);
describe.skipIf(!h)('parity with the hosted judge', () => {
  it('rubric, thresholds, composition and receipt hash are identical', () => {
    expect(RUBRIC_v1.hash).toBe(h.RUBRIC_HASH);
    expect(RUBRIC_v1.thresholds).toEqual(h.THRESHOLDS_V1);
    expect(RUBRIC_v1.questions).toEqual(h.RUBRIC_V1);
    expect(RUBRIC_v1.asked).toEqual(h.RUBRIC_ASKED);
    const P = [0, 0.15, 0.2, 0.4, 0.41, 0.5, 0.7, 0.85, 0.9, 1];
    const ENDINGS = ['complete', 'reject', 'expire', 'needs_review'];
    const FACTS: Facts[] = [
      { delivered: true, checksOk: null, checks: {}, priceUsdc: null }, { delivered: true, checksOk: true, checks: { a: true }, priceUsdc: 80 },
      { delivered: false, checksOk: null, checks: {}, priceUsdc: null }, { delivered: true, checksOk: false, checks: { a: false, b: true }, priceUsdc: 1 },
    ];
    const yn = (id: string, p: number): Answer => ({ id, value: p >= 0.5 ? 'yes' : 'no', confidence: Math.max(p, 1 - p), probabilities: { yes: p, no: 1 - p } });
    let n = 0;
    for (const f of FACTS) for (const s of P) for (const u of P) for (const c of [0, 0.5, 0.9]) for (const e of ENDINGS) {
      const answers = { spec_met: yn('spec_met', s), unsupported_claim: yn('unsupported_claim', u), ending: { id: 'ending', value: e, confidence: 0.7, probabilities: { [e]: 0.7 } }, cheat_shaped: yn('cheat_shaped', c) };
      const ours = RUBRIC_v1.compose(f, answers);
      expect(ours).toEqual(h.compose(f, answers));
      const state = `pack ${n}`;
      expect(receiptHashOf(receiptBody({ rubric: RUBRIC_v1, subject: 's', state, facts: f, answers, model: 'jev-1.13.0', composed: ours }))).toBe(h.receipt({ subject: 's', state, facts: f, answers, model: 'jev-1.13.0', composed: ours }).receiptHash);
      n++;
    }
    expect(n).toBe(4 * 10 * 10 * 3 * 4);
    const long = 'x'.repeat(5000);
    expect(jevStateOf(long, FACTS[1])).toEqual(h.jevStateOf(long, FACTS[1]));
  });
});
