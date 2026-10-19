import { beforeEach, describe, expect, test } from 'vitest';
import { makeDapp } from './dapp';
import { makeApprovals, type Decision } from './approvals';
import { makeSites, webOrigin } from './sites';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';
import { RpcError } from './rpcError';

const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EVM0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL0 = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const A = 'https://app.uniswap.org';
const B = 'https://jup.ag';

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

let session: ReturnType<typeof makeSession>;
let wallets: ReturnType<typeof makeWallets>;
let dapp: ReturnType<typeof makeDapp>;
let approvals: ReturnType<typeof makeApprovals>;
let events: [string, string, unknown][];
let opened: string[];
let decide: (id: string) => Decision;
let rpcCalls: [string[], string][];
let lastError: { code: number; message: string } | null;
let walletId: string;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as RpcError).code;
  }
};

beforeEach(async () => {
  const disk = makeStore(area());
  session = makeSession({ disk, session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
  wallets = makeWallets(disk, session);
  events = [];
  opened = [];
  rpcCalls = [];
  decide = () => ({ approve: true, walletId, index: 0 });
  lastError = null;
  // La « fenêtre » répond tout de suite, avec la décision du test.
  approvals = makeApprovals({
    open: async (id) => {
      opened.push(id);
      // Une action qui échoue laisse la fenêtre ouverte : le test la referme (refus).
      queueMicrotask(async () => {
        const r = await approvals.respond(id, decide(id));
        if (!r.ok) {
          lastError = r.error;
          await approvals.respond(id, { approve: false });
        }
      });
      return opened.length;
    },
    close: async () => {},
  });
  dapp = makeDapp({ session, wallets, sites: makeSites(disk), approvals, t: (k) => k, dappAllowed: async () => true, emit: (o, e, d) => events.push([o, e, d]), rpc: async (urls, method) => (rpcCalls.push([urls, method]), '0x10') });
  await session.create('Plage-Orange-47!');
  walletId = (await wallets.importPhrase(ABOUT)).id;
});

describe('EVM (EIP-1193)', () => {
  test('sans connexion : réseau oui, adresse non', async () => {
    expect(await dapp.handle(A, 'evm', 'eth_chainId', [])).toBe('0x1');
    expect(await dapp.handle(A, 'evm', 'net_version', [])).toBe('1');
    expect(await dapp.handle(A, 'evm', 'eth_accounts', [])).toEqual([]);
    expect(opened).toHaveLength(0);
  });

  test('connexion : accord dans la fenêtre → adresse du compte choisi, à CE site seulement', async () => {
    expect(await dapp.handle(A, 'evm', 'eth_requestAccounts', [])).toEqual([EVM0]);
    expect(opened).toHaveLength(1);
    expect(events).toContainEqual([A, 'accountsChanged', [EVM0]]);
    expect(await dapp.handle(A, 'evm', 'eth_accounts', [])).toEqual([EVM0]);
    expect(await dapp.handle(B, 'evm', 'eth_accounts', [])).toEqual([]);
    // Déjà connecté : pas de nouvelle fenêtre.
    await dapp.handle(A, 'evm', 'eth_requestAccounts', []);
    expect(opened).toHaveLength(1);
  });

  test('refus : 4001, rien d’accordé', async () => {
    decide = () => ({ approve: false });
    expect(await code(dapp.handle(A, 'evm', 'eth_requestAccounts', []))).toBe(4001);
    expect(await dapp.handle(A, 'evm', 'eth_accounts', [])).toEqual([]);
  });

  test('verrouillé : plus aucune adresse visible ; le verrouillage est annoncé aux sites', async () => {
    await dapp.handle(A, 'evm', 'eth_requestAccounts', []);
    await session.lock();
    expect(await dapp.handle(A, 'evm', 'eth_accounts', [])).toEqual([]);
    await dapp.lockChanged([A]);
    expect(events.at(-1)).toEqual([A, 'accountsChanged', []]);
  });

  test('réseau retenu PAR SITE ; réseau inconnu refusé (4902), jamais ajouté depuis une page', async () => {
    expect(await dapp.handle(A, 'evm', 'wallet_switchEthereumChain', [{ chainId: '0x2105' }])).toBeNull();
    expect(events).toContainEqual([A, 'chainChanged', '0x2105']);
    expect(await dapp.handle(A, 'evm', 'eth_chainId', [])).toBe('0x2105');
    expect(await dapp.handle(B, 'evm', 'eth_chainId', [])).toBe('0x1');
    expect(await code(dapp.handle(A, 'evm', 'wallet_switchEthereumChain', [{ chainId: '0xdeadbeef' }]))).toBe(4902);
    expect(await code(dapp.handle(A, 'evm', 'wallet_addEthereumChain', [{ chainId: '0x999999', rpcUrls: ['https://rpc.pirate.example'] }]))).toBe(4902);
    expect(await code(dapp.handle(A, 'evm', 'wallet_switchEthereumChain', [{ chainId: 'base' }]))).toBe(4902);
  });

  test('lectures publiques relayées au RPC DU RÉSEAU DU SITE ; le reste refusé', async () => {
    await dapp.handle(A, 'evm', 'wallet_switchEthereumChain', [{ chainId: '0x2105' }]);
    expect(await dapp.handle(A, 'evm', 'eth_blockNumber', [])).toBe('0x10');
    expect(rpcCalls[0][0].some((u) => u.includes('base'))).toBe(true);
    expect(await code(dapp.handle(A, 'evm', 'eth_sendRawTransaction', ['0x00']))).toBe(4200);
    expect(await code(dapp.handle(A, 'evm', 'debug_traceTransaction', []))).toBe(4200);
  });

  test('permissions EIP-2255 ; déconnexion depuis Kalyx', async () => {
    expect(await dapp.handle(A, 'evm', 'wallet_getPermissions', [])).toEqual([]);
    expect(await code(dapp.handle(A, 'evm', 'wallet_requestPermissions', [{ eth_sign: {} }]))).toBe(-32602);
    await dapp.handle(A, 'evm', 'wallet_requestPermissions', [{ eth_accounts: {} }]);
    expect(await dapp.handle(A, 'evm', 'wallet_getPermissions', [])).toHaveLength(1);
    await dapp.disconnect(A);
    expect(await dapp.handle(A, 'evm', 'eth_accounts', [])).toEqual([]);
    expect(events).toContainEqual([A, 'accountsChanged', []]);
  });
});

describe('Solana (Wallet Standard)', () => {
  test('reconnexion silencieuse : jamais de fenêtre ; connexion : adresse Solana seulement', async () => {
    expect(await dapp.handle(B, 'solana', 'sol_connect', [{ silent: true }])).toEqual({ address: null });
    expect(opened).toHaveLength(0);
    expect(await dapp.handle(B, 'solana', 'sol_connect', [{}])).toEqual({ address: SOL0 });
    expect(await dapp.handle(B, 'solana', 'sol_connect', [{ silent: true }])).toEqual({ address: SOL0 });
    // Solana accordé ≠ EVM accordé.
    expect(await dapp.handle(B, 'evm', 'eth_accounts', [])).toEqual([]);
    await dapp.handle(B, 'solana', 'sol_disconnect', []);
    expect(await dapp.handle(B, 'solana', 'sol_connect', [{ silent: true }])).toEqual({ address: null });
  });

  test('compte sans adresse Solana (clé EVM importée) : refusé', async () => {
    const k = await wallets.importKey('0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318', 'evm');
    decide = () => ({ approve: true, walletId: k.id, index: 0 });
    expect(await code(dapp.handle(B, 'solana', 'sol_connect', [{}]))).toBe(4001);
    expect(lastError?.code).toBe(4100);
  });
});

describe('fenêtres et inondation', () => {
  test('même demande en double : UNE fenêtre ; au-delà de 3 demandes d’un site : -32002', async () => {
    decide = () => ({ approve: false });
    let pendingIds: string[] = [];
    const slow = makeApprovals({ open: async (id) => (pendingIds.push(id), 1), close: async () => {} });
    const p1 = slow.request(A, 'connect', 'evm', async () => 'ok');
    const p2 = slow.request(A, 'connect', 'evm', async () => 'ok');
    await Promise.resolve();
    expect(pendingIds).toHaveLength(1);
    void slow.request(A, 'connect', 'solana', async () => 'ok').catch(() => {});
    expect(slow.size()).toBe(2);
    // Fenêtre fermée par l'utilisateur : refus pour tous ceux qui attendaient.
    slow.windowClosed(1);
    expect(await code(p1)).toBe(4001);
    expect(await code(p2)).toBe(4001);
    pendingIds = [];
    const many = makeApprovals({ open: async () => 7, close: async () => {} });
    for (const f of ['evm', 'solana'] as const) void many.request(A, 'connect', f, async () => 'ok').catch(() => {});
    void many.request(`${A}:8443`, 'connect', 'evm', async () => 'ok').catch(() => {});
    await Promise.resolve();
    expect(many.size()).toBe(3);
  });

  test('onglet fermé : sa demande en attente est refusée', async () => {
    const slow = makeApprovals({ open: async () => 1, close: async () => {} });
    const p = slow.request(A, 'connect', 'evm', async () => 'ok');
    await Promise.resolve();
    slow.originGone(A);
    expect(await code(p)).toBe(4001);
  });
});

describe('après un refus', () => {
  test('le même site ne rouvre pas de fenêtre tout de suite : 10 s, puis le double', async () => {
    let t = 0;
    const ap = makeApprovals({ open: async (id) => (queueMicrotask(() => void ap.respond(id, { approve: false })), 1), close: async () => {}, now: () => t });
    expect(await code(ap.request(A, 'connect', 'evm', async () => 'x'))).toBe(4001);
    // Pendant le délai : refus immédiat, sans fenêtre.
    t = 5_000;
    expect(await code(ap.request(A, 'connect', 'evm', async () => 'x'))).toBe(4001);
    expect(ap.size()).toBe(0);
    // Un autre site n'est pas concerné.
    t = 5_000;
    const other = ap.request(B, 'connect', 'evm', async () => 'x');
    expect(await code(other)).toBe(4001);
    // Après 10 s : nouvelle fenêtre (refusée) → délai de 20 s.
    t = 10_001;
    expect(await code(ap.request(A, 'connect', 'evm', async () => 'x'))).toBe(4001);
    t = 25_000;
    let opened2 = false;
    const p = ap.request(A, 'connect', 'evm', async () => ((opened2 = true), 'x'));
    expect(await code(p)).toBe(4001);
    expect(opened2).toBe(false);
  });
});

describe('origine', () => {
  test('https, ou http en local seulement ; jamais une page d’extension ou un fichier', () => {
    expect(webOrigin('https://app.uniswap.org/#/swap')).toBe('https://app.uniswap.org');
    expect(webOrigin('http://localhost:5173/x')).toBe('http://localhost:5173');
    expect(webOrigin('http://evil.example')).toBeNull();
    expect(webOrigin('chrome-extension://abc/popup.html')).toBeNull();
    expect(webOrigin('file:///etc/passwd')).toBeNull();
    expect(webOrigin('javascript:alert(1)')).toBeNull();
    expect(webOrigin(undefined)).toBeNull();
  });
});
