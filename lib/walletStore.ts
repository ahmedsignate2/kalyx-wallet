/**
 * État global du wallet (Zustand).
 *
 * INVARIANTS DE SÉCURITÉ (cf. SECURITY.md) :
 *  - Ni la seed, ni la clé privée ne sont JAMAIS dans ce state.
 *  - Seules des données publiques (adresse) y vivent.
 *  - La seed n'est déchiffrée du coffre qu'à la volée, dans une variable locale,
 *    le temps de dériver/signer, puis abandonnée.
 *  - `draftMnemonic` est la seule exception : transitoire, uniquement pendant
 *    l'onboarding (écran backup), effacé dès la confirmation, jamais persisté
 *    en clair.
 */
import { create } from 'zustand';
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
  deriveEvmAccount,
  evmPath,
  getAdapter,
  encryptSecret,
  decryptSecret,
  assertValidPin,
  lockRemainingMs,
  isWalletError,
  type Account,
  type MnemonicStrength,
} from '../src';
import {
  saveVault,
  loadVault,
  hasVault,
  savePublicAddress,
  loadPublicAddress,
  enableBiometricSeed,
  readBiometricSeed,
  wipeAll,
} from './secureStore';

export const DEFAULT_CHAIN = 'sepolia';

/** Accès au secret pour une opération sensible : PIN ou biométrie. */
export type Unlock = { pin: string } | { biometric: true };

interface WalletState {
  ready: boolean;
  hasWallet: boolean;
  isUnlocked: boolean;
  account: Account | null; // adresse publique uniquement
  draftMnemonic: string | null;
  failedAttempts: number;
  lastFailedAt: number;

  bootstrap: () => Promise<void>;
  newDraft: (strength?: MnemonicStrength) => void;
  /** Prépare l'import : valide puis place la phrase en brouillon transitoire. */
  setImportedDraft: (mnemonic: string) => void;
  confirmDraft: (pin: string, opts?: { enableBiometric?: boolean }) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  unlockWithBiometrics: () => Promise<void>;
  lock: () => void;
  signAndSend: (to: string, amount: string, unlock: Unlock) => Promise<string>;
  reset: () => Promise<void>;
}

function accountFromAddress(address: string): Account {
  return { chain: DEFAULT_CHAIN, address, index: 0, path: evmPath(0) };
}

function deriveAccount(mnemonic: string): Account {
  const seed = mnemonicToSeedSync(mnemonic);
  return getAdapter(DEFAULT_CHAIN).deriveAccount(seed, 0);
}

/** Récupère la seed en clair de façon transitoire selon le mode de déverrouillage. */
async function revealMnemonic(unlock: Unlock): Promise<string> {
  if ('biometric' in unlock) {
    const m = await readBiometricSeed(); // l'OS impose la biométrie
    if (!m) throw new Error('Biométrie non configurée');
    return m;
  }
  const vault = await loadVault();
  if (!vault) throw new Error('Aucun coffre');
  return decryptSecret(vault, unlock.pin); // lève WRONG_PIN si faux
}

async function persistNewWallet(
  mnemonic: string,
  pin: string,
  enableBiometric: boolean,
): Promise<Account> {
  assertValidPin(pin);
  const vault = await encryptSecret(mnemonic, pin);
  const account = deriveAccount(mnemonic);
  await saveVault(vault);
  await savePublicAddress(account.address);
  if (enableBiometric) await enableBiometricSeed(mnemonic);
  return account;
}

export const useWallet = create<WalletState>((set, get) => ({
  ready: false,
  hasWallet: false,
  isUnlocked: false,
  account: null,
  draftMnemonic: null,
  failedAttempts: 0,
  lastFailedAt: 0,

  bootstrap: async () => {
    const exists = await hasVault();
    const address = exists ? await loadPublicAddress() : null;
    set({
      ready: true,
      hasWallet: exists,
      isUnlocked: false,
      account: address ? accountFromAddress(address) : null,
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
    const account = await persistNewWallet(m, pin, opts?.enableBiometric ?? false);
    set({ account, hasWallet: true, isUnlocked: true, draftMnemonic: null });
  },

  unlockWithPin: async (pin) => {
    const { failedAttempts, lastFailedAt } = get();
    if (lockRemainingMs(failedAttempts, lastFailedAt, Date.now()) > 0) {
      throw new Error('Trop de tentatives. Réessaie plus tard.');
    }
    try {
      const mnemonic = await revealMnemonic({ pin });
      set({
        account: deriveAccount(mnemonic),
        isUnlocked: true,
        failedAttempts: 0,
        lastFailedAt: 0,
      });
    } catch (e) {
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        set({ failedAttempts: get().failedAttempts + 1, lastFailedAt: Date.now() });
      }
      throw e;
    }
  },

  unlockWithBiometrics: async () => {
    const mnemonic = await revealMnemonic({ biometric: true });
    set({ account: deriveAccount(mnemonic), isUnlocked: true });
  },

  lock: () => set({ isUnlocked: false }),

  signAndSend: async (to, amount, unlock) => {
    const account = get().account;
    if (!account) throw new Error('Aucun compte');

    // Seed révélée transitoirement, jamais mise dans le state.
    const mnemonic = await revealMnemonic(unlock);
    const seed = mnemonicToSeedSync(mnemonic);
    const signer = deriveEvmAccount(seed, account.index);
    const adapter = getAdapter(DEFAULT_CHAIN);

    const unsigned = await adapter.prepareTransfer(account.address, { to, amount });
    const raw = await adapter.signTransaction(unsigned, signer.privateKey);
    return adapter.broadcast(raw);
  },

  reset: async () => {
    await wipeAll();
    set({ hasWallet: false, isUnlocked: false, account: null, draftMnemonic: null });
  },
}));
