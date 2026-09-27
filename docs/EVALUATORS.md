# Evaluator seats

Each adapter is one small file with its ABI fragment. Each one is tested against calldata that a mined transaction
carried (`test/fixtures/evaluator-calls.json`, written by `scripts/record-evaluator-fixtures.mjs`).

| `protocol` | Call | Tested against |
|---|---|---|
| `assurance-hook` | `complete(bytes32)` / `reject(bytes32 jobId, bytes32 digest)`, with `opts.to` = the hook | Base [`0xc606d00f…3116`](https://basescan.org/tx/0xc606d00fed64e912585bbc93feb15a9289cfcde94289f49f7c74a7a468903116), the complete of a covered GLMR hire on Moonbeam's hook (funded in [`0xfbe436ce…f193`](https://basescan.org/tx/0xfbe436ced5caf66dde0e96033f041480316fc5f62cd273006ad9c1852a57f193)) |
| `judge-adapter` | `postVerdict(bytes32 jobId, 1\|2, 2, bytes32 digest)` → hook complete / reject | devnet [`0x07853069…2012`](https://www.taifoon.io/scan/36927/tx/0x07853069cf43200fad3761d05b532c654df6f02b8a47f5f767bec18cb91a2012) |
| `virtuals-erc8183` | AgenticCommerceV3 `complete` / `reject(uint256, bytes32 reason, bytes)` as the job's evaluator | Base [`0x60890802…27bd`](https://basescan.org/tx/0x60890802a3b399af7face54c1cb33d771cffc9b8594d0113de14ae290b5c27bd) (complete) and [`0x152b5fb8…db76`](https://basescan.org/tx/0x152b5fb8900e57119cee6cbc15206d8938c11dc4056b20ec4c986f4d8acddb76) (reject), inside ERC-4337 handleOps |
| `virtuals-memo-acp` | ACPRouter `signMemo(uint256 memoId, bool approved, string reason)` on the evaluation memo | Base [`0x94ba6b49…622e`](https://basescan.org/tx/0x94ba6b497e2fc2ecf7ae256e1a490cabdc4a5357ed306ee2071f46a1c4ef622e) |
| `bitagent-erc8183` | AgenticCommerce `complete` / `reject(uint256, bytes32, bytes)` as the job's evaluator; `seat: 'platform'` → Evaluator `forceSettleJob(uint256, bool)` | Base [`0x195359ba…b01e`](https://basescan.org/tx/0x195359ba64f8ba429c449e82c27d0c57486511593646886b59a0d80c808fb01e) (forceSettleJob, job 8941) and its submit [`0xa4a49696…4ebc`](https://basescan.org/tx/0xa4a496968877ccbf1ba73fe5c5908f064d7333a2ced984e1867da9ee70f74ebc) (same layout) |

The digest in the call is the receipt's decision digest. That is the same 32 bytes JevDecisionLog holds, so the job's
ending, the decision record and the receipt all carry one value. On a hard fail no decision exists, so pass
`receipt.receiptHash`.

Whoever holds the seat signs the call; this package never does. The BitAgent implementation is unverified on Base, and
its layout was read from its own transactions. Its jobs settle today through the platform Evaluator, which only
BitAgent's operators can call.
