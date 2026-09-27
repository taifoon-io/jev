# On chain

The logs are on the public devnet (chain 36927, free gas from `https://faucet.taifoon.dev`). Any account may send to
them.

| Contract | Address | Rule |
|---|---|---|
| JevAnswerLog | `0xD8c1d8188Fc8EE388792f6EB3B3dbd4f341Ba8e3` | Append-only, no owner. Recorders fixed at deploy are `trusted`; any other sender is logged with `trusted = false` |
| JevDecisionLog | `0x1D622511862DD7DEffB8fEeBc225E0FAdA1e9A05` | Append-only, no owner, no upgrade. The recorder is `msg.sender` |

On Base (8453), since 0.2.0:

| Contract | Address | Rule |
|---|---|---|
| JevAnswerLog | `0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d` | Same bytecode. The only `trusted` recorder is `0xe9F0E71e7Fc66864126C0aE5588a7858b25dE51D` |
| JevDecisionLog | `0x209490d6A0FFC5368A42b0c2208BDCda853f6a92` | Same bytecode. The recorder is `msg.sender` |

`record(receipt, { network: 'base' })` returns the Base calls with `to` set. `verify(digest, { network: 'base' })` and
`npx @taifoon/jev verify <digest> --network base` read them (the CLI's default `any` tries the devnet, then Base).
0.1.0 carried no Base addresses. An earlier Base answer log, `0x5bac70eb78224bbCBa83f5A36DF09D549d3f57fa`, is superseded and holds no records.

Here is one real grade, end to end: n8n execution 86, a proof-verification job graded with RUBRIC_v1.

- Answers recorded in devnet tx
  [`0x9a38cf55…a61b`](https://www.taifoon.io/scan/36927/tx/0x9a38cf5541bb82a8a6e2e5cf1a96ed25fdc46921c351506da83023f5dec1a61b).
  The answers digest is `0x6c7e6d2977689f1c9639a377b165f998d1160cc30eca8ff4f1fedc793db2f52d`.
- Decision anchored in devnet tx
  [`0x687ba9d7…4ee4`](https://www.taifoon.io/scan/36927/tx/0x687ba9d73d5789a2df9d9d09e94b6ed005447d7f5ece97f9226ea0d51f514ee4).
  Decision digest `0x781b0fce…3667`, confidence 2,700 bps.
- Jev answered spec_met `{ yes: 0.36, no: 0.64 }`, so the composed verdict is **reject** (spec_met ≤ 0.40).

`verify('0x6c7e6d29…f52d')` finds both rows. This is the real output:

```
{"ok":true,"checks":{"answersOnChain":true,"decisionOnChain":true},
 "answer":{"tx":"0x9a38cf5541bb82a8a6e2e5cf1a96ed25fdc46921c351506da83023f5dec1a61b","trusted":true},
 "decision":{"tx":"0x687ba9d73d5789a2df9d9d09e94b6ed005447d7f5ece97f9226ea0d51f514ee4","confidenceBps":2700}}
```

The tests re-derive these rows offline, byte for byte:

- **Execution 86:** the answers digest, the `JevAnswerLog.record` calldata (equal to the mined input) and the decision
  digest.
- **Execution 88:** run through `grade()` itself, it lands on the anchored decision digest and composes needs_review.
