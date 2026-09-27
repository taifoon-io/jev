# Workflows and n8n

## In n8n

The TypeSafe node (`@taifoon/n8n-nodes-typesafe` 1.5.0) carries this package's network-free core under **Jev Options**:

- **Ask RUBRIC_v1** routes Pass = complete, Fail = reject and Review = needs_review.
- **Facts (JSON)** takes checks you already made. A false check rejects without asking Jev.
- **Record On** takes `none`, `devnet`, `base` or `both`, and **Evaluator Call** takes a protocol and a job id.

The node outputs the receipt and the unsigned calls, and it signs nothing. With the options unset it behaves exactly as
1.4.0.

## Workflows

`workflows/0.1.1/` holds the four n8n workflows that run Jev. The same files are attached to the
GitHub release as `jev-workflows-0.1.1.zip`:

- **`hire-judge-settle.json`** runs hire → prepare (facts) → TypeSafe (the four RUBRIC_v1 questions) → answers
  (verdict, recorded and anchored) → settle on devnet. Executions 86 and 88 of this workflow are the golden runs above.
- **`jev-grader.json`** grades Base jobs nobody ruled on, then stamps each verdict on the devnet GradeStampRegistry.
- **`batch-judge.json`** runs prepare → Jev → answers for each subject, then `POST /v1/judge/batch`.
- **`stamp-grade.json`** takes a recorded decision, turns it into the canonical verdict and stamps it.

Credential references are placeholders: `{ "id": "", "name": "REPLACE: <credential type>" }`. After import, pick your
own credential of that type. Each step names the entity it takes and emits by `$id` (`meta.taifoon.steps`). The schemas
behind those `$id`s are in `workflows/0.1.1/schemas/`. `manifest.json` pins every file by sha256.
`workflows/0.1.1/README.md` explains each workflow step by step and lists the nodes and credentials it needs:

- `@taifoon/n8n-nodes-typesafe`, tested with 1.3.0, is on npm.
- `n8n-nodes-taifoon`, tested with 0.4.2, and `n8n-nodes-taifoon-devnet-signer`, tested with 0.2.0, are custom
  extensions and are not on npm.

```
npx @taifoon/jev workflows list
npx @taifoon/jev workflows export ./jev-workflows      # workflows + schemas + manifest + README
npx @taifoon/jev verify 0x6c7e6d2977689f1c9639a377b165f998d1160cc30eca8ff4f1fedc793db2f52d
```
