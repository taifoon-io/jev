// Copy the attestation helper (one import-free file, the same bytes @taifoon/assurance and the SDKs carry) into
// src/attest.ts, and pin its sha256 in src/attest.pin.json. @taifoon/jev ships no runtime dependency, so the helper is
// vendored, not installed; test/attest-vendor.test.ts fails on an edited copy, and on drift where the source is present.
//   node scripts/vendor-attest.mjs [path to packages/assurance/src/attest.ts]    write src/attest.ts + the pin
//   node scripts/vendor-attest.mjs --check                                       exit 1 on an edited copy or drift
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(root, 'src', 'attest.ts');
export const PIN = join(root, 'src', 'attest.pin.json');
export const SOURCE = process.env.ATTEST_SOURCE ?? join(root, '..', '..', 'packages', 'assurance', 'src', 'attest.ts');
export const sha = (b) => createHash('sha256').update(b).digest('hex');
export const found = () => existsSync(SOURCE);
/** the problems of the copy: edited after it was pinned, or (with the source present) behind it */
export function problems() {
  const bad = [];
  if (!existsSync(OUT) || !existsSync(PIN)) return ['src/attest.ts or its pin is missing: run node scripts/vendor-attest.mjs'];
  const got = sha(readFileSync(OUT)); const pin = JSON.parse(readFileSync(PIN, 'utf8'));
  if (pin.sha256 !== got) bad.push('src/attest.ts was edited after it was vendored (it differs from its pin)');
  if (found() && sha(readFileSync(SOURCE)) !== got) bad.push('src/attest.ts differs from packages/assurance/src/attest.ts: run node scripts/vendor-attest.mjs');
  return bad;
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (process.argv.includes('--check')) {
    const bad = problems(); if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
    console.log('src/attest.ts matches its pin' + (found() ? ' and packages/assurance/src/attest.ts' : ''));
  } else {
    const src = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? SOURCE;
    const body = readFileSync(src);
    writeFileSync(OUT, body);
    writeFileSync(PIN, JSON.stringify({ about: 'a copy of the attestation helper (packages/assurance/src/attest.ts); do not edit, re-vendor it with scripts/vendor-attest.mjs', source: 'packages/assurance/src/attest.ts', sha256: sha(body) }, null, 2) + '\n');
    console.log('vendored attest.ts → src/attest.ts (+ pin)');
  }
}
