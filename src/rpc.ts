// The RPCs the package reads through: warmbed's rotation (https://warmbed.taifoon.dev, endpoints it measured to serve
// eth_getLogs windows), then the static list vendored from the RPC registry (src/rpc-fallback.ts). A rate limit, a 5xx,
// a timeout or a refusal moves a call to the next endpoint; a revert is thrown at once (JevChainError reverted), and so is a
// range refusal that names its cap (the caller narrows the window). When every endpoint failed: JevChainError rpc_unavailable.
import { JevChainError } from './errors.js';
import { RPC_FALLBACK } from './rpc-fallback.js';

export const WARMBED = 'https://warmbed.taifoon.dev';
export const RPC_TIMEOUT_MS = 30_000;
const WARMBED_TIMEOUT_MS = 2_500;
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; urls: string[] }>();
/** Forget the cached rotations (tests; a long-running process never needs it: entries expire after 60 s). */
export function clearRpcCache(): void { cache.clear(); }

/** warmbed's rotation of a chain for `need`, then the static fallback (deduplicated). Never throws. */
export async function rpcRotation(chainId: number, f: typeof fetch = fetch, need: 'logs' | 'call' = 'logs'): Promise<string[]> {
  const k = `${chainId}:${need}`; const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.urls;
  let warm: string[] = [];
  try {
    const r = await f(`${WARMBED}/warmbed/chain/${chainId}/rotation?need=${need}${need === 'logs' ? '&min_span=500' : ''}&n=8`, { signal: AbortSignal.timeout(WARMBED_TIMEOUT_MS) });
    const body = r && r.ok ? ((await r.json()) as unknown) : null;
    if (Array.isArray(body)) warm = body.map((e) => (e && typeof e === 'object' ? String((e as { url?: unknown }).url ?? '') : '')).filter((u) => /^https:\/\//.test(u));
  } catch { warm = []; }
  const urls = [...new Set([...warm, ...(RPC_FALLBACK[chainId]?.[need] ?? []), ...(RPC_FALLBACK[chainId]?.call ?? [])])];
  if (warm.length) cache.set(k, { at: Date.now(), urls });
  return urls;
}

const REVERT = /revert|invalid opcode|out of gas/i;
/** The cap an endpoint names when it refuses a range ("eth_getLogs is limited to a 500 range"), or null. */
export function rangeCapOf(message: string): number | null {
  const m = /limited to (?:a )?(\d+)(?: block)? range/i.exec(message) ?? /range (?:is )?(?:limited|capped) (?:to|at) (\d+)/i.exec(message);
  return m ? Number(m[1]) : null;
}

/**
 * One JSON-RPC call over a list of endpoints (or one URL): each endpoint in turn, two passes with a short pause, each
 * attempt bounded by RPC_TIMEOUT_MS. Throws JevChainError reverted / rpc_unavailable, or the range refusal as is.
 */
export async function rpcCall<T>(rpc: string | readonly string[], f: typeof fetch, method: string, params: unknown[], o: { chainId?: number; passes?: number; timeoutMs?: number } = {}): Promise<T> {
  const urls = typeof rpc === 'string' ? [rpc] : rpc;
  if (!urls.length) throw new JevChainError('rpc_unavailable', `${method}: no RPC endpoint`, o.chainId);
  const passes = o.passes ?? 2;
  let last = '';
  for (let p = 0; p < passes; p++) {
    for (const u of urls) {
      try {
        const r = await f(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(o.timeoutMs ?? RPC_TIMEOUT_MS) });
        if (typeof r.status === 'number' && r.status >= 400) { last = `${hostOf(u)}: http ${r.status}`; continue; }
        const j = (await r.json()) as { result?: T; error?: { message?: string; code?: number } };
        if (j.error) {
          const msg = String(j.error.message ?? j.error.code);
          if (j.error.code === 3 || REVERT.test(msg)) throw new JevChainError('reverted', `${method}: ${msg}`, o.chainId);
          if (rangeCapOf(msg)) throw Object.assign(new Error(`${method}: ${msg}`), { final: true });
          last = `${hostOf(u)}: ${msg.slice(0, 160)}`; continue;
        }
        return j.result as T;
      } catch (e) {
        if (e instanceof JevChainError || (e as { final?: boolean }).final) throw e;
        last = `${hostOf(u)}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (p + 1 < passes) await new Promise((r) => setTimeout(r, 400 * (p + 1)));
  }
  throw new JevChainError('rpc_unavailable', `${method}: every RPC endpoint failed (last: ${last})`, o.chainId);
}
function hostOf(u: string): string { try { return new URL(u).host; } catch { return u; } }
