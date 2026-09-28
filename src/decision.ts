// verifyDecision(): recompute a decision.v2 record exactly as the coordination layer serves it at
// /v1/judge/decisions/{id} (and its jev.answer.v1 record at /v1/judge/answers/{digest}), offline, with this package's
// own code: the input fingerprint (sha256 of the text Jev read), the subject and kind ids, the decision digest, the
// on-chain confidence, the answers digest and the verdict RUBRIC_v1 composes from the answers. `verify()` takes the
// receipt `grade()` returns; this takes the record a reader finds by its link.
import { sha256Hex, type Hex } from './hash.js';
import { answersDigestOf, confidenceBpsOf, decisionDigest, kindIdOf, subjectIdOf, type AnswerRecord, type DecisionAnswer, type Subject } from './records.js';
import { defineRubric, RUBRIC_v1, type Composed, type Facts, type Rubric, type RubricInput } from './rubric.js';

/** The fields of a served decision.v2 record this check reads (the rest is carried as is). */
export type DecisionRecord = {
  v?: string; id?: string; kind: string; subject: Subject; model: string | null; answers: DecisionAnswer[];
  input?: string | null; input_digest: Hex; digest: Hex; subject_id?: Hex; kind_id?: Hex; confidence_bps?: number; answers_digest?: Hex | null;
};
export type DecisionCheck = { ok: boolean; checks: Record<string, boolean>; problems: string[]; composed: Composed | null; digest: Hex };

const low = (h: unknown) => String(h ?? '').toLowerCase();

export function verifyDecision(d: DecisionRecord | { decision: DecisionRecord }, opts: { answers?: AnswerRecord | { record: AnswerRecord }; facts?: Facts; rubric?: Rubric | RubricInput } = {}): DecisionCheck {
  const r = ('decision' in d ? d.decision : d) as DecisionRecord;
  const checks: Record<string, boolean> = {};
  if (typeof r.input === 'string') checks.inputDigest = low(sha256Hex(r.input)) === low(r.input_digest);
  if (r.subject_id) checks.subjectId = low(subjectIdOf(r.subject)) === low(r.subject_id);
  if (r.kind_id) checks.kindId = low(kindIdOf(r.kind)) === low(r.kind_id);
  const digest = decisionDigest({ kind: r.kind, subject: r.subject, answers: r.answers, model: r.model, input_digest: r.input_digest });
  checks.decisionDigest = low(digest) === low(r.digest);
  if (typeof r.confidence_bps === 'number') checks.confidenceBps = confidenceBpsOf(r.answers) === r.confidence_bps;
  const ans = opts.answers ? ('record' in opts.answers ? opts.answers.record : opts.answers) : null;
  if (ans) {
    if (r.answers_digest) checks.answersDigest = low(answersDigestOf(ans)) === low(r.answers_digest);
    checks.answersBindInput = low(ans.input_digest) === low(r.input_digest);
    checks.answersMatchDecision = r.answers.every((a) => { const b = ans.answers.find((x) => x.id === a.id); return !!b && b.value === a.value && JSON.stringify(b.distribution) === JSON.stringify(a.probabilities); });
  }
  let composed: Composed | null = null;
  if (r.kind === 'grade') {
    const rubric = opts.rubric ? defineRubric(opts.rubric) : RUBRIC_v1;
    // A recorded decision exists only once the checks passed (a failed check rejects without asking Jev), so the
    // default facts are "delivered, checks ok"; pass `facts` to compose under others (e.g. the job's price).
    const facts: Facts = opts.facts ?? { delivered: true, checksOk: true, checks: {}, priceUsdc: null };
    composed = rubric.compose(facts, Object.fromEntries(r.answers.map((a) => [a.id, { id: a.id, value: a.value, confidence: a.confidence, probabilities: a.probabilities }])));
  }
  const problems = Object.entries(checks).filter(([, v]) => !v).map(([k]) => `${k} does not recompute`);
  return { ok: problems.length === 0, checks, problems, composed, digest };
}
