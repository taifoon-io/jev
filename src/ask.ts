// Asking Jev. Two doors, both TypeSafe System One:
//   trial — https://typesafe.taifoon.dev/v1/trial: no key, 3 free calls per caller, ≤ 4 questions, ≤ 4,000 JSON characters
//   key   — https://api.typesafe.ai/v1/systemone with the caller's own TypeSafe key (console.typesafe.ai)
// This package never holds a key of its own. The answer comes back whole: value, confidence and every option's probability.
import type { Answer, Question } from './rubric.js';

export const TRIAL_URL = 'https://typesafe.taifoon.dev/v1/trial';
export const TYPESAFE_URL = 'https://api.typesafe.ai';
export const TRIAL_MAX_STATE = 4_000;
/** The model every key-path call asks for. Pinned, not `jev-latest`: a record says which model answered, and an alias can move. */
export const JEV_MODEL = 'jev-1.13.0';

export type Asked = { answers: Record<string, Answer>; model: string | null; latency_ms: number | null; connection: 'trial' | 'key'; trial: { calls: number; left: number } | null };
export class JevError extends Error {
  constructor(message: string, readonly status: number, readonly next?: string) { super(message); this.name = 'JevError'; }
}

const norm = (id: string, a: Record<string, unknown>): Answer => ({ id, value: String(a.value ?? a.choice ?? ''), confidence: Number(a.confidence ?? 0), probabilities: (a.probabilities as Record<string, number>) ?? {} });

export async function askJev(a: { text: string; questions: readonly Question[]; key?: string | null; trialUrl?: string; endpoint?: string; model?: string; fetch?: typeof fetch }): Promise<Asked> {
  const f = a.fetch ?? fetch;
  const started = Date.now();
  if (a.key) {
    const base = (a.endpoint ?? TYPESAFE_URL).replace(/\/$/, '');
    if (!/^https:\/\//.test(base)) throw new JevError('a key is only sent over https', 400);
    const questions = Object.fromEntries(a.questions.map((q) => [q.id, { type: 'choice', instructions: q.text, criteria: Object.fromEntries(q.options.map((o) => [o, o])) }]));
    const r = await f(`${base}/v1/systemone`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.key}` }, body: JSON.stringify({ model: a.model ?? JEV_MODEL, state: a.text, questions }), signal: AbortSignal.timeout(65_000) });
    const j = (await r.json().catch(() => ({}))) as { model?: string; answers?: Record<string, Record<string, unknown>>; error?: unknown };
    if (!r.ok) throw new JevError(`TypeSafe answered ${r.status}${r.status === 401 || r.status === 403 ? ': the key was rejected' : r.status === 402 ? ': the account has no credit' : ''}`, r.status);
    const answers: Record<string, Answer> = {};
    for (const q of a.questions) { const x = j.answers?.[q.id]; if (x) answers[q.id] = norm(q.id, x); }
    return { answers, model: j.model ?? null, latency_ms: Date.now() - started, connection: 'key', trial: null };
  }
  const body = { state: a.text, questions: a.questions.map((q) => ({ id: q.id, kind: 'choice', text: q.text, options: [...q.options] })) };
  const r = await f(a.trialUrl ?? TRIAL_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(65_000) });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; next?: string; model?: string; upstreamModel?: string; latency_ms?: number; answers?: Array<Record<string, unknown>>; trial?: { calls: number; left: number } };
  if (!r.ok || j.ok === false) throw new JevError(`the free trial answered ${r.status}: ${j.error ?? 'refused'}`, r.status, j.next ?? 'use your own TypeSafe key: grade({ key })');
  const answers: Record<string, Answer> = {};
  for (const x of j.answers ?? []) { const id = String(x.id ?? ''); if (id && x.schema_ok !== false) answers[id] = norm(id, x); }
  return { answers, model: j.upstreamModel ?? j.model ?? null, latency_ms: typeof j.latency_ms === 'number' ? j.latency_ms : Date.now() - started, connection: 'trial', trial: j.trial ? { calls: j.trial.calls, left: j.trial.left } : null };
}
