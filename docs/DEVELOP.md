# Develop

```
npm ci && npm run check      # typecheck, tests (golden runs, recorded calldata, hashes vs viem), build
node scripts/vendor-n8n.mjs  # refresh the n8n node's copy of the core; test/vendor.test.ts fails when it drifts
npm run bundle && npm run zip   # rebuild workflows/<version>/ and zip it for the release
```
