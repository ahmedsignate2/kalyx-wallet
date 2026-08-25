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
  EvmChainAdapter,
  BitcoinChainAdapter,
  SolanaChainAdapter,
  NATIVE_TOKEN,
  parseAmount,
  erc20TransferData,
  type Account,
  type MnemonicStrength,
  type SwapQuote,
  type RawTxRequest,
} from '../src';
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

export const DEFAULT_CHAIN = 'ethereum'; // mainnet par défaut (les testnets sont cachés/optionnels)

export type Unlock = { pin: string } | { biometric: true };
/** Frais de gas EIP-1559 choisis par l'utilisateur (palier Lent/Normal/Rapide). */
export type GasOverride = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
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
  executeSwap: (quote: SwapQuote, unlock: Unlock, onStatus?: (s: SwapStatus) => void) => Promise<string>;

  signSolanaTransaction: (unlock: Unlock, txStr: string) => Promise<string>;
  signSolanaTransactions: (unlock: Unlock, txStrArray: string[]) => Promise<string[]>;
  signSolanaMessage: (unlock: Unlock, message: string) => Promise<{ signature: string }>;
  signBitcoinMessage: (unlock: Unlock, message: string) => Promise<string>;
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
  return { index: 0, label: 'Compte importé', evmAddress: acct.address, btcAddress: '' };
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
    const ok = await authenticate('Déverrouiller Nova Wallet');
    if (!ok) throw new Error('Authentification biométrique refusée');
    const m = await readBiometricSeed(id);
    if (!m) throw new Error('Biométrie non configurée');
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
  failedAttempts: 0,
  lastFailedAt: 0,

  bootstrap: async () => {
    let wallets = await loadWalletsList();
    // Migration douce : un ancien wallet unique devient 'primary' (clés inchangées).
    if (wallets.length === 0 && (await hasVault('primary'))) {
      wallets = [{ id: 'primary', label: 'Portefeuille principal' }];
      await saveWalletsList(wallets);
    }
    const activeWalletId = wallets[0]?.id ?? 'primary';
    const accounts = wallets.length ? (await loadAccounts(activeWalletId)) ?? [] : [];
    // Compteur anti-brute-force persistant : recharge le verrouillage temporaire.
    const lock = await loadLockState();
    set({
      ready: true,
      hasWallet: wallets.length > 0 && accounts.length > 0,
      isUnlocked: false,
      wallets,
      activeWalletId,
      accounts,
      activeAccountIndex: 0,
      account: toAccount(accounts, 0, get().activeChain),
      failedAttempts: lock.failedAttempts,
      lastFailedAt: lock.lastFailedAt,
    });
  },

  newDraft: (strength = 128) => set({ draftMnemonic: generateMnemonic(strength) }),

  setImportedDraft: (mnemonic) => {
    const m = canonicalMnemonic(mnemonic);
    if (!validateMnemonic(m)) throw new Error('Phrase de récupération invalide');
    set({ draftMnemonic: m });
  },

  confirmDraft: async (pin, opts) => {
    const m = get().draftMnemonic;
    if (!m) throw new Error('Aucun mnémonique de brouillon');
    assertValidPin(pin);
    const id = 'primary';
    const accounts = [deriveStoredAccount(m, 0, 'Compte principal')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    if (opts?.enableBiometric) await enableBiometricSeed(id, m);
    const wallets: WalletMeta[] = [{ id, label: 'Portefeuille principal' }];
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
    set({ activeChain: safe, account: toAccount(get().accounts, get().activeAccountIndex, safe) });
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
    const created = deriveStoredAccount(mnemonic, nextIndex, label?.trim() || `Compte ${nextIndex + 1}`);
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
    const accounts = [deriveStoredAccount(m, 0, 'Compte principal')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    const wallets = [...get().wallets, { id, label: label?.trim() || `Portefeuille ${get().wallets.length + 1}` }];
    await saveWalletsList(wallets);
    set({ wallets, activeWalletId: id, accounts, activeAccountIndex: 0, account: toAccount(accounts, 0, get().activeChain) });
    return m; // à afficher pour sauvegarde
  },

  importWallet: async (mnemonic, pin, label) => {
    const m = canonicalMnemonic(mnemonic);
    if (!validateMnemonic(m)) throw new Error('Phrase de récupération invalide');
    await revealMnemonic(get().activeWalletId, { pin }); // vérifie le PIN
    const id = newWalletId();
    const accounts = [deriveStoredAccount(m, 0, 'Compte principal')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    const wallets = [...get().wallets, { id, label: label?.trim() || `Portefeuille importé ${get().wallets.length + 1}` }];
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
      { id, label: label?.trim() || `Clé importée ${get().wallets.length + 1}`, type: 'privateKey' },
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
    const { account, activeChain, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapter(activeChain);
    const isPk = isPrivateKeyWallet(wallets, activeWalletId);

    // Bitcoin = modèle UTXO : chemin d'envoi dédié (clé + tx différentes).
    if (adapter instanceof BitcoinChainAdapter) {
      if (isPk) throw new Error('Portefeuille clé privée : Bitcoin non disponible (EVM uniquement).');
      const seed = mnemonicToSeedSync(await revealMnemonic(activeWalletId, unlock));
      const btcSigner = deriveBtcSigner(seed, account.index);
      return adapter.sendBitcoin(account.address, to, amount, {
        privateKey: btcSigner.privateKey,
        publicKey: btcSigner.publicKey,
      });
    }

    // Solana = comptes ed25519 : transaction et signature propres.
    if (adapter instanceof SolanaChainAdapter) {
      if (isPk) throw new Error('Portefeuille clé privée : Solana non disponible (EVM uniquement).');
      const seed = mnemonicToSeedSync(await revealMnemonic(activeWalletId, unlock));
      const solSigner = deriveSolanaSigner(seed, account.index);
      return adapter.sendSolana(account.address, to, amount, {
        secretKey: solSigner.secretKey,
        publicKey: solSigner.publicKey,
      });
    }

    const pk = await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock);
    const unsigned = await adapter.prepareTransfer(account.address, { to, amount }, gas);
    const raw = await adapter.signTransaction(unsigned, pk);
    return adapter.broadcast(raw);
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
          const approveData = adapter.buildApproveData(quote.approvalAddress, quote.fromAmount);
          const approveHash = await adapter.sendContractTx(
            { to: quote.fromToken.address, data: approveData, chainId: Number(quote.tx.chainId) },
            account.address,
            signerKey,
          );
          onStatus?.('approvalWait');
          await adapter.waitForTx(approveHash);
        }
      }

      onStatus?.('swapping');
      const tx = { ...quote.tx, chainId: Number(quote.tx.chainId) };
      const hash = await adapter.sendContractTx(tx, account.address, signerKey);
      onStatus?.('confirming');
      try {
        await adapter.waitForTx(hash);
      } catch {
        /* diffusé ; on renvoie le hash */
      }
      return hash;
    } else if (quote.tx.type === 'solana' && adapter.config.family === 'solana') {
      onStatus?.('swapping');
      const signedTxStr = await get().signSolanaTransaction(unlock, quote.tx.data);
      const hash = await (adapter as any).rpc('sendTransaction', [signedTxStr, { encoding: 'base64' }]);
      if (!hash) throw new Error('Diffusion refusée par le réseau Solana');
      onStatus?.('confirming');
      return hash as string;
    } else {
      throw new Error(`Swap impossible: type de transaction (${(quote.tx as any).type}) incompatible avec le réseau actif`);
    }
  },


  signSolanaTransaction: async (unlock, txStr) => {
    const { account, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveSolanaSigner(mnemonicToSeedSync(secret), account.index);

    if (txStr.startsWith('{') || txStr.startsWith('[')) {
      throw new Error("L'intégration Relay (Solana -> EVM) nécessite une compilation des Address Lookup Tables non supportée par le client léger. L'échange doit être compilé côté serveur.");
    }

    const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(txStr) && txStr.length % 4 === 0;
    const bytes = isBase64 ? base64.decode(txStr) : base58.decode(txStr);

    let numSigs = 0;
    let size = 0;
    let offset = 0;
    for (;;) {
      const elem = bytes[offset + size];
      numSigs |= (elem & 0x7f) << (size * 7);
      size += 1;
      if ((elem & 0x80) === 0) break;
    }
    offset += size;

    const msgOffset = offset + numSigs * 64;
    const message = bytes.slice(msgOffset);

    const sig = ed25519.sign(message, signer.secretKey);

    const numRequiredSignatures = message[0];
    let acctSize = 0;
    let numAccounts = 0;
    for (;;) {
      const elem = message[3 + acctSize];
      numAccounts |= (elem & 0x7f) << (acctSize * 7);
      acctSize += 1;
      if ((elem & 0x80) === 0) break;
    }
    const acctOffset = 3 + acctSize;
    let signerIndex = -1;
    for (let i = 0; i < numRequiredSignatures; i++) {
      const start = acctOffset + i * 32;
      const acctPubkey = message.slice(start, start + 32);
      let match = true;
      for (let j = 0; j < 32; j++) {
        if (acctPubkey[j] !== signer.publicKey[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        signerIndex = i;
        break;
      }
    }

    if (signerIndex === -1) throw new Error("Our public key is not a signer in this transaction");

    const sigOffset = offset + signerIndex * 64;
    bytes.set(sig, sigOffset);

    return isBase64 ? base64.encode(bytes) : base58.encode(bytes);
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

  signBitcoinMessage: async (unlock, message) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveBtcSigner(mnemonicToSeedSync(secret), account.index);

    const MAGIC = utf8ToBytes('\x18Bitcoin Signed Message:\n');
    let msgBytes: Uint8Array;
    if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
      msgBytes = hex.decode(message);
    } else {
      try {
        msgBytes = base64.decode(message);
      } catch {
        msgBytes = utf8ToBytes(message);
      }
    }

    let msgLenBytes: Uint8Array;
    if (msgBytes.length < 253) {
      msgLenBytes = new Uint8Array([msgBytes.length]);
    } else if (msgBytes.length <= 0xffff) {
      msgLenBytes = new Uint8Array(3);
      msgLenBytes[0] = 253;
      new DataView(msgLenBytes.buffer).setUint16(1, msgBytes.length, true);
    } else if (msgBytes.length <= 0xffffffff) {
      msgLenBytes = new Uint8Array(5);
      msgLenBytes[0] = 254;
      new DataView(msgLenBytes.buffer).setUint32(1, msgBytes.length, true);
    } else {
      throw new Error('Message too long');
    }

    const payload = concatBytes(MAGIC, msgLenBytes, msgBytes);
    const hash = sha256(sha256(payload));

    const sig = secp256k1.sign(hash, signer.privateKey);
    const header = 39 + sig.recovery;
    const sigBytes = new Uint8Array(65);
    sigBytes[0] = header;
    sigBytes.set(sig.toCompactRawBytes(), 1);

    return base64.encode(sigBytes);
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
    const { account, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapter(chainId);
    if (!(adapter instanceof EvmChainAdapter)) throw new Error('Chaîne non supportée');
    const pk = await revealEvmSigningKey(wallets, activeWalletId, account.index, unlock);
    return adapter.sendContractTx(req, account.address, pk);
  },

  sendToken: async (to, amount, token, unlock, gas) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');
    const cfg = getAdapter(activeChain).config;
    if (cfg.family !== 'evm' || !cfg.evmChainId) throw new Error('Envoi de token non supporté sur ce réseau');
    const raw = parseAmount(amount, token.decimals).raw; // lève si montant invalide
    const req: RawTxRequest = {
      to: token.contract,
      data: erc20TransferData(to, raw), // lève si adresse destinataire invalide
      value: 0n,
      chainId: cfg.evmChainId,
      // Palier de frais choisi par l'utilisateur (sinon sendContractTx utilise le réseau).
      maxFeePerGas: gas?.maxFeePerGas,
      maxPriorityFeePerGas: gas?.maxPriorityFeePerGas,
    };
    return get().sendRawTxOn(unlock, activeChain, req);
  },

  sendSolToken: async (to, amount, token, unlock) => {
    const { account, activeChain, activeWalletId, wallets } = get();
    if (!account) throw new Error('Aucun compte');
    if (isPrivateKeyWallet(wallets, activeWalletId)) {
      throw new Error('Portefeuille clé privée : Solana non disponible (EVM uniquement).');
    }
    const adapter = getAdapter(activeChain);
    if (!(adapter instanceof SolanaChainAdapter)) throw new Error('Token SPL : réseau Solana requis');
    const raw = parseAmount(amount, token.decimals).raw; // lève si montant invalide
    const m = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveSolanaSigner(mnemonicToSeedSync(m), account.index);
    return adapter.sendSplToken(account.address, to, raw, token.mint, token.decimals, {
      secretKey: signer.secretKey,
      publicKey: signer.publicKey,
    });
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
    });
  },
}));
