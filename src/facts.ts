// facts(): the deterministic half. A protocol supplies its own checks — a proof verifies, an amount matches, a deadline
// held, a file hashes to what was promised — as values or as (async) functions. Code runs them; no model is asked.
// A failed check is final: grade() rejects without asking Jev.
import type { Facts } from './rubric.js';

export type Check = boolean | null | (() => boolean | null | Promise<boolean | null>);
export type FactsInput = {
  /** did anything come back / get submitted? false = hard fail */
  delivered: boolean;
  /** name → result, or name → a function that computes it; a function that throws counts as "could not be checked" */
  checks?: Record<string, Check>;
  /** the job's price in USDC; above the rubric's cap a "complete" is held for review */
  priceUsdc?: number | null;
  /** the class whose check ran and what it found, shown to Jev in the facts section */
  det?: { class: string; why: string };
};

export async function facts(input: FactsInput): Promise<Facts> {
  const checks: Record<string, boolean | null> = {};
  for (const [name, c] of Object.entries(input.checks ?? {})) {
    try { const v = typeof c === 'function' ? await c() : c; checks[name] = v === true ? true : v === false ? false : null; }
    catch { checks[name] = null; }
  }
  const vals = Object.values(checks);
  const checksOk = vals.includes(false) ? false : vals.includes(true) ? true : null;
  return { delivered: Boolean(input.delivered), checksOk, checks, priceUsdc: typeof input.priceUsdc === 'number' ? input.priceUsdc : null, ...(input.det ? { det: input.det } : {}) };
}
