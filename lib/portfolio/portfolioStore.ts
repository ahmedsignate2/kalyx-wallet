/**
 * Portefeuille AGRÉGÉ multi-chaîne (§4.1) — une seule source pour l'accueil :
 * natifs de TOUS les réseaux mainnet + tokens ERC-20 (réseaux couverts par
 * Alchemy) + SPL Solana, valorisés dans la devise de l'app.
 *
 * Vitesse perçue (§0, §7) : l'instantané précédent est mis en CACHE
 * (AsyncStorage, non sensible) et affiché immédiatement à l'ouverture
 * (< 300 ms), puis rafraîchi en silence.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePortfolio as useLegacyPortfolio } from '../portfolioStore';
import { aura } from '../aura';
import { didReceive } from './receive';
import { usePortfolioDiag, type PortfolioDiag } from './diagnostics';
import { ALCHEMY_KEY } from '../../src/domain/chains/configs';
import { carryOver, deserialize, loadHoldings, serialize, summarize, type Failed, type PortfolioAccount, type Snapshot } from './holdings';
import { loadJettons } from './jettons';
import { addressForChain } from '../accountAddress';

// Le calcul vit dans ./holdings (partagé avec l'extension) ; ce module garde l'état et le cache.
export * from './holdings';

interface PortfolioState extends Snapshot {
  loading: boolean;
  /** Clé du cache chargé (compte + devise). */
  key: string | null;
  fromCache: boolean;
  error: string | null;
  /**
   * Lit le dernier cliché du compte. Rend `false` si un AUTRE compte a été
   * demandé entre-temps : l'appelant ne doit alors pas enchaîner de `refresh`
   * (il annulerait celui du compte désormais affiché).
   */
  hydrate: (acct: PortfolioAccount, fiat: string, opts?: { includeTestnets?: boolean }) => Promise<boolean>;
  refresh: (acct: PortfolioAccount, fiat: string, opts?: { force?: boolean; includeTestnets?: boolean }) => Promise<void>;
  /** Vrai après un envoi : le prochain `refresh` ignore la fraîcheur. */
  invalidated: boolean;
  /** À appeler après un envoi : les soldes affichés ne sont plus justes. */
  invalidate: () => void;
}


const STALE_MS = 45_000;
/*
 * Clé du cache : l'adresse EVM, ou à défaut la clé TON. Un portefeuille ouvert
 * par une phrase TON n'a PAS d'adresse EVM : avec la seule adresse EVM, tous ces
 * portefeuilles auraient partagé le même cache, « kalyx.portfolio..eur ».
 */
/*
 * TOUTES les adresses du compte entrent dans la clé. Avec l'adresse EVM ou, à
 * défaut, la clé TON, tous les portefeuilles sans EVM ni TON (adresse Solana ou
 * Bitcoin suivie, clé importée) partageaient « kalyx.portfolio.ton:.<devise> » :
 * passer de l'un à l'autre montrait le solde, les jetons et la courbe du
 * précédent — et les mélangeait à la première panne d'un réseau.
 */
const accountKey = (a: PortfolioAccount, fiat: string) => {
  const parts = [
    a.evmAddress ? a.evmAddress.toLowerCase() : '',
    a.solAddress ? `sol:${a.solAddress}` : '',
    a.btcAddress ? `btc:${a.btcAddress.toLowerCase()}` : '',
    a.tonPublicKey ? `ton:${a.tonPublicKey.toLowerCase()}` : '',
  ].filter(Boolean);
  return `kalyx.portfolio.${parts.join('|') || 'none'}.${fiat}`;
};

/*
 * UNE seule clé pour lire et pour écrire. `hydrate` lisait « …eur » quand
 * `refresh` écrivait « …eur.mainnet » : le cache n'était jamais relu, et
 * comme les onglets remontent l'accueil à chaque passage, chaque retour
 * vidait les montants (squelettes) et rappelait tous les réseaux.
 */
export const snapshotKey = (a: PortfolioAccount, fiat: string, includeTestnets = false) =>
  `${accountKey(a, fiat)}.${includeTestnets ? 'testnets' : 'mainnet'}`;


/** Génération du dernier rafraîchissement demandé, et le compte qu'il charge. */
let refreshGen = 0;
let loadingKey: string | null = null;
/** Dernier compte demandé (hydrate OU refresh) : une lecture disque tardive d'un autre compte est ignorée. */
let wantedKey: string | null = null;

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  holdings: [],
  total: 0,
  pnl24h: null,
  pnl24hPct: null,
  at: 0,
  loading: false,
  key: null,
  fromCache: false,
  error: null,
  invalidated: false,

  invalidate: () => set({ invalidated: true }),

  hydrate: async (acct, fiat, opts) => {
    const key = snapshotKey(acct, fiat, opts?.includeTestnets === true);
    wantedKey = key;
    if (get().key === key) return true;
    // Autre compte : tout chargement en vol pour l'ancien devient caduc (son résultat ne s'affichera plus).
    if (loadingKey !== key) {
      refreshGen += 1;
      loadingKey = null;
      set({ loading: false });
    }
    try {
      const json = await AsyncStorage.getItem(key);
      // Un autre compte a été demandé pendant la lecture, ou ce compte est déjà
      // chargé (refresh plus rapide) : ce cliché n'a plus à s'afficher.
      if (wantedKey !== key || get().key === key) return wantedKey === key;
      const snap = json ? deserialize(json) : null;
      if (snap) set({ ...snap, key, fromCache: true, error: null });
      else set({ holdings: [], total: 0, pnl24h: null, pnl24hPct: null, at: 0, key, fromCache: false });
    } catch {
      if (wantedKey === key && get().key !== key) set({ key });
    }
    return wantedKey === key;
  },

  refresh: async (acct, fiat, opts) => {
    const includeTestnets = opts?.includeTestnets === true;
    const key = snapshotKey(acct, fiat, includeTestnets);
    wantedKey = key;
    const s = get();
    // Déjà en cours POUR CE compte : rien à faire. Pour un autre (changement de
    // compte pendant le chargement) : on relance, et l'ancien résultat sera ignoré.
    if (s.loading && loadingKey === key) return;
    // L'âge du CLICHÉ décide, qu'il vienne du disque ou du réseau : un cliché
    // relu du disque il y a dix secondes n'a pas à être redemandé.
    if (!opts?.force && !s.invalidated && s.key === key && Date.now() - s.at < STALE_MS) return;
    const gen = ++refreshGen;
    loadingKey = key;
    const latest = () => gen === refreshGen;
    set({ loading: true, error: null, invalidated: false });
    // `loading` suffit : l'ambiance Synchronisation en est DÉRIVÉE par
    // lib/auraBinding.ts. Ce store n'a pas à connaître le halo, il n'émet que
    // ce que le halo ne peut pas déduire : les événements.
    const before = s.holdings;
    try {
      const failed: Failed = new Set();
      const diag: PortfolioDiag = { at: Date.now(), ms: 0, erc20: {}, nativesFailed: [], prices: { asked: 0, got: 0, fx: 0 }, holdings: 0 };
      // Un réseau muet garde ses actifs du cliché précédent : jamais de solde qui disparaît.
      const holdings = carryOver(s.key === key ? before : [], await loadHoldings(acct, fiat, includeTestnets, failed, diag, { addressOf: addressForChain, jettons: loadJettons }), failed);
      const snap: Snapshot = { holdings, ...summarize(holdings), at: Date.now() };
      AsyncStorage.setItem(key, serialize(snap)).catch(() => {}); // le cliché reste juste pour SON compte
      if (!latest()) return; // un autre compte a été demandé depuis : ce résultat n'est plus affiché
      usePortfolioDiag.getState().set({ ...diag, ms: Date.now() - diag.at, holdings: holdings.length, alchemyKey: ALCHEMY_KEY.length });
      /*
       * RIEN LU ET DES RÉSEAUX MUETS : le total n'est pas « 0 », il est inconnu.
       * L'accueil affichait 0,00 alors qu'aucun réseau n'avait répondu.
       */
      const unknown = holdings.length === 0 && failed.size > 0;
      set({ ...snap, key, fromCache: false, loading: false, error: unknown ? 'Réseau indisponible' : null });
      if (didReceive(before, holdings)) aura.pulse('receive');
      // Résumé pour l'assistant IA (ancien store, conservé pour compatibilité).
      useLegacyPortfolio.getState().setPortfolio(
        snap.total,
        holdings.slice(0, 12).map((h) => `- ${h.symbol}: ${h.amount} (~ ${h.fiat.toFixed(2)} ${fiat})`),
        snap.pnl24h ?? undefined,
        snap.pnl24hPct ?? undefined,
      );
    } catch (e) {
      if (!latest()) return;
      usePortfolioDiag.getState().set({ at: Date.now(), ms: 0, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), erc20: {}, nativesFailed: [], prices: { asked: 0, got: 0, fx: 0 }, holdings: 0 });
      set({ loading: false, error: e instanceof Error ? e.message : 'Réseau indisponible' });
      aura.pulse('error');
    }
  },
}));
