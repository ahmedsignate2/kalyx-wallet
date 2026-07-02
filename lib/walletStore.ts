/**
 * État global du wallet (Zustand).
 *
 * Le store ne conserve JAMAIS la clé privée. Il garde l'adresse publique et un
 * mnémonique de brouillon UNIQUEMENT le temps de l'écran de sauvegarde (avant
 * persistance chiffrée). La clé privée est dérivée à la volée pour signer, puis
 * jetée (à implémenter dans le flux d'envoi).
 */
import { create } from 'zustand';
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
  deriveEvmAccount,
  getAdapter,
  type Account,
  type MnemonicStrength,
} from '../src';
import { saveMnemonic, loadMnemonic, hasMnemonic, wipeMnemonic } from './secureStore';

// Réseau par défaut du MVP : testnet, zéro risque.
export const DEFAULT_CHAIN = 'sepolia';

interface WalletState {
  ready: boolean;
  hasWallet: boolean;
  account: Account | null;
  /** Mnémonique affiché à l'écran backup, effacé après confirmation. */
  draftMnemonic: string | null;

  bootstrap: () => Promise<void>;
  newDraft: (strength?: MnemonicStrength) => void;
  confirmDraft: () => Promise<void>;
  importMnemonic: (mnemonic: string) => Promise<void>;
  /** Signe et diffuse un transfert natif. Renvoie le hash de transaction. */
  sendNative: (to: string, amount: string) => Promise<string>;
  reset: () => Promise<void>;
}

function deriveAccount(mnemonic: string): Account {
  const seed = mnemonicToSeedSync(mnemonic);
  return getAdapter(DEFAULT_CHAIN).deriveAccount(seed, 0);
}

export const useWallet = create<WalletState>((set, get) => ({
  ready: false,
  hasWallet: false,
  account: null,
  draftMnemonic: null,

  bootstrap: async () => {
    const exists = await hasMnemonic();
    let account: Account | null = null;
    if (exists) {
      const m = await loadMnemonic();
      if (m) account = deriveAccount(m);
    }
    set({ ready: true, hasWallet: exists, account });
  },

  newDraft: (strength = 128) => {
    set({ draftMnemonic: generateMnemonic(strength) });
  },

  confirmDraft: async () => {
    const m = get().draftMnemonic;
    if (!m) throw new Error('Aucun mnémonique de brouillon');
    await saveMnemonic(m);
    set({ account: deriveAccount(m), hasWallet: true, draftMnemonic: null });
  },

  importMnemonic: async (mnemonic: string) => {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('Phrase de récupération invalide');
    }
    await saveMnemonic(mnemonic.trim());
    set({ account: deriveAccount(mnemonic), hasWallet: true, draftMnemonic: null });
  },

  sendNative: async (to: string, amount: string) => {
    const account = get().account;
    if (!account) throw new Error('Aucun compte');

    const mnemonic = await loadMnemonic();
    if (!mnemonic) throw new Error('Wallet verrouillé');

    // La clé privée n'existe que le temps de signer, dans ce bloc. Elle n'est
    // jamais mise dans le state global ni loggée.
    const seed = mnemonicToSeedSync(mnemonic);
    const signer = deriveEvmAccount(seed, account.index);
    const adapter = getAdapter(DEFAULT_CHAIN);

    const unsigned = await adapter.prepareTransfer(account.address, { to, amount });
    const raw = await adapter.signTransaction(unsigned, signer.privateKey);
    return adapter.broadcast(raw);
  },

  reset: async () => {
    await wipeMnemonic();
    set({ hasWallet: false, account: null, draftMnemonic: null });
  },
}));
