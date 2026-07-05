import { erc20TransferData } from './transfer';

describe('erc20TransferData', () => {
  const TO = '0x1111111111111111111111111111111111111111';
  it('encode transfer(address,uint256) (sélecteur 0xa9059cbb)', () => {
    const data = erc20TransferData(TO, 1000000n);
    expect(data.startsWith('0xa9059cbb')).toBe(true);
    // dernier mot = montant (1000000 = 0xf4240)
    expect(BigInt('0x' + data.slice(-64))).toBe(1000000n);
    // adresse encodée dans le 1er argument
    expect(data.toLowerCase()).toContain(TO.slice(2).toLowerCase());
  });
  it('rejette une adresse invalide', () => {
    expect(() => erc20TransferData('pas-une-adresse', 1n)).toThrow();
  });
});
