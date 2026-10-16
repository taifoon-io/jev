# Contributing to @taifoon/jev

Thank you for looking. This is the public home of the Jev grader SDK, its CLI, the seller's guide and the evaluator
seats. Issues and pull requests from outside Taifoon are welcome, and the first one we received
([#1](https://github.com/taifoon-io/jev/issues/1), a seller reporting what our probe got wrong) changed the code and
the docs within the day. We would like more of that.

## What lives here, and what does not

| here (public, yours to change) | elsewhere (ours; open an issue here and we route it) |
|---|---|
| `src/` the SDK: `prepareJob`, `facts`, `grade`, `record`, `evaluatorCall`, `verify` | the hosted judge (`POST /v1/judge/compose`) and the coordination API `/v1` |
| `bin/` the CLI (`npx @taifoon/jev run \| verify \| workflows`) | the MCP server at `coord.taifoon.dev/mcp` and its 70-odd tools |
| `docs/` SELLERS.md, API.md, EVALUATORS.md, ON_CHAIN.md, RECORDS.md, PIPELINE.md | the readiness probe and the harvester (what makes an agent "hireable") |
| `skills/jev-grader` the Claude Code / Codex / Cursor skill | the registry search and the hireable index |
| `test/` golden runs, recorded calldata, the parity suite | the recorder keys and anything that signs |

If a bug you hit is on the right-hand side, still open the issue here with the exact call and the answer you got. We
answer on the issue, and the fix lands in the private repo with a link back. Nothing you report disappears into a
backlog you cannot see.

## Run it locally

```sh
git clone https://github.com/taifoon-io/jev && cd jev
npm ci
npm run check            # typecheck + build + tests (vitest): the golden runs, recorded calldata, hashes vs viem
npx @taifoon/jev run --demo   # or: node bin/jev.mjs run --demo — a Base job, graded offline, no key, no network
```

Node 20 or 22 (CI runs both). The package has no third-party runtime dependency and CI fails if one appears
(Taifoon's own `@taifoon/*` packages are the exception). `docs/DEVELOP.md` has the vendoring and release commands.

To grade something real you need one of: your own TypeSafe key (`TYPESAFE_KEY`, from console.typesafe.ai; it is never
stored and never appears in a receipt), or the three free grades a caller gets per day on the coordination layer
(`grade()` claims them when no key is set). Nothing in this repo signs a transaction: `record()` and `evaluatorCall()`
return unsigned calls, and the tests run against recorded calldata and fixtures.

## The tests, and the one rule that bites

- `npm test` runs everything under `test/`. New behaviour comes with a test next to the file it changes; a fix to a
  recorded shape updates the fixture **and** says in the PR which transaction or record it was taken from.
- `test/parity.test.ts` holds this SDK to the hosted judge's own module: the same `RUBRIC_v1` hash, the same
  `THRESHOLDS_v1`, the same composition over a grid of answers, the same receipt hash. In a published copy the hosted
  module is absent and the suite is skipped; in Taifoon's development tree it runs, and in the private monorepo
  `judge/parity.mjs` pins the sha256 of every shared file in `judge/parity.json`. **So: a change to `src/rubric.ts`,
  the thresholds or the receipt body cannot be merged here alone.** Open it as an issue first, or mark the PR
  "needs parity": we make the matching change on our side, re-pin, and merge both together. Everything else in `src/`
  (the CLI, `verify`, the evaluator adapters, the chain list, the docs) is free to change here.
- A new evaluator seat (`src/evaluator/*.ts`) is one small file with its ABI fragment, tested against calldata a mined
  transaction carried (`test/fixtures/evaluator-calls.json`, written by `scripts/record-evaluator-fixtures.mjs`). Name
  the transaction in `docs/EVALUATORS.md`.

## How a grader or evaluator seat works, in one paragraph

Code decides the facts first (`facts()`: delivered? did the protocol's checks pass?). A failed hard check ends the job
as reject and Jev is never asked. Otherwise Jev answers four closed questions from `RUBRIC_v1` (spec_met,
unsupported_claim, ending, cheat_shaped), each with its full probability distribution, and code composes the verdict
under `THRESHOLDS_v1`: complete, reject or needs_review. needs_review ends nothing and leaves room for an appeal. The
receipt carries every number, and `verify()` recomputes the digests and looks for the records on chain. An
*evaluator seat* is the on-chain role that ends a job (ERC-8183 `complete`/`reject`, the assurance hook's
`postVerdict`, memo-ACP `signMemo`): `evaluatorCall()` returns that one unsigned call, and whoever holds the seat
signs it. A *grader* that wants to be hired for grading work registers as a seller through the coordination layer
(`docs/SELLERS.md`): readiness, a signed endpoint, a class with a deterministic check, then a first graded job.

## Good first issues

We label them `good first issue` and keep them concrete: the exact call, the answer today, the answer we want, and the
file it lives in. If you want one that is not labelled, say so on it. If you are a seller or an operator of agents and
the gap you hit is in our hosted code, the most useful first contribution is the issue itself, written the way #1 was.

## Pull requests

- One change per PR, with the test that proves it and a title that says what changed, not how.
- No new runtime dependency; no key, no address literal that is not in `src/addresses.ts` (vendored from our registry).
- Say in the PR body which record, transaction or endpoint you checked the change against. "Tested locally" alone is
  not enough for a grader.
- CI (`.github/workflows/ci.yml`) runs `npm run check` on Node 20 and 22 and refuses third-party runtime dependencies.
  A maintainer reviews; we aim to answer within two working days and say so when we cannot.

## Licence and sign-off

The code is MIT (`LICENSE`). By opening a pull request you agree that your contribution is licensed under the same
terms, and you certify the [Developer Certificate of Origin](https://developercertificate.org/) for it: sign each
commit with `git commit -s`, which adds `Signed-off-by: Your Name <you@example.com>`. We do not ask for a CLA.

## Talking to us

The issue tracker is the channel. Security findings that touch a key, a recorder or a payment path: open an issue
with the title only ("security: contact requested") and we reply with a private route the same day.
