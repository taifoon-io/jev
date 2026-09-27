import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/hash.js';
// read as text through the bundler, so the test has no node:fs (the public mirror's n8n lint forbids it)
import term from '../bin/term.mjs?raw';

// @taifoon/term, vendored by scripts/vendor-term.mjs.
const TERM_SHA256 = '0xac75ab6be9ddd6b4f762062ba1192212cf882e6354ea9a0bc192ec9bbcb796be';

describe('bin/term.mjs is @taifoon/term, byte for byte', () => {
  it('matches the pinned sha256 (re-vendor with scripts/vendor-term.mjs and update the pin together)', () => {
    expect(sha256Hex(term)).toBe(TERM_SHA256);
  });
  it('imports nothing, so @taifoon/jev keeps zero runtime dependencies', () => {
    expect(term).not.toMatch(/^\s*import\s|require\(/m);
  });
});
