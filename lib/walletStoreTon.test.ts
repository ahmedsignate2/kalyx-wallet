/**
 * Le magasin face aux phrases TON — de l'import à la signature.
 *
 * C'est la couture la plus sensible : la phrase, les comptes, le déverrouillage
 * et le signataire. Une erreur ici signerait pour un autre compte que celui
 * affiché, ou inventerait des adresses EVM depuis une phrase TON.
 *
 * Stockage simulé en mémoire ; tout le reste est RÉEL : chiffrement scrypt du
 * coffre, dérivations, adresses. Les valeurs attendues viennent des vecteurs de
 * `src/domain/chains/ton/tonkeeper-vectors.json` (bibliothèques officielles, et
 * l'adresse W5 de « abandon × 23 art » confirmée dans le vrai Tonkeeper).
 *
 * Un seul scénario, dans l'ordre : c'est ainsi que l'utilisateur le vit.
 */
import { hex } from '@scure/base';
import type { ChainAdapterV2, ChainConfig } from '../src';
import VECTORS from '../src/domain/chains/ton/tonkeeper-vectors.json';

// ---- TON piloté par le test : les configurations TON réelles sont retirées, et un
// réseau TON PRINCIPAL fictif s'active à la demande — pour tester aussi bien le
// refus « TON pas configuré » que l'adresse principale confirmée dans Tonkeeper.
let mockTonOn = false;
const mockTonCfg = { id: 'ton-test-cfg', name: 'TON', family: 'ton', nativeSymbol: 'TON', nativeDecimals: 9, rpcUrls: [] };
jest.mock('../src', () => {
  const actual = jest.requireActual('../src');
  return {
    ...actual,
    listChains: (o?: { includeTestnets?: boolean }) => [
      ...actual.listChains(o).filter((c: { family: string }) => c.family !== 'ton'),
      ...(mockTonOn ? [mockTonCfg] : []),
    ],
  };
});

const mockTrack = jest.fn(async () => {});
// ---- Stockage en mémoire à la place du trousseau de l'appareil. ----
jest.mock('./secureStore', () => {
  const vaults = new Map<string, unknown>();
  const accounts = new Map<string, unknown>();
  const bio = new Map<string, string>();
  let wallets: unknown[] = [];
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return {
    saveVault: async (id: string, v: unknown) => { vaults.set(id, v); },
    loadVault: async (id: string) => vaults.get(id) ?? null,
    hasVault: async (id: string) => vaults.has(id),
    saveAccounts: async (id: string, a: unknown) => { accounts.set(id, clone(a)); },
    loadAccounts: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    loadAccountsStrict: async (id: string) => (accounts.has(id) ? clone(accounts.get(id)) : null),
    enableBiometricSeed: async (id: string, m: string) => { bio.set(id, m); },
    disableBiometricSeed: async (id: string) => { bio.delete(id); },
    readBiometricSeed: async (id: string) => bio.get(id) ?? null,
    hasBiometricSeed: async (id: string) => bio.has(id),
    saveWalletsList: async (l: unknown[]) => { wallets = clone(l); },
    loadWalletsList: async () => clone(wallets),
    saveLockState: async () => {},
    loadLockState: async () => ({ failedAttempts: 0, lastFailedAt: 0 }),
    wipeWallet: async () => {},
    wipeAll: async () => {},
  };
});
// Le scénario TON ne signe aucune transaction Solana ; le vrai paquet tire un
// module ESM pur (uuid, via rpc-websockets) que Jest ne charge pas.
jest.mock('@solana/web3.js', () => ({ VersionedTransaction: class {}, Keypair: class {} }));
jest.mock('./kv', () => ({ kvGet: async () => null, kvSet: async () => {}, kvDel: async () => {} }));
jest.mock('./biometrics', () => ({ authenticate: async () => true }));
jest.mock('./runDiscovery', () => ({ trackDiscovery: mockTrack }));
jest.mock('./aura', () => ({ aura: { pulse: () => {} } }));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ setBiometricEnabled: () => {} }) } }));
jest.mock('./pendingBtc', () => ({ usePendingBtc: { getState: () => ({ txs: [] }) } }));
jest.mock('./solanaSubmit', () => ({ submitSolanaSigned: jest.fn() }));
jest.mock('./technicalLogger', () => ({ technicalLogger: { log: () => {} }, recordTechnicalLog: () => {} }));
jest.mock('./walletNames', () => ({ isLegacyDefaultName: () => false }));

// eslint-disable-next-line import/first
import { useWallet } from './walletStore';
// eslint-disable-next-line import/first
import { classifyRecoveryPhrase } from '../src';

const PIN = '482917';
const tonPhrase = VECTORS.keys[0]; // phrase Tonkeeper officielle (@ton/crypto)
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!; // BIP-39, confirmée dans Tonkeeper
const adapter = (family: string) => ({ config: family === 'ton' ? mockTonCfg : { id: 'ethereum', family } }) as unknown as ChainAdapterV2;
const W = () => useWallet.getState();
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; message?: string }) => `${e.code ?? ''}|${e.message ?? ''}`);

describe('magasin × TON, dans l’ordre où l’utilisateur le vit', () => {
  it('1. un portefeuille BIP-39 reçoit la clé TON de Tonkeeper sur son compte 0', async () => {
    W().setImportedDraft(art.phrase);
    await W().confirmDraft(PIN);
    const a0 = W().accounts[0];
    expect(a0.tonPublicKey).toBe(art.publicKey);
    expect(a0.tonVersion).toBe('v5r1');
    expect(a0.evmAddress).toMatch(/^0x/);
    expect(a0.solAddress).toBeTruthy();
  });

  it('2. une phrase Tonkeeper est RECONNUE, et refusée tant que TON n’est pas configuré', async () => {
    expect(await codeOf(W().importWallet(tonPhrase.phrase, PIN))).toBe('NOT_SUPPORTED|import.TON_NOT_YET');
    expect(W().wallets).toHaveLength(1);
  });

  it('3. une phrase qui n’est ni BIP-39 ni TON est invalide (code traduit, plus de français)', async () => {
    expect(await codeOf(W().importWallet(VECTORS.invalid[0], PIN))).toBe('INVALID_MNEMONIC|Invalid recovery phrase');
  });

  it('4. TON configuré : la phrase ouvre un portefeuille TON SEULEMENT, à l’adresse de Tonkeeper', async () => {
    mockTonOn = true;
    await W().importWallet(tonPhrase.phrase, PIN, 'Tonkeeper');
    const meta = W().wallets[1];
    expect(meta.type).toBe('tonPhrase');
    expect(W().accounts).toEqual([{ index: 0, label: '', evmAddress: '', btcAddress: '', tonPublicKey: tonPhrase.publicKey, tonVersion: 'v5r1' }]);
    expect(W().activeChain).toBe(mockTonCfg.id);
    expect(W().account?.address).toBe(tonPhrase.v5r1.uq);
  });

  it('5. le déverrouillage ne lui fabrique AUCUNE adresse BIP-39', async () => {
    await W().unlockWithPin(PIN);
    expect(W().accounts[0].evmAddress).toBe('');
    expect(W().accounts[0].solAddress).toBeUndefined();
  });

  it('6. une phrase TON n’a qu’un compte', async () => {
    expect(await codeOf(W().addAccount({ pin: PIN }))).toBe('NOT_SUPPORTED|import.SINGLE_ACCOUNT');
  });

  it('7. le signataire TON est la clé de Tonkeeper pour cette phrase', async () => {
    const s = await W().deriveSigner(adapter('ton'), { pin: PIN });
    expect(s.curve).toBe('ed25519');
    expect(hex.encode(s.publicKey)).toBe(tonPhrase.publicKey);
    expect(hex.encode((s as { secretKey: Uint8Array }).secretKey)).toBe(tonPhrase.seed);
  });

  it('8. et rien d’autre : ni signataire EVM, ni clé privée exportée', async () => {
    expect(await codeOf(W().deriveSigner(adapter('evm'), { pin: PIN }))).toBe('NOT_SUPPORTED|import.WRONG_FAMILY:ton:evm');
    expect(await codeOf(W().exportPrivateKey({ pin: PIN }))).toBe('NOT_SUPPORTED|import.WRONG_FAMILY:ton:evm');
  });

  it('9. de retour sur le portefeuille BIP-39 : l’adresse W5 confirmée dans Tonkeeper, et sa clé', async () => {
    await W().setActiveWallet('primary');
    expect(W().activeChain).toBe(mockTonCfg.id); // multi-chaînes : le réseau affiché ne change pas
    expect(W().account?.address).toBe('UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw');
    const s = await W().deriveSigner(adapter('ton'), { pin: PIN });
    expect(hex.encode(s.publicKey)).toBe(art.publicKey);
    expect(hex.encode((s as { secretKey: Uint8Array }).secretKey)).toBe(art.seed);
  });

  it('10. un compte ajouté n’a pas de TON : Tonkeeper n’en montre qu’un par phrase', async () => {
    await W().addAccount({ pin: PIN });
    expect(W().activeAccountIndex).toBe(1);
    expect(W().accounts[1].tonPublicKey).toBeUndefined();
    expect(W().account?.address).toBe('');
    expect(await codeOf(W().deriveSigner(adapter('ton'), { pin: PIN }))).toBe('NOT_SUPPORTED|import.TON_FIRST_ACCOUNT');
    W().setActiveAccount(0);
  });

  it('11. un compte d’avant TON reçoit sa clé au déverrouillage', async () => {
    const stripped = W().accounts.map(({ tonPublicKey, tonVersion, ...rest }) => rest);
    useWallet.setState({ accounts: stripped });
    await W().unlockWithPin(PIN);
    expect(W().accounts[0].tonPublicKey).toBe(art.publicKey);
    expect(W().accounts[1].tonPublicKey).toBeUndefined();
  });

  it('12. si la clé affichée et la clé dérivée divergent, on ne signe pas', async () => {
    const good = W().accounts;
    useWallet.setState({ accounts: good.map((a) => (a.index === 0 ? { ...a, tonPublicKey: tonPhrase.publicKey } : a)) });
    expect(await codeOf(W().deriveSigner(adapter('ton'), { pin: PIN }))).toBe('|TON public key mismatch');
    useWallet.setState({ accounts: good });
  });

  it('13. la sauvegarde emporte la phrase TON, que la restauration saura reclasser', async () => {
    const all = await W().exportAllWallets({ pin: PIN });
    expect(all).toHaveLength(2);
    const ton = all.find((w) => w.label === 'Tonkeeper')!;
    expect(ton.type).toBe('seed');
    expect(ton.secret).toBe(tonPhrase.phrase);
    expect(classifyRecoveryPhrase(ton.secret)).toBe('ton');
    // Restaurer par-dessus : doublons détectés, rien n'est ajouté deux fois.
    expect(await W().importWallets(all, PIN)).toBe(0);
  });

  /*
   * Le rattrapage ne visait que le portefeuille ACTIF : basculer ensuite sur un
   * autre faisait disparaître TON Testnet de Recevoir (signalé sur téléphone).
   */
  it('14. au déverrouillage, les AUTRES portefeuilles BIP-39 reçoivent aussi leur clé TON', async () => {
    const legal = VECTORS.keys.find((k) => k.phrase.startsWith('legal winner'))!;
    await W().importWallet(legal.phrase, PIN, 'Second');
    const id = W().activeWalletId;
    const ss = jest.requireMock('./secureStore');
    const stripped = (await ss.loadAccounts(id)).map(({ tonPublicKey, tonVersion, ...rest }: Record<string, unknown>) => rest);
    await ss.saveAccounts(id, stripped);
    await W().setActiveWallet('primary');
    await W().unlockWithPin(PIN);
    await new Promise((r) => setTimeout(r, 1500)); // rattrapage en arrière-plan
    expect((await ss.loadAccounts(id))[0].tonPublicKey).toBe(legal.publicKey);
    await W().setActiveWallet(id);
    expect(W().accounts[0].tonPublicKey).toBe(legal.publicKey);
  });
});
