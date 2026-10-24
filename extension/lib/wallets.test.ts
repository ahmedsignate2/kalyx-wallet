import { beforeEach, describe, expect, test } from 'vitest';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';
import { readSecret } from './vault';
import { accountActivity, discoverAccounts, type Rpc } from './discovery';
import { createWalletsBackup } from '../../src/domain/backup/cloudBackup';
import { deriveEvmAccount } from '../../src/crypto/hd';
import { mnemonicToSeedSync } from '../../src/crypto/mnemonic';

const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EVM0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL0 = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
/** BIP-84, vecteur officiel de la phrase « abandon … about » (même valeur que src/crypto/btc.test.ts). */
const BTC0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const PK = deriveEvmAccount(mnemonicToSeedSync(ABOUT), 0).privateKey;

function area(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

let disk: ReturnType<typeof area>;
let session: ReturnType<typeof makeSession>;
let wallets: ReturnType<typeof makeWallets>;

beforeEach(async () => {
  disk = area();
  session = makeSession({ disk: makeStore(disk), session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
  wallets = makeWallets(makeStore(disk), session);
  await session.create('Plage-Orange-47!');
});

describe('portefeuilles de l’extension', () => {
  test('créer : 12 mots, scellés dans le coffre ; métadonnées publiques seulement sur le disque', async () => {
    const { id, phrase } = await wallets.create();
    expect(phrase.split(' ')).toHaveLength(12);
    const [w] = await wallets.list();
    expect(w).toMatchObject({ id, kind: 'seed', backedUp: false });
    expect(w.accounts[0].evm).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(JSON.stringify(disk.data)).not.toContain(phrase.split(' ')[0] + ' ' + phrase.split(' ')[1]);
    await wallets.markBackedUp(id);
    expect((await wallets.list())[0].backedUp).toBe(true);
  });

  test('importer une phrase : MÊMES adresses que le mobile, phrase normalisée, doublon refusé', async () => {
    const w = await wallets.importPhrase(`  ${ABOUT.toUpperCase().replace(/ /g, '   ')}  `);
    expect(w.accounts[0]).toMatchObject({ index: 0, evm: EVM0, solana: SOL0, bitcoin: BTC0 });
    // TON : compte 1 seulement, adresse v5r1 non rebondissante, identique à l'app (lib/accountAddress).
    expect(w.accounts[0].ton).toMatch(/^UQ[A-Za-z0-9_-]{46}$/);
    // Clé de Tonkeeper pour cette phrase (src/domain/chains/ton/tonkeeper-vectors.json).
    expect(w.accounts[0].tonPub).toBe('7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf');
    expect(w.accounts[1]?.ton).toBeUndefined();
    await expect(wallets.importPhrase(ABOUT)).rejects.toThrow('DUPLICATE');
    const vault = (await session.readVault())!;
    expect(readSecret(vault, await session.vaultKey(), w.id).secret).toBe(ABOUT);
  });

  test('phrases invalides refusées', async () => {
    await expect(wallets.importPhrase('abandon abandon abandon')).rejects.toThrow('INVALID_PHRASE');
    await expect(wallets.importPhrase(ABOUT.replace('about', 'abandon'))).rejects.toThrow('INVALID_PHRASE'); // somme de contrôle
  });

  test('clé privée EVM : même adresse que le compte 1 de la phrase ; clé Solana ; mauvaise famille refusée', async () => {
    const evm = await wallets.importKey(PK, 'evm');
    expect(evm.accounts[0].evm).toBe(EVM0);
    expect(evm.kind).toBe('privateKey');
    await expect(wallets.importPhrase(ABOUT)).rejects.toThrow('DUPLICATE'); // même compte : la clé et la phrase ne coexistent pas deux fois
    const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const pub = ed25519.getPublicKey(seed);
    const sol = await wallets.importKey(base58.encode(Uint8Array.from([...seed, ...pub])), 'solana');
    expect(sol.accounts[0].solana).toBe(base58.encode(pub));
    await expect(wallets.importKey(base58.encode(Uint8Array.from([...seed, ...pub])), 'evm')).rejects.toThrow('WRONG_FAMILY');
    await expect(wallets.importKey('pas une clé', 'evm')).rejects.toThrow('INVALID_KEY');
  });

  test('sauvegarde du mobile : phrase + clé EVM reprises ; Bitcoin et doublon comptés, jamais perdus en silence', async () => {
    await wallets.importKey(PK, 'evm');
    const file = await createWalletsBackup(
      [
        { label: 'Principal', type: 'seed', secret: 'legal winner thank year wave sausage worth useful legal winner thank yellow', accounts: [{ index: 0, label: 'A' }, { index: 2, label: 'C' }] },
        { label: 'Clé EVM', type: 'privateKey', keyFamily: 'evm', secret: PK },
        { label: 'Clé BTC', type: 'privateKey', keyFamily: 'bitcoin', secret: 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ' },
      ],
      'Sauvegarde-Mobile-9',
    );
    const r = await wallets.importBackup(file, 'Sauvegarde-Mobile-9');
    expect(r.added.map((w) => w.label)).toEqual(['Principal']);
    expect(r.skipped).toEqual([{ label: 'Clé EVM', reason: 'DUPLICATE' }, { label: 'Clé BTC', reason: 'UNSUPPORTED_FAMILY' }]);
    const principal = (await wallets.list()).find((w) => w.label === 'Principal')!;
    expect(principal.accounts.map((a) => a.index)).toEqual([0, 2]); // comptes nommés de la sauvegarde
    await expect(wallets.importBackup(file, 'mauvais')).rejects.toThrow('BACKUP_WRONG_PASSWORD');
    await expect(wallets.importBackup('{"pas":"une sauvegarde"}', 'x')).rejects.toThrow('BACKUP_NOT_A_BACKUP');
  });

  test('verrouillé : aucune écriture possible', async () => {
    await session.lock();
    await expect(wallets.create()).rejects.toThrow('LOCKED');
    await expect(wallets.importPhrase(ABOUT)).rejects.toThrow('LOCKED');
  });

  test('dix ajouts simultanés : aucun portefeuille perdu', async () => {
    await Promise.all(Array.from({ length: 10 }, () => wallets.create()));
    expect(await wallets.list()).toHaveLength(10);
    const vault = (await session.readVault())!;
    expect(Object.keys(vault.wallets)).toHaveLength(10);
  });
});

describe('recherche des comptes', () => {
  const evmFor = (used: Set<string>): Rpc => async (_url, method, params) => {
    const addr = String((params as unknown[])[0]);
    if (method === 'eth_getTransactionCount') return used.has(addr) ? '0x3' : '0x0';
    if (method === 'eth_getBalance') return '0x0';
    if (method === 'getSignaturesForAddress') return [];
    if (method === 'getBalance') return { value: 0 };
    throw new Error(method);
  };

  test('comptes 1 et 3 utilisés : retrouvés ; arrêt après 3 vides', async () => {
    const w = await wallets.importPhrase(ABOUT);
    const table = await wallets.addressTable(w.id, 10);
    const used = new Set([table[0].evm!, table[2].evm!]); // comptes n° 1 et 3 (index 1 et 3)
    const r = await discoverAccounts(async (i) => table.find((a) => a.index === i) ?? {}, evmFor(used), undefined, async () => false);
    expect(r.found).toEqual([1, 3]);
    expect(r.lastChecked).toBe(6);
    const updated = await wallets.addAccounts(w.id, r.found);
    expect(updated.accounts.map((a) => a.index)).toEqual([0, 1, 3]);
  });

  test('compte utilisé seulement en Bitcoin : retrouvé', async () => {
    const w = await wallets.importPhrase(ABOUT);
    const table = await wallets.addressTable(w.id, 10);
    const btcUsed = table[1].bitcoin!; // compte n° 2
    const r = await discoverAccounts(async (i) => table.find((a) => a.index === i) ?? {}, evmFor(new Set()), undefined, async (a) => a === btcUsed);
    expect(r.found).toEqual([2]);
  });

  test('Bitcoin muet : « inconnu », jamais « vide »', async () => {
    const empty: Rpc = evmFor(new Set());
    expect(await accountActivity(empty, EVM0, SOL0, BTC0, async () => { throw new Error('offline'); })).toBe('unknown');
  });

  test('réseau muet : « inconnu », jamais « vide »', async () => {
    const down: Rpc = async () => { throw new Error('offline'); };
    expect(await accountActivity(down, EVM0, SOL0)).toBe('unknown');
  });
});

describe('Bitcoin', () => {
  test('portefeuille d’avant Bitcoin : adresse bc1 ajoutée, une fois', async () => {
    const w = await wallets.importPhrase(ABOUT);
    await wallets.addAccounts(w.id, [1]);
    // Métadonnées telles qu'écrites par une version sans Bitcoin.
    const store = makeStore(disk);
    const old = (await store.get<{ accounts: { bitcoin?: string }[] }[]>('wallets'))!;
    for (const x of old) for (const a of x.accounts) delete a.bitcoin;
    await store.set('wallets', old);
    expect(await wallets.backfillBitcoin()).toBe(true);
    const accts = (await wallets.list())[0].accounts;
    expect(accts[0].bitcoin).toBe(BTC0);
    expect(accts[1].bitcoin).toMatch(/^bc1q/);
    expect(accts[1].bitcoin).not.toBe(BTC0);
    expect(await wallets.backfillBitcoin()).toBe(false);
  });
});

describe('gérer les portefeuilles', () => {
  test('renommer : nom nettoyé (contrôles, espaces), vide refusé, 40 caractères au plus', async () => {
    const w = await wallets.importPhrase(ABOUT);
    expect((await wallets.renameWallet(w.id, '  Épargne‮   long  ')).label).toBe('Épargne long');
    await expect(wallets.renameWallet(w.id, '   ')).rejects.toThrow('BAD_LABEL');
    expect((await wallets.renameAccount(w.id, 0, 'x'.repeat(80))).accounts[0].label).toHaveLength(40);
    await expect(wallets.renameAccount(w.id, 7, 'A')).rejects.toThrow('UNKNOWN_ACCOUNT');
  });

  test('ajouter un compte : premier numéro libre, mêmes adresses que le mobile', async () => {
    const w = await wallets.importPhrase(ABOUT);
    await wallets.addAccounts(w.id, [2]);
    const r = await wallets.addNextAccount(w.id);
    expect(r.index).toBe(1);
    expect(r.wallet.accounts.map((a) => a.index)).toEqual([0, 1, 2]);
    expect(r.wallet.accounts[1].evm).toBe(deriveEvmAccount(mnemonicToSeedSync(ABOUT), 1).address);
    const k = await wallets.importKey(deriveEvmAccount(mnemonicToSeedSync(ABOUT), 9).privateKey, 'evm');
    await expect(wallets.addNextAccount(k.id)).rejects.toThrow('UNKNOWN_WALLET');
  });

  test('clé privée : EVM en 0x, Solana en base58 64 octets (graine + publique) qui redonne l’adresse', async () => {
    const w = await wallets.importPhrase(ABOUT);
    expect(await wallets.revealKey(w.id, 0, 'evm')).toBe(PK);
    const sol = base58.decode(await wallets.revealKey(w.id, 0, 'solana'));
    expect(sol).toHaveLength(64);
    expect(base58.encode(ed25519.getPublicKey(sol.slice(0, 32)))).toBe(SOL0);
    expect(base58.encode(sol.slice(32))).toBe(SOL0);
    await expect(wallets.revealKey(w.id, 3, 'evm')).rejects.toThrow('UNKNOWN_ACCOUNT');
  });

  test('clé importée Solana : réexportée au même format', async () => {
    const seed = new Uint8Array(32).fill(7);
    const full = base58.encode(new Uint8Array([...seed, ...ed25519.getPublicKey(seed)]));
    const k = await wallets.importKey(full, 'solana');
    expect(await wallets.revealKey(k.id, 0, 'solana')).toBe(full);
    await expect(wallets.revealKey(k.id, 0, 'evm')).rejects.toThrow('UNKNOWN_ACCOUNT');
  });

  test('supprimer : secret retiré du coffre, réimport possible ensuite', async () => {
    const w = await wallets.importPhrase(ABOUT);
    await wallets.removeWallet(w.id);
    expect(await wallets.list()).toEqual([]);
    const vault = (await session.readVault())!;
    const vk = await session.vaultKey();
    expect(() => readSecret(vault, vk, w.id)).toThrow();
    await expect(wallets.importPhrase(ABOUT)).resolves.toBeTruthy();
    await expect(wallets.removeWallet('w-inconnu')).rejects.toThrow('UNKNOWN_WALLET');
  });

  test('sauvegarde exportée : relue par l’import (comptes et noms repris), compagnon exclu', async () => {
    const w = await wallets.importPhrase(ABOUT, 'Principal');
    await wallets.addAccounts(w.id, [1]);
    await wallets.renameAccount(w.id, 1, 'Épargne');
    await wallets.addCompanion({ topic: 't', evm: '0x' + '1'.repeat(40), evmChains: [1], label: 'Téléphone' });
    const { file, count } = await wallets.exportBackup('Sauvegarde-Solide-93!');
    expect(count).toBe(1);
    expect(file).not.toContain('abandon');
    await wallets.removeWallet(w.id);
    const r = await wallets.importBackup(file, 'Sauvegarde-Solide-93!');
    expect(r.skipped).toEqual([]);
    expect(r.added[0].label).toBe('Principal');
    const back = (await wallets.list()).find((x) => x.label === 'Principal')!;
    expect(back.accounts.map((a) => a.index)).toEqual([0, 1]);
  });

  test('rien à sauvegarder : erreur claire', async () => {
    await expect(wallets.exportBackup('Sauvegarde-Solide-93!')).rejects.toThrow('NOTHING_TO_BACKUP');
  });
});
