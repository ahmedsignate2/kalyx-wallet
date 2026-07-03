/**
 * État global du wallet (Zustand).
 *
 * INVARIANTS DE SÉCURITÉ (cf. SECURITY.md) :
 *  - Ni la seed, ni la clé privée ne sont JAMAIS dans ce state.
 *  - Seules des données publiques (adresses) y vivent.
 *  - La seed n'est déchiffrée du coffre qu'à la volée, pour dériver/signer.
 *  - `draftMnemonic` : exception transitoire, uniquement pendant l'onboarding.
 *
 * MULTI-COMPTES : une seule seed dérive plusieurs comptes par index HD. Chaque
 * compte porte SES adresses par famille (EVM 0x… et Bitcoin bc1…) : l'adresse
 * EVM est la même sur tous les réseaux EVM, Bitcoin a la sienne.
 */
import { create } from 'zustand';
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
  deriveEvmAccount,
  deriveBtcAccount,
  evmPath,
  btcPath,
  getAdapter,
  decryptSecret,
  encryptSecret,
  assertValidPin,
  lockRemainingMs,
  isWalletError,
  EvmChainAdapter,
  NATIVE_TOKEN,
  type Account,
  type MnemonicStrength,
  type SwapQuote,
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
  wipeAll,
  type StoredAccount,
} from './secureStore';

export const DEFAULT_CHAIN = 'sepolia';

export type Unlock = { pin: string } | { biometric: true };

interface WalletState {
  ready: boolean;
  hasWallet: boolean;
  isUnlocked: boolean;
  accounts: StoredAccount[];
  activeAccountIndex: number;
  activeChain: string;
  /** Compte affiché : adresse du compte actif pour le réseau actif. */
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
  setActiveChain: (chainId: string) => void;
  setActiveAccount: (index: number) => void;
  addAccount: (unlock: Unlock, label?: string) => Promise<void>;
  renameAccount: (index: number, label: string) => void;
  lock: () => void;
  signAndSend: (to: string, amount: string, unlock: Unlock) => Promise<string>;
  /** Exécute un swap/bridge LI.FI (approbation ERC-20 si besoin, puis swap). */
  executeSwap: (quote: SwapQuote, unlock: Unlock) => Promise<string>;
  changePin: (oldPin: string, newPin: string) => Promise<void>;
  revealPhrase: (unlock: Unlock) => Promise<string>;
  enableBiometric: (pin: string) => Promise<void>;
  disableBiometric: () => Promise<void>;
  reset: () => Promise<void>;
}

/** Dérive les adresses publiques (toutes familles) d'un index de compte. */
function deriveStoredAccount(mnemonic: string, index: number, label: string): StoredAccount {
  const seed = mnemonicToSeedSync(mnemonic);
  return {
    index,
    label,
    evmAddress: deriveEvmAccount(seed, index).address,
    btcAddress: deriveBtcAccount(seed, index).address,
  };
}

/** Construit le compte affiché pour (compte actif, réseau actif). */
function toAccount(
  accounts: StoredAccount[],
  activeIndex: number,
  chainId: string,
): Account | null {
  const a = accounts.find((x) => x.index === activeIndex) ?? accounts[0];
  if (!a) return null;
  const isBtc = getAdapter(chainId).config.family === 'bitcoin';
  return {
    chain: chainId,
    address: isBtc ? a.btcAddress : a.evmAddress,
    index: a.index,
    path: isBtc ? btcPath(a.index) : evmPath(a.index),
  };
}

async function revealMnemonic(unlock: Unlock): Promise<string> {
  if ('biometric' in unlock) {
    const m = await readBiometricSeed();
    if (!m) throw new Error('Biométrie non configurée');
    return m;
  }
  const vault = await loadVault();
  if (!vault) throw new Error('Aucun coffre');
  return decryptSecret(vault, unlock.pin);
}

export const useWallet = create<WalletState>((set, get) => ({
  ready: false,
  hasWallet: false,
  isUnlocked: false,
  accounts: [],
  activeAccountIndex: 0,
  activeChain: DEFAULT_CHAIN,
  account: null,
  draftMnemonic: null,
  failedAttempts: 0,
  lastFailedAt: 0,

  bootstrap: async () => {
    const exists = await hasVault();
    const accounts = (exists ? await loadAccounts() : null) ?? [];
    set({
      ready: true,
      hasWallet: exists && accounts.length > 0,
      isUnlocked: false,
      accounts,
      activeAccountIndex: 0,
      account: toAccount(accounts, 0, get().activeChain),
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
    const vault = await encryptSecret(m, pin);
    const accounts = [deriveStoredAccount(m, 0, 'Compte principal')];
    await saveVault(vault);
    await saveAccounts(accounts);
    if (opts?.enableBiometric) await enableBiometricSeed(m);
    set({
      accounts,
      activeAccountIndex: 0,
      account: toAccount(accounts, 0, get().activeChain),
      hasWallet: true,
      isUnlocked: true,
      draftMnemonic: null,
    });
  },

  unlockWithPin: async (pin) => {
    const { failedAttempts, lastFailedAt } = get();
    if (lockRemainingMs(failedAttempts, lastFailedAt, Date.now()) > 0) {
      throw new Error('Trop de tentatives. Réessaie plus tard.');
    }
    try {
      await revealMnemonic({ pin }); // valide le PIN (lève WRONG_PIN sinon)
      set({ isUnlocked: true, failedAttempts: 0, lastFailedAt: 0 });
    } catch (e) {
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        set({ failedAttempts: get().failedAttempts + 1, lastFailedAt: Date.now() });
      }
      throw e;
    }
  },

  unlockWithBiometrics: async () => {
    await revealMnemonic({ biometric: true });
    set({ isUnlocked: true });
  },

  setActiveChain: (chainId) =>
    set({
      activeChain: chainId,
      account: toAccount(get().accounts, get().activeAccountIndex, chainId),
    }),

  setActiveAccount: (index) =>
    set({
      activeAccountIndex: index,
      account: toAccount(get().accounts, index, get().activeChain),
    }),

  addAccount: async (unlock, label) => {
    const mnemonic = await revealMnemonic(unlock);
    const accounts = get().accounts;
    const nextIndex = accounts.reduce((max, a) => Math.max(max, a.index), -1) + 1;
    const created = deriveStoredAccount(
      mnemonic,
      nextIndex,
      label?.trim() || `Compte ${nextIndex + 1}`,
    );
    const updated = [...accounts, created];
    await saveAccounts(updated);
    set({
      accounts: updated,
      activeAccountIndex: nextIndex,
      account: toAccount(updated, nextIndex, get().activeChain),
    });
  },

  renameAccount: (index, label) => {
    const name = label.trim();
    if (!name) return;
    const accounts = get().accounts.map((a) => (a.index === index ? { ...a, label: name } : a));
    void saveAccounts(accounts);
    set({ accounts, account: toAccount(accounts, get().activeAccountIndex, get().activeChain) });
  },

  lock: () => set({ isUnlocked: false }),

  signAndSend: async (to, amount, unlock) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');

    // Seed révélée transitoirement, jamais mise dans le state.
    const mnemonic = await revealMnemonic(unlock);
    const seed = mnemonicToSeedSync(mnemonic);
    const signer = deriveEvmAccount(seed, account.index);
    const adapter = getAdapter(activeChain);

    const unsigned = await adapter.prepareTransfer(account.address, { to, amount });
    const raw = await adapter.signTransaction(unsigned, signer.privateKey);
    return adapter.broadcast(raw);
  },

  executeSwap: async (quote, unlock) => {
    const { account, activeChain } = get();
    if (!account) throw new Error('Aucun compte');
    const adapter = getAdapter(activeChain);
    if (!(adapter instanceof EvmChainAdapter)) throw new Error('Swap indisponible sur ce réseau');

    // Clé révélée transitoirement, jamais mise dans le state.
    const mnemonic = await revealMnemonic(unlock);
    const seed = mnemonicToSeedSync(mnemonic);
    const signer = deriveEvmAccount(seed, account.index);

    // 1) Approbation ERC-20 si on part d'un token (pas du natif).
    const fromAddr = quote.fromToken.address.toLowerCase();
    if (fromAddr !== NATIVE_TOKEN.toLowerCase() && quote.approvalAddress) {
      const allowance = await adapter.getAllowance(quote.fromToken.address, account.address, quote.approvalAddress);
      if (allowance < quote.fromAmount) {
        const approveData = adapter.buildApproveData(quote.approvalAddress, quote.fromAmount);
        const approveHash = await adapter.sendContractTx(
          { to: quote.fromToken.address, data: approveData, chainId: quote.tx.chainId },
          account.address,
          signer.privateKey,
        );
        await adapter.waitForTx(approveHash); // attendre la confirmation avant le swap
      }
    }

    // 2) Swap (transaction fournie par LI.FI).
    return adapter.sendContractTx(quote.tx, account.address, signer.privateKey);
  },

  changePin: async (oldPin, newPin) => {
    assertValidPin(newPin);
    const mnemonic = await revealMnemonic({ pin: oldPin }); // lève WRONG_PIN si faux
    await saveVault(await encryptSecret(mnemonic, newPin));
  },

  revealPhrase: async (unlock) => revealMnemonic(unlock),

  enableBiometric: async (pin) => {
    const mnemonic = await revealMnemonic({ pin });
    await enableBiometricSeed(mnemonic);
  },

  disableBiometric: async () => {
    await disableBiometricSeed();
  },

  reset: async () => {
    await wipeAll();
    set({
      hasWallet: false,
      isUnlocked: false,
      accounts: [],
      activeAccountIndex: 0,
      account: null,
      draftMnemonic: null,
    });
  },
}));
