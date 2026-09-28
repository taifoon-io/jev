// verifyDecision on the article's block-proof grade (n8n execution 109): the record as /v1/judge/decisions serves it,
// and its answers as /v1/judge/answers serves them, recompute with this package alone.
import { describe, expect, it } from 'vitest';
import { verifyDecision, type DecisionRecord } from '../src/index.js';
import d109 from './fixtures/decision-exec109-1790522234088-10691d5017.json' with { type: 'json' };
import a109 from './fixtures/answers-exec109.json' with { type: 'json' };

const rec = d109 as unknown as { decision: DecisionRecord };
const ans = a109 as unknown as Parameters<typeof verifyDecision>[1] extends infer O ? NonNullable<O extends { answers?: infer A } ? A : never> : never;

describe('verifyDecision — decision-1790522234088-10691d5017', () => {
  it('every fingerprint recomputes and RUBRIC_v1 composes needs_review', () => {
    const v = verifyDecision(rec, { answers: ans });
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.checks).toEqual({ inputDigest: true, subjectId: true, kindId: true, decisionDigest: true, confidenceBps: true, answersDigest: true, answersBindInput: true, answersMatchDecision: true });
    expect(v.digest).toBe('0x10691d5017cbca500067fe38508b99a13ca1d61e11833df311b4cd053c6efba2');
    expect(v.composed?.verdict).toBe('needs_review');
    expect(v.composed?.scores.spec_met).toBe(0.72);
  });
  it('a changed byte in the text Jev read, or in an answer, is caught', () => {
    const bent = { decision: { ...rec.decision, input: rec.decision.input + ' ' } };
    expect(verifyDecision(bent).checks.inputDigest).toBe(false);
    const a0 = rec.decision.answers[0]!;
    const moved = { decision: { ...rec.decision, answers: [{ ...a0, probabilities: { yes: 0.9, no: 0.1 } }, ...rec.decision.answers.slice(1)] } };
    const v = verifyDecision(moved, { answers: ans });
    expect(v.checks.decisionDigest).toBe(false);
    expect(v.checks.answersMatchDecision).toBe(false);
    expect(v.ok).toBe(false);
  });
});
