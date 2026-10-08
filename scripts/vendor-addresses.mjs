// Copy the contract addresses this SDK names out of the address registry's public subset (addresses.json) into
// src/addresses.ts. @taifoon/jev ships no third-party runtime dependencies, so the registry is vendored, not installed;
// test/addresses-vendor.test.ts fails when the copy differs from the registry (skipped where the registry is absent).
//   node scripts/vendor-addresses.mjs [registry public/addresses.json]    write src/addresses.ts
//   node scripts/vendor-addresses.mjs --check                             exit 1 on drift
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(root, 'src', 'addresses.ts');
export const REGISTRY = process.env.ADDRESS_REGISTRY ?? join(root, '..', '..', 'packages', 'addresses', 'public', 'addresses.json');

/** [key, system, chain, exact registry name]: the only entries the SDK names. */
export const PICKS = [
  ['devnetAnswerLog', 'jev', 36927, 'JevAnswerLog (devnet)'],
  ['devnetDecisionLog', 'jev', 36927, 'JevDecisionLog (devnet)'],
  ['devnetJudgeAdapter', 'taifoon-assurance', 36927, 'JudgeAdapter (devnet)'],
  ['devnetAssuranceHook', 'taifoon-assurance', 36927, 'AssuranceHook (proxy, devnet)'],
  ['baseAnswerLog', 'jev', 8453, 'JevAnswerLog'],
  ['baseAnswerLogFirstDeploy', 'jev', 8453, 'JevAnswerLog (first deploy)'],
  ['baseDecisionLog', 'jev', 8453, 'JevDecisionLog'],
  ['virtualsErc8183', 'standards-erc8183', 8453, 'Virtuals ACP v3 (ERC-8183)'],
  ['virtualsMemoAcpRouter', 'standards-erc8183', 8453, 'memo-ACP router'],
  ['bitagentErc8183', 'standards-erc8183', 8453, 'BitAgent ERC-8183 escrow'],
];

export const found = () => existsSync(REGISTRY);

export function render(doc) {
  const rows = PICKS.map(([key, system, chain, name]) => {
    const c = doc.systems[system]?.contracts.find((x) => x.chain === chain && x.name === name);
    if (!c) throw new Error(`the registry has no ${system} "${name}" on chain ${chain}`);
    return `  /** ${system} · ${name} (${c.status}) */\n  ${key}: { chainId: ${chain}, address: '${c.address}', block: ${c.deploy.block ?? 'null'} },`;
  });
  // every chain the registry has a live (or devnet) JevAnswerLog AND JevDecisionLog on: verify() reads any of them
  const jev = (doc.systems.jev?.contracts ?? []).filter((c) => c.status !== 'superseded');
  const pick = (chain, base) => jev.find((c) => c.chain === chain && (c.name === base || c.name === `${base} (devnet)`));
  const chains = [...new Set(jev.map((c) => c.chain))].sort((a, b) => a - b).filter((c) => pick(c, 'JevAnswerLog') && pick(c, 'JevDecisionLog'));
  const logRows = chains.map((c) => { const a = pick(c, 'JevAnswerLog'); const d = pick(c, 'JevDecisionLog');
    return `  ${c}: { answerLog: { address: '${a.address}', fromBlock: ${a.deploy.block} }, decisionLog: { address: '${d.address}', fromBlock: ${d.deploy.block} } },`; });
  return `// VENDORED from an address registry (addresses.json, public subset) by scripts/vendor-addresses.mjs - do not edit here.
// Only the contracts this SDK names; test/addresses-vendor.test.ts checks the copy against the registry.
export const REGISTRY_ADDRESSES = {
${rows.join('\n')}
} as const;

/** The Jev logs on every chain the registry deploys them to (JevAnswerLog + JevDecisionLog, from their deploy block). */
export const JEV_LOGS: Readonly<Record<number, { answerLog: { address: string; fromBlock: number }; decisionLog: { address: string; fromBlock: number } }>> = {
${logRows.join('\n')}
};
`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const src = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? REGISTRY;
  const body = render(JSON.parse(readFileSync(src, 'utf8')));
  if (process.argv.includes('--check')) {
    if (readFileSync(OUT, 'utf8') !== body) { console.error('src/addresses.ts differs from the registry: run node scripts/vendor-addresses.mjs'); process.exit(1); }
    console.log('src/addresses.ts matches the registry');
  } else { writeFileSync(OUT, body); console.log('vendored the registry → src/addresses.ts'); }
}
