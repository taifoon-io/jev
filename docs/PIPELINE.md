# How grading works

## What Jev is

Jev is TypeSafe's System One decision model. When this was written it answered as **`jev-1.13.0`**. You don't ask Jev
for prose. You give it closed questions, and every answer comes back as a **full probability distribution** over the
options, plus a confidence value. An answer to "did the delivery meet the spec?" looks like `{ yes: 0.93, no: 0.07 }`,
not a paragraph.

This package puts Jev inside a fixed judging procedure:

- Code establishes the facts first. A failed check ends the job, and Jev is never asked.
- Jev answers four **atomic** questions from a published rubric. It never gets a holistic "is the job good?".
- Code composes the verdict from the facts and the answers under published thresholds.
- Everything is hashed into a receipt and turned into the one call that ends the job. Recording it on chain is
  optional: `record()` builds the calls only when you ask.

How to describe the result: *graded against a published rubric by a pinned decision model, with an appeal.* It is not
"independently verified". An on-chain record is an attestation by whoever sent it, not a proof that the answer is right.

## The pipeline

```
 evidence ─► facts() ──── a check failed? ── yes ─► reject (hard fail; Jev is not asked)
             code checks                     │
                                             no
                                             ▼
             Jev reads: evidence (fitted: ≤ 4,000 chars as JSON in all) + the facts section + one instruction
             Jev answers RUBRIC_v1:  spec_met · unsupported_claim · ending · cheat_shaped
                                             ▼
             compose under THRESHOLDS_v1 ─► complete | reject | needs_review
                                             ▼
             receipt: rubric hash, input digest, every distribution, verdict, reasons, receiptHash
                                             ▼
             record()  ─► JevAnswerLog.record (jev.answer.v1)  +  JevDecisionLog.record (decision.v2)
                                             ▼
             evaluatorCall() ─► complete / reject on the job's protocol   (needs_review ends nothing: appeal)
```

THRESHOLDS_v1:

- **complete** needs spec_met ≥ 0.85, unsupported_claim ≤ 0.20 and ending = complete.
- **reject** follows from spec_met ≤ 0.40, unsupported_claim ≥ 0.70 or ending = reject.
- **needs_review** is the result when cheat_shaped ≥ 0.50 (escalate, never slash on this alone) or when the answers
  land in the mid band.
- Above 50 USDC a complete is held for review.

## Run it: `npx @taifoon/jev run`

One job through the coordination layer's steps, one step at a time. Each step shows the layer route it reads and
what came back, and asks before it runs (`--yes` runs them all; `--json` prints the whole trace).

```
npx @taifoon/jev run                               # the first job on /v1/judge/queue whose evidence the layer can read
npx @taifoon/jev run --job 8453:bitagent:8453:7287 --network both
npx @taifoon/jev run --no-layer --evidence pack.json    # your own pack, no layer at all: { subject, state, checks? }
```

| # | Step | Layer route | Without the layer |
|---|---|---|---|
| 1 | pick a job a grader is needed for | `GET /v1/judge/queue` | your `--evidence` |
| 2 | read the evidence pack | `GET /v1/judge/evidence/{chain}/{jobId}` | your `--evidence` |
| 3 | code establishes the facts | none | the checks in your pack |
| 4 | Jev answers RUBRIC_v1, code composes the verdict | none | same |
| 5 | record the answers and the decision | `POST /v1/judge/answers/record` (only with `TAIFOON_RELAYER_KEY`) | unsigned calls |
| 6 | the evaluator call that ends the job | none | same |
| 7 | price the next premium from the seller record | `POST /v1/pools/quote` | skipped (the quote needs the seller's record) |
| 8 | re-derive the receipt (and find it on chain) | none | same |

Steps 1 to 4 are required: saying no at one stops the run. Keys come from the environment only, `TYPESAFE_KEY` (your own
TypeSafe key; without it the Jev step stops and says where to get one) and `TAIFOON_RELAYER_KEY`, and are never printed. Nothing is signed. In code it is `pipeline()`,
with a `before` gate and an `after` hook per step.

Real run (2026-09-27): BitAgent job 7287 on Base asked for "equity_research where ticker is 'AAPL'" and
got a 32-byte digest. Facts passed (delivered, before the deadline, 1.5 USDC). Jev answered spec_met 0.03, so the
verdict is **reject**; the receipt re-derives; the seller's quote is 0.0%–39.0% (6 settled, thin record).
