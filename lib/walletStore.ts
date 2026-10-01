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
import { Address as TonCoreAddress, Cell as TonCell } from '@ton/core';
import { solanaTxDecode } from '../src/domain/wc/solanaTx';
import { formatExportedKey } from '../src/domain/keys/exportKey';
import { deriveBtcSigner, deriveSolanaSigner, discoverAccountIndexes, parseWatchAddress } from '../src';
import { base64, base58, hex } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { create } from 'zustand';
import { Wallet, getBytes, isHexString } from 'ethers';
import {
  generateMnemonic,
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
  type EncryptedVault,
  assertValidPin,
  lockRemainingMs,
  isWalletError,
  WalletError,
  checkSwapQuote,
  verifyTonSwap,
  tonNeededForMessages,
  STONFI_TON_RESERVE,
  formatInputAmount,
  TonAdapterV2,
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
  type BackupWallet,
  classifyRecoveryPhrase,
  resolveTonKey,
  tonPublicKeyFromPhrase,
  TON_DEFAULT_WALLET_VERSION,
  TON_BIP39_PATH,
  type RecoveryPhraseKind,
  type ChainConfig,
} from '../src';
import { technicalLogger } from './technicalLogger';
import { addressForChain } from './accountAddress';
import { buildAddressIndex, lookupAddress } from './isMyAddress';
import {
  saveVault,
  loadVault,
  hasVault,
  saveAccounts,
  loadAccounts,
  enableBiometricSeed,
  disableBiometricSeed,
  readBiometricSeed,
  readLegacyBiometricSeed,
  isBiometricSeedGated,
  hasBiometricSeed,
  saveWalletsList,
  loadWalletsList,
  saveLockState,
  loadLockState,
  savePinChangeJournal,
  clearPinChangeJournal,
  rollbackPinChange,
  wipeWallet,
  wipeAll,
  type StoredAccount,
  type WalletMeta,
} from './secureStore';
import { randomAvatarId } from './avatars';
import { authenticate, biometricPrompt } from './biometrics';
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
  /** Échéance d'une facture (TON Pay), en secondes Unix : la chaîne refusera le paiement au-delà. */
  expiresAt?: number;
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
  /**
   * Avant de CONNECTER le compte actif à un site ou une dApp : identité prouvée,
   * et refus (WATCH_ONLY) pour une adresse suivie — elle n'appartient pas à l'utilisateur.
   */
  verifyConnect: (unlock: Unlock) => Promise<void>;
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
  /**
   * TOUS les portefeuilles, pour une sauvegarde.
   *
   * La sauvegarde n'emportait que la phrase du portefeuille ACTIF : trois
   * portefeuilles créés, un seul sauvegardé, et la restauration réussissait — donc
   * rien n'avertissait de la perte des deux autres. C'est le pire genre de
   * sauvegarde, celle qui donne confiance et ne tient pas.
   *
   * Les secrets ne vivent que le temps de l'appel : l'appelant les chiffre
   * immédiatement et ne les garde pas.
   */
  exportAllWallets: (unlock: Unlock) => Promise<BackupWallet[]>;
  /**
   * Restaure plusieurs portefeuilles d'un coup.
   *
   * Les portefeuilles DÉJÀ présents sont ignorés, comparés par leur secret : une
   * restauration par-dessus une installation existante ne doit pas créer de
   * doublons, et l'utilisateur ne peut pas les distinguer une fois créés.
   */
  importWallets: (wallets: readonly BackupWallet[], pin: string) => Promise<number>;
  /** Recrée les comptes (numéro + nom) d'une sauvegarde pour un portefeuille à phrase BIP-39. */
  restoreAccounts: (walletId: string, accounts: readonly { index: number; label: string }[], pin: string) => Promise<void>;
  /**
   * RECHERCHE DES COMPTES d'une phrase BIP-39 : comptes 1, 2, 3… qui ont déjà
   * servi (accountDiscovery), ajoutés au portefeuille. La phrase n'est lue que
   * le temps de calculer les adresses publiques ; la recherche réseau se fait
   * SANS elle. Rend les indices ajoutés et ceux qui n'ont pas pu être vérifiés.
   */
  discoverAccounts: (
    walletId: string,
    unlock: Unlock,
    opts?: { onProgress?: (index: number) => void; /** Phrase lue (code bon) : la suite est réseau seulement. */ onUnlocked?: () => void },
  ) => Promise<{ added: number[]; uncertain: number[] }>;
  /**
   * Ajoute un portefeuille EN LECTURE SEULE : une adresse suivie (EVM,
   * Bitcoin, Solana), sans clé. Lève INVALID_WATCH_ADDRESS (message
   * `watch.<raison>`) ou WALLET_ALREADY_EXISTS si l'adresse est déjà là.
   */
  addWatchWallet: (address: string, label?: string) => Promise<void>;
  setActiveWallet: (id: string) => Promise<void>;
  renameWallet: (id: string, label: string) => Promise<void>;
  /** Change l'avatar de profil d'un portefeuille (lib/avatars.ts). */
  setWalletAvatar: (id: string, avatar: string) => Promise<void>;
  /** Exige le code (ou la biométrie) : supprimer un portefeuille est irréversible sans sa phrase. */
  removeWallet: (id: string, unlock: Unlock) => Promise<void>;
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
  /** `expectedChainId` : réseau de la demande ; un `domain.chainId` différent est refusé (rejeu sur un autre réseau). */
  signTypedData: (unlock: Unlock, typedData: { domain: unknown; types: Record<string, unknown>; message: unknown }, expectedChainId?: number) => Promise<string>;
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
  /** Envoie un jetton TON (TEP-74) : message à notre portefeuille de jeton, commentaire compris. */
  sendJetton: (to: string, amount: string, token: { master: string; decimals: number }, unlock: Unlock, extras?: { memo?: string; expiresAt?: number }) => Promise<string>;
  changePin: (oldPin: string, newPin: string) => Promise<void>;
  revealPhrase: (unlock: Unlock) => Promise<string>;
  /** Révèle la clé privée EVM d'un wallet importé par clé privée. */
  exportPrivateKey: (unlock: Unlock) => Promise<string>;
  enableBiometric: (pin: string) => Promise<void>;
  disableBiometric: () => Promise<void>;
  /** Ré-enregistre le secret biométrique au format non-gated s'il manque (migration douce). */
  healBiometric: (pin: string) => Promise<void>;
  /** Efface TOUS les portefeuilles : exige le code (ou la biométrie), comme toute action irréversible. */
  reset: (unlock: Unlock) => Promise<void>;
}

/**
 * Comptes PUBLICS (adresses EVM, Bitcoin, Solana) des indices demandés, graine
 * calculée UNE fois et effacée aussitôt. Sans TON : seul le compte 0 en a un.
 */
function deriveStoredAccounts(mnemonic: string, indexes: number[]): StoredAccount[] {
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    return indexes.map((index) => ({
      index,
      label: '',
      evmAddress: deriveEvmAccount(seed, index).address,
      btcAddress: deriveBtcAccount(seed, index).address,
      solAddress: deriveSolanaAccount(seed, index).address,
    }));
  } finally {
    seed.fill(0);
  }
}

function deriveStoredAccount(mnemonic: string, index: number, label: string): StoredAccount {
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    return {
      index,
      label,
      evmAddress: deriveEvmAccount(seed, index).address,
      btcAddress: deriveBtcAccount(seed, index).address,
      solAddress: deriveSolanaAccount(seed, index).address,
      ...(index === 0 ? tonFields(mnemonic, seed) : {}),
    };
  } finally {
    seed.fill(0);
  }
}

/**
 * Clé publique TON d'une phrase, pour le compte 0 SEULEMENT : Tonkeeper ne
 * dérive qu'une clé TON par phrase, et c'est celle-là qu'on garantit identique.
 *
 * Jamais bloquant : TON est une famille ajoutée, et un échec ici ne doit ni
 * empêcher de créer un portefeuille ni de le déverrouiller. Le champ restera
 * vide, et sera retenté au déverrouillage suivant.
 */
function tonFields(mnemonic: string, bip39Seed?: Uint8Array): Pick<StoredAccount, 'tonPublicKey' | 'tonVersion'> {
  try {
    return { tonPublicKey: bytesToHex(tonPublicKeyFromPhrase(mnemonic, bip39Seed)), tonVersion: TON_DEFAULT_WALLET_VERSION };
  } catch (e) {
    // Jamais bloquant, mais plus jamais muet : un TON absent de Recevoir sans
    // trace dans le journal ne se diagnostique pas.
    technicalLogger.logSys('TON: public key derivation failed', { error: e instanceof Error ? e.message : String(e) });
    return {};
  }
}

/**
 * Rattrapage des AUTRES portefeuilles à phrase BIP-39, après un déverrouillage.
 *
 * Le rattrapage ne visait que le portefeuille actif : basculer ensuite sur un
 * autre chargeait ses comptes depuis le stockage, SANS clé TON — et TON Testnet
 * disparaissait de Recevoir. Le secret de chaque coffre est lu avec le même
 * code (ou le secret biométrique déjà autorisé), en arrière-plan : ce travail
 * ne doit ni retarder ni faire échouer le déverrouillage.
 */
async function backfillOtherWallets(wallets: WalletMeta[], activeId: string, readSecret: (id: string) => Promise<string | null>): Promise<void> {
  for (const w of wallets) {
    if (w.id === activeId || !isBip39Wallet(wallets, w.id)) continue;
    try {
      const accounts = await loadAccounts(w.id);
      if (!accounts?.length || accounts.every((a) => a.solAddress && (a.index !== 0 || a.tonPublicKey))) continue;
      const secret = await readSecret(w.id);
      if (secret) await backfillPhraseAccounts(w.id, secret, accounts);
    } catch (e) {
      technicalLogger.logSys('Backfill of another wallet failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }
}

/** Comptes initiaux d'un portefeuille ouvert par une phrase, selon sa sorte. */
function accountsForPhrase(mnemonic: string, kind: RecoveryPhraseKind): StoredAccount[] {
  if (kind === 'ton') {
    /*
     * Phrase TON : une seule clé, un seul compte, et AUCUNE adresse hors TON. Pas
     * de dérivation BIP-39 de cette phrase : elle donnerait des adresses qu'aucun
     * autre portefeuille ne montre pour elle.
     */
    return [{ index: 0, label: '', evmAddress: '', btcAddress: '', ...tonFields(mnemonic) }];
  }
  return [deriveStoredAccount(mnemonic, 0, '')];
}

/** Un réseau TON est-il configuré ? C'est la seule condition pour ouvrir une phrase TON. */
function tonAvailable(): boolean {
  return listChains({ includeTestnets: true }).some((c) => c.family === 'ton');
}

/**
 * Sorte d'une phrase à importer — ou le refus, TRADUIT par code.
 *
 * Une phrase Tonkeeper n'est plus « invalide » : elle est reconnue. Tant qu'aucun
 * réseau TON n'est configuré, on le DIT (`import.TON_NOT_YET`) au lieu de créer un
 * portefeuille qui n'aurait rien à montrer. Dès qu'une configuration TON est
 * enregistrée, l'import fonctionne, sans interrupteur séparé qu'on oublierait.
 *
 * Exportée pour que les écrans vérifient AVANT de demander le PIN, avec la même
 * règle que le magasin — deux règles finiraient par diverger.
 */
export function phraseKindForImport(mnemonic: string): RecoveryPhraseKind {
  const kind = classifyRecoveryPhrase(mnemonic);
  if (!kind) throw new WalletError('INVALID_MNEMONIC', 'Invalid recovery phrase');
  if (kind === 'ton' && !tonAvailable()) throw new WalletError('NOT_SUPPORTED', 'import.TON_NOT_YET');
  return kind;
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

/** Portefeuille en lecture seule : une adresse suivie, sans coffre ni clé. */
function isWatchWallet(wallets: WalletMeta[], id: string): boolean {
  return wallets.find((w) => w.id === id)?.type === 'watch';
}

/**
 * Coffre qui PROUVE l'identité (code ou biométrie). Tous les coffres partagent
 * le même code ; un portefeuille en lecture seule n'en a pas : la preuve passe
 * alors par le premier portefeuille qui en a un. Jamais pour SIGNER — le
 * secret obtenu n'appartient pas au portefeuille affiché.
 */
function authWalletId(wallets: WalletMeta[], activeId: string): string {
  if (!isWatchWallet(wallets, activeId)) return activeId;
  return wallets.find((w) => w.type !== 'watch')?.id ?? activeId;
}

/** Index de TOUTES les adresses des portefeuilles (lecture parallèle des comptes). */
async function addressIndexOf(wallets: WalletMeta[]) {
  const st = useWallet.getState();
  const list = await Promise.all(
    wallets.map(async (w) => ({ walletId: w.id, accounts: (w.id === st.activeWalletId ? st.accounts : await loadAccounts(w.id)) ?? [] })),
  );
  return buildAddressIndex(list);
}

/**
 * Une adresse SUIVIE dont on vient d'importer la clé (phrase ou clé privée)
 * n'a plus lieu d'être : elle ferait compter deux fois les mêmes fonds, l'une
 * « en lecture seule », l'autre avec clé. Elle est retirée.
 */
async function dropSupersededWatch(newAccounts: StoredAccount[]): Promise<void> {
  const st = useWallet.getState();
  const mine = buildAddressIndex([{ walletId: '_new', accounts: newAccounts }]);
  const gone = st.wallets.filter((w) => w.type === 'watch' && w.watchAddress && lookupAddress(mine, w.watchAddress));
  if (!gone.length) return;
  /*
   * Aucune session à couper : une adresse suivie ne se connecte à rien
   * (verifyConnect). Appelée APRÈS un import déjà enregistré : un échec ici ne
   * doit pas faire croire que l'import a échoué (on retenterait, en double).
   */
  try {
    const wallets = useWallet.getState().wallets.filter((w) => !gone.some((g) => g.id === w.id));
    await saveWalletsList(wallets);
    useWallet.setState({ wallets });
    for (const w of gone) await wipeWallet(w.id).catch(() => {});
  } catch {
    /* liste inchangée : l'adresse suivie reste, sans conséquence pour l'import */
  }
}

/**
 * Coffre à utiliser pour CE mode de preuve. Biométrie : la copie protégée est
 * rangée par portefeuille — si l'actif est une lecture seule, on prend un
 * portefeuille à clé qui EN A une (sinon le premier, et l'échec renverra au code).
 */
async function authWalletFor(unlock: Unlock): Promise<string> {
  const { wallets, activeWalletId } = useWallet.getState();
  const id = authWalletId(wallets, activeWalletId);
  if (!('biometric' in unlock) || id === activeWalletId) return id;
  for (const w of wallets) {
    if (w.type === 'watch') continue;
    if (await hasBiometricSeed(w.id)) return w.id; // protégée ou ancienne copie
  }
  return id;
}

/** Prouve l'identité (code ou biométrie) sans rien signer : le secret lu est aussitôt jeté. */
async function proveIdentity(unlock: Unlock): Promise<void> {
  await revealMnemonic(await authWalletFor(unlock), unlock);
}

function isPrivateKeyWallet(wallets: WalletMeta[], id: string): boolean {
  return wallets.find((w) => w.id === id)?.type === 'privateKey';
}

/**
 * Portefeuille ouvert par une phrase BIP-39 — le SEUL qui dérive des comptes HD
 * multi-chaînes. Type absent = `'seed'` (rétro-compatibilité).
 *
 * À utiliser partout où l'on s'apprête à passer le secret dans
 * `mnemonicToSeedSync`. Tester « pas une clé privée » ne suffit plus : une phrase
 * TON n'est pas une clé privée, et n'est pas une phrase BIP-39 non plus.
 */
function isBip39Wallet(wallets: WalletMeta[], id: string): boolean {
  const t = wallets.find((w) => w.id === id)?.type;
  return t === undefined || t === 'seed';
}

/** Le portefeuille ne sert-il QU'UNE famille ? Laquelle — ou `null` s'il est multi-chaînes. */
function walletFamily(wallets: WalletMeta[], id: string): ChainFamily | null {
  const w = wallets.find((x) => x.id === id);
  if (w?.type === 'tonPhrase') return 'ton';
  if (w?.type === 'privateKey' || w?.type === 'watch') return w.keyFamily ?? 'evm';
  return null;
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
  // Réseau principal d'abord ; à défaut un réseau de test de la famille (TON se
  // développe sur son réseau de test avant d'avoir une configuration principale).
  return (
    listChains({ includeTestnets: false }).find((c) => c.family === family)?.id ??
    listChains({ includeTestnets: true }).find((c) => c.family === family)?.id ??
    DEFAULT_CHAIN
  );
}

/**
 * Compte d'une clé importée : une seule adresse, celle de sa famille.
 *
 * Les autres champs restent VIDES à dessein. Y mettre l'adresse qu'on pourrait
 * dériver du même secret sur une autre courbe laisserait croire que le
 * portefeuille détient là-bas aussi — alors que l'utilisateur n'a importé qu'une
 * clé, pour un usage.
 */
/** Compte unique d'un portefeuille d'UNE famille (clé importée, adresse suivie). */
function storedAccountForAddress(family: KeyFamily, address: string): StoredAccount {
  const base: StoredAccount = { index: 0, label: '', evmAddress: '', btcAddress: '' };
  if (family === 'bitcoin') return { ...base, btcAddress: address };
  if (family === 'solana') return { ...base, solAddress: address };
  return { ...base, evmAddress: address };
}

function storedAccountFromRawKey(family: KeyFamily, secret: Uint8Array): StoredAccount {
  return storedAccountForAddress(family, addressFromRawKey(family, secret));
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
  if (walletFamily(wallets, activeWalletId) === 'ton') {
    throw new WalletError('NOT_SUPPORTED', 'import.WRONG_FAMILY:ton:evm');
  }
  const secret = await revealMnemonic(activeWalletId, unlock);
  if (isPrivateKeyWallet(wallets, activeWalletId)) return normalizeEvmPrivateKey(secret);
  const seed = mnemonicToSeedSync(secret);
  try {
    return deriveEvmAccount(seed, accountIndex).privateKey;
  } finally {
    seed.fill(0); // graine effacée : elle servait à chaque signature EVM et restait en mémoire
  }
}

/**
 * Configuration d'un réseau, SANS instancier d'adaptateur.
 *
 * `toAccount` et `setActiveWallet` n'ont besoin que de la famille et du drapeau
 * « réseau de test ». Passer par `getAdapter` exigeait un adaptateur v1 pour
 * chaque famille — TON n'en a pas, et ouvrir une phrase TON aurait planté ici.
 * Même message qu'avant pour un réseau inconnu.
 */
function chainConfig(chainId: string): ChainConfig {
  const config = listChains({ includeTestnets: true }).find((c) => c.id === chainId);
  if (!config) throw new Error(`Chaîne inconnue: ${chainId}`);
  return config;
}

function toAccount(accounts: StoredAccount[], activeIndex: number, chainId: string): Account | null {
  const a = accounts.find((x) => x.index === activeIndex) ?? accounts[0];
  if (!a) return null;
  const config = chainConfig(chainId);
  const family = config.family;
  const address = addressForChain(a, config);
  const path = family === 'ton' ? TON_BIP39_PATH : family === 'bitcoin' ? btcPath(a.index) : family === 'solana' ? solPath(a.index) : evmPath(a.index);
  return { chain: chainId, address, index: a.index, path };
}

/**
 * Rétro-compat : les comptes créés avant l'ajout de Solana n'ont pas de
 * `solAddress`, ceux d'avant TON pas de `tonPublicKey` (compte 0 seulement). On
 * les complète dès qu'on dispose de la phrase (au déverrouillage), en calculant
 * la graine UNE fois pour les deux, puis on persiste. Sans effet si tout est
 * déjà rempli.
 *
 * Réservé aux portefeuilles BIP-39 : l'appelant le vérifie (`isBip39Wallet`).
 */
async function backfillPhraseAccounts(
  walletId: string,
  mnemonic: string,
  accounts: StoredAccount[],
): Promise<StoredAccount[]> {
  const updated = await backfillPhraseAccountsRaw(walletId, mnemonic, accounts);
  // Adresses complétées (Solana, TON) : une lecture seule qui les suivait n'a plus lieu d'être.
  if (updated !== accounts) await dropSupersededWatch(updated);
  return updated;
}

async function backfillPhraseAccountsRaw(
  walletId: string,
  mnemonic: string,
  accounts: StoredAccount[],
): Promise<StoredAccount[]> {
  const needSol = accounts.some((a) => !a.solAddress);
  const needTon = accounts.some((a) => a.index === 0 && !a.tonPublicKey);
  if (accounts.length === 0 || (!needSol && !needTon)) return accounts;
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    const ton = needTon ? tonFields(mnemonic, seed) : {};
    const updated = accounts.map((a) => ({
      ...a,
      ...(a.solAddress ? {} : { solAddress: deriveSolanaAccount(seed, a.index).address }),
      ...(a.index === 0 && !a.tonPublicKey ? ton : {}),
    }));
    await saveAccounts(walletId, updated);
    return updated;
  } finally {
    seed.fill(0);
  }
}

/** Révèle la seed du wallet `id` (biométrie ou PIN), de façon transitoire. */
async function revealMnemonic(id: string, unlock: Unlock): Promise<string> {
  // Lecture seule : aucune clé. Dernier rempart, quel que soit l'écran qui demande à signer.
  if (isWatchWallet(useWallet.getState().wallets, id)) {
    throw new WalletError('WATCH_ONLY', 'Portefeuille en lecture seule : rien ne peut être signé.');
  }
  console.log('[KALYX-VAULT] reveal:start', { walletId: id, mode: 'biometric' in unlock ? 'biometric' : 'pin' });
  if ('biometric' in unlock) {
    /*
     * Copie PROTÉGÉE par l'OS : c'est la lecture elle-même qui affiche l'invite
     * (une seule). Annulée → repli sur le PIN ; clé invalidée → idem, et la copie
     * sera réécrite au prochain PIN (`healBiometric`).
     */
    if (await isBiometricSeedGated(id)) {
      let m: string | null;
      try {
        m = await readBiometricSeed(id, biometricPrompt());
      } catch (e) {
        console.log('[KALYX-VAULT] reveal:biometric-gated-refused', { error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' });
        throw new WalletError('BIOMETRIC_REFUSED', 'Biometric request refused');
      }
      console.log('[KALYX-VAULT] reveal:biometric-gated', { found: !!m });
      if (!m) throw new WalletError('BIOMETRIC_NOT_SET', 'Biometric key invalidated for this wallet');
      return m;
    }
    // Ancienne copie en clair : invite de l'app, PUIS lecture (migrée ensuite, cf. unlockWithBiometrics).
    const ok = await authenticate();
    /*
     * Codes typés et non messages : l'interface testait
     * `e.message.includes('refusée')`, donc elle matchait des chaînes
     * FRANÇAISES. Traduire ou reformuler ces messages aurait cassé en silence
     * le repli sur le PIN — l'utilisateur se serait retrouvé bloqué sans erreur
     * visible. C'est précisément ce que les codes du domaine existent pour
     * éviter (cf. src/domain/errors.ts).
     */
    console.log('[KALYX-VAULT] reveal:biometric-prompt', { ok });
    if (!ok) throw new WalletError('BIOMETRIC_REFUSED', 'Biometric request refused');
    const m = await readLegacyBiometricSeed(id);
    console.log('[KALYX-VAULT] reveal:biometric-secret', { found: !!m });
    if (!m) throw new WalletError('BIOMETRIC_NOT_SET', 'No biometric vault for this wallet');
    return m;
  }
  const vault = await loadVault(id);
  if (!vault) throw new Error('Aucun coffre');
  /*
   * LE COMPTEUR DE TENTATIVES EST ICI, pas seulement sur l'écran de
   * déverrouillage. Toutes les confirmations par PIN passent par cette fonction
   * — envoyer, signer, RÉVÉLER LA PHRASE, exporter la clé — et elles
   * déchiffraient sans compter ni respecter le blocage : avec le téléphone
   * déverrouillé entre les mains, on pouvait essayer les codes un par un sur
   * « Révéler la phrase » sans jamais être arrêté.
   */
  const st = useWallet.getState();
  if (lockRemainingMs(st.failedAttempts, st.lastFailedAt, Date.now()) > 0) {
    throw new WalletError('LOCKED_OUT', 'Trop de tentatives. Réessaie plus tard.');
  }
  /*
   * La tentative est ÉCRITE comme ratée AVANT la vérification (~1 s de
   * scrypt), et effacée seulement si le code est bon. Enregistrée après, elle
   * se perdait si l'app était tuée pendant ce temps, ou avant la fin de
   * l'écriture : un essai gratuit à chaque relance.
   */
  await saveLockState(st.failedAttempts + 1, Date.now());
  console.log('[KALYX-VAULT] reveal:pin-decrypt', { failedAttempts: st.failedAttempts });
  try {
    const secret = await decryptSecret(vault, unlock.pin);
    console.log('[KALYX-VAULT] reveal:pin-ok');
    useWallet.setState({ failedAttempts: 0, lastFailedAt: 0 });
    await saveLockState(0, 0);
    return secret;
  } catch (e) {
    if (isWalletError(e) && e.code === 'WRONG_PIN') {
      const failedAttempts = useWallet.getState().failedAttempts + 1;
      const lastFailedAt = Date.now();
      useWallet.setState({ failedAttempts, lastFailedAt });
      await saveLockState(failedAttempts, lastFailedAt); // survit au redémarrage
    } else {
      // Pas une erreur de code (coffre illisible…) : la tentative n'en était pas une.
      await saveLockState(st.failedAttempts, st.lastFailedAt).catch(() => {});
    }
    throw e;
  }
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
    // Changement de PIN interrompu (app tuée pendant l'écriture) : tout revient à l'ancien PIN.
    if (await rollbackPinChange()) console.log('[KALYX-VAULT] init:pin-change-rolled-back');
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
    // Portefeuilles d'avant les avatars : chacun reçoit le sien, tiré au hasard, une fois.
    if (wallets.some((w) => !w.avatar)) {
      wallets = wallets.map((w) => (w.avatar ? w : { ...w, avatar: randomAvatarId() }));
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
    const restoredChain = savedChain && hasChain(savedChain) ? savedChain : get().activeChain;
    /*
     * Un portefeuille d'UNE famille (clé importée, phrase TON, adresse suivie)
     * rouvert sur un réseau d'une autre famille n'aurait aucune adresse à
     * montrer : on le ramène sur un réseau de sa famille.
     */
    const onlyFamily = walletFamily(wallets, activeWalletId);
    const activeChain = onlyFamily && chainConfig(restoredChain).family !== onlyFamily ? firstChainOfFamily(onlyFamily) : restoredChain;

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
    phraseKindForImport(m); // refus traduit : phrase invalide, ou TON pas encore disponible
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
    const kind = phraseKindForImport(m);
    const accounts = accountsForPhrase(m, kind);
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
    /*
     * L'OS demande le geste pour écrire la copie protégée : refusé, le
     * portefeuille est quand même créé, simplement sans biométrie (activable
     * plus tard dans les réglages).
     */
    let biometricOn = !!opts?.enableBiometric;
    if (biometricOn) {
      try {
        await enableBiometricSeed(id, m, biometricPrompt());
      } catch {
        biometricOn = false;
        await disableBiometricSeed(id).catch(() => {});
      }
    } else await disableBiometricSeed(id).catch(() => {});
    useSettings.getState().setBiometricEnabled(biometricOn);
    const wallets: WalletMeta[] = [{ id, label: '', avatar: randomAvatarId(), ...(kind === 'ton' ? { type: 'tonPhrase' as const } : {}) }];
    await saveWalletsList(wallets);
    // Une phrase TON n'a d'adresse que sur TON : on ouvre directement sur ce réseau.
    const chain = kind === 'ton' ? firstChainOfFamily('ton') : get().activeChain;
    set({
      wallets,
      activeWalletId: id,
      accounts,
      activeAccountIndex: 0,
      activeChain: chain,
      account: toAccount(accounts, 0, chain),
      hasWallet: true,
      isUnlocked: true,
      draftMnemonic: null,
      draftWasImported: false,
    });
  },

  unlockWithPin: async (pin) => {
    const { failedAttempts, lastFailedAt, activeWalletId } = get();
    if (lockRemainingMs(failedAttempts, lastFailedAt, Date.now()) > 0) {
      throw new WalletError('LOCKED_OUT', 'Trop de tentatives. Réessaie plus tard.');
    }
    try {
      const authId = authWalletId(get().wallets, activeWalletId);
      const secret = await revealMnemonic(authId, { pin });
      // Seule une phrase BIP-39 dérive des comptes : ni une clé privée, ni une
      // phrase TON ne passent par le rattrapage (qui ferait une dérivation BIP-39).
      const accounts = authId === activeWalletId && isBip39Wallet(get().wallets, activeWalletId)
        ? await backfillPhraseAccounts(activeWalletId, secret, get().accounts)
        : get().accounts;
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
      void backfillOtherWallets(get().wallets, activeWalletId, async (id) => {
        const vault = await loadVault(id);
        return vault ? decryptSecret(vault, pin) : null;
      });
    } catch (e) {
      // Tentative ratée déjà comptée par `revealMnemonic`.
      throw e;
    }
  },

  unlockWithBiometrics: async () => {
    const { activeWalletId } = get();
    console.log('[KALYX-VAULT] unlockWithBiometrics:start');
    const authId = await authWalletFor({ biometric: true });
    const legacy = !(await isBiometricSeedGated(authId));
    const secret = await revealMnemonic(authId, { biometric: true });
    /*
     * MIGRATION de l'ancienne copie en clair vers la copie protégée par l'OS,
     * juste après un geste réussi. Le système redemande le geste pour chiffrer ;
     * refusé, l'ancienne copie reste et la migration sera retentée.
     */
    if (legacy) void enableBiometricSeed(authId, secret, biometricPrompt()).catch(() => {});
    const accounts = authId === activeWalletId && isBip39Wallet(get().wallets, activeWalletId)
      ? await backfillPhraseAccounts(activeWalletId, secret, get().accounts)
      : get().accounts;
    set({
      isUnlocked: true,
      accounts,
      account: toAccount(accounts, get().activeAccountIndex, get().activeChain),
    });
    // §3.5 : la fenêtre biométrique appartient au système et ne peut pas être
    // animée. La continuité se joue au TIMING — l'impulsion part à l'instant
    // où l'OS rend la main, sans coupure visible entre lui et Kalyx.
    aura.pulse('unlock');
    // Secrets biométriques des autres portefeuilles, déjà autorisés par ce geste.
    // Sans invite : seules les anciennes copies se lisent ainsi ; les autres attendront le PIN.
    void backfillOtherWallets(get().wallets, activeWalletId, (id) => readLegacyBiometricSeed(id));
  },

  verifyPin: async (pin) => {
    // Déchiffre le coffre à la volée : réussit = PIN correct, sinon WRONG_PIN.
    await proveIdentity({ pin });
  },

  verifyConnect: async (unlock) => {
    if (isWatchWallet(get().wallets, get().activeWalletId)) {
      throw new WalletError('WATCH_ONLY', 'Portefeuille en lecture seule : il ne se connecte à aucun site.');
    }
    await proveIdentity(unlock);
  },

  verifyUnlock: async (unlock) => {
    // Biométrie (lecture gated) ou PIN : réussit = identité prouvée, seed jetée.
    await proveIdentity(unlock);
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
    /*
     * Une clé privée n'a qu'un compte, une phrase TON aussi (une phrase, une clé).
     * Code traduit, et non plus une phrase française dans toutes les langues.
     */
    if (!isBip39Wallet(get().wallets, activeWalletId)) {
      throw new WalletError('NOT_SUPPORTED', 'import.SINGLE_ACCOUNT');
    }
    const mnemonic = await revealMnemonic(activeWalletId, unlock);
    const accounts = get().accounts;
    const nextIndex = accounts.reduce((max, a) => Math.max(max, a.index), -1) + 1;
    const created = deriveStoredAccount(mnemonic, nextIndex, label?.trim() || '');
    const updated = [...accounts, created];
    await saveAccounts(activeWalletId, updated);
    set({ accounts: updated, activeAccountIndex: nextIndex, account: toAccount(updated, nextIndex, get().activeChain) });
    await dropSupersededWatch([created]);
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
    await proveIdentity({ pin });
    const m = generateMnemonic(128);
    const id = newWalletId();
    const accounts = [deriveStoredAccount(m, 0, '')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    const wallets = [...get().wallets, { id, label: label?.trim() || '', avatar: randomAvatarId() }];
    await saveWalletsList(wallets);
    set({ wallets, activeWalletId: id, accounts, activeAccountIndex: 0, account: toAccount(accounts, 0, get().activeChain) });
    rememberActive(id, 0);
    return m; // à afficher pour sauvegarde
  },

  importWallet: async (mnemonic, pin, label) => {
    const m = canonicalMnemonic(mnemonic);
    const kind = phraseKindForImport(m);
    await proveIdentity({ pin }); // vérifie le PIN
    const id = newWalletId();
    const accounts = accountsForPhrase(m, kind);
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    const meta: WalletMeta = { id, label: label?.trim() || '', avatar: randomAvatarId(), ...(kind === 'ton' ? { type: 'tonPhrase' as const } : {}) };
    const wallets = [...get().wallets, meta];
    await saveWalletsList(wallets);
    // Une phrase TON n'a d'adresse que sur TON : on bascule sur ce réseau.
    const chain = kind === 'ton' ? firstChainOfFamily('ton') : get().activeChain;
    set({ wallets, activeWalletId: id, accounts, activeAccountIndex: 0, activeChain: chain, account: toAccount(accounts, 0, chain) });
    rememberActive(id, 0);
    await dropSupersededWatch(accounts);
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
    await proveIdentity({ pin }); // vérifie le PIN (un seul PIN d'app)
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
      { id, label: label?.trim() || '', type: 'privateKey', keyFamily: chosen, avatar: randomAvatarId() },
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
    kvSet(K_ACTIVE_CHAIN, chain).catch(() => {});
    await dropSupersededWatch(accounts);
  },

  exportAllWallets: async (unlock) => {
    const { wallets, activeWalletId } = get();
    /*
     * Le PIN est vérifié UNE FOIS, sur le portefeuille actif (ou, s'il est en lecture seule, un portefeuille à clé) : tous les coffres
     * partagent le même code, et redemander à chaque itération n'ajouterait
     * aucune sécurité — seulement des occasions d'échouer à moitié.
     */
    await proveIdentity(unlock);
    const out: BackupWallet[] = [];
    for (const w of wallets) {
      const vault = await loadVault(w.id);
      if (!vault) continue; // coffre absent : on ne fabrique pas un secret vide
      /*
       * Biométrie : pas de PIN pour déchiffrer — on lisait avec un code VIDE et
       * l'export échouait à chaque fois. Chaque coffre biométrique est lu à la
       * place ; un portefeuille qui n'en a pas oblige à passer par le code.
       */
      let secret: string;
      if ('pin' in unlock) {
        secret = await decryptSecret(vault, unlock.pin);
      } else {
        const bio = await readBiometricSeed(w.id, biometricPrompt());
        if (!bio) throw new WalletError('BIOMETRIC_NOT_SET', 'Portefeuille sans coffre biométrique : utiliser le code');
        secret = bio;
      }
      out.push({
        label: w.label ?? '',
        // Une phrase TON part comme `'seed'` : la restauration la reclasse d'après
        // la phrase elle-même (`classifyRecoveryPhrase`), sans champ de plus.
        type: w.type === 'privateKey' ? 'privateKey' : 'seed',
        ...(w.type === 'privateKey' ? { keyFamily: w.keyFamily ?? 'evm' } : {}),
        secret,
        // Comptes (numéro + nom) : sans eux, la restauration ne recréait que le compte n°1.
        accounts: (w.id === activeWalletId ? get().accounts : (await loadAccounts(w.id)) ?? []).map((a) => ({ index: a.index, label: a.label ?? '' })),
      });
    }
    return out;
  },

  importWallets: async (list, pin) => {
    assertValidPin(pin);
    let added = 0;
    for (const w of list) {
      /*
       * DOUBLON IGNORÉ, comparé par le secret. Restaurer par-dessus une
       * installation existante créerait sinon deux portefeuilles identiques, que
       * l'utilisateur ne saurait pas distinguer.
       */
      let already = false;
      for (const existing of get().wallets) {
        const vault = await loadVault(existing.id);
        if (!vault) continue;
        try {
          if ((await decryptSecret(vault, pin)) === w.secret) {
            already = true;
            break;
          }
        } catch {
          // Coffre illisible avec ce PIN : on ne peut rien conclure, on continue.
        }
      }
      if (already) continue;

      if (w.type === 'privateKey') {
        await get().importPrivateKey(w.secret, pin, w.label, w.keyFamily ?? 'evm');
      } else {
        await get().importWallet(w.secret, pin, w.label);
        if (w.accounts?.length) await get().restoreAccounts(get().activeWalletId, w.accounts, pin);
      }
      added += 1;
    }
    return added;
  },

  restoreAccounts: async (walletId, list, pin) => {
    // Une clé privée ou une phrase TON n'ont qu'un compte : rien à recréer.
    if (!isBip39Wallet(get().wallets, walletId) || !list.length) return;
    const mnemonic = await revealMnemonic(walletId, { pin });
    const active = walletId === get().activeWalletId;
    const existing = (active ? get().accounts : await loadAccounts(walletId)) ?? [];
    const byIndex = new Map(existing.map((a) => [a.index, a]));
    for (const { index, label } of list) {
      const have = byIndex.get(index);
      if (have) {
        // Compte déjà là (le n°1, créé à l'import) : on lui rend seulement son nom.
        if (label && !have.label) byIndex.set(index, { ...have, label });
      } else {
        byIndex.set(index, deriveStoredAccount(mnemonic, index, label));
      }
    }
    const accounts = [...byIndex.values()].sort((a, b) => a.index - b.index);
    await saveAccounts(walletId, accounts);
    if (active) set({ accounts, account: toAccount(accounts, get().activeAccountIndex, get().activeChain) });
    await dropSupersededWatch(accounts);
  },

  discoverAccounts: async (walletId, unlock, opts = {}) => {
    const { onProgress, onUnlocked } = opts;
    if (!isBip39Wallet(get().wallets, walletId)) return { added: [], uncertain: [] };
    const MAX = 20;
    const active = walletId === get().activeWalletId;
    const existing = (active ? get().accounts : await loadAccounts(walletId)) ?? [];
    const known = new Set(existing.map((a) => a.index));
    const wanted = Array.from({ length: MAX }, (_, k) => k + 1).filter((i) => !known.has(i));
    const candidates = new Map(deriveStoredAccounts(await revealMnemonic(walletId, unlock), wanted).map((a) => [a.index, a]));
    onUnlocked?.();
    const { probeAccountActivity } = await import('./accountActivity');
    const res = await discoverAccountIndexes((i) => probeAccountActivity(candidates.get(i)!), { known, max: MAX, onProgress });
    if (res.found.length) {
      // Relu au moment d'écrire : un compte ajouté entre-temps n'est pas écrasé.
      const now = (walletId === get().activeWalletId ? get().accounts : await loadAccounts(walletId)) ?? [];
      const have = new Set(now.map((a) => a.index));
      const accounts = [...now, ...res.found.filter((i) => !have.has(i)).map((i) => candidates.get(i)!)].sort((a, b) => a.index - b.index);
      await saveAccounts(walletId, accounts);
      if (walletId === get().activeWalletId) set({ accounts, account: toAccount(accounts, get().activeAccountIndex, get().activeChain) });
      await dropSupersededWatch(accounts);
    }
    return { added: res.found, uncertain: res.uncertain };
  },

  addWatchWallet: async (address, label) => {
    if (!get().hasWallet || !get().isUnlocked) throw new WalletError('LOCKED_OUT', 'App verrouillée');
    const parsed = parseWatchAddress(address);
    if (!parsed.ok) throw new WalletError('INVALID_WATCH_ADDRESS', `watch.${parsed.error}`);
    /*
     * DÉJÀ PRÉSENTE (dans un portefeuille à clé ou suivie) : un doublon
     * afficherait deux fois les mêmes fonds — et laisserait croire qu'une
     * adresse qu'on contrôle n'est « que » suivie.
     */
    if (lookupAddress(await addressIndexOf(get().wallets), parsed.address)) {
      throw new WalletError('WALLET_ALREADY_EXISTS', 'Adresse déjà présente dans un portefeuille');
    }
    const id = newWalletId();
    const account = storedAccountForAddress(parsed.family, parsed.address);
    await saveAccounts(id, [account]); // aucun coffre : rien de secret à ranger
    const wallets: WalletMeta[] = [...get().wallets, { id, label: label?.trim() || '', type: 'watch', keyFamily: parsed.family, watchAddress: parsed.address, avatar: randomAvatarId() }];
    await saveWalletsList(wallets);
    const chain = chainConfig(get().activeChain).family === parsed.family ? get().activeChain : firstChainOfFamily(parsed.family);
    set({ wallets, activeWalletId: id, accounts: [account], activeAccountIndex: 0, activeChain: chain, account: toAccount([account], 0, chain) });
    rememberActive(id, 0);
    kvSet(K_ACTIVE_CHAIN, chain).catch(() => {}); // sinon, au relancement, un réseau d'une autre famille (adresse vide)
  },

  setActiveWallet: async (id) => {
    const accounts = (await loadAccounts(id)) ?? [];
    /*
     * Un portefeuille importé ne sert QU'UNE famille : si le réseau affiché n'en
     * fait pas partie, le compte n'aurait aucune adresse à montrer. On bascule
     * donc sur un réseau de la bonne famille — et non sur l'EVM par défaut, ce
     * qui aurait présenté une adresse vide pour une clé Bitcoin ou Solana.
     */
    const onlyFamily = walletFamily(get().wallets, id);
    const chain =
      onlyFamily && chainConfig(get().activeChain).family !== onlyFamily
        ? firstChainOfFamily(onlyFamily)
        : get().activeChain;
    set({ activeWalletId: id, accounts, activeAccountIndex: 0, activeChain: chain, account: toAccount(accounts, 0, chain) });
    kvSet(K_ACTIVE_CHAIN, chain).catch(() => {}); // sinon le réseau d'une autre famille reviendrait au relancement
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

  setWalletAvatar: async (id, avatar) => {
    const wallets = get().wallets.map((w) => (w.id === id ? { ...w, avatar } : w));
    await saveWalletsList(wallets);
    set({ wallets });
  },

  removeWallet: async (id, unlock) => {
    /*
     * Irréversible : il ne suffit PAS d'une boîte de dialogue. Une confirmation
     * restée ouverte au verrouillage automatique, ou un téléphone déverrouillé
     * laissé deux secondes, suffisait à effacer un portefeuille.
     */
    if (!get().isUnlocked) throw new WalletError('LOCKED_OUT', 'App verrouillée');
    await proveIdentity(unlock);
    const wallets = get().wallets.filter((w) => w.id !== id);
    if (wallets.length === 0) throw new Error('Impossible de supprimer le dernier portefeuille.');
    // Le code de l'app vit dans les coffres : il en faut au moins un (les lectures seules n'en ont pas).
    if (!wallets.some((w) => w.type !== 'watch')) throw new WalletError('LAST_KEY_WALLET', 'Il faut garder au moins un portefeuille avec clé.');
    // Ses connexions partent avec lui (sessions WalletConnect sur ses adresses, TON Connect liées à lui).
    const gone = ((get().activeWalletId === id ? get().accounts : await loadAccounts(id)) ?? []).flatMap((a) => [a.evmAddress, a.solAddress, a.btcAddress].filter((x): x is string => !!x));
    await Promise.race([
      import('./sessionReset').then((m) => m.disconnectWallet(id, gone)).catch(() => {}),
      new Promise((r) => setTimeout(r, 10_000)),
    ]);
    await wipeWallet(id);
    await saveWalletsList(wallets);
    if (get().activeWalletId === id) {
      // Le suivant peut ne servir qu'une famille (clé importée, adresse suivie) : réseau ajusté.
      // Un seul `set` : jamais un état où l'actif est le portefeuille supprimé.
      const nextId = wallets[0].id;
      const accounts = (await loadAccounts(nextId).catch(() => null)) ?? [];
      const fam = walletFamily(wallets, nextId);
      const chain = fam && chainConfig(get().activeChain).family !== fam ? firstChainOfFamily(fam) : get().activeChain;
      set({ wallets, activeWalletId: nextId, accounts, activeAccountIndex: 0, activeChain: chain, account: toAccount(accounts, 0, chain) });
      rememberActive(nextId, 0);
      kvSet(K_ACTIVE_CHAIN, chain).catch(() => {});
    } else {
      set({ wallets });
    }
  },

  // Le verrouillage NE coupe PAS les sessions WalletConnect : signer exige de
  // toute façon le PIN/biométrie, donc garder la session est sûr — et éviter de
  // la couper évite un désync (le web resterait « connecté » sur une session
  // morte et les requêtes partiraient dans le vide).
  // Un brouillon de phrase n'a rien à faire dans un coffre verrouillé : un portefeuille existe déjà,
  // le flux qui l'utilisait (vérification, ajout) recommencera après le code.
  lock: () => set(get().hasWallet ? { isUnlocked: false, draftMnemonic: null } : { isUnlocked: false }),

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
      expiresAt: gas?.expiresAt,
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
    // Dernier verrou, quel que soit l'écran : un dépôt sans le commentaire exigé est perdu.
    if (draft.warnings.some((w) => w.code === 'MEMO_REQUIRED')) {
      throw new WalletError('MEMO_REQUIRED', 'La destination exige un commentaire');
    }
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

    /*
     * TON : depuis la PHRASE, et non depuis la graine BIP-39 — la dérivation
     * dépend de la sorte de phrase (règle de Tonkeeper, `resolveTonKey`). Une
     * phrase TON ne sert que TON ; une phrase BIP-39 sert TON sur son compte 0,
     * le seul que Tonkeeper montre pour elle.
     */
    const onlyFamily = walletFamily(wallets, activeWalletId);
    if (onlyFamily === 'ton' && family !== 'ton') {
      throw new WalletError('NOT_SUPPORTED', `import.WRONG_FAMILY:ton:${family}`);
    }
    if (family === 'ton') {
      if (account.index !== 0) throw new WalletError('NOT_SUPPORTED', 'import.TON_FIRST_ACCOUNT');
      const key = resolveTonKey(await revealMnemonic(activeWalletId, unlock));
      /*
       * La clé dérivée doit être celle dont on affiche l'adresse. Si elles
       * divergeaient, on signerait pour un autre compte que celui montré.
       */
      const shown = get().accounts.find((a) => a.index === 0)?.tonPublicKey;
      if (!shown || shown !== bytesToHex(key.publicKey)) {
        key.seed.fill(0);
        throw new Error('TON public key mismatch');
      }
      return { curve: 'ed25519', secretKey: key.seed, publicKey: key.publicKey };
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
      throw new WalletError('NOT_SUPPORTED', 'Cette chaîne ne permet pas d’accélérer une transaction.');
    }

    const pending = usePendingBtc.getState().txs.find((t) => t.txid === txid);
    if (!pending) throw new WalletError('BUMP_NOT_FOUND', 'Transaction introuvable ou trop ancienne pour être accélérée.');
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

    /*
     * Dernier contrôle, au moment de signer, sur le devis lui-même (voir
     * `src/domain/swap/guard.ts`) : réseau actif, contrat et autorisation LI.FI
     * officiels, et arrivée sur UNE DE NOS adresses — l'échange est toujours
     * vers soi. Refusé avant que la clé soit dérivée.
     */
    const own = get().accounts.find((a) => a.index === get().activeAccountIndex);
    const tonAddress = adapter.config.family === 'ton' ? addressForChain(own, adapter.config) : '';
    const receivers = [own?.evmAddress, own?.solAddress, tonAddress].filter((x): x is string => !!x);
    const fromAddress = quote.tx.type === 'evm' ? own?.evmAddress ?? '' : quote.tx.type === 'ton' ? tonAddress : own?.solAddress ?? '';
    const passes = receivers.some((toAddress) =>
      checkSwapQuote(quote, { fromEvmChainId: adapter.config.evmChainId, fromToken: quote.fromToken.address, fromAmount: quote.fromAmount, fromAddress, toAddress }).ok,
    );
    if (!passes) throw new WalletError('NOT_SUPPORTED', 'Devis d’échange refusé : il ne correspond pas à ce qui a été demandé');

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
    } else if (quote.tx.type === 'ton' && adapter.config.family === 'ton') {
      /*
       * STON.fi (src/domain/swap/stonfi.ts). Messages construits par l'app et
       * relus (tout revient à nous) ; ici, le portefeuille pTON du routeur est
       * relu SUR LA CHAÎNE, puis la transaction est émulée : un échec prévu
       * n'est jamais signé.
       */
      const v2 = getAdapterV2(activeChain) as TonAdapterV2;
      const swapTx = quote.tx;
      await verifyTonSwap(swapTx, (owner, master) => v2.jettonWalletOf(owner, master));
      onStatus?.('swapping');
      const draft = await v2.prepareDappTransfer(tonAddress, {
        messages: swapTx.messages.map((m) => ({
          to: TonCoreAddress.parse(m.to).toString({ bounceable: true }),
          amount: m.amount,
          bounce: true,
          payload: TonCell.fromBase64(m.payload),
        })),
        validUntil: Math.floor(Date.now() / 1000) + 300,
      });
      /*
       * SOLDE AVANT ÉMULATION. Un échange STON.fi joint ~0,3 TON de gas au
       * message : sans ce contrôle, un solde trop juste ne donnait qu'« action
       * non disponible », sans dire qu'il manquait du TON ni combien.
       */
      const needed = tonNeededForMessages(swapTx.messages);
      if (draft.balance < needed) {
        throw new WalletError('INSUFFICIENT_GAS', 'TON insuffisant pour le gas STON.fi', {
          need: formatInputAmount(needed, 9),
          have: formatInputAmount(draft.balance, 9),
          gas: formatInputAmount(STONFI_TON_RESERVE, 9),
        });
      }
      if (draft.emulation?.failed) throw new WalletError('SWAP_SIMULATION_FAILED', 'La simulation indique que cet échange échouerait');
      const signer = await get().deriveSigner(v2, unlock);
      const signed = await withSigner(signer, (s) => v2.signDappTransfer(draft, s));
      await v2.broadcastDapp(signed);
      onStatus?.('confirming');
      return signed.txid;
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

    // Même décodeur que la fenêtre qui a DÉCRIT la transaction : on signe ce qui a été montré.
    const decoded = solanaTxDecode(txStr);
    if (!decoded) throw new WalletError('NOT_SUPPORTED', 'Transaction Solana illisible');
    const bytes = decoded.bytes;
    const isBase64 = decoded.encoding === 'base64';

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

  signTypedData: async (unlock, typedData, expectedChainId) => {
    const { account, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    /*
     * Une signature EIP-712 porte son réseau dans `domain.chainId`. Signée
     * pour un autre réseau que celui de la demande (un « Permit » mainnet
     * demandé depuis une page de test), elle est rejouable là-bas. Refusée,
     * comme le fait MetaMask — avant de dériver la clé.
     */
    const domainChain = (typedData.domain as { chainId?: unknown } | null)?.chainId;
    if (expectedChainId !== undefined && domainChain !== undefined && domainChain !== null) {
      let n: number;
      try {
        n = Number(typeof domainChain === 'string' && /^0x/i.test(domainChain) ? BigInt(domainChain) : domainChain);
      } catch {
        n = NaN;
      }
      if (n !== expectedChainId) {
        throw new WalletError('NOT_SUPPORTED', `Signature pour le réseau ${String(domainChain)} demandée sur le réseau ${expectedChainId} : refusée`);
      }
    }
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
    if (!(adapter instanceof EvmChainAdapter)) throw new WalletError('NOT_SUPPORTED', 'Chaîne non supportée');
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
      throw new WalletError('NOT_SUPPORTED', 'Envoi de jeton non supporté sur ce réseau');
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
      throw new WalletError('NOT_SUPPORTED', 'Envoi de jeton non supporté sur ce réseau');
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

  sendJetton: async (to, amount, token, unlock, extras) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapterV2(activeChain);
    if (adapter.config.family !== 'ton' || !adapter.capabilities.tokenSend) {
      throw new WalletError('NOT_SUPPORTED', 'Envoi de jeton non supporté sur ce réseau');
    }
    return get().sendDraft(
      adapter,
      account.address,
      { to, amount: parseAmount(amount, token.decimals).raw, token: { id: token.master, symbol: 'JETTON', decimals: token.decimals }, memo: extras?.memo, expiresAt: extras?.expiresAt },
      unlock,
    );
  },

  changePin: async (oldPin, newPin) => {
    assertValidPin(newPin);
    // L'ancien PIN est vérifié par le chemin commun : compteur et blocage compris.
    await proveIdentity({ pin: oldPin });
    /*
     * TOUT OU RIEN. Tous les coffres sont d'abord re-chiffrés EN MÉMOIRE (le
     * scrypt, lent, se fait ici, avant toute écriture) ; puis les anciens vont au
     * journal, les nouveaux sont écrits, et le journal est effacé. Une erreur
     * d'écriture remet les anciens ; une app tuée entre-temps les retrouve au
     * lancement (`rollbackPinChange`). Jamais un mélange de deux PIN.
     */
    const before: { id: string; vault: EncryptedVault }[] = [];
    const after: { id: string; vault: EncryptedVault }[] = [];
    for (const w of get().wallets) {
      const vault = await loadVault(w.id);
      if (!vault) continue;
      const m = await decryptSecret(vault, oldPin); // lève WRONG_PIN si faux
      before.push({ id: w.id, vault });
      after.push({ id: w.id, vault: await encryptSecret(m, newPin) });
    }
    await savePinChangeJournal(before);
    try {
      for (const a of after) await saveVault(a.id, a.vault);
    } catch (e) {
      await rollbackPinChange();
      throw e;
    }
    await clearPinChangeJournal();
  },

  revealPhrase: async (unlock) => {
    const { activeWalletId, wallets } = get();
    if (isPrivateKeyWallet(wallets, activeWalletId)) {
      throw new WalletError('NO_RECOVERY_PHRASE', 'Ce portefeuille a été importé par clé privée : il n’a pas de phrase de récupération.');
    }
    return revealMnemonic(activeWalletId, unlock);
  },

  exportPrivateKey: async (unlock) => {
    const { activeWalletId, wallets, account } = get();
    if (isWatchWallet(wallets, activeWalletId)) throw new WalletError('WATCH_ONLY', 'Portefeuille en lecture seule : aucune clé à exporter.');
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
    // Une phrase TON n'a pas de clé EVM : la dériver en BIP-39 inventerait un compte.
    if (!isBip39Wallet(wallets, activeWalletId)) throw new WalletError('NOT_SUPPORTED', 'import.WRONG_FAMILY:ton:evm');
    /*
     * LA CLÉ DU RÉSEAU AFFICHÉ, dans le format des autres wallets de cette
     * famille. On rendait toujours la clé EVM : sur Solana, l'utilisateur collait
     * dans Phantom une clé qui ouvrait un autre compte.
     */
    const family = chainConfig(get().activeChain).family;
    if (family === 'ton') throw new WalletError('NOT_SUPPORTED', 'Pas de clé privée TON exportable : utiliser la phrase');
    const seed = mnemonicToSeedSync(await revealMnemonic(activeWalletId, unlock));
    // Graine et clé dérivée effacées une fois la chaîne d'export formée (comme `deriveSigner`).
    try {
      if (family === 'bitcoin') {
        const k = deriveBtcSigner(seed, account.index).privateKey;
        try { return formatExportedKey('bitcoin', k); } finally { k.fill(0); }
      }
      if (family === 'solana') {
        const s = deriveSolanaSigner(seed, account.index);
        try { return formatExportedKey('solana', s.secretKey, s.publicKey); } finally { s.secretKey.fill(0); }
      }
      return deriveEvmAccount(seed, account.index).privateKey;
    } finally {
      seed.fill(0);
    }
  },

  enableBiometric: async (pin) => {
    const id = authWalletId(get().wallets, get().activeWalletId);
    const mnemonic = await revealMnemonic(id, { pin });
    try {
      await enableBiometricSeed(id, mnemonic, biometricPrompt());
    } catch {
      // Geste refusé ou annulé à l'écriture : rien n'est activé, et on le dit.
      throw new WalletError('BIOMETRIC_REFUSED', 'Biometric request refused');
    }
  },

  disableBiometric: async () => {
    const { wallets, activeWalletId } = get();
    // Lecture seule active : la copie peut être sur n'importe quel portefeuille à clé — toutes effacées.
    const ids = isWatchWallet(wallets, activeWalletId) ? wallets.filter((w) => w.type !== 'watch').map((w) => w.id) : [activeWalletId];
    for (const id of ids) await disableBiometricSeed(id);
  },

  healBiometric: async (pin) => {
    const id = authWalletId(get().wallets, get().activeWalletId);
    if (await isBiometricSeedGated(id)) return; // copie protégée en place, rien à faire
    // Copie absente, invalidée ou encore en clair → réécrite au schéma protégé via le PIN.
    const mnemonic = await revealMnemonic(id, { pin });
    await enableBiometricSeed(id, mnemonic, biometricPrompt());
  },

  reset: async (unlock) => {
    // Même règle que la suppression d'un portefeuille, pour TOUS à la fois.
    console.log('[KALYX-VAULT] reset:start', { isUnlocked: get().isUnlocked, wallets: get().wallets.length });
    if (!get().isUnlocked) throw new WalletError('LOCKED_OUT', 'App verrouillée');
    await proveIdentity(unlock);
    console.log('[KALYX-VAULT] reset:verified, wiping');
    /*
     * Toutes les connexions coupées AVANT l'effacement (WalletConnect, TON
     * Connect, sites du navigateur) — 10 s au plus : un relais injoignable ne
     * doit pas bloquer la réinitialisation. Import tardif : ces modules
     * dépendent du coffre.
     */
    await Promise.race([
      import('./sessionReset').then((m) => m.disconnectEverything()).catch(() => {}),
      new Promise((r) => setTimeout(r, 10_000)),
    ]);
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
