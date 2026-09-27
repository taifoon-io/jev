---
name: jev-grader
description: Grade whether an AI agent delivered the job it was paid for, with npx @taifoon/jev and TypeSafe's Jev. Use when the user asks "did the agent do the job?", wants to accept, reject or send an agent's delivery for review, needs a grade with probabilities and a recomputable receipt, or wants to grade an ERC-8183 / Virtuals ACP / BitAgent job on Base.
license: MIT
compatibility: Node 20+. Grading needs the user's own TypeSafe key in TYPESAFE_KEY (console.typesafe.ai). The demo and jobs rejected by code checks need no key.
---

# Grade an agent's delivery with @taifoon/jev

The grader answers one question: did the agent do the work as the task laid it out? Code checks the facts first; if a
check fails the job is rejected and Jev is never asked. Otherwise Jev (`jev-1.13.0`) answers four closed questions
(spec_met, unsupported_claim, ending, cheat_shaped) with full probabilities, and code composes **complete**, **reject**
or **needs_review** under published thresholds.

## 1. Show the shape first (no key, offline)

```
npx -y @taifoon/jev run --demo
```

It replays a real Base job graded by Jev and ends with "same decision digest as the one recorded on chain".

## 2. Describe the job as the buyer laid it out

Write a job file. Every field comes from the user or the job itself; never invent criteria.

```json
{
  "id": "job-4711",
  "task": "Extract the invoice into JSON with invoice_no, total, currency and due_date",
  "criteria": ["Returns one JSON object with exactly the four fields", "Every value matches the source invoice"],
  "source": "INVOICE INV-20931 · Total due: EUR 1,240.50 · Payment due by 2026-10-01",
  "delivered": "{\"invoice_no\":\"INV-20931\",\"total\":1240.50,\"currency\":\"EUR\",\"due_date\":\"2026-10-01\"}",
  "checks": [{ "kind": "json", "keys": ["invoice_no", "total", "currency", "due_date"] }]
}
```

Check kinds: `includes` (terms that must appear), `sources` (minimum number of links), `json` (parses, with keys),
`deadline` (`submittedAt` ≤ `deadline`). A failed check rejects without asking Jev.

## 3. Grade it on the user's own key

```
TYPESAFE_KEY=… npx -y @taifoon/jev run --job-file job.json --yes
```

- The key comes from the user's environment. Never ask for it in chat, never write it to a file, never print it.
- Without a key, a job that needs Jev stops and says where to get one. Tell the user; do not work around it.
- A live job on Base: `npx -y @taifoon/jev run --job 8453:<id> --yes` reads its public evidence.

## 4. Report the verdict honestly

- Give the verdict, the reason line, and each answer's probabilities, exactly as printed.
- **needs_review is an answer, not a failure.** Surface it to the user; do not overrule it with your own judgment.
- A grade is Jev's answer under a published rubric, not a proof. Say "graded", never "verified".

## 5. Optional, only if the user asks

- `--record devnet|base|both` adds the unsigned calls that record the grade on chain. Recording is off by default.
- The evaluator call that ends the job is printed unsigned. Never sign or send a transaction for the user.
- `--json` prints the whole trace for scripts.

Flags are strict: an unknown flag or a bad value exits with code 2 and says how to fix it.
Jev and TypeSafe are products of TypeSafe AI, Inc., which does not endorse this skill.
