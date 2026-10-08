// verify(): recompute every digest a receipt carries, re-compose its verdict from its own answers, then find the chain
// events that hold those digests. Given a bare answers digest, it finds the JevAnswered log for it.
import { decode, type AbiType } from './abi.js';
import { chainIdOf, chainName, DEVNET, jevLogsOn } from './chains.js';
import { JevChainError } from './errors.js';
import { rangeCapOf, rpcCall, rpcRotation } from './rpc.js';
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
  /** status: recorded (the answer row is on chain) · not_recorded (the chain answered, no row) · rpc_unavailable (no endpoint
   *  answered: the row may exist) · not_deployed (no Jev log on that chain) · skipped (chain: false) */
  onChain: { chainId: number; answers: AnswerEvent[]; decisions: DecisionEvent[]; status?: ChainStatus };
  problems: string[];
};

export type ChainStatus = 'recorded' | 'not_recorded' | 'rpc_unavailable' | 'not_deployed' | 'skipped';
export type Log = { transactionHash: string; blockNumber: string; topics: string[]; data: Hex };
const hexN = (n: number) => '0x' + n.toString(16);
type Rpc = string | readonly string[];
async function logs(rpc: Rpc, f: typeof fetch, address: string, topics: Array<string | null>, fromBlock: number, toBlock?: number, chainId?: number): Promise<Log[]> {
  return (await rpcCall<Log[]>(rpc, f, 'eth_getLogs', [{ address, topics, fromBlock: hexN(fromBlock), toBlock: toBlock == null ? 'latest' : hexN(toBlock) }], { chainId })) ?? [];
}
const SEL_RECORDED_AT = keccakHex('recordedAt(bytes32)').slice(0, 10);
/** JevAnswerLog.recordedAt(digest): the block of the first trusted record, 0 when none. */
async function recordedAt(rpc: Rpc, f: typeof fetch, address: string, digest: Hex, chainId?: number): Promise<number> {
  const out = await rpcCall<string>(rpc, f, 'eth_call', [{ to: address, data: SEL_RECORDED_AT + digest.slice(2) }, 'latest'], { chainId });
  return out && out !== '0x' ? Number(BigInt(out)) : 0;
}
export { rangeCapOf };
/**
 * eth_getLogs over [from, to], nearest to `center` first, in windows of at most `step` blocks (public Base endpoints
 * refuse wide ranges: mainnet.base.org caps a call at 500 blocks). A refusal that names a smaller cap shrinks the
 * window and retries. Stops at the first window where `hit` matches, so a record next to its answer costs one call.
 */
export async function logsAround(
  rpc: Rpc, f: typeof fetch, address: string, topics: Array<string | null>, center: number, from: number, to: number,
  hit: (l: Log) => boolean, step = 500, chainId?: number,
): Promise<Log[]> {
  const head = Number(BigInt(await rpcCall<string>(rpc, f, 'eth_blockNumber', [], { chainId })));
  to = Math.min(to, head); // endpoints refuse a range past the head
  center = Math.min(Math.max(center, from), to);
  const out: Log[] = [];
  const get = async (a: number, b: number): Promise<Log[]> => {
    for (;;) {
      try {
        const got: Log[] = [];
        for (let x = a; x <= b; x += step) got.push(...(await logs(rpc, f, address, topics, x, Math.min(b, x + step - 1), chainId)));
        return got;
      } catch (e) {
        const cap = rangeCapOf(e instanceof Error ? e.message : String(e));
        if (!cap || cap >= step) throw e;
        step = cap;
      }
    }
  };
  // the window around the center, then outward on both sides, one window at a time
  let lo = Math.max(from, center - Math.floor(step / 2)), hi = Math.min(to, lo + step - 1);
  out.push(...(await get(lo, hi)));
  while (!out.some(hit) && (lo > from || hi < to)) {
    if (hi < to) { const b = Math.min(to, hi + step); out.push(...(await get(hi + 1, b))); hi = b; }
    if (out.some(hit)) break;
    if (lo > from) { const a = Math.max(from, lo - step); out.push(...(await get(a, lo - 1))); lo = a; }
  }
  return out;
}
const answerEvent = (l: Log): AnswerEvent => { const [recorder, inputDigest, decisionDigest, model, uri, , trusted] = decode(ANSWERED_DATA, l.data); return { tx: l.transactionHash, block: parseInt(l.blockNumber, 16), recorder: String(recorder), trusted: Boolean(trusted), subject: l.topics[2] as Hex, inputDigest: inputDigest as Hex, decisionDigest: decisionDigest as Hex, model: String(model), uri: String(uri) }; };
const decisionEvent = (l: Log): DecisionEvent => { const [index, digest, bps, model, uri] = decode(DECIDED_DATA, l.data); return { tx: l.transactionHash, block: parseInt(l.blockNumber, 16), recorder: `0x${String(l.topics[3]).slice(26)}`, index: Number(index), digest: digest as Hex, confidenceBps: Number(bps), model: String(model), uri: String(uri) }; };

/** Which chain verify() reads: 'devnet' (default, 36927), 'base', a chain id or a chain name ("arbitrum", "arc", "monad" …). */
export type VerifyNetwork = 'devnet' | 'base' | number | string;
export type VerifyOptions = {
  /** one URL, a comma list or a list: read through these instead of warmbed's rotation */
  rpc?: string | readonly string[];
  fetch?: typeof fetch; rubric?: Rubric | RubricInput;
  /** false: recompute the digests only, read no chain */
  chain?: boolean;
  network?: VerifyNetwork;
  /** a block near the decision row (a decision record's anchor.block): its window is read first */
  decisionBlock?: number;
};

/**
 * Recompute a receipt (or take a bare answers digest), then find its rows on one chain. Every chain but the devnet is
 * read through JevAnswerLog.recordedAt (trusted records only) and the decision row in windows around it, because public
 * endpoints refuse wide log ranges; the devnet is read in one range. The chain is read through warmbed's rotation, then
 * the registry's static list; `rpc` overrides both.
 */
export async function verify(x: Receipt | string, opts: VerifyOptions = {}): Promise<Verification> {
  const chainId = chainIdOf(opts.network ?? 'devnet');
  const f = opts.fetch ?? fetch;
  const dev = { chainId, ...(jevLogsOn(chainId) ?? { answerLog: null, decisionLog: null }) } as
    { chainId: number; answerLog: { address: string; fromBlock: number } | null; decisionLog: { address: string; fromBlock: number } | null };
  const checks: Record<string, boolean> = {}; const problems: string[] = [];
  const onChain: Verification['onChain'] = { chainId: dev.chainId, answers: [], decisions: [], status: 'skipped' };
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
    const where = chainName(chainId);
    if (!dev.answerLog || !dev.decisionLog) {
      onChain.status = 'not_deployed'; problems.push(`no Jev log is deployed on ${where}`);
    } else {
      try {
        // an explicit rpc (one URL, a comma list or a list) wins; otherwise warmbed's rotation, then the static fallback
        const given = typeof opts.rpc === 'string' ? opts.rpc.split(',').map((u) => u.trim()).filter(Boolean) : opts.rpc;
        const rpc: Rpc = given?.length ? given : await rpcRotation(chainId, f);
        if (chainId !== DEVNET) {
          const at = await recordedAt(rpc, f, dev.answerLog.address, answersDigest, chainId);
          if (at > 0) onChain.answers = (await logs(rpc, f, dev.answerLog.address, [TOPIC_ANSWERED, null, null, answersDigest], at, at, chainId)).map(answerEvent);
        } else onChain.answers = (await logs(rpc, f, dev.answerLog.address, [TOPIC_ANSWERED, null, null, answersDigest], dev.answerLog.fromBlock, undefined, chainId)).map(answerEvent);
        // a bare digest: the answer row names its subject and decision, so the decision row can be found too
        const first = onChain.answers[0];
        if (!subjectId && first && !/^0x0{64}$/.test(first.decisionDigest)) { subjectId = first.subject; decision = first.decisionDigest; }
        if (subjectId && decision) {
          const center = opts.decisionBlock ?? first?.block;
          const found = chainId !== DEVNET && center
            ? await logsAround(rpc, f, dev.decisionLog.address, [TOPIC_DECIDED, subjectId], center, Math.max(dev.decisionLog.fromBlock, center - 4000), center + 4000,
              (l) => decisionEvent(l).digest.toLowerCase() === decision!.toLowerCase(), 500, chainId)
            : await logs(rpc, f, dev.decisionLog.address, [TOPIC_DECIDED, subjectId], dev.decisionLog.fromBlock, undefined, chainId);
          onChain.decisions = found.map(decisionEvent).filter((d) => d.digest.toLowerCase() === decision!.toLowerCase());
        }
        onChain.status = onChain.answers.length ? 'recorded' : 'not_recorded';
        if (!onChain.answers.length) problems.push(`not recorded on ${where}`);
      } catch (e) {
        const unavailable = !(e instanceof JevChainError) || e.code === 'rpc_unavailable';
        onChain.status = unavailable ? 'rpc_unavailable' : onChain.answers.length ? 'recorded' : 'not_recorded';
        problems.push(`${unavailable ? `RPC unavailable on ${where}` : `chain read failed on ${where}`}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    checks.answersOnChain = onChain.answers.length > 0;
    if (decision) checks.decisionOnChain = onChain.decisions.length > 0;
  }
  const recomputed = Object.entries(checks).filter(([k]) => !k.endsWith('OnChain')).every(([, v]) => v);
  return { ok: recomputed && (opts.chain === false || Boolean(checks.answersOnChain)), checks, onChain, problems };
}
