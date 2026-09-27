// The shipped skill and plugin must stay true to the CLI they teach: valid frontmatter, and every flag they show exists.
import { describe, expect, it } from 'vitest';
import skill from '../skills/jev-grader/SKILL.md?raw';
import runSrc from '../bin/run.mjs?raw';
import plugin from '../.claude-plugin/plugin.json' with { type: 'json' };
import market from '../.claude-plugin/marketplace.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };

describe('skills/jev-grader and the Claude Code plugin', () => {
  const fm = skill.split('---')[1]!;
  const field = (k: string) => new RegExp(`^${k}: (.+)$`, 'm').exec(fm)?.[1] ?? '';
  it('frontmatter follows the Agent Skills spec', () => {
    expect(field('name')).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(field('description').length).toBeGreaterThan(40);
    expect(field('description').length).toBeLessThanOrEqual(1024);
    expect(field('compatibility').length).toBeLessThanOrEqual(500);
  });
  it('every jev run flag the skill shows is a flag the CLI accepts', () => {
    const shown = new Set([...skill.matchAll(/(?<![-\w])--([a-z][a-z-]*)/g)].map((m) => `--${m[1]}`));
    for (const f of shown) expect(runSrc, `${f} is shown in SKILL.md`).toContain(`'${f}'`);
  });
  it('the skill never tells an agent to handle the key itself', () => {
    expect(skill).toMatch(/Never ask for it in chat/);
    expect(skill).not.toMatch(/TYPESAFE_KEY=sk|apikey_/);
  });
  it('plugin version follows the package; the marketplace points at this repo', () => {
    expect(plugin.version).toBe(pkg.version);
    expect(market.plugins[0]!.source).toBe('./');
  });
});
