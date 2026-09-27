// Where the records and the evaluator seats live. Every address here was read from the chain or from its deploy
// broadcast; nothing is deployed by this package.
export const CONTRACTS = Object.freeze({
  /** the public devnet the logs live on: chain 36927, free gas; anyone may send */
  devnet: {
    chainId: 36927,
    rpc: 'https://rpc.taifoon.dev',
    /** JevAnswerLog: append-only, no owner. Recorders fixed at deploy are `trusted`; any other sender is logged with trusted = false */
    answerLog: { address: '0xD8c1d8188Fc8EE388792f6EB3B3dbd4f341Ba8e3', fromBlock: 1_106_754 },
    /** JevDecisionLog: append-only, no owner, no upgrade; the recorder is msg.sender */
    decisionLog: { address: '0x1D622511862DD7DEffB8fEeBc225E0FAdA1e9A05', fromBlock: 981_099 },
    /** JudgeAdapter: posts a verdict (with the decision digest) to the devnet assurance hook */
    judgeAdapter: '0xbd4c9e797a8DBbfdde9C77bc5A5b21ACf611Db8f',
    assuranceHook: '0x7110c8951d17b69054395742e265bbd98259564a',
  },
  /** Base (8453): both logs are live. Only the KMS recorder 0xe9F0E71e7Fc66864126C0aE5588a7858b25dE51D is `trusted` on the answer log. */
  base: {
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    /** JevAnswerLog, redeployed 2026-09-27 (tx 0xeb7d2dac…ae87); supersedes 0x5bac70eb78224bbCBa83f5A36DF09D549d3f57fa */
    answerLog: { address: '0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d', fromBlock: 51_863_008 } as { address: string; fromBlock: number } | null,
    /** JevDecisionLog, deployed 2026-09-27 (tx 0x0e6300c0…4fc7); the recorder is msg.sender */
    decisionLog: { address: '0x209490d6A0FFC5368A42b0c2208BDCda853f6a92', fromBlock: 51_856_200 } as { address: string; fromBlock: number } | null,
    /** the one trusted recorder of the Base answer log */
    answerRecorder: '0xe9F0E71e7Fc66864126C0aE5588a7858b25dE51D',
    virtualsErc8183: '0x238E541BfefD82238730D00a2208E5497F1832E0',
    virtualsMemoAcpRouter: '0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0',
    bitagentErc8183: '0x5009ABB3A309115a4a682C66BAf3BC9E0329BaB7',
    bitagentEvaluator: '0x4302e523D982f3b89Cfc43cE4530C012b495Ec11',
  },
} as const);
