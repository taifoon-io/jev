// grade(): evidence → deterministic facts → Jev's atomic questions → composed verdict → receipt.
import { askJev, askLayer, JevError, type Asked } from './ask.js';
import { answersOf, buildReceipt, DEFAULT_FACTS, inputFor, packOf, rubricOf, type Connection, type Receipt } from './receipt.js';
import type { Subject } from './records.js';
import type { Answer, Facts, Rubric, RubricInput } from './rubric.js';

export type GradeInput = {
  /** what is being graded: a job id / reference, or { chainId, at, ref } for an on-chain job */
  subject: string | Subject;
  /** the evidence pack: the task, the delivery, anything Jev should read. Objects are JSON-encoded. */
  evidence: string | object;
  /** facts() output (or a promise of it); default: delivered, no deterministic check */
  facts?: Facts | Promise<Facts>;
  /** default RUBRIC_v1; or your own { version, questions, asked?, thresholds?, compose? } */
  rubric?: Rubric | RubricInput;
  /** your own TypeSafe key → api.typesafe.ai. Never stored, never recorded. */
  key?: string | null;
  /** answers you already have (e.g. from the n8n TypeSafe node): nothing is asked, the rest is identical */
  answers?: Record<string, Answer> | Answer[];
  /** the model that produced supplied answers, e.g. "jev-1.13.0" */
  model?: string | null;
  /** who is recording (jev.answer.v1 `caller`); default "sdk" */
  caller?: string;
  /** base URL for `key` (default https://api.typesafe.ai) */
  endpoint?: string;
  /** with no `key` and no `answers`: the coordination layer whose free grades are claimed (default https://coord.taifoon.dev);
   *  false never calls it (then a key or answers are required) */
  layer?: string | false;
  /** a Taifoon key (tfr_…): a grade past the free ones is paid from its balance on the layer */
  layerKey?: string | null;
  fetch?: typeof fetch;
  /** ms since epoch for the answer record; default now */
  at?: number;
};
export type { Receipt };

export async function grade(g: GradeInput): Promise<Receipt> {
  const rubric = rubricOf(g.rubric);
  const facts: Facts = (await g.facts) ?? DEFAULT_FACTS;
  const { state, jevState } = inputFor(packOf(g.evidence), facts);
  // the facts decide first: a hard fail is final and Jev is never asked
  let asked: Asked | null = null; let answers: Record<string, Answer> | null = null; let model: string | null = null; let connection: Connection = 'none';
  if (rubric.compose(facts, null).forced !== 'hard_fail') {
    if (g.answers) { answers = answersOf(g.answers); model = g.model ?? null; connection = 'supplied'; }
    else {
      if (!g.key && g.layer === false) throw new JevError('pass { key } (your TypeSafe key, from console.typesafe.ai) or { answers } you already have', 400);
      // _FREE_GRADES_v1_: no key of your own → the caller's free grades on the coordination layer (then x402 or a Taifoon key)
      asked = g.key
        ? await askJev({ text: jevState, questions: rubric.asked, key: g.key, endpoint: g.endpoint, fetch: g.fetch })
        : await askLayer({ text: jevState, questions: rubric.asked, layer: g.layer || undefined, apiKey: g.layerKey, fetch: g.fetch });
      const missing = rubric.asked.filter((q) => !asked!.answers[q.id]).map((q) => q.id);
      if (missing.length) throw new JevError(`Jev returned no valid answer for: ${missing.join(', ')}`, 502);
      answers = asked.answers; model = asked.model; connection = asked.connection;
    }
  }
  return buildReceipt({ rubric, subject: g.subject, state, jevState, facts, answers, model, connection, latency_ms: asked?.latency_ms ?? null, trial: asked?.trial ?? null, caller: g.caller, at: g.at });
}
