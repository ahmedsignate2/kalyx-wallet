import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Wallet, hexlify, toUtf8Bytes } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';
import { checkPersonal, checkSolMessage, checkSolSigned, checkTxHash, checkTyped, evmChainFor, evmTxParam, proposal, sessionAccounts, SOLANA_CAIP, unsignedSolanaTx } from './companionCore';
import { checkSolSignedTx, executeOnPhone, splitSolanaTx } from './companionSign';
import { makeCompanion, type WcClient } from './companion';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets, type WalletMeta } from './wallets';

const PHONE = new Wallet(`0x${'11'.repeat(32)}`);
const OTHER = new Wallet(`0x${'22'.repeat(32)}`);
const SOL_SK = new Uint8Array(32).fill(7);
const SOL_PK = base58.encode(ed25519.getPublicKey(SOL_SK));
const OTHER_SK = new Uint8Array(32).fill(9);

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

const ns = (evm: string[], sol: string[] = []) => ({
  eip155: { accounts: evm },
  solana: { accounts: sol },
});

describe('mode compagnon : partie pure', () => {
  test('proposition : réseaux EVM dédoublonnés, valeurs invalides écartées, Solana en plus, tout optionnel', () => {
    const p = proposal([1, 8453, 1, 0, -2, 1.5]);
    expect(p.optionalNamespaces.eip155.chains).toEqual(['eip155:1', 'eip155:8453']);
    expect(p.optionalNamespaces.solana.chains).toEqual([SOLANA_CAIP]);
    expect(p).not.toHaveProperty('requiredNamespaces');
  });

  test('comptes de la session : une adresse par famille, réseaux partagés, Solana d’un autre réseau ignoré', () => {
    const a = sessionAccounts(ns([`eip155:1:${PHONE.address}`, `eip155:8453:${PHONE.address.toLowerCase()}`], [`${SOLANA_CAIP}:${SOL_PK}`, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:${base58.encode(ed25519.getPublicKey(OTHER_SK))}`]));
    expect(a).toEqual({ evm: PHONE.address, solana: SOL_PK, evmChains: [1, 8453] });
    expect(sessionAccounts(ns(['eip155:1:pas-une-adresse']))).toEqual({ evm: undefined, solana: undefined, evmChains: [] });
  });

  test('deux adresses EVM dans la session : refusée (on ne devine pas pour qui signer)', () => {
    expect(() => sessionAccounts(ns([`eip155:1:${PHONE.address}`, `eip155:1:${OTHER.address}`]))).toThrow('COMPANION_AMBIGUOUS');
  });

  test('réseau d’une demande : celui du site s’il est partagé, sinon refus ; Ethereum par défaut', () => {
    expect(evmChainFor([8453, 1], 8453)).toBe(8453);
    expect(evmChainFor([8453, 1])).toBe(1);
    expect(evmChainFor([8453])).toBe(8453);
    expect(() => evmChainFor([1], 137)).toThrow('COMPANION_CHAIN');
    expect(() => evmChainFor([])).toThrow('COMPANION_NO_EVM');
  });

  test('signature EVM vérifiée contre l’adresse du compte', async () => {
    const hex = hexlify(toUtf8Bytes('Connexion à app.exemple'));
    const good = await PHONE.signMessage(toUtf8Bytes('Connexion à app.exemple'));
    expect(checkPersonal(good, hex, PHONE.address)).toBe(good);
    const bad = await OTHER.signMessage(toUtf8Bytes('Connexion à app.exemple'));
    expect(() => checkPersonal(bad, hex, PHONE.address)).toThrow('COMPANION_WRONG_SIGNER');
    expect(() => checkPersonal('0x1234', hex, PHONE.address)).toThrow('COMPANION_BAD_RESULT');
    expect(() => checkPersonal({ sig: good }, hex, PHONE.address)).toThrow('COMPANION_BAD_RESULT');
  });

  test('EIP-712 vérifié (EIP712Domain retiré des types)', async () => {
    const data = {
      domain: { name: 'Exemple', version: '1', chainId: 1 },
      types: { EIP712Domain: [{ name: 'name', type: 'string' }], Mail: [{ name: 'contents', type: 'string' }] },
      message: { contents: 'bonjour' },
    };
    const sig = await PHONE.signTypedData(data.domain, { Mail: data.types.Mail }, data.message);
    expect(checkTyped(sig, data, PHONE.address)).toBe(sig);
    expect(() => checkTyped(sig, data, OTHER.address)).toThrow('COMPANION_WRONG_SIGNER');
  });

  test('hachage de transaction : 32 octets hexadécimaux seulement', () => {
    expect(checkTxHash(`0x${'ab'.repeat(32)}`)).toBe(`0x${'ab'.repeat(32)}`);
    expect(() => checkTxHash('0xabc')).toThrow('COMPANION_BAD_RESULT');
    expect(() => checkTxHash(null)).toThrow('COMPANION_BAD_RESULT');
  });

  test('message Solana : signature base58 vérifiée (ed25519) contre la clé du compte', () => {
    const msg = toUtf8Bytes('Se connecter');
    const sig = base58.encode(ed25519.sign(msg, SOL_SK));
    expect(checkSolMessage({ signature: sig }, msg, SOL_PK)).toHaveLength(64);
    expect(() => checkSolMessage({ signature: base58.encode(ed25519.sign(msg, OTHER_SK)) }, msg, SOL_PK)).toThrow('COMPANION_WRONG_SIGNER');
    expect(() => checkSolMessage({ signature: '0OIl' }, msg, SOL_PK)).toThrow('COMPANION_BAD_RESULT');
  });

  test('transaction Solana non signée : un emplacement vide puis le message, relu à l’identique', () => {
    const message = new Uint8Array([1, 0, 1, 3, 9, 9, 9]);
    const tx = unsignedSolanaTx(message);
    const { sigs, message: back } = splitSolanaTx(base64.decode(tx));
    expect(sigs).toHaveLength(1);
    expect(sigs[0].every((b) => b === 0)).toBe(true);
    expect(back).toEqual(message);
  });

  test('transaction Solana rendue : même message et signature de notre clé, sinon refusée', () => {
    const message = new Uint8Array([1, 0, 1, 3, 4, 5, 6, 7]);
    const original = unsignedSolanaTx(message);
    const signedWith = (sk: Uint8Array, msg: Uint8Array) => {
      const out = new Uint8Array(1 + 64 + msg.length);
      out[0] = 1;
      out.set(ed25519.sign(msg, sk), 1);
      out.set(msg, 65);
      return base64.encode(out);
    };
    const good = signedWith(SOL_SK, message);
    expect(checkSolSignedTx(original, good, SOL_PK)).toBe(good);
    expect(() => checkSolSignedTx(original, signedWith(OTHER_SK, message), SOL_PK)).toThrow('COMPANION_WRONG_SIGNER');
    const changed = new Uint8Array(message);
    changed[7] = 99;
    expect(() => checkSolSignedTx(original, signedWith(SOL_SK, changed), SOL_PK)).toThrow('COMPANION_TX_CHANGED');
    expect(checkSolSigned({ transaction: good }, 1)).toEqual([good]);
    expect(() => checkSolSigned({ transactions: [good] }, 2)).toThrow('COMPANION_BAD_RESULT');
  });

  test('transaction EVM au format JSON-RPC (quantités hexadécimales)', () => {
    expect(evmTxParam({ from: PHONE.address, to: OTHER.address, data: '', value: 10n ** 18n, gas: 21_000n })).toEqual({ from: PHONE.address, to: OTHER.address, data: '0x', value: '0xde0b6b3a7640000', gas: '0x5208' });
  });
});

/** Client WalletConnect simulé : le « téléphone » répond par `answer`. */
function fakeClient(answer: (method: string, params: unknown) => Promise<unknown>) {
  const handlers: Record<string, ((e: { topic: string }) => void)[]> = {};
  const sessions = new Set<string>();
  const calls: { chainId: string; method: string; params: unknown }[] = [];
  let approve: (s: { topic: string; namespaces: Record<string, { accounts?: string[] }> }) => void = () => {};
  const client: WcClient = {
    async connect() {
      return { uri: 'wc:abc@2?relay-protocol=irn&symKey=00', approval: () => new Promise((r) => (approve = r)) };
    },
    async request<T>(a: { topic: string; chainId: string; request: { method: string; params: unknown } }) {
      calls.push({ chainId: a.chainId, method: a.request.method, params: a.request.params });
      return (await answer(a.request.method, a.request.params)) as T;
    },
    async disconnect(a) {
      sessions.delete(a.topic);
    },
    on(event, fn) {
      (handlers[event] ??= []).push(fn);
    },
    session: { getAll: () => [...sessions].map((topic) => ({ topic })) },
  };
  return {
    client,
    calls,
    accept(topic: string, namespaces: Record<string, { accounts?: string[] }>) {
      sessions.add(topic);
      approve({ topic, namespaces });
    },
    drop(topic: string) {
      sessions.delete(topic);
      for (const fn of handlers.session_delete ?? []) fn({ topic });
    },
  };
}

describe('mode compagnon : lien avec le téléphone', () => {
  let session: ReturnType<typeof makeSession>;
  let wallets: ReturnType<typeof makeWallets>;

  beforeEach(async () => {
    const disk = makeStore(area());
    session = makeSession({ disk, session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
    wallets = makeWallets(disk, session);
    await session.create('Plage-Orange-47!');
  });

  const link = async (answer: (method: string, params: unknown) => Promise<unknown>) => {
    const fake = fakeClient(answer);
    const companion = makeCompanion(wallets, { client: async () => fake.client });
    const before = (await wallets.list()).length;
    const { uri } = await companion.start('Téléphone');
    expect(uri).toMatch(/^wc:/);
    const waiting = companion.wait();
    fake.accept('topic-1', ns([`eip155:1:${PHONE.address}`, `eip155:8453:${PHONE.address}`], [`${SOLANA_CAIP}:${SOL_PK}`]));
    const cand = await waiting;
    // Rien n'est enregistré avant la confirmation (appareil et adresses vus par l'utilisateur).
    expect(await wallets.list()).toHaveLength(before);
    expect(cand).toMatchObject({ topic: 'topic-1', evm: PHONE.address, solana: SOL_PK });
    const meta = (await companion.confirm('topic-1', true))!;
    return { fake, companion, meta };
  };

  test('QR scanné par un AUTRE appareil : refusé dans l’extension, liaison coupée, rien d’enregistré', async () => {
    const fake = fakeClient(async () => null);
    const companion = makeCompanion(wallets, { client: async () => fake.client });
    await companion.start('Téléphone');
    const waiting = companion.wait();
    fake.accept('intrus', ns([`eip155:1:${OTHER.address}`]));
    const cand = await waiting;
    expect(cand.evm).toBe(OTHER.address);
    expect(await companion.confirm('intrus', false)).toBeNull();
    expect(fake.client.session.getAll()).toEqual([]);
    expect(await wallets.list()).toHaveLength(0);
    // Une confirmation rejouée ne vaut plus rien.
    await expect(companion.confirm('intrus', true)).rejects.toThrow('COMPANION_PAIRING_TIMEOUT');
  });

  test('confirmation jamais donnée : liaison coupée au bout du délai', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeClient(async () => null);
      const companion = makeCompanion(wallets, { client: async () => fake.client });
      await companion.start('Téléphone');
      const waiting = companion.wait();
      fake.accept('oubli', ns([`eip155:1:${PHONE.address}`]));
      await waiting;
      await vi.advanceTimersByTimeAsync(3 * 60_000 + 1);
      expect(fake.client.session.getAll()).toEqual([]);
      await expect(companion.confirm('oubli', true)).rejects.toThrow('COMPANION_PAIRING_TIMEOUT');
    } finally {
      vi.useRealTimers();
    }
  });

  test('relier : un portefeuille « téléphone » sans aucun secret, avec les adresses partagées', async () => {
    const { meta } = await link(async () => null);
    expect(meta).toMatchObject({ kind: 'companion', topic: 'topic-1', evmChains: [1, 8453], backedUp: true });
    expect(meta.accounts).toEqual([{ index: 0, label: 'Compte 1', evm: PHONE.address, solana: SOL_PK }]);
    expect(await wallets.list()).toHaveLength(1);
  });

  test('délier : le portefeuille du téléphone disparaît (et rien d’autre)', async () => {
    const { meta } = await link(async () => null);
    await wallets.importKey(`0x${'22'.repeat(32)}`, 'evm');
    expect(await wallets.removeCompanion(meta.id)).toBe(true);
    expect((await wallets.list()).map((w: WalletMeta) => w.kind)).toEqual(['privateKey']);
    // Un portefeuille à clé locale ne se « délie » pas.
    const other = (await wallets.list())[0];
    expect(await wallets.removeCompanion(other.id)).toBe(false);
  });

  test('relier à nouveau le même compte : le portefeuille est remplacé, pas doublé', async () => {
    const first = await link(async () => null);
    const again = await link(async () => null);
    expect(again.meta.id).toBe(first.meta.id);
    expect(await wallets.list()).toHaveLength(1);
  });

  test('relais WalletConnect injoignable : erreur claire au lieu d’un QR qui ne vient jamais', async () => {
    vi.useFakeTimers();
    try {
      const companion = makeCompanion(wallets, { client: () => new Promise<WcClient>(() => {}) });
      const p = companion.start('Téléphone');
      const check = expect(p).rejects.toThrow('COMPANION_OFFLINE');
      await vi.advanceTimersByTimeAsync(20_001);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });

  test('téléphone sans aucun compte partagé : refusé, session fermée', async () => {
    const fake = fakeClient(async () => null);
    const companion = makeCompanion(wallets, { client: async () => fake.client });
    await companion.start('Téléphone');
    const waiting = companion.wait();
    fake.accept('vide', ns([]));
    await expect(waiting).rejects.toThrow('COMPANION_NO_ACCOUNT');
    expect(fake.client.session.getAll()).toEqual([]);
    expect(await wallets.list()).toHaveLength(0);
  });

  test('signature d’un site faite sur le téléphone, vérifiée avant d’être rendue', async () => {
    const { fake, companion, meta } = await link(async (method, params) => (method === 'personal_sign' ? PHONE.signMessage(toUtf8Bytes('bonjour')) : null));
    const hex = hexlify(toUtf8Bytes('bonjour'));
    const sig = await executeOnPhone({ kind: 'personal', from: PHONE.address, hex, text: 'bonjour', siwe: null }, meta, companion);
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(fake.calls[0]).toEqual({ chainId: 'eip155:1', method: 'personal_sign', params: [hex, PHONE.address] });
  });

  test('le téléphone signe avec un autre compte : rien n’est rendu au site', async () => {
    const { companion, meta } = await link(async () => OTHER.signMessage(toUtf8Bytes('bonjour')));
    await expect(executeOnPhone({ kind: 'personal', from: PHONE.address, hex: hexlify(toUtf8Bytes('bonjour')), text: 'bonjour', siwe: null }, meta, companion)).rejects.toThrow('COMPANION_WRONG_SIGNER');
  });

  test('message Solana : base58 vers le téléphone, base64 vers le site', async () => {
    const msg = toUtf8Bytes('Se connecter');
    const { fake, companion, meta } = await link(async () => ({ signature: base58.encode(ed25519.sign(msg, SOL_SK)) }));
    const out = (await executeOnPhone({ kind: 'solMessage', from: SOL_PK, message: base64.encode(msg), text: 'Se connecter' }, meta, companion)) as { signature: string }[];
    expect(fake.calls[0]).toMatchObject({ chainId: SOLANA_CAIP, method: 'solana_signMessage', params: { message: base58.encode(msg), pubkey: SOL_PK } });
    expect(base64.decode(out[0].signature)).toHaveLength(64);
  });

  test('transaction EVM d’un site : envoyée au téléphone sur le réseau du site, hachage contrôlé', async () => {
    const { fake, companion, meta } = await link(async () => `0x${'cd'.repeat(32)}`);
    const h = await executeOnPhone({ kind: 'evmTx', from: PHONE.address, chainId: '0x2105', tx: { to: OTHER.address, data: '0x', value: '0x1' } }, meta, companion);
    expect(h).toBe(`0x${'cd'.repeat(32)}`);
    expect(fake.calls[0]).toEqual({ chainId: 'eip155:8453', method: 'eth_sendTransaction', params: [{ from: PHONE.address, to: OTHER.address, data: '0x', value: '0x1' }] });
    // Réseau non partagé par le téléphone : refusé avant tout envoi.
    await expect(executeOnPhone({ kind: 'evmTx', from: PHONE.address, chainId: '0x89', tx: { to: OTHER.address, data: '0x', value: '0x1' } }, meta, companion)).rejects.toThrow('COMPANION_CHAIN');
    expect(fake.calls).toHaveLength(1);
  });

  test('refus sur le téléphone : même code qu’un refus dans l’extension (4001)', async () => {
    const { companion, meta } = await link(async () => {
      throw new Error('User rejected the request');
    });
    await expect(companion.request(meta, 'eip155:1', 'personal_sign', [])).rejects.toMatchObject({ code: 4001, message: 'COMPANION_REJECTED' });
  });

  test('lien coupé depuis le téléphone : portefeuille marqué, plus aucune demande transmise', async () => {
    const { fake, companion, meta } = await link(async () => `0x${'cd'.repeat(32)}`);
    fake.drop('topic-1');
    await new Promise((r) => setTimeout(r, 0));
    const [w] = await wallets.list();
    expect(w.lost).toBe(true);
    await expect(companion.request(w, 'eip155:1', 'eth_sendTransaction', [])).rejects.toThrow('COMPANION_LOST');
    // Même avec une copie périmée des métadonnées : la session n'existe plus.
    await expect(companion.request(meta, 'eip155:1', 'eth_sendTransaction', [])).rejects.toThrow('COMPANION_LOST');
    expect(fake.calls).toHaveLength(0);
  });

  test('un portefeuille compagnon n’a pas de clé : le signataire local refuse', async () => {
    const { meta } = await link(async () => null);
    const { signerFor } = await import('./signer');
    await expect(signerFor(session, wallets, meta.id, 0, 'evm', PHONE.address)).rejects.toThrow();
  });

  test('le compagnon ne remplace pas un portefeuille local du même compte', async () => {
    await wallets.importKey(`0x${'11'.repeat(32)}`, 'evm');
    const fake = fakeClient(async () => null);
    const companion = makeCompanion(wallets, { client: async () => fake.client });
    await companion.start('Téléphone');
    const waiting = companion.wait();
    fake.accept('t', ns([`eip155:1:${PHONE.address}`]));
    await waiting;
    await expect(companion.confirm('t', true)).rejects.toThrow();
    expect((await wallets.list()).map((w: WalletMeta) => w.kind)).toEqual(['privateKey']);
  });
});

