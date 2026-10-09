// pipeline(): one job through the coordination layer's steps, each step a function with a typed output.
//   pick → evidence → facts → grade → record → evaluator → premium → verify
// Every step works without the layer too: pass `evidence` (your own pack) and the layer is never read; `grade` then
// runs on your own TypeSafe key (or answers you already have, or without either on the caller's free grades on the layer), `record` returns unsigned calls, `premium` is priced from a `sellerRecord` you pass (or skipped). With the layer
// (https://coord.taifoon.dev by default) the job comes from /v1/judge/queue, the pack from /v1/judge/evidence, the
// seller's terms from /v1/pools/quote, and — only with a relayer key — the answers are recorded on the layer through
// /v1/judge/answers/record. Nothing here signs a transaction.
import { premium as wilsonPremium, wilson } from './wilson.js';
import { facts as runFacts, type FactsInput } from './facts.js';
import { grade, type GradeInput } from './grade.js';
import { record, type Network, type Recorded } from './record.js';
import { verify, type Verification } from './verify.js';
import { evaluatorCall, type Protocol, type EvaluatorCall } from './evaluator/index.js';
import type { Receipt } from './receipt.js';
import type { Answer } from './rubric.js';
import type { Subject } from './records.js';

export const LAYER = 'https://coord.taifoon.dev';

export type StepId = 'pick' | 'evidence' | 'facts' | 'grade' | 'record' | 'evaluator' | 'premium' | 'verify';
/** The steps in order, each with the layer route it reads (null: runs locally only). */
/** `required`: the later steps need its output, so saying no at the gate stops the run instead of skipping it. */
export const STEPS: ReadonlyArray<{ id: StepId; title: string; route: string | null; required?: true }> = Object.freeze([
  { id: 'pick', title: 'Pick a job a grader is needed for', route: 'GET /v1/judge/queue', required: true },
  { id: 'evidence', title: 'Read the evidence pack', route: 'GET /v1/judge/evidence/{chain}/{jobId}', required: true },
  { id: 'facts', title: 'Code establishes the facts (a failed check ends the job)', route: null, required: true },
  { id: 'grade', title: 'Jev answers RUBRIC_v1, code composes the verdict', route: null, required: true },
  { id: 'record', title: 'Record the answers and the decision', route: 'POST /v1/judge/answers/record' },
  { id: 'evaluator', title: 'The call that ends the job on its protocol', route: null },
  { id: 'premium', title: 'Price the next premium from the seller record (Wilson)', route: 'POST /v1/pools/quote' },
  { id: 'verify', title: 'Re-derive the receipt (and find it on chain)', route: null },
]);

/** One row of /v1/judge/queue, as far as the pipeline reads it. */
export type QueueRow = { jobId: string; why: string; ending: string; budget: number | null; seller: string; buyer: string; task: string | null; evidence: string; evidence_ready: string };
/** /v1/judge/evidence/{chain}/{jobId}: `state` is the pack Jev reads; `facts` are [label, value] pairs. */
export type Evidence = { chainId: number; jobId: string; state: string; facts: Array<[string, string]>; gaps?: string[] };
export type Quote = { guaranteed: boolean; premium: string | null; premium_ratio: number | null; premium_label: string | null; deposit: string | null; record?: { n: number; settled: number; incorrect: number; wilson: [number, number]; calibrated: boolean; insurable: boolean }; why?: string[] };
export type LayerRecord = { digest?: string; uri?: string; anchor?: { tx?: string; status?: string } } & Record<string, unknown>;

export type StepResult<T = unknown> = { id: StepId; ok: boolean; skipped?: string; stopped?: true; ms: number; out?: T; error?: string };
export type Trace = {
  job: { chainId: number; jobId: string; seller: string | null } | null;
  steps: StepResult[];
  receipt: Receipt | null;
  recorded: Recorded | null;
  layerRecord: LayerRecord | null;
  evaluator: EvaluatorCall | null;
  quote: Quote | null;
  verification: Verification | null;
};

export type PipelineOpts = {
  /** the coordination layer; `false` = never read it (independent mode: `evidence` is required) */
  layer?: string | false;
  /** a job to grade, `8453:81100` or { chainId, jobId }; omitted with the layer on: the first ready row of the queue */
  job?: string | { chainId: number; jobId: string };
  /** your own evidence pack; skips pick + evidence */
  evidence?: { subject: string; chainId?: number; label?: string; from?: string; state: string; delivered?: boolean; checks?: FactsInput['checks']; priceUsdc?: number | null; seller?: string };
  /** your TypeSafe key from console.typesafe.ai (never stored, never recorded) */
  key?: string | null;
  /** answers you already have (e.g. from the n8n TypeSafe node): Jev is not asked */
  answers?: Record<string, Answer> | Answer[];
  /** the model that produced supplied `answers` (e.g. "jev-1.13.0"); it is part of the decision digest */
  model?: string | null;
  /** where record() points the calls; default devnet */
  /** recording is opt-in: where record() points the calls and what the layer may record. Default none: the receipt and
   *  its digests only (recomputable offline), no transaction. */
  network?: Network;
  /** X-API-Key for POST /v1/judge/answers/record; omitted: nothing is written to the layer */
  relayerKey?: string | null;
  /** the job's protocol for the evaluator call; omitted: guessed from the job id */
  protocol?: Protocol | null;
  /** a tenant binding (e.g. Moonbeam: { chainId: 8453, at: <hook>, ref: jobId }): overrides the subject grade() records */
  subject?: (job: { chainId: number; jobId: string }) => Subject;
  /** who is grading, recorded in the answer record (e.g. 'moonbeam') */
  caller?: string;
  /** read the logs on chain in verify (default: only when record() sent something) */
  chainVerify?: boolean;
  /** price for the premium step, in USDC; default: the job's budget */
  priceUsdc?: number | null;
  /** the seller's record, k delivered of n graded: the premium is priced locally (@taifoon/jev-wilson, the layer's own
   *  numbers to the last digit) and the layer is not asked */
  sellerRecord?: { k: number; n: number } | null;
  /** a gate before each step: return false to skip it. The interactive CLI asks here. */
  before?: (step: (typeof STEPS)[number], trace: Trace) => boolean | Promise<boolean>;
  /** called after each step with its result */
  after?: (result: StepResult, trace: Trace) => void | Promise<void>;
  fetch?: typeof fetch;
};

/** The premium the layer would quote for this record, computed here: same z, same bound, same rounding. */
export function localQuote(record: { k: number; n: number }, priceUsdc: number | null): Quote {
  const units = priceUsdc ? Math.round(priceUsdc * 1e6) : undefined;
  const p = wilsonPremium(record, units === undefined ? {} : { price: units });
  const [lo, hi] = wilson(record.n - record.k, record.n);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return {
    guaranteed: p.covered, premium: p.amount === null ? null : p.amount.toString(), premium_ratio: p.ratio, deposit: null,
    premium_label: p.insurable ? `${pct(lo)}–${pct(hi)} · ${record.k} of ${record.n} delivered` : 'UNKNOWN: no delivered job on record',
    record: { n: record.n, settled: record.n, incorrect: record.n - record.k, wilson: [lo, hi], calibrated: false, insurable: p.insurable },
    why: p.insurable ? (p.covered ? [] : [`ratio ${p.ratio.toFixed(4)} is above the 0.30 the pool covers`]) : ['a record with no delivered job is not insurable'],
  };
}

const num = (s: string | undefined) => { const m = /([0-9]+(?:\.[0-9]+)?)/.exec(s ?? ''); return m ? Number(m[1]) : null; };
const fact = (ev: Evidence, label: RegExp) => ev.facts.find(([k]) => label.test(k))?.[1];

/** A job reference: `8453:81100`, `8453:bitagent:8453:7287`, or a bare id (chain 8453). */
export function parseJob(j: string | { chainId: number; jobId: string }): { chainId: number; jobId: string } {
  if (typeof j === 'object') return j;
  const m = /^(\d+):(.+)$/.exec(j.trim());
  return m ? { chainId: Number(m[1]), jobId: m[2]! } : { chainId: 8453, jobId: j.trim() };
}

/** The layer's queue rows a grader can actually read: evidence must resolve (decimal id or label:chain:id). */
export const readable = (r: QueueRow): boolean => /\/v1\/judge\/evidence\/\d+\/(\d+|[a-z0-9-]+:\d+:\d+)$/.test(r.evidence);

/**
 * The deterministic facts an ERC-8183 evidence pack supports on its own:
 * delivered = the pack names a delivery; submitted_before_deadline when both times are on chain; priceUsdc from "price".
 * A protocol that can re-derive the delivery (a proof, a hash, a file) adds its own checks on top.
 */
export function factsFromEvidence(ev: Evidence, extra: FactsInput['checks'] = {}): FactsInput {
  const delivered = fact(ev, /what was delivered/i);
  const submitted = fact(ev, /^submitted$/i);
  const deadline = fact(ev, /^deadline$/i);
  const price = fact(ev, /^price$/i);
  const checks: FactsInput['checks'] = { ...extra };
  if (submitted && deadline) checks.submitted_before_deadline = !/after the deadline/i.test(submitted);
  return { delivered: Boolean(delivered && !/^nothing|not delivered|no submission/i.test(delivered)), checks, priceUsdc: price && /usdc/i.test(price) ? num(price) : null };
}

/** The evaluator seat for a job id, when the id says which protocol it is on. */
export function protocolFor(jobId: string): { protocol: Protocol; id: string } | null {
  const b = /^bitagent:\d+:(\d+)$/.exec(jobId); if (b) return { protocol: 'bitagent-erc8183', id: b[1]! };
  if (/^\d+$/.test(jobId)) return { protocol: 'virtuals-erc8183', id: jobId };
  if (/^0x[0-9a-fA-F]{64}$/.test(jobId)) return { protocol: 'assurance-hook', id: jobId };
  return null;
}

async function getJson<T>(f: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const r = await f(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!r.ok || j.ok === false) throw new Error(`${init?.method ?? 'GET'} ${url.replace(/^https?:\/\/[^/]+/, '')}: ${r.status} ${j.error ?? ''}`.trim());
  return j;
}

export async function pipeline(o: PipelineOpts = {}): Promise<Trace> {
  const f = o.fetch ?? fetch;
  const layer = o.layer === false ? null : (o.layer ?? LAYER).replace(/\/$/, '');
  if (!layer && !o.evidence) throw new Error('independent mode (layer: false) needs `evidence`');
  const t: Trace = { job: null, steps: [], receipt: null, recorded: null, layerRecord: null, evaluator: null, quote: null, verification: null };
  let ev: Evidence | null = null; let budget: number | null = null; let factsIn: FactsInput | null = null;

  const step = async <T>(id: StepId, run: () => Promise<T | { skip: string }>): Promise<void> => {
    const s = STEPS.find((x) => x.id === id)!; const t0 = Date.now();
    let res: StepResult;
    if (o.before && !(await o.before(s, t))) res = s.required ? { id, ok: true, stopped: true, skipped: 'stopped at the gate: the later steps need this one', ms: 0 } : { id, ok: true, skipped: 'skipped at the gate', ms: 0 };
    else {
      try {
        const out = await run();
        res = out && typeof out === 'object' && 'skip' in (out as object) ? { id, ok: true, skipped: (out as { skip: string }).skip, ms: Date.now() - t0 } : { id, ok: true, ms: Date.now() - t0, out };
      } catch (e) { res = { id, ok: false, ms: Date.now() - t0, error: (e as Error).message }; }
    }
    t.steps.push(res); await o.after?.(res, t);
  };
  const failed = () => t.steps.some((s) => !s.ok || s.stopped);

  await step('pick', async () => {
    if (o.evidence) { t.job = { chainId: o.evidence.chainId ?? 0, jobId: o.evidence.subject, seller: o.evidence.seller ?? null }; return { skip: o.evidence.from ?? 'your own evidence pack' }; }
    if (o.job) { t.job = { ...parseJob(o.job), seller: null }; return t.job; }
    const q = await getJson<{ rows: QueueRow[] }>(f, `${layer}/v1/judge/queue?limit=50`);
    const row = q.rows.find(readable);
    if (!row) throw new Error('no queue row with a readable evidence pack');
    t.job = { ...parseJob(`${/\/evidence\/(\d+)\//.exec(row.evidence)![1]}:${row.jobId}`), seller: row.seller };
    budget = row.budget;
    return { row, skipped_unreadable: q.rows.indexOf(row) };
  });
  if (failed()) return t;

  await step('evidence', async () => {
    if (o.evidence) { ev = { chainId: 0, jobId: o.evidence.subject, state: o.evidence.state, facts: [] }; return { skip: o.evidence.from ?? 'your own evidence pack' }; }
    ev = await getJson<Evidence>(f, `${layer}/v1/judge/evidence/${t.job!.chainId}/${encodeURIComponent(t.job!.jobId)}`);
    t.job!.seller ??= fact(ev, /^seller$/i) ?? null;
    return { facts: ev.facts.length, gaps: ev.gaps ?? [], state_chars: ev.state.length };
  });
  if (failed() || !ev) return t;
  const pack: Evidence = ev;

  await step('facts', async () => {
    factsIn = o.evidence ? { delivered: o.evidence.delivered ?? true, checks: o.evidence.checks ?? {}, priceUsdc: o.evidence.priceUsdc ?? null } : factsFromEvidence(pack);
    budget ??= factsIn.priceUsdc ?? null;
    return runFacts(factsIn);
  });
  if (failed()) return t;

  await step('grade', async () => {
    const g: GradeInput = { subject: o.subject ? o.subject(t.job!) : { chainId: t.job!.chainId, ref: t.job!.jobId, ...(o.evidence?.label ? { label: o.evidence.label } : {}) }, evidence: pack.state, facts: runFacts(factsIn!), fetch: f, ...(o.caller ? { caller: o.caller } : {}) };
    if (o.answers) { g.answers = o.answers; if (o.model) g.model = o.model; } else if (o.key) g.key = o.key;
    // _FREE_GRADES_v1_: no key → the caller's free grades on this layer (paid from relayerKey's balance past them); offline: none
    else { g.layer = layer ?? false; g.layerKey = o.relayerKey ?? null; }
    // no key: a job the code checks reject is still graded (Jev is not asked); only asking Jev needs the key
    try { t.receipt = await grade(g); }
    catch (e) {
      if (!o.key && !o.answers && !layer && /TypeSafe key/.test((e as Error).message)) throw new Error('Jev needs your TypeSafe key: set TYPESAFE_KEY (console.typesafe.ai), or pass answers you already have');
      throw e;
    }
    return { verdict: t.receipt.verdict, reasons: t.receipt.reasons, model: t.receipt.model, receiptHash: t.receipt.receiptHash };
  });
  if (failed() || !t.receipt) return t;
  const receipt: Receipt = t.receipt;

  await step('record', async () => {
    if (!receipt.decision) return { skip: `nothing to record: ${receipt.reasons[0] ?? receipt.verdict} (the facts decided; Jev was not asked)` };
    t.recorded = await record(receipt, { network: o.network ?? 'none' });
    if (layer && o.relayerKey && receipt.answersRecord)
      t.layerRecord = await getJson<LayerRecord>(f, `${layer}/v1/judge/answers/record`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.relayerKey }, body: JSON.stringify({ ...receipt.answersRecord, record: o.network ?? 'none' }) });
    const rec = (t.layerRecord as { recording?: { used?: unknown; held?: { message?: string } } } | null)?.recording;
    return { status: t.recorded.status, recording: rec ? { used: rec.used ?? null, held: rec.held?.message ?? null } : null, calls: t.recorded.calls.map((c) => `${c.fn}@${c.chainId}${c.to ? '' : ' (no address)'}`), digests: t.recorded.digests, layer: t.layerRecord ?? (layer ? 'not written: pass a relayer key to record on the layer' : 'independent mode') };
  });

  await step('evaluator', async () => {
    if (receipt.verdict === 'needs_review') return { skip: 'needs_review ends nothing: the job goes to appeal' };
    const p = o.protocol ? { protocol: o.protocol, id: t.job!.jobId } : protocolFor(t.job!.jobId);
    if (!p) return { skip: 'the job id does not say which protocol it is on (pass protocol)' };
    try { t.evaluator = evaluatorCall(p.protocol, p.id, receipt, receipt); }
    catch (e) { return { skip: `${p.protocol}: ${(e as Error).message}` }; }
    return t.evaluator ?? { skip: 'no evaluator call for this verdict' };
  });

  await step('premium', async () => {
    const seller = t.job!.seller;
    if (o.sellerRecord) {
      const price = o.priceUsdc ?? budget;
      t.quote = localQuote(o.sellerRecord, price);
      return { source: 'local: Wilson on the record you passed', guaranteed: t.quote.guaranteed, premium_ratio: t.quote.premium_ratio, premium_label: t.quote.premium_label, record: t.quote.record ?? null };
    }
    if (!layer) return { skip: 'offline: pass sellerRecord (--seller-record k/n) to price locally, or a layer to read the seller\'s record' };
    if (!seller) return { skip: 'no seller address in the evidence' };
    const price = o.priceUsdc ?? budget;
    if (!price) return { skip: 'no price for the job' };
    t.quote = await getJson<Quote>(f, `${layer}/v1/pools/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seller, price_usdc: price, chainId: 8453 }) });
    return { guaranteed: t.quote.guaranteed, premium_ratio: t.quote.premium_ratio, premium_label: t.quote.premium_label, record: t.quote.record ?? null };
  });

  await step('verify', async () => {
    t.verification = await verify(receipt, { chain: o.chainVerify ?? t.recorded?.status === 'sent', fetch: f });
    return { ok: t.verification.ok, checks: t.verification.checks, problems: t.verification.problems };
  });
  return t;
}
