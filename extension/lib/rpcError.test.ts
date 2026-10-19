/** Raison d'un échec : un CODE pour la fenêtre (traduite), jamais pour le site. */
import { describe, expect, it } from 'vitest';
import { reasonOf, RpcError, toRpcError } from './rpcError';

describe('reasonOf', () => {
  it('code texte du cœur ou d’ethers', () => {
    expect(reasonOf(Object.assign(new Error('x'), { code: 'INSUFFICIENT_FUNDS' }))).toBe('INSUFFICIENT_FUNDS');
    expect(reasonOf(Object.assign(new Error('x'), { code: 'CALL_EXCEPTION' }))).toBe('CALL_EXCEPTION');
  });
  it('réseau : une seule raison', () => {
    expect(reasonOf(Object.assign(new Error('x'), { code: 'TIMEOUT' }))).toBe('RPC_UNAVAILABLE');
    expect(reasonOf(new TypeError('Failed to fetch'))).toBe('RPC_UNAVAILABLE');
  });
  it('rien d’inventé', () => {
    expect(reasonOf(new RpcError(4001, 'Refusé'))).toBeUndefined();
    expect(reasonOf(new Error('boom'))).toBeUndefined();
    expect(reasonOf(Object.assign(new Error('x'), { code: 'pas un code <script>' }))).toBeUndefined();
  });
  it('le site ne reçoit pas la raison', () => {
    expect(Object.keys(toRpcError(Object.assign(new Error('x'), { code: 'INSUFFICIENT_FUNDS' })))).toEqual(['code', 'message']);
  });
});
