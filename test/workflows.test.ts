// The versioned workflow bundle: every file matches its manifest hash, credentials are placeholders only, nothing
// secret-shaped, and (in the development tree) it equals a fresh build from workflows/.
import { describe, expect, it } from 'vitest';
import manifest from '../workflows/0.2.15/manifest.json' with { type: 'json' };
// @ts-expect-error plain .mjs helper
import { check } from '../scripts/bundle-workflows.mjs';

describe('jev-workflows-0.2.15 (the newest bundle; 0.2.14, 0.2.7 and 0.2.2 are kept as shipped)', () => {
  it('the bundle checks clean', () => { expect(check('0.2.15')).toEqual([]); expect(check('0.2.14')).toEqual([]); expect(check('0.2.7')).toEqual([]); expect(check('0.2.2')).toEqual([]); });
  it('ships the four Jev workflows and the schemas their steps name', () => {
    expect(manifest.workflows.map((w) => w.file).sort()).toEqual(['batch-judge.json', 'hire-judge-settle.json', 'jev-grader.json', 'stamp-grade.json']);
    for (const s of ['answers', 'facts', 'verdict']) expect(manifest.schemas.map((x) => x.$id)).toContain(`https://www.taifoon.io/schemas/coordination/v1/${s}.json`);
  });
});
