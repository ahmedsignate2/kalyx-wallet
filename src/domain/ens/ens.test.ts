import {
  looksLikeEnsName,
  resolveEnsName,
  lookupEnsName,
  resolveEnsAvatar,
  _clearEnsCache,
  type EnsProvider,
} from './ens';

const VITALIK = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

function mockProvider(over: Partial<EnsProvider> = {}): EnsProvider {
  return {
    resolveName: jest.fn(async () => VITALIK),
    lookupAddress: jest.fn(async () => 'vitalik.eth'),
    getAvatar: jest.fn(async () => 'https://euc.li/vitalik.eth'),
    ...over,
  };
}

beforeEach(() => _clearEnsCache());

describe('looksLikeEnsName', () => {
  it('accepte les noms .eth et sous-domaines', () => {
    expect(looksLikeEnsName('vitalik.eth')).toBe(true);
    expect(looksLikeEnsName('VITALIK.ETH')).toBe(true); // casse ignorée
    expect(looksLikeEnsName('pay.vitalik.eth')).toBe(true);
    expect(looksLikeEnsName('  nick.eth  ')).toBe(true); // trim
  });
  it('rejette adresses hex, chaînes vides, autres TLD, espaces internes', () => {
    expect(looksLikeEnsName(VITALIK)).toBe(false);
    expect(looksLikeEnsName('')).toBe(false);
    expect(looksLikeEnsName('vitalik')).toBe(false);
    expect(looksLikeEnsName('vitalik.box')).toBe(false);
    expect(looksLikeEnsName('a b.eth')).toBe(false);
    expect(looksLikeEnsName('.eth')).toBe(false);
    expect(looksLikeEnsName('-bad.eth')).toBe(false);
  });
});

describe('resolveEnsName (forward)', () => {
  it('résout un nom valide en adresse', async () => {
    expect(await resolveEnsName('vitalik.eth', mockProvider())).toBe(VITALIK);
  });
  it('renvoie null sans appel réseau pour une saisie non-ENS', async () => {
    const p = mockProvider();
    expect(await resolveEnsName('pas-un-nom', p)).toBeNull();
    expect(p.resolveName).not.toHaveBeenCalled();
  });
  it('met en cache (deuxième appel = zéro réseau)', async () => {
    const p = mockProvider();
    await resolveEnsName('vitalik.eth', p);
    await resolveEnsName('vitalik.eth', p);
    expect(p.resolveName).toHaveBeenCalledTimes(1);
  });
  it('renvoie null si le provider lève (dégradation gracieuse)', async () => {
    const p = mockProvider({ resolveName: jest.fn(async () => { throw new Error('rpc down'); }) });
    expect(await resolveEnsName('vitalik.eth', p)).toBeNull();
  });
});

describe('lookupEnsName (reverse)', () => {
  it('résout une adresse en nom primaire', async () => {
    expect(await lookupEnsName(VITALIK, mockProvider())).toBe('vitalik.eth');
  });
  it('renvoie null pour une non-adresse, sans réseau', async () => {
    const p = mockProvider();
    expect(await lookupEnsName('coucou', p)).toBeNull();
    expect(p.lookupAddress).not.toHaveBeenCalled();
  });
  it('met en cache', async () => {
    const p = mockProvider();
    await lookupEnsName(VITALIK, p);
    await lookupEnsName(VITALIK, p);
    expect(p.lookupAddress).toHaveBeenCalledTimes(1);
  });
});

describe('resolveEnsAvatar', () => {
  it('renvoie l’URL de l’avatar', async () => {
    expect(await resolveEnsAvatar('vitalik.eth', mockProvider())).toBe('https://euc.li/vitalik.eth');
  });
  it('renvoie null si pas d’avatar', async () => {
    const p = mockProvider({ getAvatar: jest.fn(async () => null) });
    expect(await resolveEnsAvatar('vitalik.eth', p)).toBeNull();
  });
});
