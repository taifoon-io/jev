// Did the agent do the work it was hired for, as the task laid it out? One job, graded end to end.
//   TYPESAFE_KEY=… node examples/quickstart.mjs        (your own key, from console.typesafe.ai)
import { prepareJob, facts, grade, record, evaluatorCall, verify } from '@taifoon/jev';

// 1. The job as the buyer laid it out, and what the agent handed in (illustrative).
const job = prepareJob({
  id: 'job-4711', chainId: 8453,
  task: 'Extract the invoice into JSON with invoice_no, total, currency and due_date',
  criteria: ['Returns one JSON object with exactly the four fields', 'Every value matches the source invoice', 'due_date is ISO 8601'],
  source: 'INVOICE INV-20931 · Total due: EUR 1,240.50 · Payment due by 2026-10-01',
  delivered: '{"invoice_no":"INV-20931","total":1240.50,"currency":"EUR","due_date":"2026-10-01"}',
  checks: [{ kind: 'json', keys: ['invoice_no', 'total', 'currency', 'due_date'] }],   // code checks first
});

// 2. Code states the facts; Jev answers the rubric about the delivery against the criteria and the source.
const receipt = await grade({ subject: job.subject, evidence: job.evidence, facts: facts(job.facts), key: process.env.TYPESAFE_KEY });
console.log(receipt.verdict, '·', receipt.reasons[0]);

// 3. The record and the call that ends the job, both unsigned: whoever holds the seat signs.
const onchain = await record(receipt);
const end = evaluatorCall('virtuals-erc8183', 4711n, receipt, receipt);
console.log(onchain.calls.map((c) => c.fn), '→', end?.fn, '· verifies:', (await verify(receipt, { chain: false })).ok);
