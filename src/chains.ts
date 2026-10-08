// The chains verify() knows: every chain the coordination layer reads, by id or name, and the Jev logs on each
// (vendored from the address registry: src/addresses.ts JEV_LOGS). A chain without Jev logs is known but has nothing to verify.
import { JEV_LOGS } from './addresses.js';
import { JevChainError } from './errors.js';

export const DEVNET = 36927;
export const CHAIN_NAMES: Readonly<Record<number, string>> = {
  36927: 'Taifoon devnet', 8453: 'Base', 42161: 'Arbitrum One', 5042: 'Arc', 4663: 'Robinhood Chain', 143: 'Monad',
  3692781: 'Taifoon mainnet', 1: 'Ethereum',
};
const ALIASES: Readonly<Record<string, number>> = {
  devnet: 36927, 'taifoon-devnet': 36927, base: 8453, arbitrum: 42161, 'arbitrum-one': 42161, arb: 42161, arc: 5042,
  robinhood: 4663, 'robinhood-chain': 4663, monad: 143, taifoon: 3692781, 'taifoon-mainnet': 3692781, ethereum: 1, eth: 1,
};
export const chainName = (id: number): string => `${CHAIN_NAMES[id] ?? 'chain'} (${id})`;

/** A chain id from an id ("8453"), a name ("base", "Arbitrum One") or a number. Throws JevChainError bad_input. */
export function chainIdOf(x: string | number): number {
  if (typeof x === 'number' && Number.isInteger(x) && x > 0) return x;
  const s = String(x).trim().toLowerCase().replace(/\s+/g, '-');
  if (/^\d+$/.test(s)) return Number(s);
  const id = ALIASES[s];
  if (!id) throw new JevChainError('bad_input', `unknown chain "${x}"; use an id or one of: ${Object.keys(ALIASES).join(', ')}`);
  return id;
}

/** The Jev logs of a chain, or null when none is deployed there. */
export const jevLogsOn = (chainId: number) => JEV_LOGS[chainId] ?? null;
/** Every chain that carries Jev logs, the devnet first, then Base, then the rest by id. */
export const JEV_CHAINS: readonly number[] = Object.keys(JEV_LOGS).map(Number)
  .sort((a, b) => (a === DEVNET ? -1 : b === DEVNET ? 1 : a === 8453 ? -1 : b === 8453 ? 1 : a - b));
