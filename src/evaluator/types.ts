import type { Hex } from '../hash.js';

export type EvaluatorVerdict = 'complete' | 'reject';
export type EvaluatorCall = {
  protocol: string; chainId: number; to: string; data: Hex; value: '0';
  fn: string;
  /** who must sign: the seat the protocol checks */
  signer: string;
};
export type AdapterOpts = { to?: string; chainId?: number; seat?: 'job' | 'platform'; reason?: string };
export type Adapter = {
  name: string;
  /** what it is, in a line */
  about: string;
  call: (jobId: string | number | bigint, verdict: EvaluatorVerdict, digest: Hex, opts: AdapterOpts) => EvaluatorCall;
};
export const need = (v: string | undefined, what: string): string => { if (!v) throw new Error(`${what} is required for this adapter (opts.to)`); return v; };
export const asBytes32 = (id: string | number | bigint): Hex => { const s = String(id); if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error(`job id must be a 32-byte hex id here, got ${s.slice(0, 20)}`); return s.toLowerCase() as Hex; };
export const asUint = (id: string | number | bigint): bigint => { const n = BigInt(id); if (n < 0n) throw new Error('job id must be ≥ 0'); return n; };
