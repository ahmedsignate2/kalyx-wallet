import {
  serializeNetworks,
  parseNetworksBackup,
  NETWORKS_BACKUP_VERSION,
  customChainId,
  DEFAULT_DECIMALS,
  CUSTOM_FAMILIES,
} from './customNetworks';
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

describe('customChainId', () => {
  it('EVM : identité par chainId, forme préservée pour les anciennes sauvegardes', () => {
    expect(customChainId('evm', 99999, 'MaChain')).toBe('custom-99999');
  });
  it('hors EVM : identité par nom, puisqu\'il n\'y a pas de chainId', () => {
    expect(customChainId('solana', undefined, 'Solana (mon RPC)')).toBe('custom-solana-solana-mon-rpc');
    expect(customChainId('bitcoin', undefined, 'Bitcoin — Umbrel')).toBe('custom-bitcoin-bitcoin-umbrel');
  });
  it('un nom accentué ou exotique donne quand même un id sûr', () => {
    expect(customChainId('solana', undefined, 'Réseau Privé ✨')).toBe('custom-solana-reseau-prive');
    expect(customChainId('solana', undefined, '!!!')).toBe('custom-solana-reseau');
  });
});

describe('réseaux personnalisés NON EVM', () => {
  it('accepte un réseau Solana avec RPC perso, sans exiger de chainId', () => {
    /*
     * Le cœur de la limite levée : `family` valait `'evm'` en dur, donc ajouter
     * son propre endpoint Solana était impossible — alors que c'est le cas
     * d'usage principal, l'endpoint public étant le goulot de cette chaîne.
     */
    const { chains, error } = parseNetworksBackup(
      JSON.stringify([
        {
          name: 'Solana (Helius)',
          family: 'solana',
          nativeSymbol: 'sol',
          nativeDecimals: 9,
          rpcUrls: ['https://mainnet.helius-rpc.com/?api-key=x'],
        },
      ]),
    );
    expect(error).toBeUndefined();
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({
      id: 'custom-solana-solana-helius',
      family: 'solana',
      nativeSymbol: 'SOL',
      nativeDecimals: 9,
    });
    // Pas de chainId inventé pour une chaîne qui n'en a pas.
    expect(chains[0].evmChainId).toBeUndefined();
  });

  it('accepte un réseau Bitcoin avec API perso', () => {
    const { chains } = parseNetworksBackup(
      JSON.stringify([
        { name: 'Bitcoin (Umbrel)', family: 'bitcoin', nativeSymbol: 'BTC', rpcUrls: ['https://umbrel.local/api'] },
      ]),
    );
    expect(chains[0]).toMatchObject({ family: 'bitcoin', nativeDecimals: DEFAULT_DECIMALS.bitcoin });
  });

  it('une famille inconnue retombe sur EVM, et exige donc un chainId', () => {
    const { chains } = parseNetworksBackup(
      JSON.stringify([
        { name: 'X', family: 'cosmos', nativeSymbol: 'ATOM', rpcUrls: ['https://rpc.x'] },
        { name: 'Y', family: 'cosmos', evmChainId: 7, nativeSymbol: 'Y', rpcUrls: ['https://rpc.y'] },
      ]),
    );
    // La première n'a pas de chainId → rejetée ; la seconde devient EVM.
    expect(chains).toHaveLength(1);
    expect(chains[0]).toMatchObject({ id: 'custom-7', family: 'evm' });
  });
});

describe('décimales natives', () => {
  it('conservées quand elles sont fournies — plus figées à 18', () => {
    // 18 en dur faisait afficher ET envoyer des montants faux d'un facteur 10^12
    // sur une pièce native à 6 décimales.
    const { chains } = parseNetworksBackup(
      JSON.stringify([
        { name: 'Six', family: 'evm', evmChainId: 4242, nativeSymbol: 'SIX', nativeDecimals: 6, rpcUrls: ['https://rpc.six'] },
      ]),
    );
    expect(chains[0].nativeDecimals).toBe(6);
  });

  it('une valeur aberrante retombe sur le défaut de la famille', () => {
    const cases = [-1, 99, 1.5, 'douze', null];
    for (const nativeDecimals of cases) {
      const { chains } = parseNetworksBackup(
        JSON.stringify([
          { name: 'N', family: 'evm', evmChainId: 5151, nativeSymbol: 'N', nativeDecimals, rpcUrls: ['https://rpc.n'] },
        ]),
      );
      expect(chains[0].nativeDecimals).toBe(DEFAULT_DECIMALS.evm);
    }
  });

  it('zéro décimale est une valeur légitime, pas une absence', () => {
    const { chains } = parseNetworksBackup(
      JSON.stringify([
        { name: 'Z', family: 'evm', evmChainId: 6161, nativeSymbol: 'Z', nativeDecimals: 0, rpcUrls: ['https://rpc.z'] },
      ]),
    );
    expect(chains[0].nativeDecimals).toBe(0);
  });
});

describe('drapeau testnet', () => {
  it('conservé à l\'aller-retour', () => {
    // Il était perdu : un réseau marqué « test » ressortait parmi les réseaux
    // principaux, mélangé aux vrais, avec de vrais fonds à côté.
    const { chains } = parseNetworksBackup(
      JSON.stringify([
        { name: 'T', family: 'evm', evmChainId: 7171, nativeSymbol: 'T', rpcUrls: ['https://rpc.t'], testnet: true },
      ]),
    );
    expect(chains[0].testnet).toBe(true);
  });

  it('absent = réseau principal', () => {
    const { chains } = parseNetworksBackup(
      JSON.stringify([{ name: 'M', family: 'evm', evmChainId: 8181, nativeSymbol: 'M', rpcUrls: ['https://rpc.m'] }]),
    );
    expect(chains[0].testnet).toBe(false);
  });
});

describe('RPC en clair', () => {
  it('http refusé : un RPC non chiffré expose adresses et soldes en chemin', () => {
    const { chains, error } = parseNetworksBackup(
      JSON.stringify([
        { name: 'Clair', family: 'solana', nativeSymbol: 'SOL', rpcUrls: ['http://rpc.clair'] },
      ]),
    );
    expect(chains).toHaveLength(0);
    expect(error).toBeTruthy();
  });
});

describe('familles proposées vs familles lisibles', () => {
  it('Bitcoin n\'est PAS proposé : ce serait une impasse', () => {
    /*
     * `checkBtcAddress` refuse les adresses testnet — délibérément, pour qu'on
     * ne puisse pas envoyer des fonds réels vers une adresse de test. Un réseau
     * Bitcoin personnalisé serait donc créable et sélectionnable, mais
     * n'accepterait aucune adresse.
     */
    expect(CUSTOM_FAMILIES).toEqual(['evm', 'solana']);
  });

  it('mais un réseau Bitcoin DÉJÀ enregistré se recharge encore', () => {
    // Le supprimer en silence ferait disparaître une entrée créée par
    // l'utilisateur, sans explication.
    const { chains } = parseNetworksBackup(
      JSON.stringify([
        { name: 'Bitcoin (mon nœud)', family: 'bitcoin', nativeSymbol: 'BTC', rpcUrls: ['https://noeud.local/api'] },
      ]),
    );
    expect(chains).toHaveLength(1);
    expect(chains[0].family).toBe('bitcoin');
  });
});
