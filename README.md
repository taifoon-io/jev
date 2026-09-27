# @taifoon/jev

LLM-as-a-judge for agent jobs, callable from a contract's evaluator seat. TypeSafe's Jev, a System One model pinned
to `jev-1.13.0`, answers a published rubric as structured output. Code composes the verdict, hashes a receipt,
records it on chain and returns the one call that ends the job. Mid-band answers go to needs_review, which ends nothing.

Built by Taifoon. No runtime dependencies, no key inside, and it signs nothing.

## Quick start

Walk one live Base job through every step on the free trial. No key, no install:

```
npx @taifoon/jev run
```

Each step shows what it read and what came back, and asks before it runs. `--yes` runs them all; `--json` prints the
whole trace. Details: [the pipeline, step by step](docs/PIPELINE.md#run-it-npx-taifoonjev-run).

In code (`npm i @taifoon/jev`), this is `examples/quickstart.mjs`:

```js
import { createHash } from 'node:crypto';
import { grade, facts, record, evaluatorCall, verify } from '@taifoon/jev';

const task = 'Return the SHA-256 hex digest of the ASCII string "jev".';
const delivered = createHash('sha256').update('jev').digest('hex');   // what the seller handed in

const receipt = await grade({
  subject: { chainId: 8453, ref: 'quickstart:sha256-jev' },            // what is being judged (your job id)
  evidence: { task, delivered },
  facts: facts({ delivered: true, checks: { digest_recomputes: () => createHash('sha256').update('jev').digest('hex') === delivered } }),
  trial: true,                                                          // 3 free calls; or { key: process.env.TYPESAFE_KEY }
});
console.log(receipt.verdict, '·', receipt.reasons[0]);
console.log('spec_met', receipt.answers?.spec_met.probabilities, '· model', receipt.model);
const onchain = await record(receipt);                                  // unsigned: JevAnswerLog + JevDecisionLog (devnet)
const end = evaluatorCall('virtuals-erc8183', 1n, receipt, receipt);    // unsigned: complete / reject as job 1's evaluator
console.log(onchain.calls.map((c) => c.fn), '→', end?.fn, '· verifies:', (await verify(receipt, { chain: false })).ok);
```

Real output from one call to the public trial (2026-09-27):

```
complete · spec_met 0.93 ≥ 0.85 · unsupported_claim 0.10 ≤ 0.2 · ending complete
spec_met { no: 0.07, yes: 0.93 } · model jev-1.13.0
[ 'JevAnswerLog.record', 'JevDecisionLog.record' ] → complete(uint256,bytes32,bytes) · verifies: true
```

## What you must know

- **Code decides the facts first.** A failed check ends the job as reject, and Jev is never asked.
- **Jev answers four atomic questions** from RUBRIC_v1: spec_met, unsupported_claim, ending and cheat_shaped. It
  never gets a holistic "is the job good?".
- **Code composes the verdict** under THRESHOLDS_v1: complete, reject or needs_review. needs_review ends nothing and
  leaves room for an appeal. Above 50 USDC a complete is held for review.
- **Nothing is signed.** `record()` and `evaluatorCall()` return unsigned calls. Whoever holds the seat signs.
- **Keys.** `trial: true` uses Taifoon's free trial: 3 calls per caller, at most 4 questions and 4,000 JSON
  characters. `key` calls TypeSafe directly with your own key from [console.typesafe.ai](https://console.typesafe.ai).
  The key is not stored and never appears in a receipt.
- **What the result is.** *Graded against a published rubric by a pinned decision model, with an appeal.* It is not
  "independently verified". An on-chain record is an attestation by whoever sent it, not a proof the answer is right.

## The five calls

| Call | What it does |
|---|---|
| `grade({ subject, evidence, facts?, rubric?, key? \| trial })` | Checks the facts, asks Jev the rubric, composes the verdict, returns the receipt |
| `facts({ delivered, checks, priceUsdc? })` | Runs the checks your protocol supplies |
| `record(receipt, { network, send? })` | Returns the unsigned `JevAnswerLog.record` and `JevDecisionLog.record` calls |
| `evaluatorCall(protocol, jobId, verdict, digest)` | Returns the one unsigned call that ends the job; `null` for needs_review |
| `verify(receiptOrDigest)` | Recomputes every digest and finds the records on chain |

Evaluator seats: `assurance-hook`, `judge-adapter`, `virtuals-erc8183`, `virtuals-memo-acp` and `bitagent-erc8183`.
Each is tested against calldata a mined transaction carried.

## Documentation

- [How grading works: Jev, the pipeline, THRESHOLDS_v1, `npx @taifoon/jev run`](docs/PIPELINE.md)
- [API: the five calls, where Jev is reached, your own rubric](docs/API.md)
- [Evaluator seats, with the transactions they are tested against](docs/EVALUATORS.md)
- [On chain: contract addresses on Base and devnet, and one real grade end to end](docs/ON_CHAIN.md)
- [The records: receipt, decision.v2, jev.answer.v1](docs/RECORDS.md)
- [n8n workflows, and the TypeSafe node's Jev Options](docs/WORKFLOWS.md)
- [Develop](docs/DEVELOP.md)

```
npx @taifoon/jev verify <digest> --network base
npx @taifoon/jev workflows export ./jev-workflows
```

Pricing the next job from a seller's record is a separate package:
[`@taifoon/jev-wilson`](https://github.com/taifoon-io/jev-wilson).

## Licence

Independent project. Jev and TypeSafe are products of TypeSafe AI, Inc., which does not endorse this package.

Built by Taifoon. MIT. The package has no runtime dependencies and contains no key. It calls Jev with your own TypeSafe key or through Taifoon's free trial.
