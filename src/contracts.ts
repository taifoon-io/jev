// Where the records and the evaluator seats live. Every address here was read from the chain or from its deploy
// broadcast; nothing is deployed by this package. The contract addresses come from the address registry (src/addresses.ts,
// vendored by scripts/vendor-addresses.mjs); the recorder and the BitAgent evaluator are accounts, not registry contracts.
import { REGISTRY_ADDRESSES as R } from './addresses.js';

export const CONTRACTS = Object.freeze({
  /** the public devnet the logs live on: chain 36927, free gas; anyone may send */
  devnet: {
    chainId: 36927,
    rpc: 'https://rpc.taifoon.dev',
    /** JevAnswerLog: append-only, no owner. Recorders fixed at deploy are `trusted`; any other sender is logged with trusted = false */
    answerLog: { address: R.devnetAnswerLog.address, fromBlock: R.devnetAnswerLog.block },
    /** JevDecisionLog: append-only, no owner, no upgrade; the recorder is msg.sender */
    decisionLog: { address: R.devnetDecisionLog.address, fromBlock: R.devnetDecisionLog.block },
    /** JudgeAdapter: posts a verdict (with the decision digest) to the devnet assurance hook */
    judgeAdapter: R.devnetJudgeAdapter.address,
    assuranceHook: R.devnetAssuranceHook.address.toLowerCase(),
  },
  /** Base (8453): both logs are live. Only the KMS recorder 0xe9F0E71e7Fc66864126C0aE5588a7858b25dE51D is `trusted` on the answer log. */
  base: {
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    /** JevAnswerLog, redeployed 2026-09-27 (tx 0xeb7d2dac…ae87); supersedes 0x5bac70eb78224bbCBa83f5A36DF09D549d3f57fa */
    answerLog: { address: R.baseAnswerLog.address, fromBlock: R.baseAnswerLog.block } as { address: string; fromBlock: number } | null,
    /** JevDecisionLog, deployed 2026-09-27 (tx 0x0e6300c0…4fc7); the recorder is msg.sender */
    decisionLog: { address: R.baseDecisionLog.address, fromBlock: R.baseDecisionLog.block } as { address: string; fromBlock: number } | null,
    /** the one trusted recorder of the Base answer log */
    answerRecorder: '0xe9F0E71e7Fc66864126C0aE5588a7858b25dE51D',
    virtualsErc8183: R.virtualsErc8183.address,
    virtualsMemoAcpRouter: R.virtualsMemoAcpRouter.address,
    bitagentErc8183: R.bitagentErc8183.address,
    bitagentEvaluator: '0x4302e523D982f3b89Cfc43cE4530C012b495Ec11',
  },
} as const);
