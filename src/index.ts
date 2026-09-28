/**
 * @taifoon/jev — Jev as a grader any protocol can call.
 *
 *   prepareJob()     an agent job as the buyer laid it out → the evidence Jev reads + the code checks
 *   grade()          evidence → deterministic facts → Jev's atomic questions → composed verdict → receipt
 *   facts()          the deterministic checks a protocol supplies (a failed one is final; Jev is not asked)
 *   record()         the unsigned calls that put the receipt's digests on JevAnswerLog / JevDecisionLog
 *   evaluatorCall()  the unsigned call that ends the job on the protocol whose evaluator seat you hold
 *   verify()         recompute every digest and find the chain events that hold them
 *   verifyDecision() recompute a decision record as /v1/judge/decisions/{id} serves it, offline
 *   pipeline()       one job through the coordination layer's steps: pick → evidence → facts → grade → record → evaluator → premium → verify
 *   RUBRIC_v1        the questions, thresholds and composition (pass your own rubric to grade)
 *   CONTRACTS        where the logs and the evaluator seats are
 *
 * No runtime dependency. No key inside: Jev is called with your own TypeSafe key (console.typesafe.ai).
 */
export { grade } from './grade.js';
export { facts } from './facts.js';
export { prepareJob, runCheck } from './job.js';
export { record } from './record.js';
export { evaluatorCall } from './evaluator/index.js';
export { verify } from './verify.js';
export { verifyDecision } from './decision.js';
export { pipeline, STEPS, LAYER, factsFromEvidence, protocolFor, parseJob, localQuote } from './pipeline.js';
export { RUBRIC_v1 } from './rubric.js';
export { CONTRACTS } from './contracts.js';

export type { GradeInput, Receipt } from './grade.js';
export type { FactsInput, Check } from './facts.js';
export type { JobSpec, JobCheck, PreparedJob } from './job.js';
export type { Recorded, UnsignedCall, Network } from './record.js';
export type { Verification, AnswerEvent, DecisionEvent } from './verify.js';
export type { DecisionRecord, DecisionCheck } from './decision.js';
export type { Protocol, Adapter, AdapterOpts, EvaluatorCall } from './evaluator/index.js';
export type { JevError } from './ask.js'; // thrown with .status and .next
export type { Rubric, RubricInput, Question, Answer, Facts, Verdict, Composed, Thresholds } from './rubric.js';
export type { Subject, AnswerRecord } from './records.js';
export type { Hex } from './hash.js';
export type { PipelineOpts, Trace, StepId, StepResult, Evidence, QueueRow, Quote } from './pipeline.js';
