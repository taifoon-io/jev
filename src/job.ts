// prepareJob(): the data a grader needs, from an agent job as the buyer laid it out.
//
// The question a grader answers is narrow: did the agent do the work it was hired for, as the task laid it out?
// So the evidence Jev reads is built from the job, not from free text: the task, its acceptance criteria (numbered),
// any source the work had to be faithful to, and the delivery. Code checks what code can check first (the delivery
// exists, names what it must, cites enough sources, parses, arrived in time); a failed check rejects before Jev is asked.
import type { FactsInput } from './facts.js';
import type { Subject } from './records.js';

/** A deterministic check on the delivery. `name` labels it in the facts Jev reads (defaults per kind). */
export type JobCheck =
  | { kind: 'includes'; terms: string[]; name?: string }                         // every term appears (case-insensitive)
  | { kind: 'sources'; min: number; name?: string }                              // at least `min` distinct http(s) links
  | { kind: 'json'; keys: string[]; name?: string }                              // parses as a JSON object with these keys
  | { kind: 'deadline'; submittedAt: string; deadline: string; name?: string };  // ISO times; submitted at or before

export type JobSpec = {
  /** your job id (the subject's ref) */
  id: string;
  chainId?: number;
  /** the contract or protocol address the job lives at, when there is one */
  at?: string | null;
  /** what the buyer asked for, in their words */
  task: string;
  /** what "done" means, one criterion per line; Jev reads them numbered */
  criteria: string[];
  /** what the agent delivered; null when nothing came back (a hard fail) */
  delivered: string | null;
  /** material the delivery must be faithful to (an invoice, a dataset, a page); optional */
  source?: string | null;
  checks?: JobCheck[];
  priceUsdc?: number | null;
  seller?: string | null;
};

export type PreparedJob = {
  subject: Subject;
  /** what Jev reads (grade() adds the facts section and the instruction) */
  evidence: { task: string; acceptance_criteria: string; source?: string; delivered: string };
  facts: FactsInput;
  /** the same job as a pipeline() pack: pipeline({ layer: false, evidence: job.pack }) */
  pack: { subject: string; state: string; delivered: boolean; checks: Record<string, boolean>; priceUsdc: number | null; seller?: string };
};

const URL_RE = /https?:\/\/[^\s)\]>"']+/g;

/** Run one check on the delivery. Pure and synchronous, so the same job always yields the same facts. */
export function runCheck(c: JobCheck, delivered: string): { name: string; ok: boolean } {
  switch (c.kind) {
    case 'includes': {
      const low = delivered.toLowerCase();
      return { name: c.name ?? `mentions ${c.terms.join(', ')}`, ok: c.terms.every((t) => low.includes(t.toLowerCase())) };
    }
    case 'sources':
      return { name: c.name ?? `cites at least ${c.min} source${c.min === 1 ? '' : 's'}`, ok: new Set(delivered.match(URL_RE) ?? []).size >= c.min };
    case 'json': {
      let ok = false;
      try { const v: unknown = JSON.parse(delivered); ok = !!v && typeof v === 'object' && !Array.isArray(v) && c.keys.every((k) => k in (v as object)); } catch { ok = false; }
      return { name: c.name ?? `JSON with ${c.keys.join(', ')}`, ok };
    }
    case 'deadline':
      return { name: c.name ?? 'delivered by the deadline', ok: Date.parse(c.submittedAt) <= Date.parse(c.deadline) };
  }
}

export function prepareJob(j: JobSpec): PreparedJob {
  if (!j.task.trim()) throw new Error('prepareJob: a job needs its task');
  if (!j.criteria.length) throw new Error('prepareJob: a job needs at least one acceptance criterion (what "done" means)');
  const delivered = j.delivered ?? '';
  const checks: Record<string, boolean> = {};
  if (j.delivered != null) for (const c of j.checks ?? []) { const r = runCheck(c, delivered); checks[r.name] = r.ok; }
  const evidence: PreparedJob['evidence'] = {
    task: j.task,
    acceptance_criteria: j.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n'),
    ...(j.source ? { source: j.source } : {}),
    delivered: j.delivered ?? '(nothing was delivered)',
  };
  const subject: Subject = { chainId: j.chainId ?? 0, at: j.at ?? null, ref: j.id };
  const facts: FactsInput = { delivered: j.delivered != null && delivered.trim() !== '', checks, priceUsdc: j.priceUsdc ?? null };
  return {
    subject, evidence, facts,
    pack: { subject: j.id, state: JSON.stringify(evidence), delivered: facts.delivered, checks, priceUsdc: j.priceUsdc ?? null, ...(j.seller ? { seller: j.seller } : {}) },
  };
}
