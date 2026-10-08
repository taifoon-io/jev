/**
 * Why a chain read did not give an answer. `rpc_unavailable`: every endpoint failed (rate limit, 5xx, timeout); the record
 * may well exist, try again or pass --rpc. `not_deployed`: no Jev log on that chain. `reverted`: the call reverted.
 * `bad_input`: an argument verify() cannot use. "Not recorded" is not an error: verify() reports it in onChain.status.
 */
export type JevChainErrorCode = 'rpc_unavailable' | 'not_deployed' | 'reverted' | 'bad_input';
export class JevChainError extends Error {
  readonly code: JevChainErrorCode;
  readonly chainId?: number;
  constructor(code: JevChainErrorCode, message: string, chainId?: number) { super(message); this.name = 'JevChainError'; this.code = code; this.chainId = chainId; }
}
