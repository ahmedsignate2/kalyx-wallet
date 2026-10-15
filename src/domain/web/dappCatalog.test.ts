import { DAPP_CATALOG, DAPP_CATEGORIES, dappCompat, connectsDirectly, catalogEntry, VERIFIED_HOSTS, isLookalike, lookalikeOf, siteShield } from './dappCatalog';
import { dappHost } from './dappHost';

describe('Catalogue des dApps', () => {
  it('hôte = hôte réel de l’url (la coche « vérifié » compare l’origine de la page)', () => {
    for (const d of DAPP_CATALOG) {
      expect(d.url.startsWith('https://')).toBe(true);
      expect(dappHost(d.url)).toBe(d.host);
      expect(d.families.length).toBeGreaterThan(0);
      expect(d.icon.monogram.length).toBeGreaterThan(0);
      expect(d.icon.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(new Set(DAPP_CATALOG.map((d) => d.host)).size).toBe(DAPP_CATALOG.length);
    expect(DAPP_CATEGORIES).toEqual(['Swap', 'Lending', 'Staking', 'NFT', 'Bridges']);
  });
  it('Solana seul : via WalletConnect, jamais de connexion directe promise', () => {
    for (const name of ['Jupiter', 'Jito', 'Marinade']) {
      const d = DAPP_CATALOG.find((x) => x.name === name)!;
      expect(dappCompat(d)).toEqual(['walletconnect']);
      expect(connectsDirectly(d)).toBe(false);
    }
  });
  it('EVM et TON : connexion directe (fournisseurs injectés)', () => {
    expect(dappCompat(catalogEntry('app.uniswap.org')!)).toEqual(['evm']);
    expect(dappCompat(catalogEntry('app.ston.fi')!)).toEqual(['ton']);
    expect(dappCompat(catalogEntry('app.tonstakers.com')!)).toEqual(['ton']);
    // Multi-chaînes : la partie EVM se connecte, la partie Solana non.
    expect(dappCompat(catalogEntry('magiceden.io')!)).toEqual(['evm']);
  });
  it('aucune icône distante (pas de requête tierce)', () => {
    expect(JSON.stringify(DAPP_CATALOG)).not.toMatch(/google|favicon|s2\//i);
  });
  it('vérifié = hôte exact du catalogue, rien d’autre', () => {
    expect(VERIFIED_HOSTS.has('app.uniswap.org')).toBe(true);
    expect(catalogEntry('evil.app.uniswap.org')).toBeUndefined();
    expect(catalogEntry('uniswap.org')).toBeUndefined();
  });
  it('sosies', () => {
    expect(isLookalike('app.uniswapp.org')).toBe(true);
    expect(lookalikeOf('uniswa.org')).toBe('uniswap');
    expect(isLookalike('app.uniswap.org')).toBe(false);
    expect(isLookalike('example.com')).toBe(false);
  });
  it('bouclier : signalé prioritaire, non analysé jamais « vérifié » hors catalogue', () => {
    expect(siteShield('app.uniswap.org', 'safe')).toBe('verified');
    expect(siteShield('app.uniswap.org', 'phishing')).toBe('flagged');
    expect(siteShield('app.uniswapp.org', 'safe')).toBe('flagged');
    expect(siteShield('example.com', 'safe')).toBe('unknown');
    expect(siteShield('example.com', 'unknown')).toBe('unscanned');
    expect(siteShield('example.com', undefined)).toBe('unscanned');
    expect(siteShield('example.com', 'safe', false)).toBe('unscanned');
  });
});
