import { createHash } from 'node:crypto';
import { grade, facts, record, evaluatorCall, verify } from '@taifoon/jev';

const task = 'Return the SHA-256 hex digest of the ASCII string "jev".';
const delivered = createHash('sha256').update('jev').digest('hex');   // what the seller handed in

const receipt = await grade({
  subject: { chainId: 8453, ref: 'quickstart:sha256-jev' },            // what is being judged (your job id)
  evidence: { task, delivered },
  facts: facts({ delivered: true, checks: { digest_recomputes: () => createHash('sha256').update('jev').digest('hex') === delivered } }),
  trial: true,                                                          // 3 free calls; or { key: process.env.TYPESAFE_KEY }
});
console.log(receipt.verdict, '·', receipt.reasons[0]);
console.log('spec_met', receipt.answers?.spec_met.probabilities, '· model', receipt.model);
const onchain = await record(receipt);                                  // unsigned: JevAnswerLog + JevDecisionLog (devnet)
const end = evaluatorCall('virtuals-erc8183', 1n, receipt, receipt);    // unsigned: complete / reject as job 1's evaluator
console.log(onchain.calls.map((c) => c.fn), '→', end?.fn, '· verifies:', (await verify(receipt, { chain: false })).ok);
