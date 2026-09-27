// Asking Jev: https://api.typesafe.ai/v1/systemone with the caller's own TypeSafe key (console.typesafe.ai).
// This package never holds a key of its own and calls no one else. The answer comes back whole: value, confidence and
// every option's probability.
import type { Answer, Question } from './rubric.js';

export const TYPESAFE_URL = 'https://api.typesafe.ai';
/** The model every key-path call asks for. Pinned, not `jev-latest`: a record says which model answered, and an alias can move. */
export const JEV_MODEL = 'jev-1.13.0';

export type Asked = { answers: Record<string, Answer>; model: string | null; latency_ms: number | null; connection: 'key'; trial: null };
export class JevError extends Error {
  constructor(message: string, readonly status: number, readonly next?: string) { super(message); this.name = 'JevError'; }
}

const norm = (id: string, a: Record<string, unknown>): Answer => ({ id, value: String(a.value ?? a.choice ?? ''), confidence: Number(a.confidence ?? 0), probabilities: (a.probabilities as Record<string, number>) ?? {} });

export async function askJev(a: { text: string; questions: readonly Question[]; key?: string | null; endpoint?: string; model?: string; fetch?: typeof fetch }): Promise<Asked> {
  const f = a.fetch ?? fetch;
  const started = Date.now();
  if (!a.key) throw new JevError('a TypeSafe key is required: get one at console.typesafe.ai and pass { key }', 400, 'grade({ key: process.env.TYPESAFE_KEY })');
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
