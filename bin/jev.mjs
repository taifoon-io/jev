#!/usr/bin/env node
// jev — the @taifoon/jev command line.
//   jev workflows list [--version X]          the bundled n8n workflows (and which nodes and credentials each needs)
//   jev workflows export <dir> [--version X]  write them, their schemas, manifest and README into <dir>
//   jev run [--job 8453:81100] [--evidence pack.json] [--network …] [--yes] [--json]   one job through the pipeline, step by step
//   jev verify <answers-digest | decision id> [--chain <id|name>] [--rpc url[,url]]  (a decision id: recompute its record offline, then) find the digest's
//     JevAnswered / Decided rows: on --chain, else the chain the decision record names, else every chain with Jev logs (devnet,
//     Base, then the rest). Chain reads go through warmbed's rotation, then the registry's static list; --rpc overrides both.
//     --network devnet|base|any still works (any = no chain named).
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
// the newest bundle shipped (a bundle is versioned on its own and rebuilt only when the workflows change)
const BUNDLES = readdirSync(join(ROOT, 'workflows')).filter((d) => /^\d+\.\d+\.\d+$/.test(d)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
const version = flag('--version') ?? BUNDLES.at(-1) ?? PKG.version;
const network = flag('--network') ?? 'any';
// --rpc <url[,url…]>: read through these endpoints instead of warmbed's rotation (the named or anchored chain; else Base)
const rpcFlag = flag('--rpc');
const chainFlag = flag('--chain');
const bundle = join(ROOT, 'workflows', version);
const die = (m) => { console.error(m); process.exit(1); };
const [cmd, sub, target] = args;

if (cmd === 'workflows') {
  if (!existsSync(bundle)) die(`no workflow bundle ${version}; bundled: ${readdirSync(join(ROOT, 'workflows')).join(', ')}`);
  const m = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'));
  if (sub === 'list') {
    for (const w of m.workflows) console.log(`${w.file}  ${w.name}\n  nodes: ${w.packages.join(', ')}  ·  credentials: ${w.credentials.join(', ') || 'none'}`);
  } else if (sub === 'export') {
    if (!target) die('usage: jev workflows export <dir> [--version X]');
    const out = resolve(target);
    cpSync(bundle, out, { recursive: true });
    console.log(`${m.bundle} → ${out}: ${m.workflows.length} workflows, ${m.schemas.length} schemas, manifest.json, README.md`);
  } else die('usage: jev workflows list|export <dir> [--version X]');
} else if (cmd === 'run') {
  await import('./run.mjs').then((m) => m.run(process.argv.slice(3)));
} else if (cmd === 'verify' && sub) {
  const { verify, verifyDecision, LAYER, chainIdOf, JEV_CHAINS } = await import('../dist/index.js');
  // which chain(s) to read: --chain <id|name> (or --network devnet|base|<chain>) names one; otherwise the chain the decision
  // record names (its anchor); otherwise every chain with Jev logs in turn (devnet, Base, then the rest) until one holds it
  let named = null;
  try { named = chainFlag ? chainIdOf(chainFlag) : network !== 'any' ? chainIdOf(network) : null; } catch (e) { die(e.message); }
  let digest = sub; let offline = null; let anchor = null;
  // a decision id (or its /v1/judge/decisions URL): read the served record and its answers, recompute both here, then
  // find the answers digest on chain like any other
  const m = /(decision-\d+-[0-9a-f]{10})/.exec(sub);
  if (m) {
    const get = async (p) => { const r = await fetch(`${LAYER}${p}`, { signal: AbortSignal.timeout(30_000) }); if (!r.ok) die(`${LAYER}${p} answered ${r.status}`); return r.json(); };
    const rec = await get(`/v1/judge/decisions/${m[1]}`);
    const ad = rec?.decision?.answers_digest;
    const ans = ad ? await get(`/v1/judge/answers/${ad}`) : null;
    offline = verifyDecision(rec, ans?.record ? { answers: ans.record } : {});
    if (!ad) { console.log(JSON.stringify({ offline }, null, 1)); process.exit(offline.ok ? 0 : 2); }
    digest = ad;
    const a = rec?.decision?.anchor;
    if (a && a.status === 'ok' && Number.isInteger(Number(a.chain))) anchor = { chain: Number(a.chain), block: Number(a.block) || undefined };
  }
  const chains = named ? [named] : anchor ? [anchor.chain] : JEV_CHAINS;
  // --rpc reads one chain: the named or anchored one, else Base (the endpoints a reader passes are almost always Base's)
  const rpcFor = (c) => (rpcFlag && (chains.length === 1 || c === 8453) ? { rpc: rpcFlag } : {});
  let v = null;
  for (const c of chains) {
    const r = await verify(digest, { network: c, ...rpcFor(c), ...(anchor && anchor.chain === c && anchor.block ? { decisionBlock: anchor.block } : {}) });
    if (!v || r.checks.answersOnChain || (c === 8453 && !v.ok)) v = r;
    if (r.checks.answersOnChain) break;
  }
  console.log(JSON.stringify(offline ? { offline, ...v, ok: v.ok && offline.ok } : v, null, 1));
  process.exit(v.ok && (!offline || offline.ok) ? 0 : 2);
} else {
  console.log(`jev ${PKG.version}\n  jev workflows list [--version X]\n  jev workflows export <dir> [--version X]\n  jev run [--job <chain>:<id>] [--evidence pack.json] [--network none|devnet|base|both] [--yes] [--json]\n  jev verify <answers-digest | decision id> [--chain <id|name>] [--rpc url[,url]]`);
}
