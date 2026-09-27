# The records

- **Receipt.** `receiptHash = sha256(JSON.stringify(body))`. The body holds the rubric and its hash, the thresholds, the
  subject, `stateHash`, the facts, the model, every answer with its distribution, what was not asked, the verdict,
  `auto`, `forced`, the reasons and the scores.
- **decision.v2.** `digest = sha256(canonical { v, kind, subject{chainId, at, ref}, model, answers[id, question,
  options, value, probabilities, confidence], input_digest })`, with keys sorted.
  `subjectId = keccak256(abi.encode("taifoon.decision.subject.v1", chainId, at, ref))`.
- **jev.answer.v1.** `digest = sha256(canonical record)`, covering questions, answers with distributions, model,
  upstream model, latency, credential path (`trial` or `caller-credential`), caller and time.
