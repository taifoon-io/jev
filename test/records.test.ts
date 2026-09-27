// Golden: what is already on chain (devnet 36927) must re-derive with this package's code alone.
import { describe, expect, it } from 'vitest';
import { encodeFunctionData, keccak256, toBytes } from 'viem';
import { encodeCall } from '../src/abi.js';
import { answersDigestOf, confidenceBpsOf, decisionDigest, kindIdOf, subjectIdOf, type AnswerRecord } from '../src/records.js';
import { ANSWER_LOG_RECORD, DECISION_LOG_RECORD } from '../src/record.js';
import { keccakHex } from '../src/hash.js';

import d86 from './fixtures/decision-exec86-1790492280929-781b0fce9c.json' with { type: 'json' };
import d88 from './fixtures/decision-exec88-1790493351706-abea2dbbfd.json' with { type: 'json' };
import a86 from './fixtures/answers-exec86-devnet.json' with { type: 'json' };
type Fx = { decision: { kind: string; subject: { chainId: number; ref: string }; answers: never; model: string; input_digest: `0x${string}`; digest: string; subject_id: string; kind_id: string; confidence_bps: number; uri: string }; calldata: string };
const CASES = [{ exec: '86', fx: d86 as unknown as Fx }, { exec: '88', fx: d88 as unknown as Fx }];
describe.each(CASES)('decision.v2 of n8n execution $exec (anchored on JevDecisionLog)', ({ fx }) => {
  const { decision: d, calldata } = fx;
  it('digest, subject id, kind id, confidence and record() calldata re-derive', () => {
    expect(decisionDigest({ kind: d.kind, subject: d.subject, answers: d.answers, model: d.model, input_digest: d.input_digest })).toBe(d.digest);
    expect(subjectIdOf(d.subject)).toBe(d.subject_id);
    expect(kindIdOf(d.kind)).toBe(d.kind_id);
    expect(confidenceBpsOf(d.answers)).toBe(d.confidence_bps);
    expect(encodeCall(DECISION_LOG_RECORD, [d.subject_id, d.kind_id, d.digest, d.confidence_bps, d.model, d.uri])).toBe(calldata);
  });
});
describe('jev.answer.v1 of execution 86 (tx 0x9a38cf55… on JevAnswerLog)', () => {
  const a = a86 as unknown as { digest: string; record: AnswerRecord; decision_digest: string; input: string; to: string };
  it('the digest recomputes from the served record', () => { expect(answersDigestOf(a.record)).toBe(a.digest); });
  it('record() calldata equals the mined transaction input byte for byte', () => {
    const args = [keccakHex(a.record.use_case), a.record.subject, a.record.input_digest!, a.digest, a.decision_digest, a.record.upstream_model ?? 'jev', `https://www.taifoon.io/v1/judge/answers/${a.digest}`] as const;
    expect(encodeCall(ANSWER_LOG_RECORD, [...args])).toBe(a.input);
  });
  it('the selectors are the Solidity ones', () => {
    const abi = [{ type: 'function', name: 'record', stateMutability: 'nonpayable', inputs: ['bytes32', 'bytes32', 'bytes32', 'uint16', 'string', 'string'].map((type, i) => ({ name: `a${i}`, type })), outputs: [] }] as const;
    expect(encodeCall(DECISION_LOG_RECORD, ['0x' + '1'.repeat(64), '0x' + '2'.repeat(64), '0x' + '3'.repeat(64), 5, 'm', 'u'])).toBe(encodeFunctionData({ abi, functionName: 'record', args: ['0x' + '1'.repeat(64) as `0x${string}`, '0x' + '2'.repeat(64) as `0x${string}`, '0x' + '3'.repeat(64) as `0x${string}`, 5, 'm', 'u'] }));
    expect(keccak256(toBytes('JevAnswered(address,bytes32,bytes32,bytes32,bytes32,bytes32,string,string,uint256,bool)'))).toBe('0x685a1fb6255dcc9bfb4e33db6b44da4451372621c06e5800d469e1f003780f22');
  });
});
