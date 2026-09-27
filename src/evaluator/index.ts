// evaluatorCall(): the one unsigned call that ends a job on the protocol whose evaluator seat you hold.
// needs_review ends nothing: the job stays held and the call is null — a person, an appeal or the deadline decides.
import type { Hex } from '../hash.js';
import type { Verdict } from '../rubric.js';
import { assuranceHook } from './assurance-hook.js';
import { bitagentErc8183 } from './bitagent-erc8183.js';
import { judgeAdapter } from './judge-adapter.js';
import type { Adapter, AdapterOpts, EvaluatorCall } from './types.js';
import { virtualsErc8183 } from './virtuals-erc8183.js';
import { virtualsMemoAcp } from './virtuals-memo-acp.js';

export const ADAPTERS: Readonly<Record<string, Adapter>> = Object.freeze(Object.fromEntries([assuranceHook, judgeAdapter, virtualsErc8183, virtualsMemoAcp, bitagentErc8183].map((a) => [a.name, a])));
export type Protocol = 'assurance-hook' | 'judge-adapter' | 'virtuals-erc8183' | 'virtuals-memo-acp' | 'bitagent-erc8183';

export function evaluatorCall(protocol: Protocol | Adapter, jobId: string | number | bigint, verdict: Verdict | { verdict: Verdict }, digest: string | { decision: { digest: string } | null }, opts: AdapterOpts = {}): EvaluatorCall | null {
  const a = typeof protocol === 'string' ? ADAPTERS[protocol] : protocol;
  if (!a) throw new Error(`unknown protocol ${String(protocol)}; one of ${Object.keys(ADAPTERS).join(', ')}`);
  const v = typeof verdict === 'string' ? verdict : verdict.verdict;
  if (v === 'needs_review') return null;
  if (v !== 'complete' && v !== 'reject') throw new Error(`verdict is complete | reject | needs_review, got ${String(v)}`);
  const d = typeof digest === 'string' ? digest : digest.decision?.digest;
  if (!d || !/^0x[0-9a-fA-F]{64}$/.test(d)) throw new Error('digest: the decision digest (receipt.decision.digest), 32 bytes');
  return a.call(jobId, v, d.toLowerCase() as Hex, opts);
}
export type { Adapter, AdapterOpts, EvaluatorCall };
