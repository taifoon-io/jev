// The two records a grade leaves, in the formats the on-chain logs already hold:
//   decision.v2   — what was DECIDED: kind, subject, every answer with its question and distribution, model, and the
//                   sha256 of the exact text Jev read. JevDecisionLog.record(subject, kind, digest, confidenceBps, …).
//   jev.answer.v1 — what Jev ANSWERED: questions, answers with the whole distribution, model, latency, credential path.
//                   JevAnswerLog.record(useCase, subject, inputDigest, answersDigest, decisionDigest, …).
// Both digests are sha256 of a canonical JSON body (keys sorted), so anyone holding the body recomputes them.
import { encode } from './abi.js';
import { keccakHex, sha256Hex, type Hex } from './hash.js';
import type { Answer, Question } from './rubric.js';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_HASH = `0x${'0'.repeat(64)}` as Hex;

/** What a grade is about: a chain, an address (a job contract, a seller, zero when none) and a reference. */
export type Subject = { chainId: number; at?: string | null; ref: string; label?: string | null };
export const subjectOf = (s: string | Subject): Subject => (typeof s === 'string' ? { chainId: 0, ref: s } : s);
/** a 32-byte hex passes through; anything else is keccak'd */
export const refBytes32 = (ref: string): Hex => (/^0x[0-9a-fA-F]{64}$/.test(ref) ? (ref.toLowerCase() as Hex) : keccakHex(ref));
/** = JevDecisionLog.subjectOf(chainId, at, ref): keccak256(abi.encode("taifoon.decision.subject.v1", chainId, at, ref)) */
export const subjectIdOf = (s: Subject): Hex => keccakHex(fromHexBytes(encode(['string', 'uint256', 'address', 'bytes32'], ['taifoon.decision.subject.v1', BigInt(s.chainId), s.at ?? ZERO_ADDRESS, refBytes32(s.ref)])));
const fromHexBytes = (h: Hex): Uint8Array => { const s = h.slice(2); const b = new Uint8Array(s.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16); return b; };
export const kindIdOf = (kind: string): Hex => keccakHex(kind);

export function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === 'object') { const o = v as Record<string, unknown>; return Object.fromEntries(Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => [k, canonicalize(o[k])])); }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}
export const canonicalJson = (v: unknown): string => JSON.stringify(canonicalize(v));

// ── decision.v2 ──
export type DecisionAnswer = { id: string; question: string | null; options: readonly string[] | Record<string, string> | null; value: string; probabilities: Record<string, number>; confidence: number };
export type Decision = { v: 'decision.v2'; kind: string; subject: Subject; answers: DecisionAnswer[]; model: string | null; input_digest: Hex };
export function decisionDigest(d: Omit<Decision, 'v'>): Hex {
  const body = { v: 'decision.v2', kind: d.kind, subject: { chainId: d.subject.chainId, at: (d.subject.at ?? ZERO_ADDRESS).toLowerCase(), ref: d.subject.ref }, model: d.model,
    answers: d.answers.map((a) => ({ id: a.id, question: a.question, options: a.options, value: a.value, probabilities: a.probabilities, confidence: a.confidence })), input_digest: d.input_digest.toLowerCase() };
  return sha256Hex(canonicalJson(body));
}
/** a battery's on-chain confidence: its LOWEST answer, in basis points */
export const confidenceBpsOf = (answers: Array<{ confidence: number }>): number => {
  const c = answers.length ? Math.max(0, Math.min(1, Math.min(...answers.map((a) => Number(a.confidence) || 0)))) : 0;
  return Math.max(0, Math.min(10_000, Math.floor(c * 10_000 + 1e-9)));
};
export const decisionAnswersOf = (answers: Record<string, Answer>, questions: readonly Question[]): DecisionAnswer[] => {
  const q = new Map(questions.map((x) => [x.id, x]));
  return Object.values(answers).map((a) => ({ id: a.id, question: q.get(a.id)?.text ?? null, options: q.get(a.id)?.options ?? null, value: a.value, probabilities: a.probabilities, confidence: a.confidence }));
};

// ── jev.answer.v1 ──
export type AnswerRecord = {
  v: 'jev.answer.v1'; use_case: string; subject: Hex; input_digest: Hex | null;
  questions: Array<{ id: string; kind: 'choice'; text: string | null; options: readonly string[] | null }>;
  answers: Array<{ id: string; value: string; distribution: Record<string, number>; confidence: number | null }>;
  model: string | null; upstream_model: string | null; latency_ms: number | null; credential_path: string; caller: string; at: number;
};
export const answersDigestOf = (r: AnswerRecord): Hex => sha256Hex(canonicalJson(r));
export function answerRecordOf(a: { subjectId: Hex; inputDigest: Hex; answers: Record<string, Answer>; questions: readonly Question[]; model: string | null; latency_ms: number | null; credential_path: string; caller: string; at: number; use_case?: string }): AnswerRecord {
  const q = new Map(a.questions.map((x) => [x.id, x]));
  const upstream = a.model && /^jev-/.test(a.model) ? a.model : null;
  return {
    v: 'jev.answer.v1', use_case: a.use_case ?? 'compose', subject: a.subjectId, input_digest: a.inputDigest,
    questions: Object.keys(a.answers).map((id) => ({ id, kind: 'choice' as const, text: q.get(id)?.text ?? null, options: q.get(id)?.options ?? null })),
    answers: Object.values(a.answers).map((x) => ({ id: x.id, value: x.value, distribution: x.probabilities ?? {}, confidence: Number.isFinite(x.confidence) ? x.confidence : null })),
    model: upstream ? 'jev' : a.model, upstream_model: upstream, latency_ms: a.latency_ms === null ? null : Math.round(a.latency_ms), credential_path: a.credential_path, caller: a.caller, at: a.at,
  };
}
