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
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { create } from 'zustand';
import { Wallet, getBytes, isHexString } from 'ethers';
import {
  generateMnemonic,
  validateMnemonic,
  getAdapterV2,
  assertCurve,
  signerFromSeed,
  signerFromEvmPrivateKey,
  withSigner,
  type ChainAdapterV2,
  type ChainSigner,
  type SendRequest,
  type BitcoinPendingContext,
  type FeeSpeed,
  mnemonicToSeedSync,
  deriveEvmAccount,
  evmAccountFromPrivateKey,
  normalizeEvmPrivateKey,
  deriveBtcAccount,
  deriveSolanaAccount,
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
  listChains,
  addressFromRawKey,
  signerFromRawKey,
  parseImportedKey,
  type ChainFamily,
  type KeyFamily,
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
import { kvGet, kvSet, kvDel } from './kv';
import { aura } from './aura';
import { isLegacyDefaultName } from './walletNames';
import { useSettings } from './settingsStore';
import { usePendingBtc } from './pendingBtc';

/** Réseau actif mémorisé entre deux lancements (non sensible). */
const K_ACTIVE_CHAIN = 'kalyx.activeChain';
/**
 * Portefeuille et compte choisis au dernier lancement.
 *
 * Le réseau actif était persisté, ces deux-là non : `bootstrap` reprenait
 * TOUJOURS `wallets[0]` et l'indice 0. Quelqu'un qui travaille sur son second
 * compte retrouvait donc le principal à chaque retour dans l'app, et devait le
 * resélectionner — en permanence.
 */
const K_ACTIVE_WALLET = 'kalyx.activeWallet';
const K_ACTIVE_ACCOUNT = 'kalyx.activeAccount';
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
  /**
   * Frais choisis explicitement.
   *
   * OPTIONNELS depuis le passage à la v2 : le palier (`speed`) suffit, et
   * l'adapter chiffre au moment de préparer — c'est-à-dire juste avant de
   * signer, plutôt qu'avec une valeur lue quand l'écran s'est ouvert. Ce type
   * sert aussi à transporter les compléments d'un paiement, qui n'ont rien à
   * voir avec les frais.
   */
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  speed?: FeeSpeed;
  /**
   * Compléments d'un paiement (Solana Pay) : repères à joindre à la
   * transaction, et texte inscrit on-chain. Sans les repères, un terminal de
   * paiement ne saura jamais que le client a payé.
   */
  references?: string[];
  memo?: string;
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
  /**
   * Importe une clé privée : EVM en hexadécimal, Bitcoin en WIF, Solana en
   * base58 ou en tableau JSON.
   *
   * `family` tranche quand la clé pourrait servir plusieurs chaînes — 32 octets
   * sur secp256k1 valent pour l'EVM et Bitcoin, et sont aussi une graine ed25519.
   * Sans ce choix l'import échoue plutôt que de deviner : trois adresses
   * différentes sortent du même secret, et en choisir une au hasard montrerait un
   * portefeuille vide.
   */
  importPrivateKey: (
    privateKey: string,
    pin: string,
    label?: string,
    family?: KeyFamily,
  ) => Promise<void>;
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
  sendSolToken: (
    to: string,
    amount: string,
    token: { mint: string; decimals: number },
    unlock: Unlock,
    extras?: { references?: string[]; memo?: string },
  ) => Promise<string>;
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
/**
 * Mémorise le portefeuille et le compte actifs.
 *
 * Un seul point de persistance, appelé partout où l'un des deux change. Six
 * endroits écrivaient `activeWalletId` sans rien enregistrer : ajouter la
 * persistance à chacun garantissait qu'un septième l'oublierait.
 */
function rememberActive(walletId: string, accountIndex: number): void {
  kvSet(K_ACTIVE_WALLET, walletId).catch(() => {});
  kvSet(K_ACTIVE_ACCOUNT, String(accountIndex)).catch(() => {});
}

/** Oublie le portefeuille et le compte actifs (remise à zéro complète). */
function forgetActive(): void {
  kvDel(K_ACTIVE_WALLET).catch(() => {});
  kvDel(K_ACTIVE_ACCOUNT).catch(() => {});
}

function isPrivateKeyWallet(wallets: WalletMeta[], id: string): boolean {
  return wallets.find((w) => w.id === id)?.type === 'privateKey';
}

/**
 * Famille servie par un portefeuille importé, ou `null` s'il vient d'une phrase.
 *
 * `keyFamily` absent vaut `'evm'` : c'est la rétro-compatibilité, tous les
 * imports antérieurs à l'ouverture aux autres chaînes étant des clés EVM.
 */
function privateKeyFamily(wallets: WalletMeta[], id: string): KeyFamily | null {
  const w = wallets.find((x) => x.id === id);
  if (w?.type !== 'privateKey') return null;
  return w.keyFamily ?? 'evm';
}

/** Premier réseau non-test d'une famille donnée, pour y basculer. */
function firstChainOfFamily(family: ChainFamily): string {
  return listChains({ includeTestnets: false }).find((c) => c.family === family)?.id ?? DEFAULT_CHAIN;
}

/**
 * Compte d'une clé importée : une seule adresse, celle de sa famille.
 *
 * Les autres champs restent VIDES à dessein. Y mettre l'adresse qu'on pourrait
 * dériver du même secret sur une autre courbe laisserait croire que le
 * portefeuille détient là-bas aussi — alors que l'utilisateur n'a importé qu'une
 * clé, pour un usage.
 */
function storedAccountFromRawKey(family: KeyFamily, secret: Uint8Array): StoredAccount {
  const address = addressFromRawKey(family, secret);
  const base: StoredAccount = { index: 0, label: '', evmAddress: '', btcAddress: '' };
  if (family === 'bitcoin') return { ...base, btcAddress: address };
  if (family === 'solana') return { ...base, solAddress: address };
  return { ...base, evmAddress: address };
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
    /*
     * Portefeuille du dernier lancement, s'il existe ENCORE : il peut avoir été
     * supprimé entre-temps, et repartir sur un identifiant fantôme donnerait un
     * portefeuille vide sans rien expliquer.
     */
    const savedWallet = await kvGet(K_ACTIVE_WALLET).catch(() => null);
    const activeWalletId =
      (savedWallet && wallets.some((w) => w.id === savedWallet) ? savedWallet : wallets[0]?.id) ?? 'primary';
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

    /*
     * Compte du dernier lancement, s'il appartient bien à CE portefeuille. Un
     * indice conservé d'un autre portefeuille, ou d'un compte supprimé depuis,
     * afficherait le solde de quelqu'un d'autre — on retombe alors sur le
     * premier compte.
     */
    const savedIndex = Number(await kvGet(K_ACTIVE_ACCOUNT).catch(() => null));
    const activeAccountIndex = accounts.some((a) => a.index === savedIndex) ? savedIndex : (accounts[0]?.index ?? 0);

    set({
      ready: true,
      hasWallet: wallets.length > 0 && accounts.length > 0,
      isUnlocked: false,
      wallets,
      activeWalletId,
      accounts,
      activeAccountIndex,
      activeChain,
      account: toAccount(accounts, activeAccountIndex, activeChain),
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

  setActiveAccount: (index) => {
    set({ activeAccountIndex: index, account: toAccount(get().accounts, index, get().activeChain) });
    // Persisté, comme le réseau actif : sans cela le choix ne survivait pas à
    // une sortie de l'app.
    rememberActive(get().activeWalletId, index);
  },

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
    rememberActive(id, 0);
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
    rememberActive(id, 0);
  },

  importPrivateKey: async (privateKey, pin, label, family) => {
    /*
     * ANALYSE AVANT TOUTE ÉCRITURE. L'import n'acceptait qu'une clé EVM en
     * hexadécimal : un WIF Bitcoin ou un export Phantom étaient refusés sans
     * explication, alors que ce sont les formes que les utilisateurs ont en main.
     */
    const parsed = parseImportedKey(privateKey);
    if (!parsed.ok) throw new WalletError('INVALID_KEY', `import.${parsed.error}`);

    /*
     * LA FAMILLE NE SE DEVINE PAS quand plusieurs sont possibles : 32 octets sur
     * secp256k1 servent l'EVM et Bitcoin, et sont aussi une graine ed25519. Trois
     * adresses différentes pour un même secret — choisir à la place de
     * l'utilisateur, c'est lui montrer un portefeuille vide.
     */
    const candidates = parsed.key.families;
    const chosen = family ?? (candidates.length === 1 ? candidates[0] : null);
    if (!chosen) throw new WalletError('INVALID_KEY', 'import.FAMILY_REQUIRED');
    if (!candidates.includes(chosen)) throw new WalletError('INVALID_KEY', 'import.FAMILY_UNSUPPORTED');

    /*
     * LE WIF NON COMPRESSÉ N'EST PLUS REFUSÉ, et mon refus précédent était mal
     * raisonné. Le drapeau de compression décrit la forme de clé publique que le
     * propriétaire avait utilisée pour SON adresse ; la clé privée, elle, est la
     * même trente-deux octets, et on en dérive parfaitement une adresse segwit
     * natif valide.
     *
     * Surtout, la distinction ne séparait rien : le détenteur d'un WIF COMPRESSÉ
     * peut tout aussi bien avoir des fonds sur l'adresse héritée de la même clé.
     * Refuser le `5…` écartait la forme que les gens ont le plus souvent en main
     * — portefeuilles papier, anciens exports — pour un risque qui existe dans
     * les deux cas.
     *
     * Ce qui protège vraiment est déjà en place : l'écran AFFICHE l'adresse
     * dérivée avant l'import, et prévient quand la clé vient d'un WIF non
     * compressé.
     */
    await revealMnemonic(get().activeWalletId, { pin }); // vérifie le PIN (un seul PIN d'app)
    const id = newWalletId();
    const accounts = [storedAccountFromRawKey(chosen, parsed.key.secret)];
    /*
     * Le coffre garde le secret en hexadécimal. Le préfixe `0x` est conservé pour
     * l'EVM : c'est la forme que `normalizeEvmPrivateKey` attend et que tous les
     * coffres existants contiennent.
     */
    const stored = chosen === 'evm' ? '0x' + bytesToHex(parsed.key.secret) : bytesToHex(parsed.key.secret);
    await saveVault(id, await encryptSecret(stored, pin));
    await saveAccounts(id, accounts);
    const wallets: WalletMeta[] = [
      ...get().wallets,
      { id, label: label?.trim() || '', type: 'privateKey', keyFamily: chosen },
    ];
    await saveWalletsList(wallets);
    // Le réseau actif doit appartenir à la famille de la clé, sinon le compte
    // n'aurait pas d'adresse à montrer.
    const chain =
      getAdapter(get().activeChain).config.family === chosen ? get().activeChain : firstChainOfFamily(chosen);
    set({
      wallets,
      activeWalletId: id,
      accounts,
      activeAccountIndex: 0,
      activeChain: chain,
      account: toAccount(accounts, 0, chain),
    });
    rememberActive(id, 0);
  },

  setActiveWallet: async (id) => {
    const accounts = (await loadAccounts(id)) ?? [];
    /*
     * Un portefeuille importé ne sert QU'UNE famille : si le réseau affiché n'en
     * fait pas partie, le compte n'aurait aucune adresse à montrer. On bascule
     * donc sur un réseau de la bonne famille — et non sur l'EVM par défaut, ce
     * qui aurait présenté une adresse vide pour une clé Bitcoin ou Solana.
     */
    const pkFamily = privateKeyFamily(get().wallets, id);
    const chain =
      pkFamily && getAdapter(get().activeChain).config.family !== pkFamily
        ? firstChainOfFamily(pkFamily)
        : get().activeChain;
    set({ activeWalletId: id, accounts, activeAccountIndex: 0, activeChain: chain, account: toAccount(accounts, 0, chain) });
    /*
     * Changer de portefeuille remet le compte à zéro : laisser l'ancien indice
     * ferait rouvrir l'app sur un compte qui n'existe peut-être pas ici.
     */
    rememberActive(id, 0);
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
      // Le portefeuille mémorisé vient d'être supprimé : on enregistre le suivant.
      rememberActive(nextId, 0);
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
      references: gas?.references,
      memo: gas?.memo,
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
    const pkFamily = privateKeyFamily(wallets, activeWalletId);
    if (pkFamily) {
      /*
       * Une clé importée sert SA famille et rien d'autre. Le refus nomme les deux
       * familles : « Solana non disponible » sans dire ce que le portefeuille sait
       * faire n'apprend rien à celui qui vient d'importer un WIF.
       */
      if (family !== pkFamily) {
        throw new WalletError('NOT_SUPPORTED', `import.WRONG_FAMILY:${pkFamily}:${family}`);
      }
      if (pkFamily === 'evm') {
        return signerFromEvmPrivateKey(
          await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock),
        );
      }
      /*
       * Clé BRUTE, sans dérivation. Appliquer BIP-84 ou SLIP-0010 à un secret qui
       * EST déjà la clé produirait une autre clé, donc une autre adresse que celle
       * affichée à l'import.
       */
      const raw = (await revealMnemonic(activeWalletId, unlock)).replace(/^0x/i, '');
      const secret = hexToBytes(raw);
      try {
        return signerFromRawKey(pkFamily, secret);
      } finally {
        secret.fill(0);
      }
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
    const { account } = get();
    if (!account) throw new Error('Aucun compte');
    /*
     * Dérivation par le chemin unique, donc clé EFFACÉE après usage. Elle était
     * tirée à la main ici et restait vivante jusqu'au ramasse-miettes — sur un
     * chemin appelé par n'importe quelle dApp connectée.
     */
    const signer = await get().deriveSigner(getAdapterV2('solana'), unlock);
    assertCurve(signer, 'ed25519');

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

    /*
     * `withSigner` efface la clé après la signature, y compris si `tx.sign`
     * lève — et c'est le chemin d'erreur qui compte, une dApp pouvant envoyer
     * une transaction malformée.
     */
    const serialized = await withSigner(signer, async (sk) => {
      assertCurve(sk, 'ed25519');
      tx.sign([Keypair.fromSeed(sk.secretKey)]);
      return tx.serialize();
    });
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
    const { account } = get();
    if (!account) throw new Error('Aucun compte');
    const signer = await get().deriveSigner(getAdapterV2('solana'), unlock);
    assertCurve(signer, 'ed25519');
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
    const signature = await withSigner(signer, async (sk) => {
      assertCurve(sk, 'ed25519');
      return ed25519.sign(msgBytes, sk.secretKey);
    });
    return { signature: base58.encode(signature) };
  },

  signBitcoinMessage: async (unlock, message, type = 'ecdsa') => {
    const { account } = get();
    if (!account) throw new Error('Aucun compte');

    /*
     * Passe par l'adapter v2 et par `withSigner` : la clé est effacée après la
     * signature, succès ou échec. Elle restait auparavant vivante jusqu'au
     * ramasse-miettes, alors qu'elle n'avait plus aucune raison d'exister.
     *
     * Spec WalletConnect Bitcoin : `message` est du TEXTE (UTF-8). Aucune
     * heuristique hex/base64 — « test » est un message, pas un encodage.
     */
    const adapter = getAdapterV2('bitcoin');
    if (!adapter.signMessage) throw new Error('Signature de message indisponible sur Bitcoin');
    const signer = await get().deriveSigner(adapter, unlock);
    return withSigner(signer, (sk) => adapter.signMessage!(message, sk, type === 'ecdsa' ? 'bip137' : 'bip322'));
  },

  signBitcoinPsbt: async (unlock, psbtBase64, options) => {
    const { account } = get();
    if (!account) throw new Error('Aucun compte');
    const signer = await get().deriveSigner(getAdapterV2('bitcoin'), unlock);
    assertCurve(signer, 'secp256k1');

    const btc = await import('@scure/btc-signer');
    let psbtBytes: Uint8Array;
    if (psbtBase64.toLowerCase().startsWith('70736274')) {
      psbtBytes = hex.decode(psbtBase64);
    } else {
      psbtBytes = base64.decode(psbtBase64);
    }
    const tx = btc.Transaction.fromPSBT(psbtBytes);

    // Clé effacée après la signature, y compris si le PSBT est malformé — et
    // il vient d'une dApp, donc il peut l'être.
    await withSigner(signer, async (sk) => {
      assertCurve(sk, 'secp256k1');
      if (options?.signInputs && options.signInputs.length > 0) {
        for (const idx of options.signInputs) {
          tx.signIdx(sk.privateKey, idx);
        }
      } else {
        tx.sign(sk.privateKey);
      }
    });

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
        references: gas?.references,
        memo: gas?.memo,
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
  sendSolToken: async (to, amount, token, unlock, extras) => {
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
        references: extras?.references,
        memo: extras?.memo,
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
    const pkFamily = privateKeyFamily(wallets, activeWalletId);
    if (pkFamily) {
      const secret = await revealMnemonic(activeWalletId, unlock);
      /*
       * On rend le secret TEL QU'IL EST STOCKÉ pour une clé non EVM : le
       * normaliser en clé EVM y ajouterait un `0x` et laisserait croire à une clé
       * Ethereum, alors que c'est une clé Bitcoin ou Solana.
       */
      return pkFamily === 'evm' ? normalizeEvmPrivateKey(secret) : secret.replace(/^0x/i, '');
    }
    return deriveEvmAccount(mnemonicToSeedSync(await revealMnemonic(activeWalletId, unlock)), account.index).privateKey;
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
    // Le portefeuille et le compte mémorisés n'ont plus d'objet : les laisser
    // ferait chercher, au prochain lancement, un identifiant qui n'existe plus.
    forgetActive();
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
