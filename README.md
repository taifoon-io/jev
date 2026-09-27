# @taifoon/jev

**Did the AI agent do the work it was paid for? Ask Jev, and get an answer you can check.**

- **What:** a grader for agent jobs. Code checks the facts, TypeSafe's Jev answers four closed questions about the
  delivery, and code turns the answers into complete, reject or needs review, with a receipt anyone can recompute.
- **Why:** agents are paid on chain for work nobody reads. A grade with its full probabilities, a published rubric and
  an appeal path is something a buyer, a seller and a contract can all rely on.
- **How:** replay a real Base job, graded by Jev, offline and with no key:

```
npx @taifoon/jev run --demo
```

Then grade your own with your TypeSafe key from [console.typesafe.ai](https://console.typesafe.ai). No runtime
dependencies, no key inside, and it signs nothing. Recording a grade on chain is optional.

## Quick start

An agent was hired for a job. The grader answers one question: did it do the work as the task laid it out? You give
it the job the way the buyer wrote it, and it does the rest:

```js
import { prepareJob, facts, grade, record } from '@taifoon/jev';

const job = prepareJob({
  id: 'job-4711', chainId: 8453,
  task: 'Extract the invoice into JSON with invoice_no, total, currency and due_date',
  criteria: ['Returns one JSON object with exactly the four fields', 'Every value matches the source invoice'],
  source: 'INVOICE INV-20931 · Total due: EUR 1,240.50 · Payment due by 2026-10-01',
  delivered: '{"invoice_no":"INV-20931","total":1240.50,"currency":"EUR","due_date":"2026-10-01"}',
  checks: [{ kind: 'json', keys: ['invoice_no', 'total', 'currency', 'due_date'] }],
});
const receipt = await grade({ subject: job.subject, evidence: job.evidence, facts: facts(job.facts), key: process.env.TYPESAFE_KEY });
receipt.verdict;              // complete | reject | needs_review, with every answer's full distribution
await record(receipt);        // the unsigned calls that put it on chain
```

What the grader needs, and where it comes from:

| Field | What it is | Who checks it |
|---|---|---|
| `task` | what the buyer asked for, in their words | Jev reads it |
| `criteria` | what "done" means, one per line | Jev reads them numbered |
| `source` | what the delivery must be faithful to (an invoice, a page, a dataset) | Jev compares against it |
| `delivered` | what the agent handed in | code first, then Jev |
| `checks` | `includes` · `sources` · `json` · `deadline` | code; a failed check rejects before Jev is asked |

Four illustrative jobs, written by hand, are in [`examples/jobs/`](examples/jobs): a research report that meets the brief, the same report
without its sources (code rejects it), an invoice extraction checked against its source, and a trading signal whose
claims the evidence cannot support. Grade one with your key:

```
TYPESAFE_KEY=… npx @taifoon/jev run --job-file examples/jobs/invoice-extraction.json
npx @taifoon/jev run --demo      # offline, no key: replays the real Base job below and checks it against the chain
npx @taifoon/jev run             # a live Base job from the coordination layer's queue (needs TYPESAFE_KEY)
```

## A real job, graded

[BitAgent](https://basescan.org/address/0x5009ABB3A309115a4a682C66BAf3BC9E0329BaB7) job 7287 on Base: a buyer paid
1.5 USDC for `equity_research where ticker is 'AAPL'`. The seller submitted within seconds, but only a 32-byte digest
reached the chain; the report itself was never shown. Code confirmed the job was funded and delivered, then Jev
(`jev-1.13.0`) answered on 27 September 2026:

| Question | Jev's answer |
|---|---|
| spec_met: does the delivery meet the task? | **no** 0.97 · yes 0.03 |
| unsupported_claim | no 0.94 · yes 0.06 |
| ending | **needs_review** 0.93 · complete 0.07 |
| cheat_shaped | no 0.56 · yes 0.44 |

Code composed **reject** (spec_met ≤ 0.40) and the unsigned `reject(uint256,bytes32,bytes)` for BitAgent's evaluator
seat. The decision is anchored on the Taifoon devnet in
[`0xffc608f8…c622`](https://www.taifoon.io/scan/36927/tx/0xffc608f8c8b39ff6992e8ec8d589b8784a3cf4199359c408f8eed1d4b581c622).
`npx @taifoon/jev run --demo` replays it from [`examples/jobs/base-bitagent-7287.recorded.json`](examples/jobs/base-bitagent-7287.recorded.json)
with no key and no network, and arrives at the same decision digest.

## What you must know

- **Code decides the facts first.** A failed check ends the job as reject, and Jev is never asked.
- **Jev answers four atomic questions** from RUBRIC_v1: spec_met, unsupported_claim, ending and cheat_shaped. It
  never gets a holistic "is the job good?".
- **Code composes the verdict** under THRESHOLDS_v1: complete, reject or needs_review. needs_review ends nothing and
  leaves room for an appeal. Above 50 USDC a complete is held for review.
- **Nothing is signed.** `record()` and `evaluatorCall()` return unsigned calls. Whoever holds the seat signs.
- **Your key.** Jev is called with your own TypeSafe key from [console.typesafe.ai](https://console.typesafe.ai),
  directly at TypeSafe. The key is not stored and never appears in a receipt.
- **What the result is.** *Graded against a published rubric by a pinned decision model, with an appeal.* It is not
  "independently verified". An on-chain record is an attestation by whoever sent it, not a proof the answer is right.

## The five calls

| Call | What it does |
|---|---|
| `prepareJob({ id, task, criteria, delivered, source?, checks? })` | Turns a job as the buyer laid it out into the evidence Jev reads and the code checks |
| `grade({ subject, evidence, facts?, rubric?, key \| answers })` | Checks the facts, asks Jev the rubric, composes the verdict, returns the receipt |
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

Built by Taifoon. MIT. The package has no runtime dependencies and contains no key. It calls Jev only with your own TypeSafe key.
