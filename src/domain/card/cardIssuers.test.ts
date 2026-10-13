import { CARD_ISSUERS, cardIssuer, cardChainFor, spendableOn } from './cardIssuers';
import { listChains } from '../chains/registry';
import { VERIFIED_HOSTS, isLookalike, siteShield } from '../web/dappCatalog';

describe('émetteurs de cartes', () => {
  it('chaque émetteur est une dApp vérifiée du catalogue, en https', () => {
    for (const i of CARD_ISSUERS) {
      expect(VERIFIED_HOSTS.has(i.dapp.host)).toBe(true);
      expect(i.dapp.url.startsWith(`https://${i.dapp.host}`)).toBe(true);
      expect(i.dapp.category).toBe('Cards');
      expect(siteShield(i.dapp.host, 'safe')).toBe('verified');
    }
  });

  it('les sosies des émetteurs sont signalés', () => {
    expect(isLookalike('app.gnosispays.com')).toBe(true);
    expect(isLookalike('holyhe1d.com')).toBe(true);
    expect(isLookalike('spritze.finance')).toBe(true);
    expect(isLookalike('app.holyheld.com')).toBe(false);
  });

  it('identifiant inconnu : premier émetteur', () => {
    expect(cardIssuer('x').id).toBe(CARD_ISSUERS[0].id);
    expect(cardIssuer('spritz').id).toBe('spritz');
  });

  it('réseaux : tous connus de Kalyx, choix respecté ou repli sur le défaut', () => {
    const known = new Set(listChains().map((c) => c.id));
    for (const i of CARD_ISSUERS) for (const c of i.chainIds) expect(known.has(c)).toBe(true);
    const hh = cardIssuer('holyheld');
    expect(cardChainFor(hh, 'arbitrum')).toBe('arbitrum');
    expect(cardChainFor(hh, 'gnosis')).toBe('base');
    expect(cardChainFor(cardIssuer('gnosispay'), 'base')).toBe('gnosis');
  });

  it('prêt à dépenser : stablecoins vérifiés de l’émetteur, sur le bon réseau', () => {
    const hh = cardIssuer('holyheld');
    const holdings = [
      { chainId: 'base', symbol: 'USDC', amount: 12.5, verified: true },
      { chainId: 'base', symbol: 'USDC', amount: 99, verified: false }, // faux USDC (spam)
      { chainId: 'arbitrum', symbol: 'USDC', amount: 5, verified: true },
      { chainId: 'base', symbol: 'ETH', amount: 1, verified: true },
      { chainId: 'base', symbol: 'usdt', amount: 2, verified: true },
    ];
    expect(spendableOn(holdings, hh, 'base').total).toBe(14.5);
  });
});
