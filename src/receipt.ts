// The receipt, built from what is already known — no network. grade() asks Jev and then calls this; the n8n node calls
// it with the answers its own TypeSafe call returned.
import { sha256Hex, type Hex } from './hash.js';
import { answerRecordOf, answersDigestOf, confidenceBpsOf, decisionAnswersOf, decisionDigest, kindIdOf, subjectIdOf, subjectOf, type AnswerRecord, type Subject } from './records.js';
import { defineRubric, jevStateOf, receiptBody, receiptHashOf, RUBRIC_v1, STATE_CAP, type Answer, type Facts, type ReceiptBody, type Rubric, type RubricInput } from './rubric.js';

export type Connection = 'trial' | 'key' | 'supplied' | 'none';
export type Receipt = ReceiptBody & {
  v: 'jev.receipt.v1';
  receiptHash: Hex;
  /** the on-chain subject: JevDecisionLog.subjectOf(chainId, at, ref) */
  chainSubject: Subject; subjectId: Hex;
  /** the exact text Jev read (evidence cut at the cap + the facts section + the instruction) and its sha256 */
  input: string; inputDigest: Hex;
  decision: { v: 'decision.v2'; kind: 'grade'; kindId: Hex; digest: Hex; confidenceBps: number } | null;
  answersRecord: AnswerRecord | null; answersDigest: Hex | null;
  via: { connection: Connection; latency_ms: number | null; trial: { calls: number; left: number } | null };
};
export const DEFAULT_FACTS: Facts = Object.freeze({ delivered: true, checksOk: null, checks: {}, priceUsdc: null }) as Facts;
export const rubricOf = (r?: Rubric | RubricInput): Rubric => (r ? defineRubric(r) : RUBRIC_v1);
export const packOf = (evidence: string | object): string => (typeof evidence === 'string' ? evidence : JSON.stringify(evidence));
/** the text Jev reads, cut until its JSON form fits `maxJson` characters (the trial's limit) — the facts section is never cut */
export function inputFor(pack: string, facts: Facts, maxJson?: number): { state: string; jevState: string } {
  let cap = STATE_CAP; let s = jevStateOf(pack, facts, cap);
  while (maxJson && JSON.stringify(s.jevState).length > maxJson && cap > 200) { cap -= 200; s = jevStateOf(pack, facts, cap); }
  return s;
}

export function buildReceipt(a: {
  rubric: Rubric; subject: string | Subject; state: string; jevState: string; facts: Facts;
  answers: Record<string, Answer> | null; model: string | null; connection: Connection;
  latency_ms?: number | null; trial?: { calls: number; left: number } | null; caller?: string; at?: number;
}): Receipt {
  const subject = subjectOf(a.subject); const subjectId = subjectIdOf(subject); const inputDigest = sha256Hex(a.jevState);
  const composed = a.rubric.compose(a.facts, a.answers);
  const body = receiptBody({ rubric: a.rubric, subject: subject.ref, state: a.state, facts: a.facts, answers: a.answers, model: a.model, composed });
  let decision: Receipt['decision'] = null; let answersRecord: AnswerRecord | null = null; let answersDigest: Hex | null = null;
  if (a.answers) {
    const dA = decisionAnswersOf(a.answers, a.rubric.questions);
    decision = { v: 'decision.v2', kind: 'grade', kindId: kindIdOf('grade'), digest: decisionDigest({ kind: 'grade', subject, answers: dA, model: a.model, input_digest: inputDigest }), confidenceBps: confidenceBpsOf(dA) };
    answersRecord = answerRecordOf({ subjectId, inputDigest, answers: a.answers, questions: a.rubric.questions, model: a.model, latency_ms: a.latency_ms ?? null,
      credential_path: a.connection === 'trial' ? 'trial' : 'caller-credential', use_case: a.connection === 'trial' ? 'compose' : 'compose.answers', caller: a.caller ?? 'sdk', at: a.at ?? Date.now() });
    answersDigest = answersDigestOf(answersRecord);
  }
  return { v: 'jev.receipt.v1', ...body, receiptHash: receiptHashOf(body), chainSubject: subject, subjectId, input: a.jevState, inputDigest, decision, answersRecord, answersDigest,
    via: { connection: a.connection, latency_ms: a.latency_ms ?? null, trial: a.trial ?? null } };
}
/** answers as a map id → { id, value, confidence, probabilities } (key order fixed: it is hashed) */
export function answersOf(list: Array<{ id: string; value: unknown; confidence?: unknown; probabilities?: Record<string, number> }> | Record<string, { id?: string; value: unknown; confidence?: unknown; probabilities?: Record<string, number> }>): Record<string, Answer> {
  const arr = Array.isArray(list) ? list : Object.entries(list).map(([id, a]) => ({ ...a, id: a.id ?? id }));
  return Object.fromEntries(arr.map((a) => [a.id, { id: a.id, value: String(a.value), confidence: Number(a.confidence), probabilities: a.probabilities ?? {} }]));
}
