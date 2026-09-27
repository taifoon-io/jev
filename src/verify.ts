// verify(): recompute every digest a receipt carries, re-compose its verdict from its own answers, then find the chain
// events that hold those digests. Given a bare answers digest, it finds the JevAnswered log for it.
import { decode, type AbiType } from './abi.js';
import { CONTRACTS } from './contracts.js';
import { keccakHex, sha256Hex, type Hex } from './hash.js';
import type { Receipt } from './receipt.js';
import { answersDigestOf, confidenceBpsOf, decisionAnswersOf, decisionDigest, subjectIdOf } from './records.js';
import { defineRubric, receiptBody, receiptHashOf, RUBRIC_v1, type Rubric, type RubricInput } from './rubric.js';

const TOPIC_ANSWERED = keccakHex('JevAnswered(address,bytes32,bytes32,bytes32,bytes32,bytes32,string,string,uint256,bool)');
const TOPIC_DECIDED = keccakHex('Decided(bytes32,bytes32,address,uint256,bytes32,uint16,string,string)');
const ANSWERED_DATA: AbiType[] = ['address', 'bytes32', 'bytes32', 'string', 'string', 'uint256', 'bool'];
const DECIDED_DATA: AbiType[] = ['uint256', 'bytes32', 'uint16', 'string', 'string'];

export type AnswerEvent = { tx: string; block: number; recorder: string; trusted: boolean; subject: Hex; inputDigest: Hex; decisionDigest: Hex; model: string; uri: string };
export type DecisionEvent = { tx: string; block: number; recorder: string; index: number; digest: Hex; confidenceBps: number; model: string; uri: string };
export type Verification = {
  ok: boolean;
  checks: Record<string, boolean>;
  onChain: { chainId: number; answers: AnswerEvent[]; decisions: DecisionEvent[] };
  problems: string[];
};

type Log = { transactionHash: string; blockNumber: string; topics: string[]; data: Hex };
const hexN = (n: number) => '0x' + n.toString(16);
async function rpcCall<T>(rpc: string, f: typeof fetch, method: string, params: unknown[]): Promise<T> {
  const r = await f(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(30_000) });
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}
async function logs(rpc: string, f: typeof fetch, address: string, topics: Array<string | null>, fromBlock: number, toBlock?: number): Promise<Log[]> {
  return (await rpcCall<Log[]>(rpc, f, 'eth_getLogs', [{ address, topics, fromBlock: hexN(fromBlock), toBlock: toBlock == null ? 'latest' : hexN(toBlock) }])) ?? [];
}
const SEL_RECORDED_AT = keccakHex('recordedAt(bytes32)').slice(0, 10);
/** JevAnswerLog.recordedAt(digest): the block of the first trusted record, 0 when none. */
async function recordedAt(rpc: string, f: typeof fetch, address: string, digest: Hex): Promise<number> {
  const out = await rpcCall<string>(rpc, f, 'eth_call', [{ to: address, data: SEL_RECORDED_AT + digest.slice(2) }, 'latest']);
  return out && out !== '0x' ? Number(BigInt(out)) : 0;
}
/** eth_getLogs in windows of `step` blocks (public Base endpoints refuse wide ranges). */
async function logsWindowed(rpc: string, f: typeof fetch, address: string, topics: Array<string | null>, from: number, to: number, step = 2000): Promise<Log[]> {
  const head = Number(BigInt(await rpcCall<string>(rpc, f, 'eth_blockNumber', [])));
  to = Math.min(to, head); // endpoints refuse a range past the head
  const out: Log[] = [];
  for (let a = from; a <= to; a += step) out.push(...(await logs(rpc, f, address, topics, a, Math.min(to, a + step - 1))));
  return out;
}
const answerEvent = (l: Log): AnswerEvent => { const [recorder, inputDigest, decisionDigest, model, uri, , trusted] = decode(ANSWERED_DATA, l.data); return { tx: l.transactionHash, block: parseInt(l.blockNumber, 16), recorder: String(recorder), trusted: Boolean(trusted), subject: l.topics[2] as Hex, inputDigest: inputDigest as Hex, decisionDigest: decisionDigest as Hex, model: String(model), uri: String(uri) }; };
const decisionEvent = (l: Log): DecisionEvent => { const [index, digest, bps, model, uri] = decode(DECIDED_DATA, l.data); return { tx: l.transactionHash, block: parseInt(l.blockNumber, 16), recorder: `0x${String(l.topics[3]).slice(26)}`, index: Number(index), digest: digest as Hex, confidenceBps: Number(bps), model: String(model), uri: String(uri) }; };

/**
 * `network`: 'devnet' (default, chain 36927) or 'base' (8453). On Base the answer row is found through
 * JevAnswerLog.recordedAt (trusted records only) and the decision row in a window around it, because public Base
 * endpoints refuse wide log ranges.
 */
export async function verify(x: Receipt | string, opts: { rpc?: string; fetch?: typeof fetch; rubric?: Rubric | RubricInput; chain?: boolean; network?: 'devnet' | 'base' } = {}): Promise<Verification> {
  const network = opts.network ?? 'devnet';
  const f = opts.fetch ?? fetch; const rpc = opts.rpc ?? CONTRACTS[network].rpc;
  const dev = network === 'base'
    ? { chainId: CONTRACTS.base.chainId, answerLog: CONTRACTS.base.answerLog, decisionLog: CONTRACTS.base.decisionLog }
    : { chainId: CONTRACTS.devnet.chainId, answerLog: CONTRACTS.devnet.answerLog as { address: string; fromBlock: number } | null, decisionLog: CONTRACTS.devnet.decisionLog as { address: string; fromBlock: number } | null };
  const checks: Record<string, boolean> = {}; const problems: string[] = [];
  const onChain: Verification['onChain'] = { chainId: dev.chainId, answers: [], decisions: [] };
  let answersDigest: Hex | null; let subjectId: Hex | null = null; let decision: Hex | null = null;
  if (typeof x === 'string') {
    if (!/^0x[0-9a-fA-F]{64}$/.test(x)) throw new Error('verify takes a receipt or a 32-byte answers digest');
    answersDigest = x.toLowerCase() as Hex;
  } else {
    const rubric = opts.rubric ? defineRubric(opts.rubric) : RUBRIC_v1;
    const composed = rubric.compose(x.facts, x.answers);
    const body = receiptBody({ rubric, subject: x.subject, state: '', facts: x.facts, answers: x.answers, model: x.model, composed });
    body.stateHash = x.stateHash; // the pack itself is not in the receipt; its hash is carried as is
    checks.rubric = x.rubricHash === rubric.hash;
    checks.verdict = composed.verdict === x.verdict && composed.forced === x.forced;
    checks.receiptHash = receiptHashOf(body) === x.receiptHash;
    checks.inputDigest = sha256Hex(x.input) === x.inputDigest;
    checks.subjectId = subjectIdOf(x.chainSubject) === x.subjectId;
    if (x.answers && x.decision && x.answersRecord) {
      const dA = decisionAnswersOf(x.answers, rubric.questions);
      checks.decisionDigest = decisionDigest({ kind: x.decision.kind, subject: x.chainSubject, answers: dA, model: x.model, input_digest: x.inputDigest }) === x.decision.digest;
      checks.confidenceBps = confidenceBpsOf(dA) === x.decision.confidenceBps;
      checks.answersDigest = answersDigestOf(x.answersRecord) === x.answersDigest;
    }
    for (const [k, v] of Object.entries(checks)) if (!v) problems.push(`${k} does not recompute`);
    answersDigest = x.answersDigest; subjectId = x.subjectId; decision = x.decision?.digest ?? null;
  }
  if (opts.chain !== false && answersDigest) {
    try {
      if (!dev.answerLog || !dev.decisionLog) throw new Error(`this package version carries no ${network} address for the logs`);
      if (network === 'base') {
        const at = await recordedAt(rpc, f, dev.answerLog.address, answersDigest);
        if (at > 0) onChain.answers = (await logs(rpc, f, dev.answerLog.address, [TOPIC_ANSWERED, null, null, answersDigest], at, at)).map(answerEvent);
      } else onChain.answers = (await logs(rpc, f, dev.answerLog.address, [TOPIC_ANSWERED, null, null, answersDigest], dev.answerLog.fromBlock)).map(answerEvent);
      // a bare digest: the answer row names its subject and decision, so the decision row can be found too
      const first = onChain.answers[0];
      if (!subjectId && first && !/^0x0{64}$/.test(first.decisionDigest)) { subjectId = first.subject; decision = first.decisionDigest; }
      if (subjectId && decision) {
        const found = network === 'base' && first
          ? await logsWindowed(rpc, f, dev.decisionLog.address, [TOPIC_DECIDED, subjectId], Math.max(dev.decisionLog.fromBlock, first.block - 4000), first.block + 4000)
          : await logs(rpc, f, dev.decisionLog.address, [TOPIC_DECIDED, subjectId], dev.decisionLog.fromBlock);
        onChain.decisions = found.map(decisionEvent).filter((d) => d.digest.toLowerCase() === decision!.toLowerCase());
      }
    } catch (e) { problems.push(`chain read failed: ${e instanceof Error ? e.message : String(e)}`); }
    checks.answersOnChain = onChain.answers.length > 0;
    if (decision) checks.decisionOnChain = onChain.decisions.length > 0;
  }
  const recomputed = Object.entries(checks).filter(([k]) => !k.endsWith('OnChain')).every(([, v]) => v);
  return { ok: recomputed && (opts.chain === false || Boolean(checks.answersOnChain)), checks, onChain, problems };
}
