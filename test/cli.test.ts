// The command line as a stranger meets it: every flag known, every value checked, safe defaults, clear errors.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

const BIN = new URL('../bin/jev.mjs', import.meta.url).pathname;
const run = (...args: string[]) => {
  const env = { ...process.env }; delete env.TYPESAFE_KEY; delete env.TAIFOON_RELAYER_KEY;
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env, timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('jev (no network)', () => {
  it('no arguments prints the usage', () => { expect(run()).toMatchObject({ code: 0 }); expect(run().out).toMatch(/jev run/); });
  it('--demo replays the real Base job and matches the recorded decision digest', () => {
    const r = run('run', '--demo', '--yes');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/same decision digest as the one recorded on chain/);
    expect(r.out).toMatch(/not recorded \(opt in with --record\)/);          // recording is opt-in
  });
  it('--demo --json prints one JSON trace', () => {
    const r = run('run', '--demo', '--json');
    expect(JSON.parse(r.out).receipt.verdict).toBe('reject');
  });
  it('--record base builds the Base calls (unsigned; nothing is sent)', () => {
    expect(run('run', '--demo', '--yes', '--record', 'base').out).toMatch(/JevAnswerLog\.record@8453/);
  });
  it.each([
    [['--record', 'foo'], /--record is none, devnet, base or both/],
    [['--recrod', 'base'], /unknown flag --recrod/],
    [['--record'], /--record needs a value/],
    [['--job-file', '/nope.json'], /no such file/],
    [['--job', '8453:1', '--job-file', 'README.md'], /pick one source/],
    [['--layer', 'http://evil.example'], /https:\/\//],
    [['--protocol', 'uniswap'], /--protocol is one of/],
    [['--price-usdc', '-3'], /positive number/],
    [['--seller-record', '7/5'], /--seller-record must be <delivered>\/<graded>/],
    [['--seller-record', '60-62'], /e\.g\. 60\/62/],
  ])('refuses %j with exit 2 and the fix', (args, re) => {
    const r = run('run', ...(args as string[]));
    expect(r.code).toBe(2);
    expect(r.out).toMatch(re);
  });
  it('--seller-record prices the premium here, offline, with the layer\'s numbers', () => {
    const r = run('run', '--demo', '--json', '--seller-record', '6/6', '--price-usdc', '1.5');
    const t = JSON.parse(r.out);
    expect(t.quote.premium_ratio).toBe(0.39033428790216534);
    expect(t.quote.premium).toBe('585501');
  });
  it('--demo with another source is refused', () => { expect(run('run', '--demo', '--job', '8453:1').code).toBe(2); });
  it('a job whose code checks fail is rejected without a key (Jev is never asked)', () => {
    const r = run('run', '--yes', '--job-file', new URL('../examples/jobs/research-report-no-sources.json', import.meta.url).pathname);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/verdict reject/);
  });
  it('a job that needs Jev, without a key, stops at Jev and says where to get one', () => {
    const r = run('run', '--yes', '--job-file', new URL('../examples/jobs/invoice-extraction.json', import.meta.url).pathname);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/TYPESAFE_KEY \(console\.typesafe\.ai\)/);
  });
  it('workflows list names the bundled workflows', () => { expect(run('workflows', 'list').out).toMatch(/hire-judge-settle\.json/); });
});
