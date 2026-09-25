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
import { technicalLogger } from './technicalLogger';
import type { Unlock } from './walletStore';
import { base64 } from '@scure/base';
import { utf8ToBytes } from '@noble/hashes/utils';
import { payAccountsFor, checkPayAction, listChains, type PayMethod, type PayRefusal } from '../src';

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

/**
 * Refus du garde-fou, porteur d'un CODE et non d'une phrase.
 *
 * Une `Error` avec un message français aurait ressorti ce message à l'écran,
 * non traduit — c'est précisément le défaut qu'on corrige ici.
 */
export class PayActionRefused extends Error {
  constructor(
    readonly code: PayRefusal,
    readonly detail?: string,
  ) {
    super(`pay action refused: ${code}`);
    this.name = 'PayActionRefused';
  }
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

/**
 * base64url sans remplissage, tel que le formulaire l'attend.
 *
 * Passe par `@scure/base` et non par `btoa` ni `Buffer` : NI L'UN NI L'AUTRE
 * n'est garanti sous Hermes. `btoa` n'est pas un global de React Native, et
 * `Buffer` n'existe que si on l'installe explicitement — ce que le projet ne
 * fait pas. Le code aurait donc levé dans l'app tout en passant en test, où
 * Node fournit les deux.
 */
function base64url(value: string): string {
  return base64.encode(utf8ToBytes(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

/**
 * Cause d'échec, sous forme de CODE.
 *
 * PAS un texte. J'avais écrit ces messages en français en dur dans ce magasin,
 * et ils sont ressortis en français à l'écran quelle que soit la langue — alors
 * que les clés de traduction existaient déjà et que j'avais moi-même posé la
 * règle ailleurs : un module qui ne fait pas d'interface n'écrit pas de phrase.
 */
export type PayFailure =
  /** Module natif absent : installation antérieure au build qui l'embarque. */
  | 'UNAVAILABLE'
  /** Aucune adresse EVM sur ce portefeuille (import par clé privée exotique). */
  | 'NO_EVM_ACCOUNT'
  /** Le service ne propose rien de finançable avec les soldes actuels. */
  | 'NO_OPTION'
  /** Informations exigées, formulaire non complété. */
  | 'INFO_REQUIRED'
  /** Échec réseau ou refus du service. */
  | 'FAILED'
  /** Action de paiement refusée par le garde-fou. */
  | 'ACTION_REFUSED';

interface PayState {
  phase: Phase;
  link: string | null;
  options: PayOptions | null;
  /** Option retenue par l'utilisateur. */
  selected: PayOption | null;
  /** URL du formulaire hébergé, quand l'option choisie exige une capture. */
  collectUrl: string | null;
  result: PayResult | null;
  /** Cause d'échec, à traduire par l'écran. */
  failure: PayFailure | null;
  /** Détail technique éventuel (méthode refusée, message du service). */
  detail: string | null;

  /** Charge les options d'un lien de paiement. */
  open: (link: string) => Promise<void>;
  /** Retient une option ; ouvre la capture de données si elle est requise. */
  select: (option: PayOption, theme?: 'light' | 'dark') => void;
  /** Le formulaire hébergé a abouti : on peut poursuivre. */
  collected: () => void;
  /** Résumé copiable de la tentative, pour un ticket. */
  diagnostic: () => string;
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
  failure: null,
  detail: null,
};

export const usePay = create<PayState>((set, get) => ({
  ...EMPTY,

  open: async (link) => {
    const c = payClient();
    if (!c) {
      set({ phase: 'error', failure: 'UNAVAILABLE' });
      return;
    }

    /*
     * L'adresse EVM, TOUJOURS — et non `account.address`, qui suit la chaîne
     * active et vaut donc une adresse Bitcoin ou Solana quand l'utilisateur est
     * sur ces réseaux. Scanner un lien de paiement depuis l'écran Bitcoin
     * envoyait alors zéro compte au service, sans que rien ne l'explique.
     */
    const w = useWallet.getState();
    const stored = w.accounts.find((a) => a.index === w.activeAccountIndex) ?? w.accounts[0];
    const accounts = payAccountsFor(stored?.evmAddress ?? '');
    if (accounts.length === 0) {
      set({ phase: 'error', failure: 'NO_EVM_ACCOUNT' });
      return;
    }

    set({ ...EMPTY, phase: 'loading', link });
    try {
      const options = await c.getPaymentOptions({ paymentLink: link, accounts, includePaymentInfo: true });

      /*
       * TRACE DE DIAGNOSTIC. Zéro option peut venir de plusieurs causes qu'on
       * ne distingue pas depuis l'écran : soldes insuffisants, demande déjà
       * réglée, demande expirée, ou comptes envoyés sous une forme que le
       * service n'exploite pas. Sans cette trace, un « rien pour payer » reste
       * inexplicable — c'est ce qui s'est passé au premier essai sur appareil.
       *
       * Ne contient AUCUN secret : des adresses publiques et le statut du
       * service, et le filtre d'assainissement raccourcit les adresses.
       */
      technicalLogger.log('DAPP', 'WalletConnect Pay : options', {
        chains: accounts.length,
        accounts: accounts.join(' '),
        options: options.options.length,
        status: options.info?.status,
        requested: options.info
          ? `${options.info.amount.value} ${options.info.amount.display.assetSymbol}`
          : undefined,
        merchant: options.info?.merchant.name,
      });

      if (options.options.length === 0) {
        /*
         * Zéro option n'est PAS forcément une panne : WalletConnect Pay ne règle
         * qu'en stablecoins précis sur huit réseaux. Un portefeuille qui ne
         * détient que de l'ETH n'a légitimement rien à proposer, et le message
         * doit le dire au lieu de laisser croire à un bogue.
         */
        /*
         * L'état de la demande est CONSERVÉ même sans option : il explique le
         * refus bien mieux que nous. Une demande expirée ou déjà réglée n'a rien
         * à voir avec un solde insuffisant, et l'écran peut le dire.
         */
        set({ phase: 'error', failure: 'NO_OPTION', options, detail: options.info?.status ?? null });
        return;
      }
      set({ phase: 'choosing', options });
    } catch (e) {
      set({ phase: 'error', failure: 'FAILED', detail: e instanceof Error ? e.message : null });
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
      set({ phase: 'error', failure: 'INFO_REQUIRED' });
      return;
    }

    set({ phase: 'signing', failure: null, detail: null });
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
      const refused = e instanceof PayActionRefused ? e : null;
      set({
        phase: 'error',
        failure: refused ? 'ACTION_REFUSED' : 'FAILED',
        detail: refused ? refused.code : e instanceof Error ? e.message : null,
      });
    }
  },

  reset: () => set({ ...EMPTY }),

  /**
   * Résumé copiable de la tentative.
   *
   * Zéro option a plusieurs causes que l'écran ne distingue pas : soldes
   * insuffisants pour le MONTANT demandé, demande expirée, déjà réglée, ou
   * comptes envoyés sous une forme que le service n'exploite pas. Sans ce
   * résumé on en reste aux hypothèses — et j'en ai déjà donné deux fausses.
   *
   * Ne contient aucun secret : des adresses publiques, le statut du service et
   * le montant demandé.
   */
  diagnostic: () => {
    const { link, options, failure, detail } = get();
    const w = useWallet.getState();
    const stored = w.accounts.find((a) => a.index === w.activeAccountIndex) ?? w.accounts[0];
    return JSON.stringify(
      {
        link,
        failure,
        detail,
        accountsSent: payAccountsFor(stored?.evmAddress ?? ''),
        optionCount: options?.options.length ?? null,
        paymentId: options?.paymentId ?? null,
        requestStatus: options?.info?.status ?? null,
        requested: options?.info
          ? `${options.info.amount.value} ${options.info.amount.display.assetSymbol} (${options.info.amount.display.decimals} déc.)`
          : null,
        merchant: options?.info?.merchant.name ?? null,
        expiresAt: options?.info?.expiresAt ?? null,
      },
      null,
      2,
    );
  },
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
  if (!check.ok) throw new PayActionRefused(check.reason ?? 'CHAIN_UNREADABLE', check.detail);

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

/**
 * Identifiant Kalyx d'une chaîne EVM, ou null si elle n'est pas configurée.
 *
 * `listChains` est importé statiquement : un `require` au milieu d'une fonction
 * n'apportait rien ici — le même module est déjà importé en tête du fichier —
 * et laissait planer un doute sur une résolution paresseuse qui n'avait aucune
 * raison d'être.
 */
function evmChainIdToKalyx(evmChainId: number): string | null {
  return listChains().find((c) => c.evmChainId === evmChainId)?.id ?? null;
}
