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
import { create } from 'zustand';
import { Wallet, getBytes, isHexString } from 'ethers';
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
  deriveEvmAccount,
  deriveBtcAccount,
  deriveBtcSigner,
  deriveSolanaAccount,
  deriveSolanaSigner,
  evmPath,
  btcPath,
  solPath,
  getAdapter,
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
  saveWalletsList,
  loadWalletsList,
  saveLockState,
  loadLockState,
  wipeWallet,
  wipeAll,
  type StoredAccount,
  type WalletMeta,
} from './secureStore';

export const DEFAULT_CHAIN = 'sepolia';

export type Unlock = { pin: string } | { biometric: true };
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
  setActiveWallet: (id: string) => Promise<void>;
  renameWallet: (id: string, label: string) => Promise<void>;
  removeWallet: (id: string) => Promise<void>;
  lock: () => void;
  signAndSend: (to: string, amount: string, unlock: Unlock) => Promise<string>;
  executeSwap: (quote: SwapQuote, unlock: Unlock, onStatus?: (s: SwapStatus) => void) => Promise<string>;
  // Signature pour WalletConnect (requêtes dApp)
  signMessage: (unlock: Unlock, message: string) => Promise<string>;
  signTypedData: (unlock: Unlock, typedData: { domain: unknown; types: Record<string, unknown>; message: unknown }) => Promise<string>;
  sendRawTxOn: (unlock: Unlock, chainId: string, req: RawTxRequest) => Promise<string>;
  /** Envoie un token ERC-20 détenu (transfer) sur le réseau actif. */
  sendToken: (to: string, amount: string, token: { contract: string; decimals: number }, unlock: Unlock) => Promise<string>;
  /** Envoie un token SPL détenu (Solana) : crée l'ATA si besoin puis transfère. */
  sendSolToken: (to: string, amount: string, token: { mint: string; decimals: number }, unlock: Unlock) => Promise<string>;
  changePin: (oldPin: string, newPin: string) => Promise<void>;
  revealPhrase: (unlock: Unlock) => Promise<string>;
  enableBiometric: (pin: string) => Promise<void>;
  disableBiometric: () => Promise<void>;
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
    if (!validateMnemonic(mnemonic)) throw new Error('Phrase de récupération invalide');
    set({ draftMnemonic: mnemonic.trim() });
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
      const mnemonic = await revealMnemonic(activeWalletId, { pin });
      const accounts = await backfillSolAddresses(activeWalletId, mnemonic, get().accounts);
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
    const mnemonic = await revealMnemonic(activeWalletId, { biometric: true });
    const accounts = await backfillSolAddresses(activeWalletId, mnemonic, get().accounts);
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

  setActiveChain: (chainId) =>
    set({ activeChain: chainId, account: toAccount(get().accounts, get().activeAccountIndex, chainId) }),

  setActiveAccount: (index) =>
    set({ activeAccountIndex: index, account: toAccount(get().accounts, index, get().activeChain) }),

  addAccount: async (unlock, label) => {
    const { activeWalletId } = get();
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
    if (!validateMnemonic(mnemonic)) throw new Error('Phrase de récupération invalide');
    await revealMnemonic(get().activeWalletId, { pin }); // vérifie le PIN
    const m = mnemonic.trim();
    const id = newWalletId();
    const accounts = [deriveStoredAccount(m, 0, 'Compte principal')];
    await saveVault(id, await encryptSecret(m, pin));
    await saveAccounts(id, accounts);
    const wallets = [...get().wallets, { id, label: label?.trim() || `Portefeuille importé ${get().wallets.length + 1}` }];
    await saveWalletsList(wallets);
    set({ wallets, activeWalletId: id, accounts, activeAccountIndex: 0, account: toAccount(accounts, 0, get().activeChain) });
  },

  setActiveWallet: async (id) => {
    const accounts = (await loadAccounts(id)) ?? [];
    set({ activeWalletId: id, accounts, activeAccountIndex: 0, account: toAccount(accounts, 0, get().activeChain) });
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

  lock: () => set({ isUnlocked: false }),

  signAndSend: async (to, amount, unlock) => {
    const { account, activeChain, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const mnemonic = await revealMnemonic(activeWalletId, unlock);
    const seed = mnemonicToSeedSync(mnemonic);
    const adapter = getAdapter(activeChain);

    // Bitcoin = modèle UTXO : chemin d'envoi dédié (clé + tx différentes).
    if (adapter instanceof BitcoinChainAdapter) {
      const btcSigner = deriveBtcSigner(seed, account.index);
      return adapter.sendBitcoin(account.address, to, amount, {
        privateKey: btcSigner.privateKey,
        publicKey: btcSigner.publicKey,
      });
    }

    // Solana = comptes ed25519 : transaction et signature propres.
    if (adapter instanceof SolanaChainAdapter) {
      const solSigner = deriveSolanaSigner(seed, account.index);
      return adapter.sendSolana(account.address, to, amount, {
        secretKey: solSigner.secretKey,
        publicKey: solSigner.publicKey,
      });
    }

    const signer = deriveEvmAccount(seed, account.index);
    const unsigned = await adapter.prepareTransfer(account.address, { to, amount });
    const raw = await adapter.signTransaction(unsigned, signer.privateKey);
    return adapter.broadcast(raw);
  },

  executeSwap: async (quote, unlock, onStatus) => {
    const { account, activeChain, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapter(activeChain);
    if (!(adapter instanceof EvmChainAdapter)) throw new Error('Swap indisponible sur ce réseau');

    const mnemonic = await revealMnemonic(activeWalletId, unlock);
    const seed = mnemonicToSeedSync(mnemonic);
    const signer = deriveEvmAccount(seed, account.index);

    const fromAddr = quote.fromToken.address.toLowerCase();
    if (fromAddr !== NATIVE_TOKEN.toLowerCase() && quote.approvalAddress) {
      const allowance = await adapter.getAllowance(quote.fromToken.address, account.address, quote.approvalAddress);
      if (allowance < quote.fromAmount) {
        onStatus?.('approving');
        const approveData = adapter.buildApproveData(quote.approvalAddress, quote.fromAmount);
        const approveHash = await adapter.sendContractTx(
          { to: quote.fromToken.address, data: approveData, chainId: quote.tx.chainId },
          account.address,
          signer.privateKey,
        );
        onStatus?.('approvalWait');
        await adapter.waitForTx(approveHash);
      }
    }

    onStatus?.('swapping');
    const hash = await adapter.sendContractTx(quote.tx, account.address, signer.privateKey);
    onStatus?.('confirming');
    try {
      await adapter.waitForTx(hash);
    } catch {
      /* diffusé ; on renvoie le hash */
    }
    return hash;
  },

  signMessage: async (unlock, message) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const m = await revealMnemonic(activeWalletId, unlock);
    const pk = deriveEvmAccount(mnemonicToSeedSync(m), account.index).privateKey;
    const data = isHexString(message) ? getBytes(message) : message;
    return new Wallet(pk).signMessage(data);
  },

  signTypedData: async (unlock, typedData) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const m = await revealMnemonic(activeWalletId, unlock);
    const pk = deriveEvmAccount(mnemonicToSeedSync(m), account.index).privateKey;
    const { EIP712Domain: _drop, ...types } = (typedData.types ?? {}) as Record<string, unknown>;
    return new Wallet(pk).signTypedData(
      typedData.domain as never,
      types as never,
      typedData.message as never,
    );
  },

  sendRawTxOn: async (unlock, chainId, req) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapter(chainId);
    if (!(adapter instanceof EvmChainAdapter)) throw new Error('Chaîne non supportée');
    const m = await revealMnemonic(activeWalletId, unlock);
    const pk = deriveEvmAccount(mnemonicToSeedSync(m), account.index).privateKey;
    return adapter.sendContractTx(req, account.address, pk);
  },

  sendToken: async (to, amount, token, unlock) => {
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
    };
    return get().sendRawTxOn(unlock, activeChain, req);
  },

  sendSolToken: async (to, amount, token, unlock) => {
    const { account, activeChain, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
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

  revealPhrase: async (unlock) => revealMnemonic(get().activeWalletId, unlock),

  enableBiometric: async (pin) => {
    const id = get().activeWalletId;
    const mnemonic = await revealMnemonic(id, { pin });
    await enableBiometricSeed(id, mnemonic);
  },

  disableBiometric: async () => {
    await disableBiometricSeed(get().activeWalletId);
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
