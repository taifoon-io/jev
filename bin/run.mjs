// jev run — one job through the pipeline, one step at a time.
//   jev run                              the first ready job on the coordination layer's queue (your TYPESAFE_KEY, else the free grades)
//   jev run --job 8453:81100             a job you name (chain:id; ids like bitagent:8453:7287 work too)
//   jev run --evidence pack.json         your own pack, no layer at all: { subject, state, delivered?, checks?, priceUsdc? }
//   jev run --job-file job.json          one agent job: { id, task, criteria[], delivered, source?, checks[] } (see examples/jobs/)
//   jev run --demo                       offline, no key: replays a REAL graded job (BitAgent 7287 on Base) with Jev's
//                                        recorded answers, and checks the result against the decision on chain
//   jev run --answers answers.json       answers you already have (the n8n TypeSafe node's output): Jev is not asked
//   --record none|devnet|base|both       opt-in: where the grade is recorded (default none: the receipt and digests only);
//                                        --network is the same flag
//   --layer <url> | --no-layer           the coordination layer (default https://coord.taifoon.dev)
//   --yes                                run every step without asking;  --json  print the whole trace as JSON at the end
// Keys come from the environment only: TYPESAFE_KEY (your own TypeSafe key, console.typesafe.ai) and
// TAIFOON_RELAYER_KEY (records the answers on the layer). Neither is printed or written anywhere.
// Output is @taifoon/term (vendored as ./term.mjs), the same rhythm as `taifoon up` and the STUDIO run log.
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createTerm } from './term.mjs';

const short = (s, n = 18) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n - 8)}…${s.slice(-6)}` : String(s));

/** One line per step: what it established. The full output is in the --json trace. */
function factOf(r) {
  const o = r.out ?? {};
  switch (r.id) {
    case 'pick': return o.row ? `job ${o.row.jobId} · ${o.row.why} · evidence ${o.row.evidence_ready}` : `job ${o.jobId} on ${o.chainId}`;
    case 'evidence': return `${o.facts} labelled facts · ${o.gaps?.length ?? 0} gaps · ${o.state_chars} characters for Jev to read`;
    case 'facts': return `delivered ${o.delivered ? 'yes' : 'no'} · checks ${o.checksOk === false ? 'failed' : o.checksOk ? 'ok' : 'none'}${o.priceUsdc != null ? ` · ${o.priceUsdc} USDC` : ''}`;
    case 'grade': return `${o.verdict} · ${o.reasons?.[0] ?? ''}${o.model ? ` · ${o.model}` : ''}`;
    case 'record': return `${o.status === 'none' ? 'not recorded (opt in with --record)' : `${o.status} · ${(o.calls ?? []).join(', ')}`}${o.recording?.held ? ` · layer held it: ${o.recording.held}` : ''}${typeof o.layer === 'object' && o.layer ? ` · layer ${short(o.layer.digest)}` : ''}`;
    case 'evaluator': return `${o.fn} on ${o.protocol} · signed by ${o.signer}`;
    case 'premium': return `${o.guaranteed ? 'guaranteed' : 'not guaranteed'} · premium ${o.premium_label ?? o.premium_ratio}`;
    case 'verify': return o.ok ? `the receipt re-derives · ${Object.keys(o.checks ?? {}).length} checks` : `problems: ${(o.problems ?? []).join('; ')}`;
    default: return 'done';
  }
}

const USAGE = 'jev run [--demo | --job <chain>:<id> | --job-file job.json | --evidence pack.json] [--answers answers.json] [--record none|devnet|base|both] [--layer <https url> | --no-layer] [--protocol <name>] [--price-usdc <n>] [--seller-record <k>/<n>] [--yes] [--json]';
const PROTOCOLS = ['assurance-hook', 'judge-adapter', 'virtuals-erc8183', 'virtuals-memo-acp', 'bitagent-erc8183'];
/** A stranger's typo must never run something else: every flag is known, every value checked, exit 2 with the fix. */
function refuse(msg) { process.stderr.write(`jev run: ${msg}\n  ${USAGE}\n`); process.exit(2); }

export async function run(argv) {
  const a = [...argv];
  const has = (n) => { const i = a.indexOf(n); if (i < 0) return false; a.splice(i, 1); return true; };
  const val = (n) => {
    const i = a.indexOf(n); if (i < 0) return undefined;
    const v = a[i + 1]; if (v === undefined || v.startsWith('--')) refuse(`${n} needs a value`);
    a.splice(i, 2); return v;
  };
  const file = (n) => { const f = val(n); if (f !== undefined && !existsSync(f)) refuse(`${n}: no such file ${f}`); return f; };
  const yes = has('--yes') || !process.stdin.isTTY; const json = has('--json'); const noLayer = has('--no-layer') || argv.includes('--demo') || argv.includes('--job-file');
  const demo = has('--demo');
  const job = val('--job'); const evFile = file('--evidence');
  const jobFile = file('--job-file');
  const ansFile = file('--answers');
  const rec = demo ? JSON.parse(readFileSync(new URL('../examples/jobs/base-bitagent-7287.recorded.json', import.meta.url), 'utf8')) : null;
  const network = val('--record') ?? val('--network') ?? 'none'; const layer = noLayer ? false : val('--layer');
  const protocol = val('--protocol'); const price = val('--price-usdc'); const sellerRec = val('--seller-record');
  if (a.length) refuse(`unknown flag ${a[0]}`);
  if (!['none', 'devnet', 'base', 'both'].includes(network)) refuse(`--record is none, devnet, base or both (got ${network})`);
  if (demo && (job || evFile || jobFile || ansFile)) refuse('--demo replays one recorded job: drop --job, --job-file, --evidence and --answers');
  if ([job, evFile, jobFile].filter(Boolean).length > 1) refuse('pick one source: --job, --job-file or --evidence');
  if (job && !/^\d+:.+$/.test(job) && !/^\S+$/.test(job)) refuse(`--job is <chain>:<id>, e.g. 8453:bitagent:8453:7287 (got ${job})`);
  if (layer && !/^https:\/\//.test(layer)) refuse('--layer must be an https:// URL');
  if (protocol && !PROTOCOLS.includes(protocol)) refuse(`--protocol is one of ${PROTOCOLS.join(', ')}`);
  if (price !== undefined && !(Number(price) > 0)) refuse(`--price-usdc must be a positive number (got ${price})`);
  const recM = sellerRec === undefined ? null : /^(\d+)\/(\d+)$/.exec(sellerRec);
  if (sellerRec !== undefined && (!recM || Number(recM[1]) > Number(recM[2]) || Number(recM[2]) === 0)) refuse(`--seller-record must be <delivered>/<graded>, e.g. 60/62 (got ${sellerRec})`);
  const { pipeline, STEPS, prepareJob } = await import('../dist/index.js');

  const t = createTerm({ quiet: json });
  const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  t.info(`jev run · ${noLayer ? 'offline' : `layer ${layer ?? 'https://coord.taifoon.dev'}`} · grade on ${demo ? `Jev's recorded answers for ${rec.job.ref} (${rec.job.task})` : ansFile ? 'supplied answers' : process.env.TYPESAFE_KEY ? 'your TypeSafe key' : noLayer ? 'no key: set TYPESAFE_KEY, or try --demo' : 'your free grades on the layer (no TypeSafe key)'} · record → ${network === 'none' ? 'none (opt in with --record devnet|base|both)' : network}${process.env.TAIFOON_RELAYER_KEY ? ' + the layer' : ''}`);

  const trace = await pipeline({
    layer, job, network, protocol, priceUsdc: price ? Number(price) : undefined, sellerRecord: recM ? { k: Number(recM[1]), n: Number(recM[2]) } : undefined,
    evidence: rec ? { subject: rec.subject.ref, from: `the recorded job ${rec.job.ref} (${rec.job.protocol}, ${rec.job.price})`, chainId: rec.subject.chainId, label: rec.subject.label, state: rec.evidence, delivered: rec.facts.delivered, checks: rec.facts.checks } : jobFile ? prepareJob(JSON.parse(readFileSync(jobFile, 'utf8'))).pack : evFile ? JSON.parse(readFileSync(evFile, 'utf8')) : undefined,
    answers: rec ? rec.answers : ansFile ? JSON.parse(readFileSync(ansFile, 'utf8')) : undefined, ...(rec ? { model: rec.model } : {}),
    key: process.env.TYPESAFE_KEY || null, relayerKey: process.env.TAIFOON_RELAYER_KEY || null,
    before: async (s) => {
      t.step(STEPS.indexOf(s) + 1, STEPS.length, s.title);
      if (s.route && !noLayer) t.note(s.route);
      if (!rl) return true;
      const r = (await rl.question(s.required ? '  enter = run · q = quit › ' : '  enter = run · s = skip · q = quit › ')).trim().toLowerCase();
      if (r === 'q') { rl.close(); process.exit(0); }
      return s.required || r !== 's';
    },
    after: (r) => {
      if (r.skipped) t.skip(r.skipped);
      else if (!r.ok) t.fail(r.error ?? 'failed', { ms: r.ms });
      else t.ok(factOf(r), { ms: r.ms });
    },
  });
  rl?.close();
  if (json) t.json(trace);
  else if (trace.receipt) {
    t.line('');
    t.say(`verdict ${trace.receipt.verdict} · receipt ${trace.receipt.receiptHash}`);
    if (rec) {
      const same = trace.receipt.decision?.digest === rec.recorded.digest;
      (same ? t.ok : t.fail)(`${same ? 'same decision digest as' : 'differs from'} the one recorded on chain: ${rec.recorded.decision}, anchored in ${rec.recorded.anchor.tx}`);
    } else if (trace.recorded && trace.recorded.status !== 'none') t.cmd(`npx @taifoon/jev verify ${trace.recorded.digests.answers}`);
  }
  process.exit(trace.steps.some((s) => !s.ok) ? 1 : 0);
}
