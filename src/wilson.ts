// GENERATED from @taifoon/jev-wilson 0.1.0 (src/wilson.ts) by scripts/vendor-wilson.mjs. Do not edit here.
// The pricing half only: z, the Wilson interval, the premium. Same numbers as the layer's /v1/pools/quote.
/** z for a two-sided 95% interval, as the layer pins it. */
export const Z = 1.959963984540054;
/** The layer's pool rule: no pool covers above this premium ratio. */
export const MAX_PREMIUM_RATIO = 0.3;
/** The premium ratio is rounded to millionths before it multiplies the price. */
export const RATIO_SCALE = 1_000_000;

function checkRecord(k: number, n: number): void {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) {
    throw new RangeError(`need integers 0 <= k <= n, got k=${k}, n=${n}`);
  }
}

/** The Wilson score interval for `successes` of `n`. [0, 1] when n = 0. Same operations, same order as the layer. */
export function wilson(successes: number, n: number, z: number = Z): [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n, z2 = z * z;
  const d = 1 + z2 / n;
  const c = p + z2 / (2 * n);
  const s = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}


/** u_F: the upper Wilson bound on the failure rate, n - k failed of n. This is the layer's π ratio. */
export function wilsonUpperFailure(k: number, n: number, z: number = Z): number {
  checkRecord(k, n);
  return wilson(n - k, n, z)[1];
}

/** JavaScript Math.round, kept explicit so the Python twin can match it. */
const roundHalfUp = (x: number): number => Math.round(x);

/** floor(price × round(ratio × 1e6) / 1e6), exactly as the layer's pool-quote computes it. */
export function premiumAmount(price: bigint, ratio: number): bigint {
  if (price <= 0n) throw new RangeError('price must be a positive integer in the token’s smallest unit');
  return (price * BigInt(roundHalfUp(ratio * RATIO_SCALE))) / BigInt(RATIO_SCALE);
}

export type SellerRecord = { k: number; n: number };
export type PremiumOpts = {
  /** floor on the ratio; default 0 (the layer has none) */
  min?: number;
  /** cover only when ratio <= max; default 0.30 (the layer's pool rule) */
  max?: number;
  /** price in the token's smallest unit; when given, `amount` is computed */
  price?: bigint | number | string;
  /** z for the record form; default Z */
  z?: number;
};
export type Premium =
  | { insurable: false; reason: 'UNKNOWN'; ratio: null; amount: null; covered: false; basis: 'record' }
  | { insurable: true; ratio: number; amount: bigint | null; covered: boolean; basis: 'record' | 'p_L' };

/**
 * The premium for the next job.
 *
 * premium({ k, n }, opts)  prices from the record: ratio = u_F, bit-for-bit with the layer.
 * premium(pL, opts)        prices from a lower bound you already hold: ratio = 1 - p_L. Equal in real
 *                          arithmetic, but 1 - p_L can differ from u_F in the last bits of a double.
 *                          Use the record form when you need the layer's number to the last digit.
 */
export function premium(input: number | SellerRecord, opts: PremiumOpts = {}): Premium {
  const min = opts.min ?? 0;
  const max = opts.max ?? MAX_PREMIUM_RATIO;
  let raw: number;
  let basis: 'record' | 'p_L';
  if (typeof input === 'number') {
    if (!(input >= 0 && input <= 1)) throw new RangeError(`p_L must be in [0, 1], got ${input}`);
    raw = 1 - input;
    basis = 'p_L';
  } else {
    checkRecord(input.k, input.n);
    if (input.k <= 0) return { insurable: false, reason: 'UNKNOWN', ratio: null, amount: null, covered: false, basis: 'record' };
    raw = wilsonUpperFailure(input.k, input.n, opts.z ?? Z);
    basis = 'record';
  }
  const ratio = raw < min ? min : raw;
  const amount = opts.price === undefined ? null : premiumAmount(BigInt(opts.price), ratio);
  return { insurable: true, ratio, amount, covered: ratio <= max, basis };
}
