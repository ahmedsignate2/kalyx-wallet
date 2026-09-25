/**
 * État global du wallet (Zustand).
 *
 * INVARIANTS DE SÉCURITÉ (cf. SECURITY.md) :
 *  - Ni la seed, ni la clé privée ne sont JAMAIS dans ce state.
 *  - Seules des données publiques (adresses) y vivent.
 *  - La seed n'est déchiffrée du coffre qu'à la volée, pour dériver/signer.
 *
 * MULTI-WALLET : plusieurs portefeuilles (seeds indépendantes), chacun avec son
 * coffre chiffré et ses comptes. Le wallet 'primary' garde les clés historiques
 * (aucune migration destructive). Un seul PIN d'app chiffre tous les coffres.
 * MULTI-COMPTES : au sein d'un wallet, plusieurs comptes par index HD.
 */
import { base64, base58, hex } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { create } from 'zustand';
import { Wallet, getBytes, isHexString } from 'ethers';
import {
  generateMnemonic,
  validateMnemonic,
  getAdapterV2,
  signerFromSeed,
  signerFromEvmPrivateKey,
  withSigner,
  type ChainAdapterV2,
  type ChainSigner,
  type SendRequest,
  type BitcoinPendingContext,
  signBip137Message,
  signBip322Message,
  type FeeSpeed,
  mnemonicToSeedSync,
  deriveEvmAccount,
  evmAccountFromPrivateKey,
  normalizeEvmPrivateKey,
  deriveBtcAccount,
  deriveBtcSigner,
  deriveSolanaAccount,
  deriveSolanaSigner,
  evmPath,
  btcPath,
  solPath,
  getAdapter,
  hasChain,
  decryptSecret,
  encryptSecret,
  assertValidPin,
  lockRemainingMs,
  isWalletError,
  WalletError,
  EvmChainAdapter,
  SolanaChainAdapter,
  NATIVE_TOKEN,
  parseAmount,
  erc20TransferData,
  type Account,
  type MnemonicStrength,
  type SwapQuote,
  type RawTxRequest,
} from '../src';
import { technicalLogger } from './technicalLogger';
import {
  saveVault,
  loadVault,
  hasVault,
  saveAccounts,
  loadAccounts,
  enableBiometricSeed,
  disableBiometricSeed,
  readBiometricSeed,
  hasBiometricSeed,
  saveWalletsList,
  loadWalletsList,
  saveLockState,
  loadLockState,
  wipeWallet,
  wipeAll,
  type StoredAccount,
  type WalletMeta,
} from './secureStore';
import { authenticate } from './biometrics';
import { submitSolanaSigned } from './solanaSubmit';
import { kvGet, kvSet } from './kv';
import { aura } from './aura';
import { isLegacyDefaultName } from './walletNames';
import { useSettings } from './settingsStore';
import { usePendingBtc } from './pendingBtc';

/** Réseau actif mémorisé entre deux lancements (non sensible). */
const K_ACTIVE_CHAIN = 'kalyx.activeChain';
import { VersionedTransaction, Keypair } from '@solana/web3.js';
import * as btcLib from '@scure/btc-signer';

export const DEFAULT_CHAIN = 'ethereum'; // mainnet par défaut (les testnets sont cachés/optionnels)

export type Unlock = { pin: string } | { biometric: true };
/** Frais de gas EIP-1559 choisis par l'utilisateur (palier Lent/Normal/Rapide). */
/**
 * Frais choisis par l'utilisateur.
 *
 * `speed` sert aux chaînes qui n'ont pas de notion de « prix du gaz » : sur
 * Bitcoin le palier se traduit en sat/vB, calculé par l'adapter au moment de
 * l'envoi. Sans lui, le choix Lent/Normal/Rapide était ignoré hors EVM.
 */
export type GasOverride = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  speed?: FeeSpeed;
};
export type SwapStatus = 'approving' | 'approvalWait' | 'swapping' | 'confirming';

interface WalletState {
  ready: boolean;
  hasWallet: boolean;
  isUnlocked: boolean;
  wallets: WalletMeta[];
  activeWalletId: string;
  accounts: StoredAccount[];
  activeAccountIndex: number;
  activeChain: string;
  account: Account | null;
  draftMnemonic: string | null;
  /** Le brouillon vient-il d'un import (phrase, Drive) plutôt que d'une création ? */
  draftWasImported: boolean;
  failedAttempts: number;
  lastFailedAt: number;

  bootstrap: () => Promise<void>;
  newDraft: (strength?: MnemonicStrength) => void;
  setImportedDraft: (mnemonic: string) => void;
  confirmDraft: (pin: string, opts?: { enableBiometric?: boolean }) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  unlockWithBiometrics: () => Promise<void>;
  /** Vérifie le PIN (déchiffre le coffre à la volée) ; lève WRONG_PIN si faux. */
  verifyPin: (pin: string) => Promise<void>;
  /** Vérifie l'identité (PIN ou biométrie) sans exposer la seed. */
  verifyUnlock: (unlock: Unlock) => Promise<void>;
  setActiveChain: (chainId: string) => void;
  setActiveAccount: (index: number) => void;
  addAccount: (unlock: Unlock, label?: string) => Promise<void>;
  renameAccount: (index: number, label: string) => void;
  // Multi-wallet
  createWallet: (pin: string, label?: string) => Promise<string>; // renvoie la phrase à sauvegarder
  importWallet: (mnemonic: string, pin: string, label?: string) => Promise<void>;
  /** Importe un wallet depuis une clé privée EVM (un seul compte, EVM uniquement). */
  importPrivateKey: (privateKey: string, pin: string, label?: string) => Promise<void>;
  setActiveWallet: (id: string) => Promise<void>;
  renameWallet: (id: string, label: string) => Promise<void>;
  removeWallet: (id: string) => Promise<void>;
  lock: () => void;
  signAndSend: (to: string, amount: string, unlock: Unlock, gas?: GasOverride) => Promise<string>;
  /**
   * Prépare, signe et diffuse un envoi sur n'importe quelle chaîne.
   *
   * Chemin unique : c'est lui qui remplace les trois branches `instanceof` que
   * l'interface v1 imposait.
   */
  sendDraft: (
    adapter: ChainAdapterV2,
    from: string,
    request: SendRequest,
    unlock: Unlock,
  ) => Promise<string>;
  /**
   * Dérive le signataire de la chaîne, à partir de la seed qui ne sort pas d'ici.
   *
   * Exposé sur le store parce que les chemins de signature (envoi, message,
   * dApp) en ont tous besoin — et qu'il ne doit exister qu'UNE façon d'obtenir
   * du matériel de signature.
   */
  deriveSigner: (adapter: ChainAdapterV2, unlock: Unlock) => Promise<ChainSigner>;
  /** Accélère une transaction Bitcoin en attente (remplacement BIP-125). */
  bumpBitcoin: (txid: string, unlock: Unlock, speed?: FeeSpeed) => Promise<string>;
  executeSwap: (quote: SwapQuote, unlock: Unlock, onStatus?: (s: SwapStatus) => void) => Promise<string>;

  signSolanaTransaction: (unlock: Unlock, txStr: string, refreshBlockhash?: boolean) => Promise<string>;
  signSolanaTransactions: (unlock: Unlock, txStrArray: string[]) => Promise<string[]>;
  signSolanaMessage: (unlock: Unlock, message: string) => Promise<{ signature: string }>;
  signBitcoinMessage: (unlock: Unlock, message: string, type?: 'ecdsa' | 'bip322') => Promise<string>;
  signBitcoinPsbt: (unlock: Unlock, psbtBase64: string, options?: { finalize?: boolean; signInputs?: number[] }) => Promise<string>;

  // Signature pour WalletConnect (requêtes dApp)
  signMessage: (unlock: Unlock, message: string) => Promise<string>;
  signTypedData: (unlock: Unlock, typedData: { domain: unknown; types: Record<string, unknown>; message: unknown }) => Promise<string>;
  sendRawTxOn: (unlock: Unlock, chainId: string, req: RawTxRequest) => Promise<string>;
  /** Envoie un token ERC-20 détenu (transfer) sur le réseau actif. */
  sendToken: (to: string, amount: string, token: { contract: string; decimals: number }, unlock: Unlock, gas?: GasOverride) => Promise<string>;
  /** Envoie un token SPL détenu (Solana) : crée l'ATA si besoin puis transfère. */
  sendSolToken: (to: string, amount: string, token: { mint: string; decimals: number }, unlock: Unlock) => Promise<string>;
  changePin: (oldPin: string, newPin: string) => Promise<void>;
  revealPhrase: (unlock: Unlock) => Promise<string>;
  /** Révèle la clé privée EVM d'un wallet importé par clé privée. */
  exportPrivateKey: (unlock: Unlock) => Promise<string>;
  enableBiometric: (pin: string) => Promise<void>;
  disableBiometric: () => Promise<void>;
  /** Ré-enregistre le secret biométrique au format non-gated s'il manque (migration douce). */
  healBiometric: (pin: string) => Promise<void>;
  reset: () => Promise<void>;
}

function deriveStoredAccount(mnemonic: string, index: number, label: string): StoredAccount {
  const seed = mnemonicToSeedSync(mnemonic);
  return {
    index,
    label,
    evmAddress: deriveEvmAccount(seed, index).address,
    btcAddress: deriveBtcAccount(seed, index).address,
    solAddress: deriveSolanaAccount(seed, index).address,
  };
}

/** Compte unique (EVM) d'un wallet importé par clé privée : pas de HD, ni BTC/Solana. */
function storedAccountFromPk(privateKey: string): StoredAccount {
  const acct = evmAccountFromPrivateKey(privateKey);
  // Libellé vide = nom par défaut, traduit à l'affichage (lib/walletNames.ts).
  return { index: 0, label: '', evmAddress: acct.address, btcAddress: '' };
}

function isPrivateKeyWallet(wallets: WalletMeta[], id: string): boolean {
  return wallets.find((w) => w.id === id)?.type === 'privateKey';
}

/**
 * Clé privée EVM prête à signer, quelle que soit l'origine du wallet actif :
 * dérivée de la seed (wallet HD) ou clé importée telle quelle (wallet clé privée).
 * Le secret ne vit que le temps de l'appel.
 */
async function revealEvmSigningKey(
  wallets: WalletMeta[],
  activeWalletId: string,
  accountIndex: number,
  unlock: Unlock,
): Promise<string> {
  const secret = await revealMnemonic(activeWalletId, unlock);
  return isPrivateKeyWallet(wallets, activeWalletId)
    ? normalizeEvmPrivateKey(secret)
    : deriveEvmAccount(mnemonicToSeedSync(secret), accountIndex).privateKey;
}

function toAccount(accounts: StoredAccount[], activeIndex: number, chainId: string): Account | null {
  const a = accounts.find((x) => x.index === activeIndex) ?? accounts[0];
  if (!a) return null;
  const family = getAdapter(chainId).config.family;
  const address = family === 'bitcoin' ? a.btcAddress : family === 'solana' ? a.solAddress ?? '' : a.evmAddress;
  const path = family === 'bitcoin' ? btcPath(a.index) : family === 'solana' ? solPath(a.index) : evmPath(a.index);
  return { chain: chainId, address, index: a.index, path };
}

/**
 * Rétro-compat : les comptes créés avant l'ajout de Solana n'ont pas de
 * `solAddress`. On les complète dès qu'on dispose de la seed (au déverrouillage),
 * puis on persiste. Sans effet si tout est déjà rempli.
 */
async function backfillSolAddresses(
  walletId: string,
  mnemonic: string,
  accounts: StoredAccount[],
): Promise<StoredAccount[]> {
  if (accounts.length === 0 || accounts.every((a) => a.solAddress)) return accounts;
  const seed = mnemonicToSeedSync(mnemonic);
  const updated = accounts.map((a) =>
    a.solAddress ? a : { ...a, solAddress: deriveSolanaAccount(seed, a.index).address },
  );
  await saveAccounts(walletId, updated);
  return updated;
}

/** Révèle la seed du wallet `id` (biométrie ou PIN), de façon transitoire. */
async function revealMnemonic(id: string, unlock: Unlock): Promise<string> {
  if ('biometric' in unlock) {
    // Prompt biométrique explicite (fiable), PUIS lecture du secret non-gated.
    // Un seul prompt : le secret n'est plus keystore-gated (cf. secureStore).
    const ok = await authenticate('Déverrouiller Kalyx Wallet');
    /*
     * Codes typés et non messages : l'interface testait
     * `e.message.includes('refusée')`, donc elle matchait des chaînes
     * FRANÇAISES. Traduire ou reformuler ces messages aurait cassé en silence
     * le repli sur le PIN — l'utilisateur se serait retrouvé bloqué sans erreur
     * visible. C'est précisément ce que les codes du domaine existent pour
     * éviter (cf. src/domain/errors.ts).
     */
    if (!ok) throw new WalletError('BIOMETRIC_REFUSED', 'Biometric request refused');
    const m = await readBiometricSeed(id);
    if (!m) throw new WalletError('BIOMETRIC_NOT_SET', 'No biometric vault for this wallet');
    return m;
  }
  const vault = await loadVault(id);
  if (!vault) throw new Error('Aucun coffre');
  return decryptSecret(vault, unlock.pin);
}

function newWalletId(): string {
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Forme canonique BIP-39 d'une phrase importée : minuscules, espaces normalisés.
 * Les wordlists BIP-39 sont TOUTES en minuscules ; la seed dérivée est identique
 * (vérifié), mais stocker/afficher la forme canonique garantit la portabilité vers
 * les wallets stricts (qui rejettent « Belt » avec majuscule) et un affichage propre.
 */
function canonicalMnemonic(m: string): string {
  return m.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const useWallet = create<WalletState>((set, get) => ({
  ready: false,
  hasWallet: false,
  isUnlocked: false,
  wallets: [],
  activeWalletId: 'primary',
  accounts: [],
  activeAccountIndex: 0,
  activeChain: DEFAULT_CHAIN,
  account: null,
  draftMnemonic: null,
  draftWasImported: false,
  failedAttempts: 0,
  lastFailedAt: 0,

  bootstrap: async () => {
    let wallets = await loadWalletsList();
    // Migration douce : un ancien wallet unique devient 'primary' (clés inchangées).
    if (wallets.length === 0 && (await hasVault('primary'))) {
      wallets = [{ id: 'primary', label: '' }];
      await saveWalletsList(wallets);
    }
    /*
     * MIGRATION DES NOMS PAR DÉFAUT. Les versions précédentes écrivaient
     * « Portefeuille principal », « Compte 2 »… en français DANS le stockage.
     * Un utilisateur anglophone les voyait donc en français, et changer de
     * langue n'y changeait rien puisque le texte était figé sur le disque.
     * On vide ces libellés une fois pour toutes : vide = nom par défaut, résolu
     * à l'affichage depuis la langue active. Un nom réellement choisi par
     * l'utilisateur ne correspond à aucun de ces motifs et n'est pas touché.
     */
    if (wallets.some((w) => isLegacyDefaultName(w.label))) {
      wallets = wallets.map((w) => (isLegacyDefaultName(w.label) ? { ...w, label: '' } : w));
      await saveWalletsList(wallets);
    }
    const activeWalletId = wallets[0]?.id ?? 'primary';
    let accounts = wallets.length ? (await loadAccounts(activeWalletId)) ?? [] : [];
    if (accounts.some((a) => isLegacyDefaultName(a.label))) {
      accounts = accounts.map((a) => (isLegacyDefaultName(a.label) ? { ...a, label: '' } : a));
      await saveAccounts(activeWalletId, accounts);
    }
    // Compteur anti-brute-force persistant : recharge le verrouillage temporaire.
    const lock = await loadLockState();
    // Réseau actif du dernier lancement (sinon réseau par défaut).
    const savedChain = await kvGet(K_ACTIVE_CHAIN).catch(() => null);
    const activeChain = savedChain && hasChain(savedChain) ? savedChain : get().activeChain;
    set({
      ready: true,
      hasWallet: wallets.length > 0 && accounts.length > 0,
      isUnlocked: false,
      wallets,
      activeWalletId,
      accounts,
      activeAccountIndex: 0,
      activeChain,
      account: toAccount(accounts, 0, activeChain),
      failedAttempts: lock.failedAttempts,
      lastFailedAt: lock.lastFailedAt,
    });
  },

  newDraft: (strength = 128) => set({ draftMnemonic: generateMnemonic(strength), draftWasImported: false }),

  setImportedDraft: (mnemonic) => {
    const m = canonicalMnemonic(mnemonic);
    if (!validateMnemonic(m)) throw new Error('Phrase de récupération invalide');
    set({ draftMnemonic: m, draftWasImported: true });
  },

  confirmDraft: async (pin, opts) => {
    const m = get().draftMnemonic;
    if (!m) throw new Error('Aucun mnémonique de brouillon');
    /*
     * GARDE-FOU CRITIQUE — perte de fonds.
     *
     * Cette fonction est celle du TOUT PREMIER lancement : elle écrit sur le
     * coffre `primary` et REMPLACE la liste des wallets par une seule entrée.
     * L'appeler alors qu'un wallet existe déjà écrase sa phrase de récupération
     * de façon IRRÉVERSIBLE — si l'utilisateur ne l'avait pas notée, ses fonds
     * sont perdus pour toujours.
     *
     * Le cas s'est produit : `app/import.tsx` et `app/restore-drive.tsx`
     * routaient vers /set-pin sans regarder si un wallet existait. Importer
     * depuis Google après avoir créé un wallet détruisait le premier.
     *
     * Les écrans corrigés passent désormais par `importWallet`, qui AJOUTE.
     * Cette garde reste le filet : aucun chemin futur ne pourra plus détruire
     * un coffre par simple erreur de navigation.
     */
    if (get().hasWallet || get().wallets.length > 0) {
      throw new WalletError(
        'WALLET_ALREADY_EXISTS',
        'Un wallet existe déjà : utiliser importWallet, qui ajoute sans écraser.',
      );
    }
    assertValidPin(pin);
    const id = 'primary';
    const accounts = [deriveStoredAccount(m, 0, '')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    /*
     * BIOMÉTRIE : on aligne À LA FOIS le coffre et le RÉGLAGE sur le choix fait
     * à l'écran, dans les deux sens.
     *
     * Bug corrigé : seul le coffre était écrit, et uniquement quand la case
     * était cochée. Le réglage `biometricEnabled` n'était jamais touché par la
     * création. Après une réinitialisation puis une re-création avec la case
     * DÉCOCHÉE, le réglage restait à `true` d'une vie précédente : l'écran de
     * déverrouillage demandait donc l'empreinte à chaque ouverture, puis
     * échouait — le coffre biométrique ne correspondait plus au nouveau wallet —
     * en affichant « à réactiver dans Réglages ». Symétriquement, cocher la case
     * stockait bien la seed mais laissait le réglage à `false` : la biométrie ne
     * était jamais proposée.
     *
     * C'est fait ICI et non dans l'écran : la création est le seul endroit qui
     * sait que l'état précédent doit être oublié.
     */
    if (opts?.enableBiometric) await enableBiometricSeed(id, m);
    else await disableBiometricSeed(id).catch(() => {});
    useSettings.getState().setBiometricEnabled(!!opts?.enableBiometric);
    const wallets: WalletMeta[] = [{ id, label: '' }];
    await saveWalletsList(wallets);
    set({
      wallets,
      activeWalletId: id,
      accounts,
      activeAccountIndex: 0,
      account: toAccount(accounts, 0, get().activeChain),
      hasWallet: true,
      isUnlocked: true,
      draftMnemonic: null,
      draftWasImported: false,
    });
  },

  unlockWithPin: async (pin) => {
    const { failedAttempts, lastFailedAt, activeWalletId } = get();
    if (lockRemainingMs(failedAttempts, lastFailedAt, Date.now()) > 0) {
      throw new Error('Trop de tentatives. Réessaie plus tard.');
    }
    try {
      const secret = await revealMnemonic(activeWalletId, { pin });
      // Un wallet clé privée n'a pas de seed → pas de backfill Solana (EVM only).
      const accounts = isPrivateKeyWallet(get().wallets, activeWalletId)
        ? get().accounts
        : await backfillSolAddresses(activeWalletId, secret, get().accounts);
      set({
        isUnlocked: true,
        failedAttempts: 0,
        lastFailedAt: 0,
        accounts,
        account: toAccount(accounts, get().activeAccountIndex, get().activeChain),
      });
      // Impulsion d'Ouverture (docs/08 §12) : le halo s'ouvre depuis le centre.
      // L'Aura l'abandonne si aucun halo n'est visible — c'est le cas
      // aujourd'hui sur l'écran de déverrouillage, qui n'en a pas encore
      // (étape 4). L'événement est néanmoins émis ICI, à la source, parce que
      // c'est le seul endroit qui sait qu'un déverrouillage a RÉUSSI.
      aura.pulse('unlock');
      void saveLockState(0, 0); // réinitialise le compteur persistant
    } catch (e) {
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        const failedAttempts = get().failedAttempts + 1;
        const lastFailedAt = Date.now();
        set({ failedAttempts, lastFailedAt });
        void saveLockState(failedAttempts, lastFailedAt); // survit au redémarrage
      }
      throw e;
    }
  },

  unlockWithBiometrics: async () => {
    const { activeWalletId } = get();
    const secret = await revealMnemonic(activeWalletId, { biometric: true });
    const accounts = isPrivateKeyWallet(get().wallets, activeWalletId)
      ? get().accounts
      : await backfillSolAddresses(activeWalletId, secret, get().accounts);
    set({
      isUnlocked: true,
      accounts,
      account: toAccount(accounts, get().activeAccountIndex, get().activeChain),
    });
    // §3.5 : la fenêtre biométrique appartient au système et ne peut pas être
    // animée. La continuité se joue au TIMING — l'impulsion part à l'instant
    // où l'OS rend la main, sans coupure visible entre lui et Kalyx.
    aura.pulse('unlock');
  },

  verifyPin: async (pin) => {
    // Déchiffre le coffre à la volée : réussit = PIN correct, sinon WRONG_PIN.
    await revealMnemonic(get().activeWalletId, { pin });
  },

  verifyUnlock: async (unlock) => {
    // Biométrie (lecture gated) ou PIN : réussit = identité prouvée, seed jetée.
    await revealMnemonic(get().activeWalletId, unlock);
  },

  setActiveChain: (chainId) => {
    // Garde-fou : un id inconnu (réseau perso supprimé) retomberait en crash via
    // getAdapter. On bascule alors sur le réseau par défaut, toujours valide.
    const safe = hasChain(chainId) ? chainId : DEFAULT_CHAIN;
    technicalLogger.logSys(`Switched active network to ${safe}`, { chainId: safe });
    set({ activeChain: safe, account: toAccount(get().accounts, get().activeAccountIndex, safe) });
    kvSet(K_ACTIVE_CHAIN, safe).catch(() => {});
  },

  setActiveAccount: (index) =>
    set({ activeAccountIndex: index, account: toAccount(get().accounts, index, get().activeChain) }),

  addAccount: async (unlock, label) => {
    const { activeWalletId } = get();
    if (isPrivateKeyWallet(get().wallets, activeWalletId)) {
      throw new Error('Un portefeuille importé par clé privée n’a qu’un seul compte.');
    }
    const mnemonic = await revealMnemonic(activeWalletId, unlock);
    const accounts = get().accounts;
    const nextIndex = accounts.reduce((max, a) => Math.max(max, a.index), -1) + 1;
    const created = deriveStoredAccount(mnemonic, nextIndex, label?.trim() || '');
    const updated = [...accounts, created];
    await saveAccounts(activeWalletId, updated);
    set({ accounts: updated, activeAccountIndex: nextIndex, account: toAccount(updated, nextIndex, get().activeChain) });
  },

  renameAccount: (index, label) => {
    const name = label.trim();
    if (!name) return;
    const accounts = get().accounts.map((a) => (a.index === index ? { ...a, label: name } : a));
    void saveAccounts(get().activeWalletId, accounts);
    set({ accounts, account: toAccount(accounts, get().activeAccountIndex, get().activeChain) });
  },

  createWallet: async (pin, label) => {
    // Vérifie le PIN (cohérence : un seul PIN d'app) via le wallet actif.
    await revealMnemonic(get().activeWalletId, { pin });
    const m = generateMnemonic(128);
    const id = newWalletId();
    const accounts = [deriveStoredAccount(m, 0, '')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    const wallets = [...get().wallets, { id, label: label?.trim() || '' }];
    await saveWalletsList(wallets);
    set({ wallets, activeWalletId: id, accounts, activeAccountIndex: 0, account: toAccount(accounts, 0, get().activeChain) });
    return m; // à afficher pour sauvegarde
  },

  importWallet: async (mnemonic, pin, label) => {
    const m = canonicalMnemonic(mnemonic);
    if (!validateMnemonic(m)) throw new Error('Phrase de récupération invalide');
    await revealMnemonic(get().activeWalletId, { pin }); // vérifie le PIN
    const id = newWalletId();
    const accounts = [deriveStoredAccount(m, 0, '')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    const wallets = [...get().wallets, { id, label: label?.trim() || '' }];
    await saveWalletsList(wallets);
    set({ wallets, activeWalletId: id, accounts, activeAccountIndex: 0, account: toAccount(accounts, 0, get().activeChain) });
  },

  importPrivateKey: async (privateKey, pin, label) => {
    // Valide/normalise la clé AVANT toute écriture (lève si invalide).
    const key = normalizeEvmPrivateKey(privateKey);
    await revealMnemonic(get().activeWalletId, { pin }); // vérifie le PIN (un seul PIN d'app)
    const id = newWalletId();
    const accounts = [storedAccountFromPk(key)];
    await saveVault(id, await encryptSecret(key, pin));
    await saveAccounts(id, accounts);
    const wallets: WalletMeta[] = [
      ...get().wallets,
      { id, label: label?.trim() || '', type: 'privateKey' },
    ];
    await saveWalletsList(wallets);
    // EVM only : si le réseau actif n'est pas EVM, on bascule sur un réseau EVM valide.
    const chain = getAdapter(get().activeChain).config.family === 'evm' ? get().activeChain : DEFAULT_CHAIN;
    set({
      wallets,
      activeWalletId: id,
      accounts,
      activeAccountIndex: 0,
      activeChain: chain,
      account: toAccount(accounts, 0, chain),
    });
  },

  setActiveWallet: async (id) => {
    const accounts = (await loadAccounts(id)) ?? [];
    // Un wallet clé privée est EVM-only : forcer un réseau EVM si besoin.
    const chain =
      isPrivateKeyWallet(get().wallets, id) && getAdapter(get().activeChain).config.family !== 'evm'
        ? DEFAULT_CHAIN
        : get().activeChain;
    set({ activeWalletId: id, accounts, activeAccountIndex: 0, activeChain: chain, account: toAccount(accounts, 0, chain) });
  },

  renameWallet: async (id, label) => {
    const name = label.trim();
    if (!name) return;
    const wallets = get().wallets.map((w) => (w.id === id ? { ...w, label: name } : w));
    await saveWalletsList(wallets);
    set({ wallets });
  },

  removeWallet: async (id) => {
    const wallets = get().wallets.filter((w) => w.id !== id);
    if (wallets.length === 0) throw new Error('Impossible de supprimer le dernier portefeuille.');
    await wipeWallet(id);
    await saveWalletsList(wallets);
    if (get().activeWalletId === id) {
      const nextId = wallets[0].id;
      const accounts = (await loadAccounts(nextId)) ?? [];
      set({ wallets, activeWalletId: nextId, accounts, activeAccountIndex: 0, account: toAccount(accounts, 0, get().activeChain) });
    } else {
      set({ wallets });
    }
  },

  // Le verrouillage NE coupe PAS les sessions WalletConnect : signer exige de
  // toute façon le PIN/biométrie, donc garder la session est sûr — et éviter de
  // la couper évite un désync (le web resterait « connecté » sur une session
  // morte et les requêtes partiraient dans le vide).
  lock: () => set({ isUnlocked: false }),

  signAndSend: async (to, amount, unlock, gas) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapterV2(activeChain);

    /*
     * UN SEUL chemin pour les trois chaînes. Il y en avait trois, choisis par
     * `instanceof`, parce que l'interface v1 ne savait exprimer que l'EVM :
     * Bitcoin et Solana passaient par des méthodes maison. Chaque chaîne
     * ajoutée rallongeait ce branchement, et celle qu'on oubliait quelque part
     * ne cassait rien — elle disparaissait simplement d'un écran.
     */
    const request: SendRequest = {
      to,
      amount: parseAmount(amount, adapter.config.nativeDecimals).raw,
      speed: gas?.speed,
    };
    return get().sendDraft(adapter, account.address, request, unlock);
  },

  /**
   * Prépare, signe, diffuse. Le signataire est dérivé ICI et effacé aussitôt.
   *
   * La seed ne sort pas de ce module : elle est lue, dérivée, puis remise à
   * zéro. L'adapter ne reçoit que le matériel de signature de SA chaîne, donc
   * rien qui permette de remonter au portefeuille entier.
   */
  sendDraft: async (adapter, from, request, unlock) => {
    const { activeWalletId, wallets, account } = get();
    if (!account) throw new Error('Aucun compte');

    const draft = await adapter.prepareSend(from, request);
    const signer = await get().deriveSigner(adapter, unlock);
    const signed = await withSigner(signer, (s) => adapter.signSend(draft, s));
    const outcome = await adapter.broadcastSend(signed);

    /*
     * Contexte de remplacement, quand la chaîne en produit un. Bitcoin en a
     * besoin : les UTXO dépensés disparaissent de l'ensemble disponible, donc
     * sans les conserver ici aucune accélération n'est constructible ensuite.
     */
    if (adapter.config.family === 'bitcoin' && outcome.opaque) {
      usePendingBtc.getState().remember(from, outcome.txid, outcome.opaque as BitcoinPendingContext);
    }
    void activeWalletId;
    void wallets;
    return outcome.txid;
  },

  deriveSigner: async (adapter, unlock) => {
    const { account, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const family = adapter.config.family;

    /*
     * Portefeuille importé par CLÉ PRIVÉE : pas de seed, donc pas de
     * dérivation possible — et une clé secp256k1 EVM ne donne ni adresse
     * Bitcoin ni compte Solana. Le refus est explicite plutôt que silencieux.
     */
    if (isPrivateKeyWallet(wallets, activeWalletId)) {
      if (family !== 'evm') {
        throw new Error(`Portefeuille clé privée : ${family} non disponible (EVM uniquement).`);
      }
      return signerFromEvmPrivateKey(
        await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock),
      );
    }

    const seed = mnemonicToSeedSync(await revealMnemonic(activeWalletId, unlock));
    try {
      return signerFromSeed(family, seed, account.index);
    } finally {
      // La seed est remise à zéro dès la dérivation faite : elle n'a aucune
      // raison de survivre à l'appel qui l'a demandée.
      seed.fill(0);
    }
  },

  bumpBitcoin: async (txid, unlock, speed) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapterV2(activeChain);
    if (!adapter.capabilities.accelerate || !adapter.prepareAcceleration) {
      throw new Error('Cette chaîne ne permet pas d’accélérer une transaction.');
    }

    const pending = usePendingBtc.getState().txs.find((t) => t.txid === txid);
    if (!pending) throw new Error('Transaction introuvable ou trop ancienne pour être accélérée.');
    if (pending.from !== account.address) throw new Error('Cette transaction vient d’un autre compte.');

    const context: BitcoinPendingContext = {
      dest: pending.to,
      target: BigInt(pending.target),
      feeRate: pending.feeRate,
      inputs: pending.inputs,
      fee: BigInt(pending.fee),
    };

    const draft = await adapter.prepareAcceleration(account.address, { txid, opaque: context }, speed);
    const signer = await get().deriveSigner(adapter, unlock);
    const signed = await withSigner(signer, (s) => adapter.signSend(draft, s));
    const outcome = await adapter.broadcastSend(signed);

    // `remember` évince l'originale : elle partage les mêmes entrées, donc elle
    // n'est plus accélérable — proposer de le faire mènerait à un rejet.
    if (outcome.opaque) {
      usePendingBtc.getState().remember(account.address, outcome.txid, outcome.opaque as BitcoinPendingContext);
    }
    return outcome.txid;
  },

  executeSwap: async (quote, unlock, onStatus) => {
    const { account, activeChain, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapter(activeChain);

    if (quote.tx.type === 'evm' && adapter instanceof EvmChainAdapter) {
      const signerKey = await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock);

      const fromAddr = quote.fromToken.address.toLowerCase();
      if (fromAddr !== NATIVE_TOKEN.toLowerCase() && quote.approvalAddress) {
        const allowance = await adapter.getAllowance(quote.fromToken.address, account.address, quote.approvalAddress);
        if (allowance < quote.fromAmount) {
          onStatus?.('approving');

          /*
           * REMISE À ZÉRO D'ABORD, quand une autorisation non nulle existe déjà.
           *
           * USDT sur Ethereum — et quelques autres jetons antérieurs à la
           * finalisation d'ERC-20 — font échouer `approve(spender, montant)`
           * tant que l'autorisation courante n'est pas nulle. Quelqu'un ayant
           * déjà autorisé 100 USDT et voulant en échanger 200 voyait donc son
           * échange échouer sur un revert que rien n'expliquait.
           *
           * Le surcoût d'une transaction ne concerne QUE ce cas — autorisation
           * non nulle et insuffisante —, c'est-à-dire exactement celui qui
           * échouait. Les autres ne paient rien de plus.
           */
          if (allowance > 0n) {
            const resetHash = await adapter.sendContractTx(
              {
                to: quote.fromToken.address,
                data: adapter.buildApproveData(quote.approvalAddress, 0n),
                chainId: Number(quote.tx.chainId),
              },
              account.address,
              signerKey,
            );
            await adapter.waitForTx(resetHash);
          }

          const approveData = adapter.buildApproveData(quote.approvalAddress, quote.fromAmount);
          const approveHash = await adapter.sendContractTx(
            { to: quote.fromToken.address, data: approveData, chainId: Number(quote.tx.chainId) },
            account.address,
            signerKey,
          );
          onStatus?.('approvalWait');
          await adapter.waitForTx(approveHash);
          // Allowance VISIBLE sur le RPC avant la tx principale (nœuds publics en retard).
          const seen = await adapter.waitForAllowance(quote.fromToken.address, account.address, quote.approvalAddress, quote.fromAmount);
          if (!seen) throw new Error("L'autorisation est confirmée mais pas encore visible sur le réseau. Réessaie dans quelques secondes.");
        }
      }

      onStatus?.('swapping');
      const tx = { ...quote.tx, chainId: Number(quote.tx.chainId) };
      const hash = await adapter.sendContractTx(tx, account.address, signerKey);
      onStatus?.('confirming');
      await adapter.waitForTx(hash);
      return hash;
    } else if (quote.tx.type === 'solana' && adapter.config.family === 'solana') {
      onStatus?.('swapping');
      // Blockhash rafraîchi à la signature (un devis peut dater de >60 s), puis
      // simulation OBLIGATOIRE → envoi → attente de confirmation : on ne dit
      // « swap exécuté » que si Solana a confirmé.
      const signedTxStr = await get().signSolanaTransaction(unlock, quote.tx.data, true);
      return submitSolanaSigned(signedTxStr, (st) => onStatus?.(st === 'sending' ? 'swapping' : 'confirming'));
    } else {
      throw new Error(`Swap impossible: type de transaction (${(quote.tx as any).type}) incompatible avec le réseau actif`);
    }
  },


  signSolanaTransaction: async (unlock, txStr, refreshBlockhash = false) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveSolanaSigner(mnemonicToSeedSync(secret), account.index);

    const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(txStr) && txStr.length % 4 === 0;
    const bytes = isBase64 ? base64.decode(txStr) : base58.decode(txStr);

    const tx = VersionedTransaction.deserialize(bytes);
    
    if (refreshBlockhash) {
      try {
        const adapter = getAdapter('solana') as SolanaChainAdapter;
        const res = await (adapter as any).rpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
        if (res?.value?.blockhash) {
          tx.message.recentBlockhash = res.value.blockhash;
        }
      } catch (e) {
        console.warn('Failed to refresh blockhash', e);
      }
    }

    const keypair = Keypair.fromSeed(signer.secretKey);

    tx.sign([keypair]);

    const serialized = tx.serialize();
    return isBase64 ? base64.encode(serialized) : base58.encode(serialized);
  },

  signSolanaTransactions: async (unlock, txStrArray) => {
    const res: string[] = [];
    for (const tx of txStrArray) {
      res.push(await get().signSolanaTransaction(unlock, tx));
    }
    return res;
  },

  signSolanaMessage: async (unlock, message) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveSolanaSigner(mnemonicToSeedSync(secret), account.index);
    let msgBytes: Uint8Array;
    try {
      msgBytes = base58.decode(message);
    } catch {
      try {
        msgBytes = base64.decode(message);
      } catch {
        msgBytes = utf8ToBytes(message);
      }
    }
    const signature = ed25519.sign(msgBytes, signer.secretKey);
    return { signature: base58.encode(signature) };
  },

  signBitcoinMessage: async (unlock, message, type = 'ecdsa') => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveBtcSigner(mnemonicToSeedSync(secret), account.index);

    /*
     * La construction des signatures vit dans `src/domain/chains/btcSign` : ici
     * elle était enfouie derrière le déverrouillage et le stockage, donc
     * intestable — et ni BIP-137 ni BIP-322 n'étaient couverts par le moindre
     * test, alors que ce sont les fonctions qui prouvent la possession d'une
     * adresse à un tiers.
     *
     * Spec WalletConnect Bitcoin : `message` est du TEXTE (UTF-8). Aucune
     * heuristique hex/base64 — « test » est un message, pas un encodage.
     */
    return type === 'ecdsa'
      ? signBip137Message(message, signer.privateKey)
      : signBip322Message(message, { privateKey: signer.privateKey, publicKey: signer.publicKey });
  },

  signBitcoinPsbt: async (unlock, psbtBase64, options) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveBtcSigner(mnemonicToSeedSync(secret), account.index);

    const btc = await import('@scure/btc-signer');
    let psbtBytes: Uint8Array;
    if (psbtBase64.toLowerCase().startsWith('70736274')) {
      psbtBytes = hex.decode(psbtBase64);
    } else {
      psbtBytes = base64.decode(psbtBase64);
    }
    const tx = btc.Transaction.fromPSBT(psbtBytes);

    if (options?.signInputs && options.signInputs.length > 0) {
      for (const idx of options.signInputs) {
        tx.signIdx(signer.privateKey, idx);
      }
    } else {
      tx.sign(signer.privateKey);
    }

    if (options?.finalize) {
      tx.finalize();
    }

    const finalBytes = tx.toPSBT();
    const isHex = psbtBase64.toLowerCase().startsWith('70736274');
    return isHex ? hex.encode(finalBytes) : base64.encode(finalBytes);
  },

  signMessage: async (unlock, message) => {
    const { account, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const pk = await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock);
    const data = isHexString(message) ? getBytes(message) : message;
    return new Wallet(pk).signMessage(data);
  },

  signTypedData: async (unlock, typedData) => {
    const { account, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const pk = await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock);
    const { EIP712Domain: _drop, ...types } = (typedData.types ?? {}) as Record<string, unknown>;
    return new Wallet(pk).signTypedData(
      typedData.domain as never,
      types as never,
      typedData.message as never,
    );
  },

  sendRawTxOn: async (unlock, chainId, req) => {
    const { account, accounts, activeAccountIndex, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapter(chainId);
    if (!(adapter instanceof EvmChainAdapter)) throw new Error('Chaîne non supportée');
    // `from` = adresse EVM du compte actif (identique sur toutes les chaînes EVM),
    // même si la chaîne ACTIVE est Solana/Bitcoin (ex. Earn sur Avalanche depuis Solana).
    const stored = accounts.find((a) => a.index === activeAccountIndex);
    const from = stored?.evmAddress ?? account.address;
    const pk = await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock);
    return adapter.sendContractTx(req, from, pk);
  },

  sendToken: async (to, amount, token, unlock, gas) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapterV2(activeChain);
    if (!adapter.capabilities.tokenSend) {
      throw new Error('Envoi de jeton non supporté sur ce réseau');
    }
    return get().sendDraft(
      adapter,
      account.address,
      {
        to,
        amount: parseAmount(amount, token.decimals).raw, // lève si montant invalide
        token: { id: token.contract, symbol: 'TOKEN', decimals: token.decimals },
        speed: gas?.speed,
      },
      unlock,
    );
  },

  /**
   * Envoi d'un jeton SPL.
   *
   * Conservé pour ne pas casser ses appelants, mais c'est désormais LE MÊME
   * chemin que `sendToken` : un envoi de jeton est un envoi de jeton, et le
   * fait que l'un s'appelle contrat et l'autre mint est un détail que l'adapter
   * absorbe.
   */
  sendSolToken: async (to, amount, token, unlock) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapterV2(activeChain);
    if (!adapter.capabilities.tokenSend) {
      throw new Error('Envoi de jeton non supporté sur ce réseau');
    }
    return get().sendDraft(
      adapter,
      account.address,
      {
        to,
        amount: parseAmount(amount, token.decimals).raw,
        token: { id: token.mint, symbol: 'TOKEN', decimals: token.decimals },
      },
      unlock,
    );
  },

  changePin: async (oldPin, newPin) => {
    assertValidPin(newPin);
    // Re-chiffre TOUS les coffres avec le nouveau PIN (le 1er vérifie l'ancien).
    for (const w of get().wallets) {
      const vault = await loadVault(w.id);
      if (!vault) continue;
      const m = await decryptSecret(vault, oldPin); // lève WRONG_PIN si faux
      await saveVault(w.id, await encryptSecret(m, newPin));
    }
  },

  revealPhrase: async (unlock) => {
    const { activeWalletId, wallets } = get();
    if (isPrivateKeyWallet(wallets, activeWalletId)) {
      throw new Error('Ce portefeuille a été importé par clé privée : il n’a pas de phrase de récupération.');
    }
    return revealMnemonic(activeWalletId, unlock);
  },

  exportPrivateKey: async (unlock) => {
    const { activeWalletId, wallets, account } = get();
    if (!account) throw new Error('Aucun compte');
    // Wallet clé privée : la clé stockée EST la clé privée. Wallet HD : dérivée du compte actif.
    return isPrivateKeyWallet(wallets, activeWalletId)
      ? normalizeEvmPrivateKey(await revealMnemonic(activeWalletId, unlock))
      : deriveEvmAccount(mnemonicToSeedSync(await revealMnemonic(activeWalletId, unlock)), account.index).privateKey;
  },

  enableBiometric: async (pin) => {
    const id = get().activeWalletId;
    const mnemonic = await revealMnemonic(id, { pin });
    await enableBiometricSeed(id, mnemonic);
  },

  disableBiometric: async () => {
    await disableBiometricSeed(get().activeWalletId);
  },

  healBiometric: async (pin) => {
    const id = get().activeWalletId;
    if (await hasBiometricSeed(id)) return; // déjà au bon format, rien à faire
    // Ancien secret gated illisible sur ce build → on le ré-écrit non-gated via le PIN.
    const mnemonic = await revealMnemonic(id, { pin });
    await enableBiometricSeed(id, mnemonic);
  },

  reset: async () => {
    await wipeAll(get().wallets);
    set({
      hasWallet: false,
      isUnlocked: false,
      wallets: [],
      activeWalletId: 'primary',
      accounts: [],
      activeAccountIndex: 0,
      account: null,
      draftMnemonic: null,
      draftWasImported: false,
    });
  },
}));
