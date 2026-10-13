import { CARD_ISSUERS, cardIssuer } from './cardIssuers';
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
});
