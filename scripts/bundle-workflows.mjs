// Build the versioned bundle of the n8n workflows that run Jev: workflows/<version>/ inside this package.
// Source: the development tree's workflows/ (exported from n8n.taifoon.dev, credential REFERENCES only) and schemas/json.
// Every credential reference becomes a placeholder (id "", a name that says which credential type to pick); a secret-
// shaped string anywhere refuses the build. Run in the development tree: node scripts/bundle-workflows.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const DEV_ROOT = join(here, '..', '..', '..');
// a bundle has its own version: rebuilt (BUNDLE_VERSION=x.y.z node scripts/bundle-workflows.mjs) only when workflows change
const BUNDLE = process.env.BUNDLE_VERSION || PKG.version;
const OUT = join(here, '..', 'workflows', BUNDLE);
export const newestBundle = () => { try { return readdirSync(join(here, '..', 'workflows')).filter((d) => /^\d+\.\d+\.\d+$/.test(d)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).at(-1); } catch { return undefined; } };
export const SECRET = /(apikey_[A-Za-z0-9]{8,}|tfn_live_[A-Za-z0-9]{8,}|tfr_[A-Za-z0-9]{16,}|npm_[A-Za-z0-9]{30,}|sk-ant-[A-Za-z0-9-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|0x[0-9a-fA-F]{64}"\s*[,}]\s*$)/m;

/** Workflow text as published: internal source paths in code comments become a public name. */
export const scrub = (text) => text.replace(/schemas\/src\/from\/judge\.ts/g, 'the Taifoon verdict schema').replace(/ \(schemas\/src\/from\/\)/g, '');
/** A schema as published: `x-source` notes name internal stores, so they are dropped. */
export const publicSchema = (raw) => scrub(JSON.stringify(JSON.parse(raw, (k, v) => (k === 'x-source' ? undefined : v)), null, 2) + '\n');

export const WORKFLOWS = [
  { file: 'hire-judge-settle.tfnhiresettle001.json', out: 'hire-judge-settle.json', title: 'HIRE → JUDGE → SETTLE (devnet 36927)',
    what: 'One hire from offer to settlement. The seller’s reply is held with its digest; prepare decides the facts (a hard fail skips Jev); your TypeSafe credential answers the four RUBRIC_v1 questions; answers composes the verdict under THRESHOLDS_v1, records decision.v2 and jev.answer.v1 and, with Record On = devnet (set in this file), anchors them on the devnet logs; a complete settles through the devnet assurance hook (approve, fund, submit, complete), needs_review is held until the job’s deadline, when anyone may call expire. Executions 86 and 88 of this workflow are the golden runs @taifoon/jev re-derives.\n\n**Needs:** n8n-nodes-taifoon ≥ 0.4.5 and n8n-nodes-taifoon-devnet-signer ≥ 0.3.0 (custom extensions), @taifoon/n8n-nodes-typesafe ≥ 2.0.1; a Taifoon relayer key, your TypeSafe key, and two devnet 36927 keys (buyer, seller) with gas and dUSDC. **Outputs:** the whole JOB (Receipt, then Proofs · wait): handshake, verdict, decision with its devnet anchor tx, and every settlement transaction with its proof link.' },
  { file: 'jev-grader.tfnjevgrader0001.json', out: 'jev-grader.json', title: 'Jev on-chain grader (grade → stamp → devnet)',
    what: 'Grades Base jobs that were paid and delivered and that nobody ruled on (GET /v1/judge/ready): four per run, each through prepare → Jev → answers, then the canonical verdict, then GradeStampRegistry.stamp on the devnet, signed by the devnet signer node; the stamp transaction is appended to the verdict’s anchors.' },
  { file: 'batch-judge.tfnbatchjudge001.json', out: 'batch-judge.json', title: 'Batch judge',
    what: 'A batch of subjects, each as its own prepare → Jev → answers (so every answer is recorded), aggregated and posted to POST /v1/judge/batch.' },
  { file: 'stamp-grade.tfnstamp00000001.json', out: 'stamp-grade.json', title: 'Stamp Grade (a recorded verdict → GradeStampRegistry)',
    what: 'Takes one recorded decision (by id), maps it to the canonical verdict, and stamps it on the devnet GradeStampRegistry; emits the verdict with the stamp transaction in its anchors.' },
];
export const CREDENTIALS = {
  taifoonTypeSafeApi: 'your TypeSafe key (console.typesafe.ai) — credential type "TypeSafe API" of @taifoon/n8n-nodes-typesafe',
  taifoonRelayerApi: 'a Taifoon relayer key (tfr_…) for https://www.taifoon.io/v1 — credential type "Taifoon Relayer API" of n8n-nodes-taifoon',
  taifoonDevnetKeyApi: 'a devnet 36927 key with gas from https://faucet.taifoon.dev — credential type "Taifoon Devnet Key API" of n8n-nodes-taifoon-devnet-signer',
};
export const PACKAGES = {
  '@taifoon/n8n-nodes-typesafe': { tested: '2.0.1', where: 'npm (community node): npm i @taifoon/n8n-nodes-typesafe' },
  'n8n-nodes-taifoon': { tested: '0.4.5', where: 'custom extension (type prefix CUSTOM.); not on npm' },
  'n8n-nodes-taifoon-devnet-signer': { tested: '0.3.0', where: 'custom extension (type prefix CUSTOM.); not on npm' },
};
const PKG_OF = { 'CUSTOM.taifoon': 'n8n-nodes-taifoon', 'CUSTOM.taifoonDevnetSigner': 'n8n-nodes-taifoon-devnet-signer', '@taifoon/n8n-nodes-typesafe.taifoonTypeSafe': '@taifoon/n8n-nodes-typesafe' };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const short = (id) => (id ? String(id).replace('https://www.taifoon.io/schemas/coordination/v1/', '') : '—');
const ids = (v) => (Array.isArray(v) ? v.map(short).join(' + ') : short(v));

export function sanitize(w) {
  const nodes = w.nodes.map((n) => {
    const out = { ...n };
    if (n.credentials) out.credentials = Object.fromEntries(Object.keys(n.credentials).map((type) => [type, { id: '', name: `REPLACE: ${type}` }]));
    return out;
  });
  return { name: w.name, nodes, connections: w.connections, settings: w.settings ?? {}, active: false, meta: w.meta, tags: [], versionId: undefined };
}

export function build() {
  const manifest = { bundle: `jev-workflows-${BUNDLE}`, package: `${PKG.name}@${PKG.version}`, workflows: [], schemas: [], packages: PACKAGES, credentials: CREDENTIALS };
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(join(OUT, 'schemas'), { recursive: true });
  const usedSchemas = new Set(['common.json']);
  let readme = `# Jev workflows ${BUNDLE}\n\nThe n8n workflows that run Jev on n8n.taifoon.dev, exported with credential references replaced by placeholders (\`{ "id": "", "name": "REPLACE: <credential type>" }\`: pick your own credential of that type after import). Import with n8n → Workflows → Import from File, or \`n8n import:workflow --input=<file>\`. Every step carries its contract: \`meta.taifoon.steps\` names the canonical entity it takes and emits by \`$id\`; the schemas are in \`schemas/\` (the \`$id\`s are identifiers, the files are here).\n\n## Nodes they need\n\n| Package | Tested with | Where |\n|---|---|---|\n${Object.entries(PACKAGES).map(([p, v]) => `| \`${p}\` | ${v.tested} | ${v.where} |`).join('\n')}\n\n## Credentials they need\n\n| Type | What |\n|---|---|\n${Object.entries(CREDENTIALS).map(([t, v]) => `| \`${t}\` | ${v} |`).join('\n')}\n`;
  for (const wf of WORKFLOWS) {
    const src = JSON.parse(readFileSync(join(DEV_ROOT, 'workflows', wf.file), 'utf8'));
    const clean = sanitize(src);
    const text = scrub(JSON.stringify(clean, null, 2) + '\n');
    if (SECRET.test(text)) throw new Error(`${wf.file}: a secret-shaped string — refusing`);
    writeFileSync(join(OUT, wf.out), text);
    const steps = src.meta?.taifoon?.steps ?? {};
    for (const s of Object.values(steps)) for (const v of [s.in, s.out].flat()) if (v) usedSchemas.add(short(v));
    const packages = [...new Set(src.nodes.map((n) => PKG_OF[n.type]).filter(Boolean))];
    const builtins = [...new Set(src.nodes.filter((n) => n.type.startsWith('n8n-nodes-base.')).map((n) => `${n.type.replace('n8n-nodes-base.', '')} v${n.typeVersion}`))];
    const creds = [...new Set(src.nodes.flatMap((n) => Object.keys(n.credentials ?? {})))];
    manifest.workflows.push({ file: wf.out, source_id: src.id, name: src.name, sha256: sha(text), nodes: src.nodes.length, packages, builtins, credentials: creds });
    readme += `\n## ${wf.title} — \`${wf.out}\`\n\n${wf.what}\n\n- source: \`${src.id}\` on n8n.taifoon.dev · sha256 \`${sha(text)}\`\n- nodes: ${packages.map((p) => `\`${p}\``).join(', ')}; built-ins ${builtins.join(', ')}\n- credentials: ${creds.map((c) => `\`${c}\``).join(', ') || 'none'}\n\n| Step | Takes | Emits | Does |\n|---|---|---|---|\n${Object.entries(steps).map(([name, s]) => `| ${name} | ${ids(s.in)} | ${ids(s.out)} | ${String(s.does ?? '').replace(/\|/g, '\\|')} |`).join('\n')}\n`;
  }
  for (const f of [...usedSchemas].sort()) {
    const p = join(DEV_ROOT, 'schemas', 'json', f);
    if (!existsSync(p)) continue;
    const text = publicSchema(readFileSync(p, 'utf8'));
    writeFileSync(join(OUT, 'schemas', f), text);
    manifest.schemas.push({ file: `schemas/${f}`, $id: JSON.parse(text).$id, sha256: sha(text) });
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(OUT, 'README.md'), readme);
  return manifest;
}
/** problems with the bundle as shipped: every file matches the manifest, credentials are placeholders only, no secret;
 *  in the development tree also: the bundle equals a fresh build from workflows/ (so a changed workflow needs a re-bundle) */
export function check(version = PKG.version) {
  const dir = join(here, '..', 'workflows', version); const problems = [];
  if (!existsSync(join(dir, 'manifest.json'))) return [`no bundle for ${version}`];
  const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  for (const w of m.workflows) {
    const text = readFileSync(join(dir, w.file), 'utf8');
    if (sha(text) !== w.sha256) problems.push(`${w.file}: sha256 differs from the manifest`);
    if (SECRET.test(text)) problems.push(`${w.file}: secret-shaped string`);
    for (const n of JSON.parse(text).nodes) for (const [t, ref] of Object.entries(n.credentials ?? {})) if (ref.id !== '' || ref.name !== `REPLACE: ${t}` || Object.keys(ref).length !== 2) problems.push(`${w.file} ${n.name}: credential ${t} is not a placeholder`);
    const src = join(DEV_ROOT, 'workflows', WORKFLOWS.find((x) => x.out === w.file)?.file ?? '-');
    if (version === newestBundle() && existsSync(src) && scrub(JSON.stringify(sanitize(JSON.parse(readFileSync(src, 'utf8'))), null, 2) + '\n') !== text) problems.push(`${w.file}: stale — workflows/ changed; run node scripts/bundle-workflows.mjs`);
  }
  for (const f of m.schemas) { const t = readFileSync(join(dir, f.file), 'utf8'); if (sha(t) !== f.sha256) problems.push(`${f.file}: sha256 differs from the manifest`); }
  return problems;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const m = build();
  console.log(`${m.bundle}: ${m.workflows.length} workflows, ${m.schemas.length} schemas → ${OUT}`);
}
