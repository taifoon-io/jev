// Copy the pricing half of @taifoon/jev-wilson (judge/wilson/src/wilson.ts: z, the interval, the premium) into
// src/wilson.ts. @taifoon/jev ships no runtime dependencies, so the one implementation is vendored, not installed;
// test/wilson-vendor.test.ts checks the copy against the published @taifoon/jev-wilson on a grid of records.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, '..', 'wilson', 'src', 'wilson.ts'), 'utf8');
const from = src.indexOf('/** z for a two-sided'), to = src.indexOf('export type Listing');
if (from < 0 || to < 0) throw new Error('jev-wilson changed shape: update the markers in scripts/vendor-wilson.mjs');
const body = src.slice(from, to)
  .replace(/\/\*\* The Jev model the examples pin\. \*\/\nexport const JEV_MODEL = .*\n/, '')
  .replace(/\n\/\*\* p_L: the lower Wilson bound[\s\S]*?\n}\n/, '\n')
  .trimEnd();
const version = JSON.parse(readFileSync(join(root, '..', 'wilson', 'package.json'), 'utf8')).version;
writeFileSync(join(root, 'src', 'wilson.ts'), `// GENERATED from @taifoon/jev-wilson ${version} (src/wilson.ts) by scripts/vendor-wilson.mjs. Do not edit here.
// The pricing half only: z, the Wilson interval, the premium. Same numbers as the layer's /v1/pools/quote.
${body}
`);
console.log(`vendored @taifoon/jev-wilson ${version} → src/wilson.ts`);
