# Jev workflows 0.2.0

The n8n workflows that run Jev on n8n.taifoon.dev, exported with credential references replaced by placeholders (`{ "id": "", "name": "REPLACE: <credential type>" }`: pick your own credential of that type after import). Import with n8n → Workflows → Import from File, or `n8n import:workflow --input=<file>`. Every step carries its contract: `meta.taifoon.steps` names the canonical entity it takes and emits by `$id`; the schemas are in `schemas/` (the `$id`s are identifiers, the files are here).

## Nodes they need

| Package | Tested with | Where |
|---|---|---|
| `@taifoon/n8n-nodes-typesafe` | 1.3.0 | npm (community node): npm i @taifoon/n8n-nodes-typesafe |
| `n8n-nodes-taifoon` | 0.4.2 | custom extension (type prefix CUSTOM.); not on npm |
| `n8n-nodes-taifoon-devnet-signer` | 0.2.0 | custom extension (type prefix CUSTOM.); not on npm |

## Credentials they need

| Type | What |
|---|---|
| `taifoonTypeSafeApi` | your TypeSafe key (console.typesafe.ai) — credential type "TypeSafe API" of @taifoon/n8n-nodes-typesafe |
| `taifoonRelayerApi` | a Taifoon relayer key (tfr_…) for https://www.taifoon.io/v1 — credential type "Taifoon Relayer API" of n8n-nodes-taifoon |
| `taifoonDevnetKeyApi` | a devnet 36927 key with gas from https://faucet.taifoon.dev — credential type "Taifoon Devnet Key API" of n8n-nodes-taifoon-devnet-signer |

## HIRE → JUDGE → SETTLE (devnet 36927) — `hire-judge-settle.json`

One hire from offer to settlement. The seller’s reply is held with its digest; prepare decides the facts (a hard fail skips Jev); your TypeSafe credential answers the four RUBRIC_v1 questions; answers composes the verdict under THRESHOLDS_v1, records decision.v2 and jev.answer.v1 and anchors them on the devnet logs; a complete settles through the devnet assurance hook (approve, fund, submit, complete), needs_review is held. Executions 86 and 88 of this workflow are the golden runs @taifoon/jev re-derives.

- source: `tfnhiresettle001` on n8n.taifoon.dev · sha256 `013f382c33e9b54f7585dac5811f8d8a544c8e5e8315eb51335e0539e81dc148`
- nodes: `n8n-nodes-taifoon`, `@taifoon/n8n-nodes-typesafe`, `n8n-nodes-taifoon-devnet-signer`; built-ins manualTrigger v1, set v3.4, code v2, if v2.2
- credentials: `taifoonRelayerApi`, `taifoonTypeSafeApi`, `taifoonDevnetKeyApi`

| Step | Takes | Emits | Does |
|---|---|---|---|
| Start | — | — | start a run (swap for a Webhook or Schedule trigger) |
| Inputs | — | hire.json | the hire intent: task, candidate seller, endpoint/tool, buyer, price, chain (a HIRE in state Open) |
| Offer + deliver | hire.json | job.json | POST /v1/handshake {dispatch:true}: the offer goes to the seller’s own endpoint; the reply is held with its keccak digest |
| Delivery | job.json | delivery.json | stop unless a reply digest is held (no digest = nothing to settle) |
| Judge · prepare | delivery.json | facts.json | POST /v1/judge/compose (prepare): the facts decide first; hard_fail ends here; else the exact text Jev reads + prepare_digest |
| Hard fail? | facts.json | facts.json | branch: a hard fail goes straight to the verdict without asking Jev |
| Jev · TypeSafe (our credential) | facts.json | answers.json | TypeSafe ask on the prepared text: every RUBRIC_ASKED answer with its whole distribution |
| Judge · answers | answers.json | verdict.json | POST /v1/judge/compose (answers): recompose under THRESHOLDS_v1, record decision.v2, anchor on JevDecisionLog |
| Verdict | verdict.json + facts.json | verdict.json | the composed verdict (complete \| reject \| needs_review) with what settlement needs carried forward |
| Settle | verdict.json | settlement.json | POST /v1/settle: the plan (jobId, price, premium, deposit, calls[] in order, who signs each) |
| Seller · approve deposit | settlement.json | settlement.json | the seller approves D (> P); the tx joins settlement.txs |
| Buyer · approve + fund | settlement.json | settlement.json | the buyer approves P + π and calls fundJob: machine Delivered → Funded |
| Seller · submit | settlement.json | settlement.json | submit(jobId, evidenceDigest = delivery.digest): machine Funded → Submitted |
| Verdict says complete? | settlement.json | settlement.json | branch on the composed verdict: complete → complete; otherwise hold (Submitted → Held) |
| Buyer · complete + capture | settlement.json | settlement.json | complete(jobId) (+ capture): machine → Settled |
| Held for review | settlement.json | settlement.json | needs_review / reject: funded and sealed, nothing paid; the evaluator leg or the deadline decides |
| Receipt | settlement.json | job.json | the whole JOB: hire, delivery, facts, verdict, settlement — every transaction with its proof link |

## Jev on-chain grader (grade → stamp → devnet) — `jev-grader.json`

Grades Base jobs that were paid and delivered and that nobody ruled on (GET /v1/judge/ready): four per run, each through prepare → Jev → answers, then the canonical verdict, then GradeStampRegistry.stamp on the devnet, signed by the devnet signer node; the stamp transaction is appended to the verdict’s anchors.

- source: `tfnjevgrader0001` on n8n.taifoon.dev · sha256 `762248c554dd0607362e20361ec3efe0fda58326d89c2f1c18c525ea48e92e35`
- nodes: `n8n-nodes-taifoon`, `@taifoon/n8n-nodes-typesafe`, `n8n-nodes-taifoon-devnet-signer`; built-ins manualTrigger v1, code v2, if v2.2
- credentials: `taifoonRelayerApi`, `taifoonTypeSafeApi`, `taifoonDevnetKeyApi`

| Step | Takes | Emits | Does |
|---|---|---|---|
| When clicking ‘Execute workflow’ | — | — | start a grading run |
| Ready jobs (Base) | — | job.json | GET /v1/judge/ready: jobs on Base that were paid and delivered, and nobody ruled |
| Pick 4 calibrated | job.json | job.json | keep four whose seller has a calibrated record; one item per job, no state built here |
| Judge · prepare | job.json | facts.json | POST /v1/judge/compose (prepare) on the job: facts decide first; the pack comes from the job evidence (GRADEABLE labels 1–21) |
| Hard fail? | facts.json | facts.json | a hard fail is final at prepare (Jev is not asked; nothing to stamp) |
| Jev · TypeSafe (our credential) | facts.json | answers.json | TypeSafe ask on the prepared text (jevStateOf): every RUBRIC_ASKED answer with its whole distribution |
| Judge · answers | answers.json | verdict.json | POST /v1/judge/compose (answers): recompose under THRESHOLDS_v1, record decision.v2 and the answers, anchor both |
| Verdict | verdict.json | verdict.json | the recorded decision as a canonical VERDICT (fromDecision), composed from this run’s receipt |
| Stamp Grade (unsigned) | verdict.json | verdict.json | POST /v1/assurance/call stampGrade: the unsigned GradeStampRegistry.stamp(subject_id, digest, verdict code, mode 2) |
| Taifoon Devnet Signer | verdict.json | verdict.json | sign and send the stamp on devnet 36927 (anvil #0) |
| Verdict + stamp | verdict.json | verdict.json | the same VERDICT with the stamp transaction appended to anchors |

## Batch judge — `batch-judge.json`

A batch of subjects, each as its own prepare → Jev → answers (so every answer is recorded), aggregated and posted to POST /v1/judge/batch.

- source: `tfnbatchjudge001` on n8n.taifoon.dev · sha256 `8e66a8e261e9f1f8052bd0b7658cb2ef5212d8df89b8a5347b56762701f078fd`
- nodes: `n8n-nodes-taifoon`, `@taifoon/n8n-nodes-typesafe`; built-ins manualTrigger v1, code v2, if v2.2, httpRequest v4.2
- credentials: `taifoonRelayerApi`, `taifoonTypeSafeApi`

| Step | Takes | Emits | Does |
|---|---|---|---|
| Grade a batch | — | — | start a batch (pass { subjects, jobId, threshold } or run the demo set) |
| Build the batch | — | hire.json | one canonical HIRE per subject (a delivered handshake, or a job on chain); no state is built here |
| Judge · prepare | hire.json | facts.json | POST /v1/judge/compose (prepare) per subject: the facts decide first; the pack is built from DELIVERY + FACTS; else the exact text Jev reads + prepare_digest |
| Hard fail? | facts.json | facts.json | branch: a hard fail is final (Jev is not asked) and goes straight to the batch |
| Jev · TypeSafe (our credential) | facts.json | answers.json | TypeSafe ask on the prepared text (jevStateOf): every RUBRIC_ASKED answer with its whole distribution |
| Judge · answers | answers.json | verdict.json | POST /v1/judge/compose (answers): recompose under THRESHOLDS_v1, record decision.v2 and the answers (jev.answer.v1), anchor both |
| Grade + aggregate | facts.json + verdict.json | — | the batch outcome from the recorded verdicts (Conformant / NonConformant / NoGrade counts, fail fraction vs threshold) — a batch record, not a canonical entity |
| Record the batch to the coordination layer | — | — | POST /v1/judge/batch (relayer key): the batch record, keyed batch:<jobId> |

## Stamp Grade (a recorded verdict → GradeStampRegistry) — `stamp-grade.json`

Takes one recorded decision (by id), maps it to the canonical verdict, and stamps it on the devnet GradeStampRegistry; emits the verdict with the stamp transaction in its anchors.

- source: `tfnstamp00000001` on n8n.taifoon.dev · sha256 `516d9483e3d26e1891dacb8c4493d609340e3c6a3b200784c72864f9cb931ebc`
- nodes: `n8n-nodes-taifoon`, `n8n-nodes-taifoon-devnet-signer`; built-ins manualTrigger v1, code v2
- credentials: `taifoonDevnetKeyApi`

| Step | Takes | Emits | Does |
|---|---|---|---|
| Start | — | — | start (pass { decision_id } to stamp another verdict) |
| Verdict | — | verdict.json | GET /v1/judge/decisions/:id → the canonical VERDICT (fromDecision) and its stamp code |
| Stamp Grade | verdict.json | verdict.json | POST /v1/assurance/call stampGrade: the unsigned GradeStampRegistry.stamp(subject_id, digest, verdict code, mode) |
| Taifoon Devnet Signer | verdict.json | verdict.json | sign and send the stamp on devnet 36927 (anvil #0) |
| Verdict + stamp | verdict.json | verdict.json | the same VERDICT with the stamp transaction appended to anchors |
