// Asking Jev, two ways. With the caller's own TypeSafe key: https://api.typesafe.ai/v1/systemone (console.typesafe.ai).
// Without one: the caller's free grades on the Taifoon coordination layer (POST /v1/judge/compose), which asks Jev the same
// four questions and returns the answers whole; past the free grades it answers 402 with how to pay one grade. This
// package holds no key of its own. The answer comes back whole: value, confidence and every option's probability.
import type { Answer, Question } from './rubric.js';

export const TYPESAFE_URL = 'https://api.typesafe.ai';
/** The model every key-path call asks for. Pinned, not `jev-latest`: a record says which model answered, and an alias can move. */
export const JEV_MODEL = 'jev-1.13.0';

export type Asked = { answers: Record<string, Answer>; model: string | null; latency_ms: number | null; connection: 'key' | 'trial'; trial: { calls: number; left: number } | null };

/** the coordination layer, where a caller without a TypeSafe key claims its free grades */
export const LAYER_URL = 'https://coord.taifoon.dev';
/** the questions the layer's free grade answers (RUBRIC_v1 asks exactly these); another rubric needs the caller's own key */
export const LAYER_QUESTIONS = Object.freeze(['spec_met', 'unsupported_claim', 'ending', 'cheat_shaped']);
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

/** A free grade on the coordination layer (or one paid from a Taifoon key's balance, with `apiKey`): the layer asks Jev the
 *  four RUBRIC questions on `text` and returns the answers; this package composes the verdict from them as with a key. */
export async function askLayer(a: { text: string; questions: readonly Question[]; layer?: string; apiKey?: string | null; fetch?: typeof fetch }): Promise<Asked> {
  const f = a.fetch ?? fetch;
  const started = Date.now();
  const other = a.questions.map((q) => q.id).filter((id) => !LAYER_QUESTIONS.includes(id));
  if (other.length) throw new JevError(`the layer's free grade answers ${LAYER_QUESTIONS.join(', ')}; this rubric also asks ${other.join(', ')}: pass { key } (your TypeSafe key)`, 400, 'grade({ key: process.env.TYPESAFE_KEY })');
  const base = (a.layer ?? LAYER_URL).replace(/\/$/, '');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new JevError('the layer is only called over https', 400);
  const r = await f(`${base}/v1/judge/compose`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-taifoon-client': '@taifoon/jev', ...(a.apiKey ? { 'x-api-key': a.apiKey } : {}) }, body: JSON.stringify({ state: a.text }), signal: AbortSignal.timeout(65_000) });
  const j = (await r.json().catch(() => ({}))) as { model?: string; receipt?: { answers?: Record<string, Record<string, unknown>> }; quota?: { grades?: { free?: number; left?: number } }; error?: string; next_step?: unknown };
  if (r.status === 402) throw new JevError('no free grade left for this caller today: pass { key } (your TypeSafe key), a Taifoon key (layerKey), or pay one grade with x402 at POST ' + `${base}/v1/judge/compose`, 402, `${base}/v1/judge/compose`);
  if (!r.ok) throw new JevError(`the layer answered ${r.status}${j.error ? `: ${String(j.error).slice(0, 200)}` : ''}`, r.status);
  const answers: Record<string, Answer> = {};
  for (const q of a.questions) { const x = j.receipt?.answers?.[q.id]; if (x) answers[q.id] = norm(q.id, x); }
  const g = j.quota?.grades;
  return { answers, model: j.model ?? null, latency_ms: Date.now() - started, connection: 'trial', trial: g && typeof g.free === 'number' && typeof g.left === 'number' ? { calls: g.free, left: g.left } : null };
}
