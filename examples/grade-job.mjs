// Grade one agent job: did the agent do the work as the task laid it out?
//   TYPESAFE_KEY=… node examples/grade-job.mjs examples/jobs/research-report.json
//   node examples/grade-job.mjs examples/jobs/research-report-no-sources.json     (code rejects it; Jev is not asked)
// Your key comes from console.typesafe.ai. It is sent to TypeSafe only, and never stored or recorded.
import { readFileSync } from 'node:fs';
import { prepareJob, facts, grade, record } from '@taifoon/jev';

const spec = JSON.parse(readFileSync(process.argv[2] ?? new URL('./jobs/research-report.json', import.meta.url), 'utf8'));
const job = prepareJob(spec);                         // task + numbered criteria + source + delivery, and the code checks

const f = await facts(job.facts);
console.log('facts', f.checks, f.checksOk === false ? '→ a check failed: code rejects, Jev is not asked' : '');

const receipt = await grade({ subject: job.subject, evidence: job.evidence, facts: f, key: process.env.TYPESAFE_KEY });
console.log(receipt.verdict, '·', receipt.reasons.join(' · '));
if (receipt.answers) for (const [id, a] of Object.entries(receipt.answers)) console.log(' ', id.padEnd(18), a.value, a.probabilities);
if (receipt.decision) console.log('record:', (await record(receipt)).calls.map((c) => c.fn).join(' + '));
