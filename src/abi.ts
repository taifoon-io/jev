// The ABI encoding this package needs, and no more: static words (bytes32, uintN, bool, address) and dynamic bytes /
// string, for calls and for reading the two log events. Checked against viem in test/abi.test.ts.
import { fromHex, keccakHex, toHex, utf8, type Hex } from './hash.js';

export type AbiType = 'bytes32' | 'uint256' | 'uint64' | 'uint16' | 'uint8' | 'bool' | 'address' | 'bytes' | 'string';
export type AbiValue = string | number | bigint | boolean;

const word = (n: bigint): string => { if (n < 0n || n >= 1n << 256n) throw new Error('uint out of range'); return n.toString(16).padStart(64, '0'); };
const isDynamic = (t: AbiType) => t === 'bytes' || t === 'string';
function staticWord(t: AbiType, v: AbiValue): string {
  switch (t) {
    case 'bool': return word(v ? 1n : 0n);
    case 'address': { const s = String(v); if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error(`not an address: ${s}`); return s.slice(2).toLowerCase().padStart(64, '0'); }
    case 'bytes32': { const s = String(v); if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error(`not a bytes32: ${s}`); return s.slice(2).toLowerCase(); }
    default: {
      const bits = Number(t.slice(4)); const n = BigInt(v as string | number | bigint);
      if (n < 0n || n >= 1n << BigInt(bits)) throw new Error(`${String(v)} does not fit ${t}`);
      return word(n);
    }
  }
}
function tail(t: AbiType, v: AbiValue): string {
  const b = t === 'string' ? utf8(String(v)) : fromHex(String(v));
  const hex = toHex(b).slice(2);
  return word(BigInt(b.length)) + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
}
/** abi.encode(values) for the given types */
export function encode(types: readonly AbiType[], values: readonly AbiValue[]): Hex {
  if (types.length !== values.length) throw new Error('types and values differ in length');
  let head = ''; let body = ''; const headLen = types.length * 32;
  types.forEach((t, i) => {
    if (isDynamic(t)) { head += word(BigInt(headLen + body.length / 2)); body += tail(t, values[i]!); }
    else head += staticWord(t, values[i]!);
  });
  return `0x${head}${body}`;
}
/** the 4-byte selector of a canonical signature, e.g. "complete(bytes32)" */
export const selector = (signature: string): Hex => keccakHex(signature).slice(0, 10) as Hex;
/** calldata: selector ‖ abi.encode(args); the types are read from the signature */
export function encodeCall(signature: string, values: readonly AbiValue[]): Hex {
  const inner = signature.slice(signature.indexOf('(') + 1, -1);
  const types = (inner ? inner.split(',') : []) as AbiType[];
  return `${selector(signature)}${encode(types, values).slice(2)}` as Hex;
}
/** abi.decode for the same types (log data) */
export function decode(types: readonly AbiType[], data: Hex): AbiValue[] {
  const h = data.slice(2);
  const at = (i: number) => h.slice(i * 64, i * 64 + 64);
  return types.map((t, i) => {
    const w = at(i);
    if (isDynamic(t)) {
      const off = Number(BigInt('0x' + w)) * 2; const len = Number(BigInt('0x' + h.slice(off, off + 64)));
      const raw = h.slice(off + 64, off + 64 + len * 2);
      return t === 'string' ? new TextDecoder().decode(fromHex(raw)) : (`0x${raw}` as Hex);
    }
    if (t === 'bool') return BigInt('0x' + w) !== 0n;
    if (t === 'address') return `0x${w.slice(24)}`;
    if (t === 'bytes32') return `0x${w}`;
    return BigInt('0x' + w);
  });
}
