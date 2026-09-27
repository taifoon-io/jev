// Virtuals ERC-8183 (AgenticCommerceV3 on Base). When the job names you as its evaluator you end it:
// complete(jobId, reason, optParams) or reject(jobId, reason, optParams). `reason` is a bytes32 — the decision digest.
import { encodeCall } from '../abi.js';
import { CONTRACTS } from '../contracts.js';
import { asUint, type Adapter } from './types.js';

export const ABI = { complete: 'complete(uint256,bytes32,bytes)', reject: 'reject(uint256,bytes32,bytes)' } as const;
export const virtualsErc8183: Adapter = {
  name: 'virtuals-erc8183',
  about: 'Virtuals AgenticCommerceV3: complete / reject(jobId, digest, 0x) as the job’s evaluator',
  call: (jobId, verdict, digest, o) => ({
    protocol: 'virtuals-erc8183', chainId: o.chainId ?? CONTRACTS.base.chainId, to: o.to ?? CONTRACTS.base.virtualsErc8183, value: '0', fn: ABI[verdict],
    data: encodeCall(ABI[verdict], [asUint(jobId), digest, '0x']),
    signer: 'the address the job names as evaluator',
  }),
};
