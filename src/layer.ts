// _JEV_THROUGH_COORD_v1_ (0.5.0): the coordination layer's Jev routes. A grade without your own TypeSafe key, a record with a
// Taifoon key, a decision read and the graded jobs all go through coord's /v1/jev/* by default; `layer` overrides the base and
// `routes` any path. Until a layer serves /v1/jev/*, a 404 there falls back once to the judge route it aliases (the same
// handler), so 0.5.0 works against a layer that has not deployed the aliases yet. Your own key (`key`) still goes straight to
// TypeSafe: it is never sent to the layer.
export const LAYER_URL = 'https://coord.taifoon.dev';
export type LayerRoutes = { grade: string; record: string; decision: string; jobs: string; records: string };
/** the default: coord's Jev routes */
export const LAYER_ROUTES: Readonly<LayerRoutes> = Object.freeze({ grade: '/v1/jev/grade', record: '/v1/jev/record', decision: '/v1/jev/decisions/', jobs: '/v1/jev/jobs', records: '/v1/jev/records' });
/** the judge routes each one aliases, tried once when the layer answers 404 on the Jev route */
export const LEGACY_ROUTES: Readonly<Partial<LayerRoutes>> = Object.freeze({ grade: '/v1/judge/compose', record: '/v1/judge/answers/record', decision: '/v1/judge/decisions/' });

/** the layer base, checked: https only (localhost may be http). Pure. */
export function layerBase(layer?: string | null): string {
  const base = (layer ?? LAYER_URL).replace(/\/$/, '');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('the layer is only called over https');
  return base;
}

/** One call to a layer route: the Jev route first; on a 404 the judge route it aliases (when the caller did not override the
 *  route). Returns the response and the path that answered. */
export async function layerCall(o: { f: typeof fetch; base: string; route: keyof LayerRoutes; suffix?: string; routes?: Partial<LayerRoutes>; init?: RequestInit; timeoutMs?: number }): Promise<{ r: Response; path: string }> {
  const own = o.routes?.[o.route];
  const first = `${own ?? LAYER_ROUTES[o.route]}${o.suffix ?? ''}`;
  const go = (p: string) => o.f(`${o.base}${p}`, { ...o.init, signal: AbortSignal.timeout(o.timeoutMs ?? 65_000) });
  const r = await go(first);
  const legacy = LEGACY_ROUTES[o.route];
  if (r.status === 404 && !own && legacy) { const p = `${legacy}${o.suffix ?? ''}`; return { r: await go(p), path: p }; }
  return { r, path: first };
}

export type JevJob = {
  decision_id: string; job: { id: string; venue: string; class: string | null; chain_id: number };
  rubric: { version: string | null; hash: string | null; thresholds: string | null };
  verdict: string | null; auto: boolean | null; reason: string | null;
  checks: { id: string; value: string; p: number | null; question: string | null }[];
  model: string | null; digest: string; answers_digest: string | null;
  record: { chain_id: number | null; contract: string | null; tx: string | null; block: number | null; recorded_at: number | null; status: string | null; link: string | null } | null;
  ending: { kind: 'release' | 'refund' | 'expire' | 'other'; verdict: string | null; tx: string | null; link: string | null; decided_by: string | null; grade_gated: boolean; row: string } | null;
  at: string;
};
export type JevJobs = { ok: boolean; network: number; read_at: string; count: number; summary: { graded: number; with_ending: number; grade_gated_endings: number }; jobs: JevJob[] };

/** GET /v1/jev/jobs: the graded jobs on a network (36927 the devnet, 8453 Base), decoded, with the release or refund that followed. */
export async function jobs(o: { network?: 36927 | 8453 | 'devnet' | 'base'; limit?: number; layer?: string; routes?: Partial<LayerRoutes>; fetch?: typeof fetch } = {}): Promise<JevJobs> {
  const q = new URLSearchParams({ network: String(o.network ?? 36927), limit: String(Math.max(1, Math.min(50, o.limit ?? 20))) });
  const { r, path } = await layerCall({ f: o.fetch ?? fetch, base: layerBase(o.layer), route: 'jobs', suffix: `?${q}`, routes: o.routes, timeoutMs: 30_000 });
  const j = (await r.json().catch(() => ({}))) as JevJobs & { error?: string };
  if (!r.ok || j.ok === false) throw new Error(`GET ${path}: ${r.status} ${j.error ?? ''}`.trim());
  return j;
}
