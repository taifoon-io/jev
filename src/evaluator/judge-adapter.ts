// JudgeAdapter: the evaluator seat between a judge and an assurance hook. postVerdict(jobId, 1 Conformant | 2
// NonConformant, mode 2 calibrated, digest) stores the verdict once per job and calls hook.complete / hook.reject in the
// same transaction, so the adapter's VerdictPosted, the hook's event and the decision record carry one digest.
import { encodeCall } from '../abi.js';
import { CONTRACTS } from '../contracts.js';
import { asBytes32, type Adapter } from './types.js';

export const ABI = { postVerdict: 'postVerdict(bytes32,uint8,uint8,bytes32)' } as const;
export const judgeAdapter: Adapter = {
  name: 'judge-adapter',
  about: 'JudgeAdapter.postVerdict(jobId, 1|2, 2, digest) → hook.complete / hook.reject (devnet by default)',
  call: (jobId, verdict, digest, o) => ({
    protocol: 'judge-adapter', chainId: o.chainId ?? CONTRACTS.devnet.chainId, to: o.to ?? CONTRACTS.devnet.judgeAdapter, value: '0', fn: ABI.postVerdict,
    data: encodeCall(ABI.postVerdict, [asBytes32(jobId), verdict === 'complete' ? 1 : 2, 2, digest]),
    signer: 'an evaluator registered on the adapter (isEvaluator)',
  }),
};
