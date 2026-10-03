import { applyNonceFloor, clearNonceFloor, noteBroadcastNonce } from './EvmAdapterV2';

describe('plancher de nonce local (EVM)', () => {
  const A = '0xAbC0000000000000000000000000000000000001';
  beforeEach(() => clearNonceFloor());

  it('sans envoi récent : nonce du nœud', () => {
    expect(applyNonceFloor(1, A, 7, 0)).toBe(7);
  });

  it('nœud en retard après un envoi : nonce suivant le dernier envoi', () => {
    noteBroadcastNonce(1, A, 7, 1_000);
    expect(applyNonceFloor(1, A, 7, 2_000)).toBe(8);
    expect(applyNonceFloor(1, A.toLowerCase(), 7, 2_000)).toBe(8); // casse ignorée
  });

  it('nœud en avance : son nonce l’emporte', () => {
    noteBroadcastNonce(1, A, 7, 1_000);
    expect(applyNonceFloor(1, A, 10, 2_000)).toBe(10);
  });

  it('propre à chaque réseau', () => {
    noteBroadcastNonce(1, A, 7, 1_000);
    expect(applyNonceFloor(137, A, 3, 2_000)).toBe(3);
  });

  it('expire : une transaction perdue ne bloque pas indéfiniment', () => {
    noteBroadcastNonce(1, A, 7, 1_000);
    expect(applyNonceFloor(1, A, 7, 1_000 + 121_000)).toBe(7);
  });

  it('un remplacement au même nonce ne recule pas le plancher', () => {
    noteBroadcastNonce(1, A, 8, 1_000);
    noteBroadcastNonce(1, A, 7, 2_000);
    expect(applyNonceFloor(1, A, 7, 3_000)).toBe(9);
  });
});
