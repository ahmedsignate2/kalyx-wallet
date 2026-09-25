/**
 * WalletConnect Pay — paiement marchand depuis le portefeuille.
 *
 * Voie STANDALONE (`@walletconnect/pay`), pas WalletKit. La voie WalletKit
 * aurait imposé de migrer `web3wallet` → `walletkit`, c'est-à-dire de réécrire
 * `lib/walletconnect.ts`, qui porte toutes nos méthodes de signature et
 * fonctionne. Concentrer deux risques juste avant un build qu'aucune OTA ne
 * pourra corriger n'avait pas de sens. La migration WalletKit reste à décider
 * pour ses propres raisons.
 *
 * LE SDK EST UN MODULE NATIF (Yttrium, embarqué par
 * `@walletconnect/react-native-compat` ≥ 2.25). Il n'existe donc PAS tant que
 * l'app n'a pas été reconstruite, et aucune mise à jour OTA ne pourra
 * l'apporter. Il est chargé paresseusement et de façon gardée — comme la
 * caméra — pour qu'une absence de module natif dégrade la fonction au lieu de
 * faire tomber l'app au démarrage.
 *
 * DÉROULÉ : lien détecté → options → capture de données si l'option l'exige →
 * actions → signatures → confirmation.
 */
import { create } from 'zustand';
import { useWallet } from './walletStore';
import type { Unlock } from './walletStore';
import { payAccountsFor, checkPayAction, type PayMethod } from '../src';

/** Identifiant public du projet Pay, fourni au build (secret EAS). */
const PAY_APP_ID = (process.env.EXPO_PUBLIC_WALLETCONNECT_PAY_ID ?? '').trim();

/* ── Formes minimales de ce que rend le SDK ──────────────────────────────────
 *
 * Redéclarées plutôt qu'importées du paquet : le module natif est absent en
 * test et sur toute version antérieure au prochain build, et un import de types
 * depuis un paquet chargé paresseusement ferait entrer sa résolution dans le
 * chemin critique. Seuls les champs qu'on lit figurent ici.
 */
export interface PayAmountDisplay {
  assetSymbol: string;
  assetName: string;
  decimals: number;
  iconUrl?: string;
  networkName?: string;
}

export interface PayAmount {
  unit: string;
  value: string;
  display: PayAmountDisplay;
}

export interface PayCollectData {
  url: string;
  /** Schéma JSON, sous forme de CHAÎNE : à analyser avant usage. */
  schema?: string;
}

export interface PayOption {
  id: string;
  amount: PayAmount;
  etaS: number;
  collectData?: PayCollectData | null;
}

export interface PayInfo {
  status: string;
  amount: PayAmount;
  /** Secondes depuis l'époque. */
  expiresAt: number;
  merchant: { name: string; iconUrl?: string };
}

export interface PayOptions {
  paymentId: string;
  info?: PayInfo;
  options: PayOption[];
}

interface PayAction {
  walletRpc: { chainId: string; method: string; params: string };
}

export type PayStatus = 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'cancelled';

export interface PayResult {
  status: PayStatus;
  isFinal: boolean;
  pollInMs?: number;
}

/* ── Chargement gardé du SDK ─────────────────────────────────────────────── */

interface PayClient {
  getPaymentOptions(p: { paymentLink: string; accounts: string[]; includePaymentInfo?: boolean }): Promise<PayOptions>;
  getRequiredPaymentActions(p: { paymentId: string; optionId: string }): Promise<PayAction[]>;
  confirmPayment(p: { paymentId: string; optionId: string; data: (string | object)[] }): Promise<PayResult>;
}

let client: PayClient | null = null;

/**
 * Client Pay, ou `null` si le module natif n'est pas là.
 *
 * Ne LÈVE jamais : une build antérieure au module natif doit simplement ne pas
 * proposer le paiement, pas tomber. C'est le même traitement que la caméra.
 */
function payClient(): PayClient | null {
  if (client) return client;
  if (!PAY_APP_ID) return null;
  try {
    // require paresseux : l'import statique ferait chercher le module natif au
    // chargement du bundle, donc au démarrage de l'app.
    const mod = require('@walletconnect/pay') as {
      WalletConnectPay: new (o: { appId: string }) => PayClient;
      isProviderAvailable?: () => boolean;
    };
    if (typeof mod.isProviderAvailable === 'function' && !mod.isProviderAvailable()) return null;
    client = new mod.WalletConnectPay({ appId: PAY_APP_ID });
    return client;
  } catch {
    return null;
  }
}

/** Le paiement marchand est-il utilisable sur cette installation ? */
export function isPayAvailable(): boolean {
  return payClient() !== null;
}

/* ── Capture de données : URL du formulaire hébergé ──────────────────────── */

/** base64url sans remplissage, tel que le formulaire l'attend. */
function base64url(value: string): string {
  const b64 =
    typeof btoa === 'function'
      ? btoa(value)
      : // Environnement sans `btoa` (Node) : même résultat.
        Buffer.from(value, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Construit l'URL du formulaire de capture, en préservant sa requête existante.
 *
 * Le formulaire est HÉBERGÉ et non reconstruit en natif : ses champs sont dictés
 * par la réglementation et changent sans nous prévenir. Une copie native
 * empêcherait de payer dans les juridictions concernées le jour où elle
 * diverge.
 */
export function buildCollectUrl(
  baseUrl: string,
  opts: { prefill?: Record<string, string>; theme?: 'light' | 'dark'; themeVariables?: string } = {},
): string {
  const params: string[] = [];
  if (opts.prefill && Object.keys(opts.prefill).length > 0) {
    params.push(`prefill=${base64url(JSON.stringify(opts.prefill))}`);
  }
  if (opts.theme) params.push(`theme=${opts.theme}`);
  if (opts.themeVariables) params.push(`themeVariables=${opts.themeVariables}`);
  if (params.length === 0) return baseUrl;
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.join('&')}`;
}

/** Champs que le formulaire attend, lus depuis son schéma JSON. */
export function requiredCollectFields(schema: string | undefined): string[] {
  if (!schema) return [];
  try {
    const parsed = JSON.parse(schema) as { required?: unknown };
    return Array.isArray(parsed.required) ? parsed.required.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

/* ── Magasin du flux de paiement ─────────────────────────────────────────── */

type Phase = 'idle' | 'loading' | 'choosing' | 'collecting' | 'signing' | 'done' | 'error';

interface PayState {
  phase: Phase;
  link: string | null;
  options: PayOptions | null;
  /** Option retenue par l'utilisateur. */
  selected: PayOption | null;
  /** URL du formulaire hébergé, quand l'option choisie exige une capture. */
  collectUrl: string | null;
  result: PayResult | null;
  error: string | null;

  /** Charge les options d'un lien de paiement. */
  open: (link: string) => Promise<void>;
  /** Retient une option ; ouvre la capture de données si elle est requise. */
  select: (option: PayOption, theme?: 'light' | 'dark') => void;
  /** Le formulaire hébergé a abouti : on peut poursuivre. */
  collected: () => void;
  /** Signe les actions et confirme le paiement. */
  confirm: (unlock: Unlock) => Promise<void>;
  reset: () => void;
}

const EMPTY = {
  phase: 'idle' as Phase,
  link: null,
  options: null,
  selected: null,
  collectUrl: null,
  result: null,
  error: null,
};

export const usePay = create<PayState>((set, get) => ({
  ...EMPTY,

  open: async (link) => {
    const c = payClient();
    if (!c) {
      set({ phase: 'error', error: 'Le paiement marchand n’est pas disponible sur cette version.' });
      return;
    }
    const account = useWallet.getState().account;
    const accounts = payAccountsFor(account?.address ?? '');
    if (accounts.length === 0) {
      set({ phase: 'error', error: 'Aucun compte EVM disponible pour payer.' });
      return;
    }

    set({ ...EMPTY, phase: 'loading', link });
    try {
      const options = await c.getPaymentOptions({ paymentLink: link, accounts, includePaymentInfo: true });
      if (options.options.length === 0) {
        set({ phase: 'error', error: 'Aucune option de paiement disponible pour tes soldes.' });
        return;
      }
      set({ phase: 'choosing', options });
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : 'Paiement indisponible.' });
    }
  },

  select: (option, theme) => {
    /*
     * La capture de données est PAR OPTION : certaines l'exigent, d'autres non.
     * Et elle doit avoir lieu AVANT de demander les actions — sinon le service
     * répond « IC data required » et le flux casse sans explication.
     */
    const url = option.collectData?.url;
    set({
      selected: option,
      collectUrl: url ? buildCollectUrl(url, { theme }) : null,
      phase: url ? 'collecting' : 'choosing',
    });
  },

  collected: () => set({ collectUrl: null, phase: 'choosing' }),

  confirm: async (unlock) => {
    const c = payClient();
    const { options, selected } = get();
    if (!c || !options || !selected) return;
    if (selected.collectData?.url && get().collectUrl) {
      set({ phase: 'error', error: 'Informations requises avant de confirmer le paiement.' });
      return;
    }

    set({ phase: 'signing', error: null });
    try {
      const actions = await c.getRequiredPaymentActions({
        paymentId: options.paymentId,
        optionId: selected.id,
      });

      /*
       * L'ORDRE EST CONTRACTUEL : les résultats doivent suivre exactement
       * l'ordre des actions. Et les actions s'enchaînent — un paiement Permit2
       * commence par une approbation dont la suivante dépend —, donc on signe
       * en SÉRIE, jamais en parallèle.
       */
      const data: (string | object)[] = [];
      for (const action of actions) {
        data.push(await signPayAction(action, unlock));
      }

      const result = await c.confirmPayment({
        paymentId: options.paymentId,
        optionId: selected.id,
        data,
      });
      set({ phase: 'done', result });
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : 'Le paiement a échoué.' });
    }
  },

  reset: () => set({ ...EMPTY }),
}));

/**
 * Signe UNE action dictée par le service, après contrôle.
 *
 * Le garde-fou est dans `checkPayAction`, côté domaine et testé : méthode dans
 * une liste fermée, espace de noms `eip155`, réseau dans le périmètre de
 * paiement. Ce sont des actions que le SERVEUR choisit — les signer sans les
 * vérifier reviendrait à lui confier le portefeuille.
 */
async function signPayAction(action: PayAction, unlock: Unlock): Promise<string> {
  const { chainId, method, params } = action.walletRpc;
  const check = checkPayAction({ chainId, method });
  if (!check.ok) throw new Error(check.reason ?? 'Action de paiement refusée');

  let parsed: unknown;
  try {
    parsed = JSON.parse(params);
  } catch {
    throw new Error('Paramètres de paiement illisibles');
  }
  const args = Array.isArray(parsed) ? parsed : [parsed];
  const w = useWallet.getState();

  switch (method as PayMethod) {
    case 'personal_sign': {
      // `personal_sign` reçoit [message, adresse] ; l'ordre peut être inversé
      // selon l'émetteur, on retient ce qui n'est pas notre adresse.
      const me = (w.account?.address ?? '').toLowerCase();
      const message = args.find((a) => typeof a === 'string' && a.toLowerCase() !== me) as string | undefined;
      if (typeof message !== 'string') throw new Error('Message à signer absent');
      return w.signMessage(unlock, message);
    }
    case 'eth_signTypedData_v4': {
      const raw = args.find((a) => typeof a === 'object' || (typeof a === 'string' && a.trim().startsWith('{')));
      const typed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!typed || typeof typed !== 'object') throw new Error('Données typées absentes');
      return w.signTypedData(unlock, typed as Parameters<typeof w.signTypedData>[1]);
    }
    case 'eth_sendTransaction': {
      const tx = args[0] as { to?: string; data?: string; value?: string } | undefined;
      if (!tx?.to) throw new Error('Transaction de paiement incomplète');
      const chain = evmChainIdToKalyx(check.evmChainId!);
      if (!chain) throw new Error(`Réseau ${check.evmChainId} non configuré dans le portefeuille`);
      return w.sendRawTxOn(unlock, chain, {
        to: tx.to,
        data: tx.data ?? '0x',
        value: tx.value ? BigInt(tx.value) : 0n,
        chainId: check.evmChainId!,
      });
    }
    default:
      // Inatteignable : `checkPayAction` a déjà refusé. Gardé parce qu'un
      // ajout à la liste fermée sans branche ici doit échouer bruyamment.
      throw new Error(`Méthode de paiement non gérée : ${method}`);
  }
}

/** Identifiant Kalyx d'une chaîne EVM, ou null si elle n'est pas configurée. */
function evmChainIdToKalyx(evmChainId: number): string | null {
  const { listChains } = require('../src') as typeof import('../src');
  return listChains().find((c) => c.evmChainId === evmChainId)?.id ?? null;
}
