import { parseAlchemyHistory } from './alchemy';

const OWNER = '0x84e90b03e29c28b22c645ad6c0badc9574995eb3';
const transfer = (o: Record<string, unknown>) => ({ result: { transfers: [{ hash: '0xaa', from: OWNER, to: '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be', category: 'external', blockNum: '0x5a98840', rawContract: { value: '0x0' }, ...o }] } });

describe('Alchemy : transaction sans horodatage (Avalanche)', () => {
  it('garde le numéro de bloc pour retrouver la date, au lieu de laisser 1970', () => {
    const [tx] = parseAlchemyHistory([transfer({ metadata: {} })], OWNER);
    expect(tx.timestamp).toBe(0);
    expect(tx.block).toBe(0x5a98840);
  });
  it('avec horodatage : aucun numéro de bloc ajouté', () => {
    const [tx] = parseAlchemyHistory([transfer({ metadata: { blockTimestamp: '2026-09-27T21:41:19.000Z' } })], OWNER);
    expect(tx.timestamp).toBe(Math.floor(Date.parse('2026-09-27T21:41:19Z') / 1000));
    expect(tx.block).toBeUndefined();
  });
});
