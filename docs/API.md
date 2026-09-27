# API

## The five calls

| Call | What it does | Network |
|---|---|---|
| `grade({ subject, evidence, facts?, rubric?, key? \| trial })` | Checks the facts first. If none fails, asks Jev the rubric, composes the verdict and returns the receipt. | Asks Jev once, or never on a hard fail |
| `facts({ delivered, checks, priceUsdc? })` | Runs the checks your protocol supplies. A check is a value or an (async) function; one that throws counts as "could not be checked". | None |
| `record(receipt, { network, send? })` | Returns the unsigned `JevAnswerLog.record` and `JevDecisionLog.record` calls. `network` is a flag: `none`, `devnet` (default), `base` or `both`. Pass `send` (your wallet) to send every call that has an address. | None unless you pass `send` |
| `evaluatorCall(protocol, jobId, verdict, digest)` | Returns the one unsigned call that ends the job on that protocol. For `needs_review` it returns `null`. | None |
| `verify(receiptOrDigest)` | Recomputes every digest, re-composes the verdict and finds the `JevAnswered` and `Decided` events. | One devnet RPC read |

It also exports `RUBRIC_v1` and `CONTRACTS`. Nothing else.

**Where Jev is reached.** With `trial: true`, calls go to `https://typesafe.taifoon.dev/v1/trial`. The trial is free for
3 calls per caller, takes at most 4 questions and 4,000 JSON characters, and SDK cuts the evidence to fit (never the facts
section). With `key`, calls go to `https://api.typesafe.ai/v1/systemone` using your own TypeSafe key from
[console.typesafe.ai](https://console.typesafe.ai). The key is not stored and never appears in a receipt. If you already
have the answers (from the n8n node, for example), pass `answers` and nothing is asked.

**Your own rubric.** `grade({ rubric: { version, questions, asked?, thresholds?, compose? } })`. The rubric hash is
sha256 of its questions and goes into the receipt.
