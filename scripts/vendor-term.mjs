// Copy @taifoon/term (from the development tree) into bin/term.mjs, byte for byte.
// @taifoon/jev ships no third-party runtime dependencies, so the renderer is vendored, not installed.
// After a copy, update TERM_SHA256 in test/term-vendor.test.ts to the hash this prints.
import { copyFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, '..', '..', 'packages', 'term', 'term.mjs');
const to = join(root, 'bin', 'term.mjs');
copyFileSync(from, to);
console.log(`vendored ${from} → ${to}\nsha256 ${createHash('sha256').update(readFileSync(to)).digest('hex')}`);
