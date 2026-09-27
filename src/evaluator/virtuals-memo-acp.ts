// Virtuals memo-ACP (ACPRouter on Base). The evaluator ends a job by signing its evaluation memo:
// signMemo(memoId, isApproved, reason). Pass the memo id as the job id; the reason carries the verdict and the digest.
import { encodeCall } from '../abi.js';
import { CONTRACTS } from '../contracts.js';
import { asUint, type Adapter } from './types.js';

export const ABI = { signMemo: 'signMemo(uint256,bool,string)' } as const;
export const virtualsMemoAcp: Adapter = {
  name: 'virtuals-memo-acp',
  about: 'Virtuals memo-ACP router: signMemo(memoId, approved, "jev <verdict> <digest>") on the evaluation memo',
  call: (memoId, verdict, digest, o) => ({
    protocol: 'virtuals-memo-acp', chainId: o.chainId ?? CONTRACTS.base.chainId, to: o.to ?? CONTRACTS.base.virtualsMemoAcpRouter, value: '0', fn: ABI.signMemo,
    data: encodeCall(ABI.signMemo, [asUint(memoId), verdict === 'complete', o.reason ?? `jev ${verdict} ${digest}`]),
    signer: 'the job’s evaluator (the memo’s counterparty)',
  }),
};
