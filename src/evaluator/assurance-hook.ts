// An assurance hook (the AssuranceHook family: Taifoon's, Moonbeam's on Base). The job's evaluator — or its buyer —
// ends it: complete(jobId) pays the seller; reject(jobId, digest) walks every party back and records the digest.
import { encodeCall } from '../abi.js';
import { asBytes32, need, type Adapter } from './types.js';

export const ABI = { complete: 'complete(bytes32)', reject: 'reject(bytes32,bytes32)' } as const;
export const assuranceHook: Adapter = {
  name: 'assurance-hook',
  about: 'AssuranceHook: complete(jobId) or reject(jobId, digest); pass the hook address as opts.to',
  call: (jobId, verdict, digest, o) => ({
    protocol: 'assurance-hook', chainId: o.chainId ?? 8453, to: need(o.to, 'the hook address'), value: '0',
    fn: verdict === 'complete' ? ABI.complete : ABI.reject,
    data: verdict === 'complete' ? encodeCall(ABI.complete, [asBytes32(jobId)]) : encodeCall(ABI.reject, [asBytes32(jobId), digest]),
    signer: 'the job’s buyer or an evaluator the hook registered',
  }),
};
