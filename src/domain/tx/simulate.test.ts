import { parseAlchemySimulation, staticSimulation } from './simulate';
import { ALL_CHAINS } from '../chains/configs';

const ME = '0x28C6c06298d514Db089934071355E5743bf21d60';
const eth = ALL_CHAINS.find((c) => c.id === 'ethereum')!;

describe('simulation', () => {
  it('parse Alchemy : perds / reçois du point de vue de l’utilisateur', () => {
    const json = { result: { changes: [
      { assetType: 'ERC20', changeType: 'TRANSFER', from: ME, to: '0xrouter', rawAmount: '50000000', symbol: 'USDC', decimals: 6, contractAddress: '0xa0b8' },
      { assetType: 'NATIVE', changeType: 'TRANSFER', from: '0xrouter', to: ME.toLowerCase(), rawAmount: '20000000000000000', symbol: 'ETH', decimals: 18 },
      { assetType: 'ERC20', changeType: 'APPROVE', from: ME, to: '0xrouter', rawAmount: '1' },
      { assetType: 'ERC20', changeType: 'TRANSFER', from: '0xa', to: '0xb', rawAmount: '1', symbol: 'X', decimals: 1 },
    ] } };
    const ch = parseAlchemySimulation(json, ME);
    expect(ch).toHaveLength(2);
    expect(ch[0]).toMatchObject({ direction: 'out', symbol: 'USDC', rawAmount: '50000000', decimals: 6 });
    expect(ch[1]).toMatchObject({ direction: 'in', symbol: 'ETH', rawAmount: '20000000000000000' });
  });
  it('statique : envoi natif', () => {
    const s = staticSimulation({ to: '0xabc', value: 10n ** 18n, data: '0x' }, eth);
    expect(s.changes[0]).toMatchObject({ direction: 'out', assetType: 'NATIVE', symbol: 'ETH', rawAmount: (10n ** 18n).toString() });
  });
  it('statique : approve illimité et setApprovalForAll → approvals', () => {
    const spender = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
    const approve = '0x095ea7b3' + spender.slice(2).padStart(64, '0') + 'f'.repeat(64);
    expect(staticSimulation({ to: '0xtoken', data: approve }, eth).approvals[0]).toMatchObject({ spender, unlimited: true });
    const all = '0xa22cb465' + spender.slice(2).padStart(64, '0') + '1'.padStart(64, '0');
    expect(staticSimulation({ to: '0xnft', data: all }, eth).approvals[0]).toMatchObject({ spender, all: true });
  });
});
