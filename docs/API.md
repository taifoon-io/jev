# API

## The six calls

| Call | What it does | Network |
|---|---|---|
| `grade({ subject, evidence, facts?, rubric?, key \| answers })` | Checks the facts first. If none fails, asks Jev the rubric, composes the verdict and returns the receipt. | Asks Jev once, or never on a hard fail |
| `facts({ delivered, checks, priceUsdc? })` | Runs the checks your protocol supplies. A check is a value or an (async) function; one that throws counts as "could not be checked". | None |
| `record(receipt, { network, send? })` | Returns the unsigned `JevAnswerLog.record` and `JevDecisionLog.record` calls. `network` is a flag: `none`, `devnet` (default), `base` or `both`. Pass `send` (your wallet) to send every call that has an address. | None unless you pass `send` |
| `evaluatorCall(protocol, jobId, verdict, digest)` | Returns the one unsigned call that ends the job on that protocol. For `needs_review` it returns `null`. | None |
| `prepareJob({ id, task, criteria, delivered, source?, checks? })` | Turns a job as the buyer laid it out into the evidence Jev reads and the checks code runs. | None |
| `verify(receiptOrDigest)` | Recomputes every digest, re-composes the verdict and finds the `JevAnswered` and `Decided` events. | One devnet RPC read |
| `verifyDecision(record, { answers?, facts? })` | Recomputes a decision record as `/v1/judge/decisions/{id}` serves it: sha256 of the text Jev read, subject and kind ids, the decision digest, the on-chain confidence, the answers digest (with the `/v1/judge/answers/{digest}` record) and the verdict RUBRIC_v1 composes. | None |

It also exports `RUBRIC_v1`, `CONTRACTS`, `runCheck` and the `jev run` pipeline (`pipeline`, `STEPS`, `LAYER` and its helpers).

**Where Jev is reached.** Calls go to `https://api.typesafe.ai/v1/systemone` with your own TypeSafe key from
[console.typesafe.ai](https://console.typesafe.ai), and to no one else. The key is not stored and never appears in a receipt. If you already
have the answers (from the n8n node, for example), pass `answers` and nothing is asked.

**Your own rubric.** `grade({ rubric: { version, questions, asked?, thresholds?, compose? } })`. The rubric hash is
sha256 of its questions and goes into the receipt.
