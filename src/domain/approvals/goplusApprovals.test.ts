import LIVE from '../security/goplus-approvals-live.json';
import { parseGoPlusApprovals } from './approvals';

describe('GoPlus : autorisations d’un vrai compte (Base)', () => {
  const c = parseGoPlusApprovals(LIVE);
  it('trouve les paires (token, contrat autorisé) avec le nom du contrat', () => {
    expect(c.map((x) => x.symbol)).toEqual(expect.arrayContaining(['WETH', 'USDC', 'TRUMP']));
    const usdc = c.find((x) => x.symbol === 'USDC')!;
    expect(usdc).toMatchObject({ decimals: 6, spenderName: 'LiFiDiamond', risky: false, spender: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' });
  });
  it('réponse absurde : liste vide, jamais d’exception', () => {
    expect(parseGoPlusApprovals(null)).toEqual([]);
    expect(parseGoPlusApprovals({ result: [{ token_address: 'x', approved_list: [{ approved_contract: 'y' }] }] })).toEqual([]);
  });
  it('contrat signalé : marqué risqué', () => {
    const bad = parseGoPlusApprovals({ result: [{ token_address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', token_symbol: 'USDC', decimals: 6, approved_list: [{ approved_contract: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', address_info: { malicious_behavior: ['phishing_activities'] } }] }] });
    expect(bad[0].risky).toBe(true);
  });
});
