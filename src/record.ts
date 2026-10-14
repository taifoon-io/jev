// record(): the unsigned calls that put a receipt on chain — JevAnswerLog.record (jev.answer.v1), JevDecisionLog.record
// (decision.v2) and GradeStampRegistry.stamp (the grade's verdict) — built by the shared attestation helper (attest.ts,
// vendored byte for byte). Recording is ON by default (_ATTEST_BY_DEFAULT_v1_): the Taifoon devnet 36927 and the Taifoon
// mainnet 3692781. `network` still takes none | devnet | base | both; `networks` takes any chain ids. A log or registry a
// network does not have is listed in `missing`, never faked. Nothing here signs: pass `send` (your wallet, e.g. viem's
// walletClient.sendTransaction) to send the calls, or hand them on.
import { attest, ATTEST_PROFILES, type AttestMissing, type AttestProfile, type StampVerdict } from './attest.js';
import { refBytes32, ZERO_ADDRESS } from './records.js';
import type { Hex } from './hash.js';
import type { Receipt } from './receipt.js';
import type { Verdict } from './rubric.js';

export type Network = 'none' | 'devnet' | 'base' | 'both';
export type UnsignedCall = { chainId: number; to: string | null; data: Hex; value: '0'; fn: string };
export type Recorded = {
  network: Network | 'default' | 'chains';
  /** the chains the calls aim at (empty when opted out) */
  networks: number[];
  /** ready: every contract exists · partial: some are missing · missing: none exist · sent: `send` sent the calls · none: opted out */
  status: 'ready' | 'partial' | 'missing' | 'sent' | 'none';
  calls: UnsignedCall[];
  /** a contract a target network does not have: said here, with no call */
  missing: AttestMissing[];
  digests: { answers: Hex; decision: Hex; input: Hex; subject: Hex; receipt: Hex; stampSubject: Hex };
  notes: string[];
  sent?: string[];
};

export const ANSWER_LOG_RECORD = 'record(bytes32,bytes32,bytes32,bytes32,bytes32,string,string)';
export const DECISION_LOG_RECORD = 'record(bytes32,bytes32,bytes32,uint16,string,string)';
/** the composed verdict → the stamp's REF code. Jev is asked only when the facts found a delivery, so a reject is a
 *  delivery with defects (2), not a missing one; needs_review cannot be determined yet (4). */
export const STAMP_VERDICT_OF: Record<Verdict, StampVerdict> = { complete: 1, reject: 2, needs_review: 4 };
const NETWORKS: Record<Exclude<Network, 'none'>, number[]> = { devnet: [36927], base: [8453], both: [36927, 8453] };

export async function record(r: Receipt, opts: { network?: Network; networks?: readonly number[]; profile?: AttestProfile; uri?: string; stamp?: boolean; send?: (call: UnsignedCall) => Promise<string> } = {}): Promise<Recorded> {
  if (!r.decision || !r.answersRecord || !r.answersDigest) throw new Error(`nothing to record: Jev was not asked (${r.reasons[0] ?? r.verdict}) — a hard fail is decided by the facts alone`);
  const network: Recorded['network'] = opts.network ?? (opts.networks ? 'chains' : 'default');
  const chains = opts.network === 'none' ? 'none' as const : opts.network ? NETWORKS[opts.network] : opts.networks ?? ATTEST_PROFILES[opts.profile ?? 'taifoon'];
  const model = (r.answersRecord.upstream_model ?? r.answersRecord.model ?? 'jev').slice(0, 64);
  const uri = (kind: string, d: Hex) => (opts.uri ? `${opts.uri.replace(/\/$/, '')}/${d}` : `urn:jev:${kind}:${d}`).slice(0, 512);
  const s = r.chainSubject;
  const a = attest({
    kind: r.decision.kind, subject: { chainId: s.chainId, contract: s.at ?? ZERO_ADDRESS, jobId: refBytes32(s.ref) },
    digest: r.decision.digest, confidenceBps: r.decision.confidenceBps, model, uri: uri('decision', r.decision.digest),
    answers: { useCase: r.answersRecord.use_case, inputDigest: r.inputDigest, answersDigest: r.answersDigest, uri: uri('answers', r.answersDigest) },
    verdict: opts.stamp === false ? null : STAMP_VERDICT_OF[r.verdict], mode: 2,
  }, { networks: chains });
  if (a.mark.subject !== r.subjectId) throw new Error('record: the attestation subject differs from the receipt\'s subject id');
  const digests = { answers: r.answersDigest, decision: r.decision.digest, input: r.inputDigest, subject: r.subjectId, receipt: r.receiptHash, stampSubject: a.mark.stampSubject };
  if (!a.recorded) return { network, networks: [], status: 'none', calls: [], missing: [], digests, notes: ['recording turned off (network none): the receipt and its digests only'] };
  const out: Recorded = {
    network, networks: a.networks, status: a.status === 'none' ? 'none' : a.status, calls: a.calls, missing: a.missing, digests,
    notes: [
      ...(a.networks.includes(36927) ? ['devnet 36927: any account may send (gas from https://faucet.taifoon.dev). A sender outside JevAnswerLog’s deploy-time recorders is logged with trusted = false.'] : []),
      ...a.missing.map((m) => m.why),
    ],
  };
  if (opts.send) { out.sent = []; for (const c of out.calls) out.sent.push(await opts.send(c)); if (out.sent.length) out.status = 'sent'; }
  return out;
}
