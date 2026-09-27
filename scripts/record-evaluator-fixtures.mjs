// Dev-only: fetch the real transactions the evaluator adapters are tested against and write test/fixtures/evaluator-calls.json.
// Each entry keeps the full transaction input as the chain returned it; for account-abstraction transactions (ERC-4337
// handleOps) the adapter's call is INSIDE that input, and `inner` records where. Run: node scripts/record-evaluator-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { decodeFunctionData, parseAbi } from 'viem';
const RPC = { 8453: 'https://mainnet.base.org', 36927: 'https://rpc.taifoon.dev' };
const tx = async (chainId, hash) => (await (await fetch(RPC[chainId], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash] }) })).json()).result;
const CASES = [
  { name: 'assurance-hook complete (Moonbeam hook on Base, the covered GLMR hire)', protocol: 'assurance-hook', verdict: 'complete', chainId: 8453, hash: '0xc606d00fed64e912585bbc93feb15a9289cfcde94289f49f7c74a7a468903116', sig: 'function complete(bytes32 jobId)' },
  { name: 'judge-adapter postVerdict NonConformant (devnet)', protocol: 'judge-adapter', verdict: 'reject', chainId: 36927, hash: '0x07853069cf43200fad3761d05b532c654df6f02b8a47f5f767bec18cb91a2012', sig: 'function postVerdict(bytes32 jobId, uint8 verdict, uint8 mode, bytes32 digest)' },
  { name: 'Virtuals ERC-8183 v3 complete (inside an ERC-4337 handleOps)', protocol: 'virtuals-erc8183', verdict: 'complete', chainId: 8453, hash: '0x60890802a3b399af7face54c1cb33d771cffc9b8594d0113de14ae290b5c27bd', sig: 'function complete(uint256 jobId, bytes32 reason, bytes optParams)', selector: 'd75bbdf3' },
  { name: 'Virtuals ERC-8183 v3 reject (inside an ERC-4337 handleOps)', protocol: 'virtuals-erc8183', verdict: 'reject', chainId: 8453, hash: '0x152b5fb8900e57119cee6cbc15206d8938c11dc4056b20ec4c986f4d8acddb76', sig: 'function reject(uint256 jobId, bytes32 reason, bytes optParams)', selector: '41dd26f5' },
  { name: 'Virtuals memo-ACP signMemo (inside an ERC-4337 handleOps)', protocol: 'virtuals-memo-acp', verdict: 'complete', chainId: 8453, hash: '0x94ba6b497e2fc2ecf7ae256e1a490cabdc4a5357ed306ee2071f46a1c4ef622e', sig: 'function signMemo(uint256 memoId, bool isApproved, string reason)', selector: '712ee07a' },
  { name: 'BitAgent platform Evaluator forceSettleJob (job 8941)', protocol: 'bitagent-erc8183', verdict: 'complete', seat: 'platform', chainId: 8453, hash: '0x195359ba64f8ba429c449e82c27d0c57486511593646886b59a0d80c808fb01e', sig: 'function forceSettleJob(uint256 jobId, bool approved)' },
  { name: 'BitAgent AgenticCommerce submit (job 8941) — the (uint256,bytes32,bytes) layout its complete/reject share', protocol: 'bitagent-erc8183', verdict: null, chainId: 8453, hash: '0xa4a496968877ccbf1ba73fe5c5908f064d7333a2ced984e1867da9ee70f74ebc', sig: 'function submit(uint256 jobId, bytes32 deliverable, bytes optParams)' },
];
const out = [];
for (const c of CASES) {
  const t = await tx(c.chainId, c.hash);
  const abi = parseAbi([c.sig]);
  const at = c.selector ? t.input.indexOf(c.selector) : 2;
  if (at < 2) throw new Error(`${c.hash}: selector not found`);
  const d = decodeFunctionData({ abi, data: '0x' + t.input.slice(at) });
  const args = d.args.map((a) => (typeof a === 'bigint' ? a.toString() : a));
  out.push({ ...c, block: parseInt(t.blockNumber, 16), from: t.from, to: t.to, inner_at: c.selector ? at : null, args, input: t.input });
  console.log(c.protocol, c.hash.slice(0, 12), args.map(String).map((s) => s.slice(0, 20)).join(' '));
}
writeFileSync(new URL('../test/fixtures/evaluator-calls.json', import.meta.url), JSON.stringify({ fetched: '2026-09-27', cases: out }, null, 1));
