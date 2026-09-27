import { describe, expect, it, vi } from 'vitest';
import { facts, grade, pipeline, prepareJob, runCheck, verify, type Answer, type JobSpec } from '../src/index.js';

// the four illustrative jobs in examples/jobs/ (written by hand, not real deliveries)
import report from '../examples/jobs/research-report.json' with { type: 'json' };
import thin from '../examples/jobs/research-report-no-sources.json' with { type: 'json' };
import invoice from '../examples/jobs/invoice-extraction.json' with { type: 'json' };
import signal from '../examples/jobs/signal-unsupported.json' with { type: 'json' };
import sample from '../examples/jobs/research-report.sample-answers.json' with { type: 'json' };

const spec = (j: unknown) => j as JobSpec;
const answers = (spec_met: number, unsupported: number, ending: string, cheat = 0.03): Answer[] => [
  { id: 'spec_met', value: spec_met >= 0.5 ? 'yes' : 'no', confidence: 0.8, probabilities: { yes: spec_met, no: 1 - spec_met } },
  { id: 'unsupported_claim', value: unsupported >= 0.5 ? 'yes' : 'no', confidence: 0.8, probabilities: { yes: unsupported, no: 1 - unsupported } },
  { id: 'ending', value: ending, confidence: 0.8, probabilities: { complete: ending === 'complete' ? 0.9 : 0.05, reject: ending === 'reject' ? 0.9 : 0.03, expire: 0, needs_review: ending === 'needs_review' ? 0.9 : 0.02 } },
  { id: 'cheat_shaped', value: cheat >= 0.5 ? 'yes' : 'no', confidence: 0.9, probabilities: { yes: cheat, no: 1 - cheat } },
];

describe('prepareJob(): the data a grader needs, from the job as the buyer laid it out', () => {
  it('Jev reads the task, the numbered acceptance criteria, the source and the delivery; code has run its checks', async () => {
    const job = prepareJob(spec(report));
    expect(job.evidence.acceptance_criteria.split('\n')[0]).toBe('1. Names the ticker AAPL');
    expect(job.facts.checks).toEqual({ 'names the ticker and a call': true, 'cites at least 2 sources': true, 'delivered by the deadline': true });
    const f = vi.fn(async () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: Object.fromEntries(answers(0.92, 0.06, 'complete').map((a) => [a.id, { choice: a.value, confidence: a.confidence, probabilities: a.probabilities }])) })));
    const r = await grade({ subject: job.subject, evidence: job.evidence, facts: facts(job.facts), key: 'apikey_x', fetch: f as never });
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).state as string;
    for (const part of ['equity_research where ticker is', '1. Names the ticker AAPL', '5. States no figure it does not source', 'Call: HOLD', 'facts code established', 'cites at least 2 sources: passed']) expect(sent).toContain(part);
    expect(r.verdict).toBe('complete');
  });

  it('a delivery without its sources is rejected by code, before Jev is asked (no key needed)', async () => {
    const job = prepareJob(spec(thin));
    expect(job.facts.checks).toEqual({ 'names the ticker and a call': true, 'cites at least 2 sources': false });
    const f = vi.fn();
    const r = await grade({ subject: job.subject, evidence: job.evidence, facts: facts(job.facts), fetch: f as never });
    expect(f).not.toHaveBeenCalled();
    expect(r).toMatchObject({ verdict: 'reject', forced: 'hard_fail', decision: null });
  });

  it('an extraction job carries its source, so Jev checks the values against it, not just the shape', async () => {
    const job = prepareJob(spec(invoice));
    expect(job.facts.checks).toEqual({ 'JSON with invoice_no, total, currency, due_date': true });
    expect(job.evidence.source).toContain('Total due: EUR 1,240.50');
    const r = await grade({ subject: job.subject, evidence: job.evidence, facts: facts(job.facts), answers: answers(0.9, 0.05, 'complete') });
    expect(r.input).toContain('Total due: EUR 1,240.50');
    expect(r.verdict).toBe('complete');
  });

  it('claims the evidence cannot support (a "guaranteed edge") pass the code checks and are Jev\'s to catch', async () => {
    const job = prepareJob(spec(signal));
    expect(job.facts.checks).toEqual({ 'gives a signal': true, 'cites at least 1 source': true });
    const r = await grade({ subject: job.subject, evidence: job.evidence, facts: facts(job.facts), answers: answers(0.3, 0.9, 'reject') });
    expect(r.verdict).toBe('reject');
    expect(r.reasons[0]).toMatch(/spec_met 0.3|unsupported_claim 0.9/);
  });

  it('nothing delivered is a hard fail; a job needs its task and at least one criterion', async () => {
    const r = await grade({ ...(({ subject, evidence }) => ({ subject, evidence }))(prepareJob({ ...spec(report), delivered: null })), facts: facts(prepareJob({ ...spec(report), delivered: null }).facts) });
    expect(r).toMatchObject({ verdict: 'reject', forced: 'hard_fail' });
    expect(() => prepareJob({ ...spec(report), criteria: [] })).toThrow(/acceptance criterion/);
  });

  it('runCheck: each kind', () => {
    expect(runCheck({ kind: 'json', keys: ['a'] }, '[1]').ok).toBe(false);
    expect(runCheck({ kind: 'json', keys: ['a'] }, '{"a":1}').ok).toBe(true);
    expect(runCheck({ kind: 'sources', min: 2 }, 'https://a.io https://a.io').ok).toBe(false);
    expect(runCheck({ kind: 'deadline', submittedAt: '2026-09-28T00:00:00Z', deadline: '2026-09-27T00:00:00Z' }, '').ok).toBe(false);
  });

  it('the offline demo: the same job through pipeline() with the labelled sample answers, no network', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const t = await pipeline({ layer: false, fetch: f, evidence: prepareJob(spec(report)).pack, answers: sample as unknown as Answer[] });
    expect(f).not.toHaveBeenCalled();
    expect(t.receipt!.verdict).toBe('complete');
    expect((await verify(t.receipt!, { chain: false })).ok).toBe(true);
  });
});
