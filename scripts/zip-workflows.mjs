// jev-workflows-<version>.zip: the bundle as one file for the GitHub release, so a version can be fetched and pinned.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './bundle-workflows.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const problems = check(version);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
const name = `jev-workflows-${version}`; const zip = join(root, `${name}.zip`);
const tmp = mkdtempSync(join(tmpdir(), 'jevwf-'));
cpSync(join(root, 'workflows', version), join(tmp, name), { recursive: true });
if (existsSync(zip)) rmSync(zip);
execFileSync('zip', ['-qrX', zip, name], { cwd: tmp, stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
console.log(zip);
