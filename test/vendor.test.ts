// The n8n TypeSafe node carries a copy of the network-free core (no runtime dependencies allowed there). In the
// development tree or in the published repository (the node one level up) this fails when the copy drifts from src/.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs helper
import { drift, found, VENDORED, vendored } from '../scripts/vendor-n8n.mjs';

describe.skipIf(!found())('the n8n node’s vendored copy', () => {
  it('every vendored file is identical to src/', () => { expect(drift()).toEqual([]); });
  it('holds nothing that reaches the network', () => { for (const f of VENDORED as string[]) expect(vendored(f)).not.toMatch(/\bfetch\(/); });
});
