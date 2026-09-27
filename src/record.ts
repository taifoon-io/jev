// record(): the unsigned calls that put a receipt's digests on chain — JevAnswerLog.record (jev.answer.v1) and
// JevDecisionLog.record (decision.v2). `network` is a flag: none | devnet | base | both. Nothing here signs: pass `send`
// (your wallet, e.g. viem's walletClient.sendTransaction) to send the calls that have an address, or hand them on.
import { encodeCall } from './abi.js';
import { CONTRACTS } from './contracts.js';
import { keccakHex, type Hex } from './hash.js';
import type { Receipt } from './receipt.js';

export type Network = 'none' | 'devnet' | 'base' | 'both';
export type UnsignedCall = { chainId: number; to: string | null; data: Hex; value: '0'; fn: string };
export type Recorded = {
  network: Network;
  /** ready: every call has an address · partial: some have `to: null` · sent: `send` sent the addressed ones · none: nothing to send */
  status: 'ready' | 'partial' | 'sent' | 'none';
  calls: UnsignedCall[];
  digests: { answers: Hex; decision: Hex; input: Hex; subject: Hex; receipt: Hex };
  notes: string[];
  sent?: string[];
};

export const ANSWER_LOG_RECORD = 'record(bytes32,bytes32,bytes32,bytes32,bytes32,string,string)';
export const DECISION_LOG_RECORD = 'record(bytes32,bytes32,bytes32,uint16,string,string)';

type Target = { chainId: number; answerLog: string | null; decisionLog: string | null; note: string };
const TARGETS: Record<'devnet' | 'base', () => Target> = {
  devnet: () => ({ chainId: CONTRACTS.devnet.chainId, answerLog: CONTRACTS.devnet.answerLog.address, decisionLog: CONTRACTS.devnet.decisionLog.address,
    note: 'devnet 36927: any account may send (gas from https://faucet.taifoon.dev). A sender outside JevAnswerLog’s deploy-time recorders is logged with trusted = false.' }),
  base: () => ({ chainId: CONTRACTS.base.chainId, answerLog: CONTRACTS.base.answerLog?.address ?? null, decisionLog: CONTRACTS.base.decisionLog?.address ?? null,
    note: CONTRACTS.base.answerLog && CONTRACTS.base.decisionLog ? 'Base 8453: the logs at CONTRACTS.base.' : 'Base 8453: this package version carries no Base address for the logs, so these calls have to = null (the call data is final; set `to` to send them).' }),
};

export async function record(r: Receipt, opts: { network?: Network; uri?: string; send?: (call: UnsignedCall) => Promise<string> } = {}): Promise<Recorded> {
  if (!r.decision || !r.answersRecord || !r.answersDigest) throw new Error(`nothing to record: Jev was not asked (${r.reasons[0] ?? r.verdict}) — a hard fail is decided by the facts alone`);
  const network = opts.network ?? 'devnet';
  const digests = { answers: r.answersDigest, decision: r.decision.digest, input: r.inputDigest, subject: r.subjectId, receipt: r.receiptHash };
  if (network === 'none') return { network, status: 'none', calls: [], digests, notes: ['network none: the receipt and its digests only'] };
  const model = (r.answersRecord.upstream_model ?? r.answersRecord.model ?? 'jev').slice(0, 64);
  const uri = (kind: string, d: Hex) => (opts.uri ? `${opts.uri.replace(/\/$/, '')}/${d}` : `urn:jev:${kind}:${d}`).slice(0, 512);
  const answerData = encodeCall(ANSWER_LOG_RECORD, [keccakHex(r.answersRecord.use_case), r.subjectId, r.inputDigest, r.answersDigest, r.decision.digest, model, uri('answers', r.answersDigest)]);
  const decisionData = encodeCall(DECISION_LOG_RECORD, [r.subjectId, r.decision.kindId, r.decision.digest, r.decision.confidenceBps, model, uri('decision', r.decision.digest)]);
  const targets = (network === 'both' ? ['devnet', 'base'] as const : [network]).map((n) => TARGETS[n]());
  const calls: UnsignedCall[] = targets.flatMap((t) => [
    { chainId: t.chainId, to: t.answerLog, value: '0' as const, fn: 'JevAnswerLog.record', data: answerData },
    { chainId: t.chainId, to: t.decisionLog, value: '0' as const, fn: 'JevDecisionLog.record', data: decisionData },
  ]);
  const out: Recorded = { network, status: calls.every((c) => c.to) ? 'ready' : 'partial', calls, digests, notes: targets.map((t) => t.note) };
  if (opts.send) { out.sent = []; for (const c of calls) if (c.to) out.sent.push(await opts.send(c)); if (out.sent.length) out.status = 'sent'; }
  return out;
}
