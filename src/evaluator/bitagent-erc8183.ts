// BitAgent / Unibase ERC-8183 (AgenticCommerce on Base; implementation unverified, layout read from its transactions).
//   seat "job" (default): you are the job's evaluator → AgenticCommerce complete / reject(jobId, digest, 0x), the same
//     (uint256, bytes32, bytes) layout its submit uses.
//   seat "platform": the platform Evaluator contract's forceSettleJob(jobId, approved) — what settles its jobs today;
//     only BitAgent's operators may send it.
import { encodeCall } from '../abi.js';
import { CONTRACTS } from '../contracts.js';
import { asUint, type Adapter } from './types.js';

export const ABI = { complete: 'complete(uint256,bytes32,bytes)', reject: 'reject(uint256,bytes32,bytes)', forceSettleJob: 'forceSettleJob(uint256,bool)' } as const;
export const bitagentErc8183: Adapter = {
  name: 'bitagent-erc8183',
  about: 'BitAgent AgenticCommerce: complete / reject(jobId, digest, 0x) as evaluator; seat "platform" = Evaluator.forceSettleJob',
  call: (jobId, verdict, digest, o) => o.seat === 'platform'
    ? { protocol: 'bitagent-erc8183', chainId: o.chainId ?? CONTRACTS.base.chainId, to: o.to ?? CONTRACTS.base.bitagentEvaluator, value: '0', fn: ABI.forceSettleJob,
      data: encodeCall(ABI.forceSettleJob, [asUint(jobId), verdict === 'complete']), signer: 'a BitAgent platform operator (the Evaluator contract’s own access control)' }
    : { protocol: 'bitagent-erc8183', chainId: o.chainId ?? CONTRACTS.base.chainId, to: o.to ?? CONTRACTS.base.bitagentErc8183, value: '0', fn: ABI[verdict],
      data: encodeCall(ABI[verdict], [asUint(jobId), digest, '0x']), signer: 'the address the job names as evaluator' },
};
