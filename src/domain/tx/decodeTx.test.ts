import { decodeTx, isRiskyTx } from './decodeTx';

const SPENDER = '0x1111111111111111111111111111111111111111';
const w = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0');
const addrWord = (a: string) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');

describe('decodeTx', () => {
  it('envoi natif (données vides)', () => {
    const d = decodeTx({ to: '0xabc', value: 1000n, data: '0x' });
    expect(d).toEqual({ kind: 'empty', to: '0xabc', value: 1000n });
  });

  it('ERC-20 transfer(to, amount)', () => {
    const data = '0xa9059cbb' + addrWord(SPENDER) + w('0x3e8'); // 1000
    const d = decodeTx({ to: '0xToken', data });
    expect(d).toMatchObject({ kind: 'transfer', to: SPENDER, amount: 1000n });
  });

  it('approve(spender, montant) — montant fini', () => {
    const data = '0x095ea7b3' + addrWord(SPENDER) + w('0x64'); // 100
    const d = decodeTx({ to: '0xToken', data });
    expect(d).toMatchObject({ kind: 'approve', spender: SPENDER, amount: 100n, unlimited: false });
    expect(isRiskyTx(d)).toBe(false);
  });

  it('approve ILLIMITÉ (uint256 max) → risqué', () => {
    const max = (2n ** 256n - 1n).toString(16);
    const data = '0x095ea7b3' + addrWord(SPENDER) + w('0x' + max);
    const d = decodeTx({ to: '0xToken', data });
    expect(d).toMatchObject({ kind: 'approve', unlimited: true });
    expect(isRiskyTx(d)).toBe(true);
  });

  it('setApprovalForAll(operator, true) → risqué (accès à tous les NFT)', () => {
    const data = '0xa22cb465' + addrWord(SPENDER) + w('0x1');
    const d = decodeTx({ to: '0xCollection', data });
    expect(d).toMatchObject({ kind: 'approveAll', operator: SPENDER, approved: true });
    expect(isRiskyTx(d)).toBe(true);
  });

  it('setApprovalForAll(operator, false) → révocation, non risqué', () => {
    const data = '0xa22cb465' + addrWord(SPENDER) + w('0x0');
    expect(isRiskyTx(decodeTx({ to: '0xC', data }))).toBe(false);
  });

  it('appel de contrat inconnu → générique', () => {
    const d = decodeTx({ to: '0xDeFi', value: 5n, data: '0xdeadbeef0000' });
    expect(d).toMatchObject({ kind: 'contract', selector: '0xdeadbeef' });
  });
});
