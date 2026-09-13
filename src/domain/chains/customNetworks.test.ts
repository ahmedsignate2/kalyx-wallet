import { serializeNetworks, parseNetworksBackup, NETWORKS_BACKUP_VERSION } from './customNetworks';
import type { ChainConfig } from './types';

const MACHAIN: ChainConfig = {
  id: 'custom-99999',
  name: 'MaChain',
  family: 'evm',
  evmChainId: 99999,
  nativeSymbol: 'MAC',
  nativeDecimals: 18,
  rpcUrls: ['https://rpc.machain.xyz'],
  explorerUrl: 'https://scan.machain.xyz',
};

describe('serializeNetworks', () => {
  it('produit une enveloppe versionnée nova/networks', () => {
    const json = JSON.parse(serializeNetworks([MACHAIN]));
    expect(json.v).toBe(NETWORKS_BACKUP_VERSION);
    expect(json.app).toBe('kalyx');
    expect(json.kind).toBe('networks');
    expect(json.chains[0].evmChainId).toBe(99999);
  });
});

describe('parseNetworksBackup — aller-retour', () => {
  it('réimporte ce qui a été exporté', () => {
    const { chains, error } = parseNetworksBackup(serializeNetworks([MACHAIN]));
    expect(error).toBeUndefined();
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ id: 'custom-99999', name: 'MaChain', nativeSymbol: 'MAC' });
  });

  it('accepte aussi un simple tableau de réseaux', () => {
    const { chains } = parseNetworksBackup(JSON.stringify([MACHAIN]));
    expect(chains).toHaveLength(1);
  });
});

describe('parseNetworksBackup — validation', () => {
  it('rejette un JSON illisible', () => {
    expect(parseNetworksBackup('{pas du json').error).toMatch(/illisible/i);
  });
  it('rejette une forme non reconnue', () => {
    expect(parseNetworksBackup('42').error).toMatch(/non reconnue/i);
  });
  it('ignore les entrées mal formées (chainId ≤ 0, RPC non https, champs manquants)', () => {
    const { chains, error } = parseNetworksBackup(
      JSON.stringify([
        { name: 'Bad', evmChainId: -1, nativeSymbol: 'X', rpcUrls: ['https://x'] }, // chainId invalide
        { name: 'Http', evmChainId: 5, nativeSymbol: 'H', rpcUrls: ['http://insecure'] }, // pas https
        { name: '', evmChainId: 7, nativeSymbol: 'E', rpcUrls: ['https://ok'] }, // nom vide
        MACHAIN, // seul valide
      ]),
    );
    expect(error).toBeUndefined();
    expect(chains).toHaveLength(1);
    expect(chains[0].evmChainId).toBe(99999);
  });
  it('déduplique par chainId', () => {
    const { chains } = parseNetworksBackup(JSON.stringify([MACHAIN, { ...MACHAIN, name: 'Doublon' }]));
    expect(chains).toHaveLength(1);
  });
  it('normalise le symbole en majuscules et reconstruit un id sûr', () => {
    const { chains } = parseNetworksBackup(
      JSON.stringify([{ name: 'x', evmChainId: 123, nativeSymbol: 'abc', rpcUrls: ['https://r'], id: 'PWNED' }]),
    );
    expect(chains[0].nativeSymbol).toBe('ABC');
    expect(chains[0].id).toBe('custom-123'); // id recalculé, la valeur fournie est ignorée
  });
  it('erreur si aucun réseau valide', () => {
    expect(parseNetworksBackup(JSON.stringify([{ name: 'x' }])).error).toMatch(/aucun réseau valide/i);
  });
});
