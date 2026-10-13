/**
 * Préférences de l'onglet Carte, PERSISTANTES (AsyncStorage) : retrouvées
 * telles quelles à chaque ouverture de l'app.
 *
 *  - `theme`      : matière de la carte Kalyx ;
 *  - `issuer`     : émetteur choisi ;
 *  - `chain`      : réseau de paiement préféré (Base par défaut, ramené au
 *                   réseau par défaut de l'émetteur s'il ne le prend pas) ;
 *  - `configured` : la carte est configurée — l'écran s'ouvre directement sur
 *                   elle, sans repasser par le choix initial ;
 *  - `account`    : compte on-chain de la carte (Gnosis Pay : son Safe), vérifié
 *                   par lib/cardAccount ; sert au solde et à la recharge native ;
 *  - `last4`      : 4 derniers chiffres saisis PAR L'UTILISATEUR, mémo visuel
 *                   facultatif. Jamais le numéro complet ni le CVV : ceux-là
 *                   restent chez l'émetteur.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { cardChainFor, cardIssuer, type CardIssuerId } from '../src/domain/card/cardIssuers';

export type CardTheme = 'holo' | 'noir' | 'creme';
export const CARD_THEMES: readonly CardTheme[] = ['holo', 'noir', 'creme'];

const K = 'kalyx.card.prefs';

type Saved = { theme: CardTheme; issuer: CardIssuerId | null; chain: string | null; configured: boolean; last4: string | null; account: string | null };

type State = Saved & {
  loaded: boolean;
  setTheme: (t: CardTheme) => void;
  /** Change d'émetteur : le réseau est ramené à un réseau qu'il prend en charge. */
  setIssuer: (i: CardIssuerId) => void;
  setChain: (chainId: string) => void;
  /** Termine la configuration (l'écran s'ouvrira directement sur la carte). */
  finishSetup: () => void;
  /** Rouvre le choix (émetteur, réseau) sans rien effacer. */
  editSetup: () => void;
  /** Mémo : exactement 4 chiffres, ou `null` pour l'effacer. */
  setLast4: (v: string | null) => void;
  /** Compte on-chain de la carte (déjà vérifié), ou `null` pour le délier. */
  setAccount: (a: string | null) => void;
  load: () => Promise<void>;
};

/** 4 chiffres exactement, sinon rien. */
export function cleanLast4(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 4 ? d : null;
}

const pick = (s: State): Saved => ({ theme: s.theme, issuer: s.issuer, chain: s.chain, configured: s.configured, last4: s.last4, account: s.account });

export const useCardPrefs = create<State>((set, get) => {
  const persist = () => {
    AsyncStorage.setItem(K, JSON.stringify(pick(get()))).catch(() => {});
  };
  return {
    theme: 'holo',
    issuer: null,
    chain: null,
    configured: false,
    last4: null,
    account: null,
    loaded: false,
    setTheme: (theme) => {
      set({ theme });
      persist();
    },
    setIssuer: (issuer) => {
      // Le compte relié appartient à l'émetteur d'avant : on ne le garde pas.
      set({ issuer, chain: cardChainFor(cardIssuer(issuer), get().chain), ...(issuer !== get().issuer ? { account: null } : {}) });
      persist();
    },
    setChain: (chain) => {
      const i = get().issuer;
      set({ chain: i ? cardChainFor(cardIssuer(i), chain) : chain });
      persist();
    },
    finishSetup: () => {
      if (!get().issuer) return;
      set({ configured: true });
      persist();
    },
    editSetup: () => {
      set({ configured: false });
      persist();
    },
    setLast4: (v) => {
      set({ last4: cleanLast4(v) });
      persist();
    },
    setAccount: (account) => {
      set({ account });
      persist();
    },
    load: async () => {
      if (get().loaded) return;
      try {
        const raw = await AsyncStorage.getItem(K);
        const v = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
        const issuer = v.issuer ? cardIssuer(v.issuer).id : null;
        set({
          theme: CARD_THEMES.includes(v.theme as CardTheme) ? (v.theme as CardTheme) : 'holo',
          issuer,
          chain: issuer ? cardChainFor(cardIssuer(issuer), v.chain) : null,
          configured: !!v.configured && !!issuer,
          last4: cleanLast4(v.last4),
          account: typeof v.account === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.account) ? v.account : null,
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
    },
  };
});
