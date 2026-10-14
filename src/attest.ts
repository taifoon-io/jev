/**
 * attest: the attested mark, the on-chain attestation and the stamp of one step (a grade, an assurance settle, a resale
 * step), as UNSIGNED calls aimed at a default network chosen by profile. _ATTEST_BY_DEFAULT_v1_
 *
 * ONE file with NO imports, pure and browser-safe, like assurance.ts: @taifoon/jev, @taifoon/assurance (and through its
 * sync, taifoon-sdk and moonbeam-sdk) carry a byte-identical copy and pin its hash. The addresses come from the address
 * registry (packages/addresses) through scripts/gen-attest.mjs; nothing below the generated block names an address.
 *
 *   mark          what is attested, offline: the step's kind, the subject ids (decision log + stamp registry) and the
 *                 digest = keccak256 of the canonical JSON body (or the digest the caller already has, e.g. Jev's).
 *   attestation   JevDecisionLog.record(subject, kind, digest, confidenceBps, model, uri) on every target network, after
 *                 JevAnswerLog.record(...) when the step carries Jev's answers.
 *   stamp         GradeStampRegistry.stamp(subject, digest, verdict, mode, model, uri) when the step has a verdict.
 *
 * Recording is ON by default (the owner's rule of 2026-10-14): profile taifoon → the Taifoon devnet 36927 and the Taifoon
 * mainnet 3692781 (GRID); profile moonbeam → Base 8453. Any network can be named instead; `networks: 'none'` opts out
 * (the mark is still returned). A contract the registry does not have on a target network is listed in `missing`, with
 * no call: nothing is faked. Nothing here signs or sends; the caller signs the calls.
 */

// ── GENERATED from packages/addresses/addresses.json by scripts/gen-attest.mjs: do not edit ──
/** The attestation contracts on every chain the address registry has one on (superseded deploys left out). */
export const ATTEST_TARGETS: Readonly<Record<number, { name: string; decisionLog: string | null; answerLog: string | null; stampRegistry: string | null }>> = {
  143: { name: 'Monad', decisionLog: '0x1aC6266b9926cB3E206D5dc0c9d1B7c873aa150a', answerLog: '0x29fEEc116e0CAbbaf38e9EBF2BBf65d82D672104', stampRegistry: null },
  5042: { name: 'Arc', decisionLog: '0x863db7dAc69CC614a98822082cbe884F1f3b55cA', answerLog: '0x45214361A8cADb8aEe6302cd5653E119E5a89839', stampRegistry: null },
  8453: { name: 'Base', decisionLog: '0x209490d6A0FFC5368A42b0c2208BDCda853f6a92', answerLog: '0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d', stampRegistry: null },
  36927: { name: 'Taifoon devnet', decisionLog: '0x1D622511862DD7DEffB8fEeBc225E0FAdA1e9A05', answerLog: '0xD8c1d8188Fc8EE388792f6EB3B3dbd4f341Ba8e3', stampRegistry: '0xff5B4852AC7066D04FEd8de97bdA52401d03ad6E' },
  42161: { name: 'Arbitrum One', decisionLog: '0x1aC6266b9926cB3E206D5dc0c9d1B7c873aa150a', answerLog: '0x29fEEc116e0CAbbaf38e9EBF2BBf65d82D672104', stampRegistry: null },
  3692781: { name: 'Taifoon mainnet', decisionLog: null, answerLog: null, stampRegistry: null },
};
// ── END GENERATED ──

/** The default networks per profile. Taifoon: its devnet and its mainnet (GRID). Moonbeam: Base only. */
export const ATTEST_PROFILES = { taifoon: [36927, 3692781], moonbeam: [8453] } as const;
export type AttestProfile = keyof typeof ATTEST_PROFILES;

export type AttestHex = `0x${string}`;
export type AttestCall = { chainId: number; to: string; data: AttestHex; value: '0'; fn: 'JevDecisionLog.record' | 'JevAnswerLog.record' | 'GradeStampRegistry.stamp' };
export type AttestMissing = { chainId: number; network: string; contract: 'JevDecisionLog' | 'JevAnswerLog' | 'GradeStampRegistry'; why: string };
/** the REF verdict vocabulary of GradeStampRegistry: 1 delivered as specified · 2 with defects · 3 not delivered · 4 cannot determine */
export type StampVerdict = 1 | 2 | 3 | 4;
export type AttestInput = {
  /** the step: 'grade', 'assurance.settle', 'resale.<hop>' … (the decision log's kind is keccak256 of it) */
  kind: string;
  /** the job the step is about, on its own chain and contract */
  subject: { chainId: number; contract: string; jobId: string | number | bigint };
  /** the canonical body of the step; its keccak256 is the digest unless `digest` is given */
  body?: unknown | undefined;
  digest?: AttestHex | undefined;
  /** 0..10000; default 10000 (a deterministic step) */
  confidenceBps?: number | undefined;
  /** ≤ 64 bytes, e.g. 'jev-1.13.0' or 'det:assurance-settle-v1' */
  model: string;
  /** ≤ 512 bytes; default urn:taifoon:<kind>:<digest> */
  uri?: string | undefined;
  /** a stamp is built when there is a verdict; mode 1 deterministic (default) · 2 calibrated */
  verdict?: StampVerdict | null | undefined;
  mode?: 1 | 2 | undefined;
  /** Jev's answer record digests: adds JevAnswerLog.record */
  answers?: { useCase: string; inputDigest: AttestHex; answersDigest: AttestHex; uri?: string | undefined } | undefined;
};
export type AttestOptions = {
  /** picks the default networks; default 'taifoon' */
  profile?: AttestProfile | undefined;
  /** overrides the profile: chain ids, or 'none' to opt out of recording (the mark is still returned) */
  networks?: readonly number[] | 'none' | undefined;
  /** extra or replacement contracts per chain (e.g. a fork's deploy, or a network the registry does not list) */
  targets?: Readonly<Record<number, Partial<{ name: string; decisionLog: string | null; answerLog: string | null; stampRegistry: string | null }>>> | undefined;
};
export type Attested = {
  mark: { kind: string; kindId: AttestHex; subject: AttestHex; stampSubject: AttestHex; digest: AttestHex; confidenceBps: number; verdict: StampVerdict | null; model: string; uri: string };
  /** false only when the caller opted out */
  recorded: boolean;
  networks: number[];
  calls: AttestCall[];
  missing: AttestMissing[];
  /** ready: every target contract exists · partial: some are missing · missing: none exist · none: opted out */
  status: 'ready' | 'partial' | 'missing' | 'none';
};

// ── keccak256 (the same code as packages/addresses/keccak.mjs; test/attest.test.ts checks known vectors) ──
const KM = (1n << 64n) - 1n;
const KRC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KR = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const krot = (v: bigint, n: number) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & KM);
function kf(A: bigint[]) {
  const C: bigint[] = [0n, 0n, 0n, 0n, 0n]; const B: bigint[] = new Array<bigint>(25).fill(0n);
  const at = (a: bigint[], i: number) => a[i] as bigint;
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) C[x] = at(A, x) ^ at(A, x + 5) ^ at(A, x + 10) ^ at(A, x + 15) ^ at(A, x + 20);
    for (let x = 0; x < 5; x++) { const d = at(C, (x + 4) % 5) ^ krot(at(C, (x + 1) % 5), 1); for (let y = 0; y < 25; y += 5) A[x + y] = at(A, x + y) ^ d; }
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = krot(at(A, x + 5 * y), KR[x + 5 * y] as number);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] = at(B, x + 5 * y) ^ (~at(B, (x + 1) % 5 + 5 * y) & KM & at(B, (x + 2) % 5 + 5 * y));
    A[0] = at(A, 0) ^ (KRC[round] as bigint);
  }
}
/** UTF-8 bytes of a string (no TextEncoder: the file runs where no DOM or Node lib is typed) */
function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
export function attestKeccak(input: Uint8Array | string): AttestHex {
  const bytes = typeof input === 'string' ? utf8(input) : input;
  const rate = 136; const A: bigint[] = new Array<bigint>(25).fill(0n);
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes); padded[bytes.length] = (padded[bytes.length] as number) ^ 0x01; padded[padded.length - 1] = (padded[padded.length - 1] as number) ^ 0x80;
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) { let w = 0n; for (let b = 7; b >= 0; b--) w = (w << 8n) | BigInt(padded[off + i * 8 + b] as number); A[i] = (A[i] as bigint) ^ w; }
    kf(A);
  }
  let out = '0x';
  for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) out += Number(((A[i] as bigint) >> BigInt(8 * b)) & 0xffn).toString(16).padStart(2, '0');
  return out as AttestHex;
}

// ── ABI encoding (only the types these three calls use) ──
const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const bytesOf = (h: string) => { const s = h.replace(/^0x/, ''); const o = new Uint8Array(s.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16); return o; };
const word = (n: bigint) => { if (n < 0n || n >= 1n << 256n) throw new Error(`attest: ${n} does not fit a uint256`); return n.toString(16).padStart(64, '0'); };
const isHex32 = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v);
const isAddr = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);
type AbiArg = { t: 'bytes32' | 'address' | 'uint' | 'string'; v: string | bigint | number };
function encodeArgs(args: AbiArg[]): string {
  let head = ''; let tail = ''; const headLen = args.length * 32;
  for (const a of args) {
    if (a.t === 'string') {
      const b = utf8(String(a.v)); head += word(BigInt(headLen + tail.length / 2));
      tail += word(BigInt(b.length)) + hexOf(b).padEnd(Math.ceil(b.length / 32) * 64, '0');
    } else if (a.t === 'bytes32') { if (!isHex32(String(a.v))) throw new Error(`attest: ${a.v} is not a bytes32`); head += String(a.v).slice(2).toLowerCase(); }
    else if (a.t === 'address') { if (!isAddr(String(a.v))) throw new Error(`attest: ${a.v} is not an address`); head += String(a.v).slice(2).toLowerCase().padStart(64, '0'); }
    else head += word(BigInt(a.v));
  }
  return head + tail;
}
const selector = (sig: string) => attestKeccak(sig).slice(2, 10);
const call = (sig: string, args: AbiArg[]): AttestHex => `0x${selector(sig)}${encodeArgs(args)}`;

export const DECISION_LOG_RECORD_SIG = 'record(bytes32,bytes32,bytes32,uint16,string,string)';
export const ANSWER_LOG_RECORD_SIG = 'record(bytes32,bytes32,bytes32,bytes32,bytes32,string,string)';
export const STAMP_SIG = 'stamp(bytes32,bytes32,uint8,uint8,string,string)';

/** canonical JSON: sorted keys, bigint as a decimal string, no whitespace (the digest's preimage) */
export function attestCanonical(v: unknown): string {
  if (typeof v === 'bigint') return JSON.stringify(v.toString());
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(attestCanonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${attestCanonical(o[k])}`).join(',')}}`;
}
const jobRef = (id: string | number | bigint): AttestHex => (typeof id === 'string' && isHex32(id) ? (id as AttestHex) : (`0x${word(BigInt(id))}` as AttestHex));
/** JevDecisionLog.subjectOf(chainId, at, ref) = keccak256(abi.encode("taifoon.decision.subject.v1", chainId, at, ref)) */
export const decisionSubjectOf = (chainId: number, at: string, ref: string | number | bigint): AttestHex =>
  attestKeccak(bytesOf(encodeArgs([{ t: 'string', v: 'taifoon.decision.subject.v1' }, { t: 'uint', v: chainId }, { t: 'address', v: at }, { t: 'bytes32', v: jobRef(ref) }])));
/** GradeStampRegistry.subjectOf(chainId, jobContract, jobId) = keccak256(abi.encode("taifoon.stamp.subject.v1", …)) */
export const stampSubjectOf = (chainId: number, jobContract: string, jobId: string | number | bigint): AttestHex =>
  attestKeccak(bytesOf(encodeArgs([{ t: 'string', v: 'taifoon.stamp.subject.v1' }, { t: 'uint', v: chainId }, { t: 'address', v: jobContract }, { t: 'bytes32', v: jobRef(jobId) }])));

/** the stamp verdict of a settled ending, from the seller-record verdict the machine writes (endingOf): correct → 1;
 *  a Jev case (rejected or expired after delivery) → 4, it takes a grade to say more; incorrect → 3; excluded → no stamp */
export function stampVerdictOfEnding(e: { verdict: string; jevCase: boolean; excluded: string | null }): StampVerdict | null {
  if (e.excluded) return null;
  if (e.verdict === 'correct') return 1;
  if (e.jevCase || e.verdict === 'undecided') return 4;
  if (e.verdict === 'incorrect') return 3;
  return null;
}

/** the mark, the attestation calls and the stamp call of one step, on the profile's networks (or the ones named) */
export function attest(input: AttestInput, opts: AttestOptions = {}): Attested {
  const { subject } = input;
  if (!isAddr(subject.contract)) throw new Error(`attest: subject.contract ${subject.contract} is not an address`);
  if (!input.kind) throw new Error('attest: a kind names the step');
  const digest = input.digest ?? attestKeccak(attestCanonical(input.body ?? null));
  if (!isHex32(digest) || /^0x0{64}$/.test(digest)) throw new Error('attest: the digest must be a non-zero bytes32');
  const confidenceBps = input.confidenceBps ?? 10_000;
  if (!Number.isInteger(confidenceBps) || confidenceBps < 0 || confidenceBps > 10_000) throw new Error(`attest: confidenceBps ${confidenceBps} is not 0..10000`);
  const model = input.model; if (!model || utf8(model).length > 64) throw new Error('attest: model is 1..64 bytes');
  const uri = input.uri ?? `urn:taifoon:${input.kind}:${digest}`; if (utf8(uri).length > 512) throw new Error('attest: uri is ≤ 512 bytes');
  const verdict = input.verdict ?? null; const mode = input.mode ?? 1;
  if (verdict !== null && ![1, 2, 3, 4].includes(verdict)) throw new Error(`attest: verdict ${verdict} is not 1..4`);
  const kindId = attestKeccak(input.kind);
  const mark = { kind: input.kind, kindId, subject: decisionSubjectOf(subject.chainId, subject.contract, subject.jobId), stampSubject: stampSubjectOf(subject.chainId, subject.contract, subject.jobId), digest, confidenceBps, verdict, model, uri };
  if (opts.networks === 'none') return { mark, recorded: false, networks: [], calls: [], missing: [], status: 'none' };
  const networks = [...(opts.networks ?? ATTEST_PROFILES[opts.profile ?? 'taifoon'])];
  const calls: AttestCall[] = []; const missing: AttestMissing[] = [];
  for (const chainId of networks) {
    const t = { name: `chain ${chainId}`, decisionLog: null, answerLog: null, stampRegistry: null, ...ATTEST_TARGETS[chainId], ...opts.targets?.[chainId] };
    const gap = (contract: AttestMissing['contract']) => missing.push({ chainId, network: t.name, contract, why: `no ${contract} on ${t.name} (${chainId}) in the address registry` });
    // the answers first, then the decision that cites them (the order the layer's recorder sends)
    if (input.answers) {
      if (t.answerLog) calls.push({ chainId, to: t.answerLog, value: '0', fn: 'JevAnswerLog.record', data: call(ANSWER_LOG_RECORD_SIG, [{ t: 'bytes32', v: attestKeccak(input.answers.useCase) }, { t: 'bytes32', v: mark.subject }, { t: 'bytes32', v: input.answers.inputDigest }, { t: 'bytes32', v: input.answers.answersDigest }, { t: 'bytes32', v: digest }, { t: 'string', v: model }, { t: 'string', v: input.answers.uri ?? uri }]) });
      else gap('JevAnswerLog');
    }
    if (t.decisionLog) calls.push({ chainId, to: t.decisionLog, value: '0', fn: 'JevDecisionLog.record', data: call(DECISION_LOG_RECORD_SIG, [{ t: 'bytes32', v: mark.subject }, { t: 'bytes32', v: kindId }, { t: 'bytes32', v: digest }, { t: 'uint', v: confidenceBps }, { t: 'string', v: model }, { t: 'string', v: uri }]) });
    else gap('JevDecisionLog');
    if (verdict !== null) {
      if (t.stampRegistry) calls.push({ chainId, to: t.stampRegistry, value: '0', fn: 'GradeStampRegistry.stamp', data: call(STAMP_SIG, [{ t: 'bytes32', v: mark.stampSubject }, { t: 'bytes32', v: digest }, { t: 'uint', v: verdict }, { t: 'uint', v: mode }, { t: 'string', v: model }, { t: 'string', v: uri }]) });
      else gap('GradeStampRegistry');
    }
  }
  const status = missing.length === 0 ? 'ready' : calls.length === 0 ? 'missing' : 'partial';
  return { mark, recorded: true, networks, calls, missing, status };
}
