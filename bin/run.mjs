// jev run — one job through the pipeline, one step at a time.
//   jev run                              the first ready job on the coordination layer's queue, on the public trial
//   jev run --job 8453:81100             a job you name (chain:id; ids like bitagent:8453:7287 work too)
//   jev run --evidence pack.json         your own pack, no layer at all: { subject, state, delivered?, checks?, priceUsdc? }
//   jev run --answers answers.json       answers you already have (the n8n TypeSafe node's output): Jev is not asked
//   --network none|devnet|base|both      where record() points the calls (default devnet)
//   --layer <url> | --no-layer           the coordination layer (default https://coord.taifoon.dev)
//   --yes                                run every step without asking;  --json  print the whole trace as JSON at the end
// Keys come from the environment only: TYPESAFE_KEY (your own Jev key; otherwise the 3-call trial) and
// TAIFOON_RELAYER_KEY (records the answers on the layer). Neither is printed or written anywhere.
// Output is @taifoon/term (vendored as ./term.mjs), the same rhythm as `taifoon up` and the STUDIO run log.
import { readFileSync } from 'node:fs';
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
    case 'record': return `${o.status} · ${(o.calls ?? []).join(', ')}${typeof o.layer === 'object' && o.layer ? ` · layer ${short(o.layer.digest)}` : ''}`;
    case 'evaluator': return `${o.fn} on ${o.protocol} · signed by ${o.signer}`;
    case 'premium': return `${o.guaranteed ? 'guaranteed' : 'not guaranteed'} · premium ${o.premium_label ?? o.premium_ratio}`;
    case 'verify': return o.ok ? `the receipt re-derives · ${Object.keys(o.checks ?? {}).length} checks` : `problems: ${(o.problems ?? []).join('; ')}`;
    default: return 'done';
  }
}

export async function run(argv) {
  const a = [...argv];
  const has = (n) => { const i = a.indexOf(n); if (i < 0) return false; a.splice(i, 1); return true; };
  const val = (n) => { const i = a.indexOf(n); return i >= 0 ? a.splice(i, 2)[1] : undefined; };
  const yes = has('--yes') || !process.stdin.isTTY; const json = has('--json'); const noLayer = has('--no-layer');
  const job = val('--job'); const evFile = val('--evidence'); const ansFile = val('--answers');
  const network = val('--network') ?? 'devnet'; const layer = noLayer ? false : val('--layer');
  const protocol = val('--protocol'); const price = val('--price-usdc');
  const { pipeline, STEPS } = await import('../dist/index.js');

  const t = createTerm({ quiet: json });
  const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  t.info(`jev run · ${noLayer ? 'independent (no layer)' : `layer ${layer ?? 'https://coord.taifoon.dev'}`} · grade on ${ansFile ? 'supplied answers' : process.env.TYPESAFE_KEY ? 'your TypeSafe key' : 'the public trial (3 free calls)'} · record → ${network}${process.env.TAIFOON_RELAYER_KEY ? ' + the layer' : ''}`);

  const trace = await pipeline({
    layer, job, network, protocol, priceUsdc: price ? Number(price) : undefined,
    evidence: evFile ? JSON.parse(readFileSync(evFile, 'utf8')) : undefined,
    answers: ansFile ? JSON.parse(readFileSync(ansFile, 'utf8')) : undefined,
    key: process.env.TYPESAFE_KEY || null, trial: true, relayerKey: process.env.TAIFOON_RELAYER_KEY || null,
    before: async (s) => {
      t.step(STEPS.indexOf(s) + 1, STEPS.length, s.title);
      if (s.route) t.note(s.route);
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
    if (trace.recorded) t.cmd(`npx @taifoon/jev verify ${trace.recorded.digests.answers}`);
  }
  process.exit(trace.steps.some((s) => !s.ok) ? 1 : 0);
}
