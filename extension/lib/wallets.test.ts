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
    expect(w.accounts[0]).toMatchObject({ index: 0, evm: EVM0, solana: SOL0 });
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
    const r = await discoverAccounts(async (i) => table.find((a) => a.index === i) ?? {}, evmFor(used));
    expect(r.found).toEqual([1, 3]);
    expect(r.lastChecked).toBe(6);
    const updated = await wallets.addAccounts(w.id, r.found);
    expect(updated.accounts.map((a) => a.index)).toEqual([0, 1, 3]);
  });

  test('réseau muet : « inconnu », jamais « vide »', async () => {
    const down: Rpc = async () => { throw new Error('offline'); };
    expect(await accountActivity(down, EVM0, SOL0)).toBe('unknown');
  });
});
