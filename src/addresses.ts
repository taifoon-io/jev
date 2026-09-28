// VENDORED from an address registry (addresses.json, public subset) by scripts/vendor-addresses.mjs - do not edit here.
// Only the contracts this SDK names; test/addresses-vendor.test.ts checks the copy against the registry.
export const REGISTRY_ADDRESSES = {
  /** jev · JevAnswerLog (devnet) (devnet-only) */
  devnetAnswerLog: { chainId: 36927, address: '0xD8c1d8188Fc8EE388792f6EB3B3dbd4f341Ba8e3', block: 1106754 },
  /** jev · JevDecisionLog (devnet) (devnet-only) */
  devnetDecisionLog: { chainId: 36927, address: '0x1D622511862DD7DEffB8fEeBc225E0FAdA1e9A05', block: 981099 },
  /** taifoon-assurance · JudgeAdapter (devnet) (devnet-only) */
  devnetJudgeAdapter: { chainId: 36927, address: '0xbd4c9e797a8DBbfdde9C77bc5A5b21ACf611Db8f', block: null },
  /** taifoon-assurance · AssuranceHook (proxy, devnet) (devnet-only) */
  devnetAssuranceHook: { chainId: 36927, address: '0x7110C8951d17B69054395742e265bbd98259564A', block: 909786 },
  /** jev · JevAnswerLog (live) */
  baseAnswerLog: { chainId: 8453, address: '0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d', block: 51863008 },
  /** jev · JevAnswerLog (first deploy) (superseded) */
  baseAnswerLogFirstDeploy: { chainId: 8453, address: '0x5bac70eb78224bbCBa83f5A36DF09D549d3f57fa', block: 51856203 },
  /** jev · JevDecisionLog (live) */
  baseDecisionLog: { chainId: 8453, address: '0x209490d6A0FFC5368A42b0c2208BDCda853f6a92', block: 51856200 },
  /** standards-erc8183 · Virtuals ACP v3 (ERC-8183) (live) */
  virtualsErc8183: { chainId: 8453, address: '0x238E541BfefD82238730D00a2208E5497F1832E0', block: 44427013 },
  /** standards-erc8183 · memo-ACP router (live) */
  virtualsMemoAcpRouter: { chainId: 8453, address: '0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0', block: 36786061 },
  /** standards-erc8183 · BitAgent ERC-8183 escrow (live) */
  bitagentErc8183: { chainId: 8453, address: '0x5009ABB3A309115a4a682C66BAf3BC9E0329BaB7', block: 48395723 },
} as const;
