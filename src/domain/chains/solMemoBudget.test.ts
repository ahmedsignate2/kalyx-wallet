import { CU_SOL_TRANSFER, CU_SPL_TRANSFER, sendComputeUnits } from './solPriority';
import { buildTransferMessage } from './solTx';

describe('budget de calcul d’un envoi avec mémo', () => {
  it('sans mémo, le budget du transfert reste inchangé', () => {
    expect(sendComputeUnits(CU_SOL_TRANSFER)).toBe(CU_SOL_TRANSFER);
    expect(sendComputeUnits(CU_SPL_TRANSFER, '')).toBe(CU_SPL_TRANSFER);
  });

  it('avec mémo, le budget couvre le programme Memo (il dépassait les 1 000 unités d’un transfert SOL)', () => {
    const cu = sendComputeUnits(CU_SOL_TRANSFER, 'Facture 42');
    expect(cu).toBeGreaterThanOrEqual(CU_SOL_TRANSFER + 15_000);
  });

  it('grandit avec la taille du mémo (octets UTF-8, pas caractères)', () => {
    expect(sendComputeUnits(CU_SOL_TRANSFER, 'é'.repeat(10))).toBeGreaterThan(sendComputeUnits(CU_SOL_TRANSFER, 'e'.repeat(10)));
    // 120 caractères, la limite du champ : reste sous le maximum d'une transaction (1,4 M).
    expect(sendComputeUnits(CU_SPL_TRANSFER, '漢'.repeat(120))).toBeLessThan(1_400_000);
  });

  it('le message de transfert porte bien le mémo en UTF-8', () => {
    const key = '11111111111111111111111111111112';
    const msg = buildTransferMessage({ from: key, to: key, lamports: 1n, recentBlockhash: key, memo: 'Merci ✓' });
    expect(Buffer.from(msg).includes(Buffer.from('Merci ✓', 'utf8'))).toBe(true);
  });
});
