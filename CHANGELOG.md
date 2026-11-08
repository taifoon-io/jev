# Changelog

All notable changes to `@taifoon/jev`. Versions follow the GitHub releases of this repository; each is published to npm
with provenance by `.github/workflows/publish.yml`.

## 0.4.0

- `verify` reads a trusted record past an endpoint that serves only recent logs. `JevAnswerLog.recordedAt` names the block
  of a trusted record; when an endpoint answers `[]` for that block, the next endpoint of the rotation is asked. A record
  reads `not_recorded` only when every endpoint that answered held no row; no answer at all is still `rpc_unavailable`.
  (Seen on Base for a record 1.35M blocks old.) Two tests cover both outcomes.
- `src/attest.ts`: the defaults of an unknown chain are their own typed value, so the copy compiles under stricter
  TypeScript settings (TS2783). Types only; the calls it returns are unchanged.
- Taifoon mainnet (3692781) is Jev's record home: `record()` builds the `JevAnswerLog.record` and `JevDecisionLog.record`
  calls for it by default (JevDecisionLog `0xaEbF9084Bb32eB2E0F58537526A8877dd1436b23`, JevAnswerLogV2
  `0xC08dfc61d702AEA45d1EF2515d8BDA36d548C75c`), and `verify --chain taifoon` reads them. It has no GradeStampRegistry
  yet; the stamp is listed under `missing`.
- Base: answers are written to JevAnswerLogV2 (`0xC08dfc61d702AEA45d1EF2515d8BDA36d548C75c`, from block 52639649).
  `verify` reads V2 first, then the earlier JevAnswerLog (`0x8e9B9cE86a2d55c10318607b0c815B7B8C66254d`), so every
  earlier record still verifies. Two tests cover both logs.
- README: what you get, how it works, and where Jev's records live.
- package: CHANGELOG.md ships in the tarball; search keywords.

## 0.3.0 (2026-10-14)

- Recording is on by default: every grade returns the unsigned `JevAnswerLog.record`, `JevDecisionLog.record` and
  `GradeStampRegistry.stamp` calls for the Taifoon devnet 36927 and the Taifoon mainnet 3692781 (`--record none` turns
  them off; a contract a network does not have is listed in `missing`). One shared attestation helper for the mark, the
  attestation and the stamp.
- Optional fields of the attestation helper accept `undefined` (`exactOptionalPropertyTypes`).

Earlier versions: see the [releases](https://github.com/taifoon-io/jev/releases).
