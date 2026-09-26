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
import {
  payAccountsFor,
  checkPayAction,
  decideNoOption,
  listChains,
  formatTokenAmount,
  type PayMethod,
  type PayRefusal,
} from '../src';

/** Identifiant public du projet Pay, fourni au build (secret EAS). */
const PAY_APP_ID = (process.env.EXPO_PUBLIC_WALLETCONNECT_PAY_ID ?? '').trim();

/**
 * Thème du formulaire hébergé, exporté du tableau de bord WalletConnect Pay.
 *
 * Chaîne base64url à passer VERBATIM : le tableau de bord l'encode déjà, et la
 * réencoder produirait un paramètre que le formulaire ignore. Elle décode en
 * `{"fontFamily":"poppins","fontSize":15,"inputRadius":24,"buttonRadius":24}`.
 *
 * Constante et non variable d'environnement : ce n'est ni un secret ni une
 * valeur qui varie par build, et la garder dans le code la rend modifiable par
 * une simple mise à jour OTA.
 */
const PAY_THEME_VARIABLES =
  'eyJmb250RmFtaWx5IjoicG9wcGlucyIsImZvbnRTaXplIjoxNSwiaW5wdXRSYWRpdXMiOjI0LCJidXR0b25SYWRpdXMiOjI0fQ';

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
  /**
   * Compte que le service a RECONNU comme payeur, s'il en a reconnu un.
   *
   * Champ à haute valeur de diagnostic : absent, il dit que le service n'a
   * apparié AUCUN des comptes envoyés — ce qui n'a rien à voir avec un solde
   * insuffisant. On ne le lisait pas, et c'est une des raisons pour lesquelles
   * un « zéro option » restait indéchiffrable.
   */
  buyer?: { accountCaip10: string; accountProviderName: string };
}

export interface PayOptions {
  paymentId: string;
  info?: PayInfo;
  options: PayOption[];
  /**
   * Capture de données exigée AVANT toute option, au niveau de la demande.
   *
   * Distincte du `collectData` porté par une option : celle-ci conditionne la
   * production même des options. Le service peut donc rendre zéro option non
   * par manque de fonds, mais parce qu'il attend des informations — et tant
   * qu'on ne lisait pas ce champ, ce cas ressortait en « rien pour payer ».
   */
  collectData?: PayCollectData | null;
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

/**
 * Montant lisible d'un `PayAmount`.
 *
 * `value` est en UNITÉS MINIMALES ; l'afficher tel quel fait passer 0,01 USD
 * pour 1 USD. Mes traces le faisaient, et un diagnostic qui se trompe d'un
 * facteur cent envoie chercher le problème au mauvais endroit.
 */
export function payAmountText(amount: PayAmount | undefined): string | null {
  if (!amount) return null;
  let raw: bigint;
  try {
    raw = BigInt(amount.value || '0');
  } catch {
    return `${amount.value} ${amount.display?.assetSymbol ?? ''}`.trim();
  }
  return `${formatTokenAmount(raw, amount.display?.decimals ?? 0)} ${amount.display?.assetSymbol ?? ''}`.trim();
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
  /**
   * Formulaire envoyé, et le service ne propose toujours rien.
   *
   * Distinct de `NO_OPTION` : l'utilisateur a fourni ce qu'on lui demandait, il
   * doit savoir que ce n'est pas lui qui a mal fait. Et distinct pour une raison
   * de fonctionnement : c'est cet état qui ARRÊTE la boucle — sans lui, on
   * réaffichait le même formulaire indéfiniment.
   */
  | 'INFO_NOT_ENOUGH'
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

  /** Compte qui paie, et son adresse EVM. Renseigné dès le premier chargement. */
  payer: { index: number; evmAddress: string } | null;

  /**
   * Charge les options d'un lien de paiement.
   *
   * Options NOMMÉES : la file de paramètres positionnels devenait illisible, et
   * trois booléens de suite finissent toujours par être inversés.
   *
   * `afterInfo` marque le rechargement qui SUIT l'envoi du formulaire. Sans ce
   * drapeau, un service qui redemande des informations à chaque réponse fait
   * reparcourir le formulaire sans fin — c'est la boucle observée sur appareil.
   *
   * `accountIndex` laisse payer depuis un AUTRE compte que celui affiché. Un
   * portefeuille en a souvent plusieurs, et les fonds ne sont pas toujours sur
   * celui qu'on regarde — sans ce choix, il fallait changer de compte à
   * l'accueil puis rescanner le QR.
   */
  open: (
    link: string,
    opts?: { afterInfo?: boolean; theme?: 'light' | 'dark'; accountIndex?: number },
  ) => Promise<void>;
  /** Retient une option ; ouvre la capture de données si elle est requise. */
  select: (option: PayOption, theme?: 'light' | 'dark') => void;
  /** Le formulaire hébergé a abouti : on peut poursuivre. */
  collected: () => void;
  /**
   * Redemande les options sans repasser par le formulaire.
   *
   * La vérification d'identité que le service exige n'est pas instantanée :
   * elle peut être en cours d'examen quand on redemande les options. Sans
   * relance, l'utilisateur devait ressortir de l'écran et RESCANNER le QR pour
   * savoir si elle avait abouti.
   */
  recheck: () => Promise<void>;
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
  payer: null,
};

export const usePay = create<PayState>((set, get) => ({
  ...EMPTY,

  open: async (link, opts = {}) => {
    const { afterInfo = false, theme, accountIndex } = opts;
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
    const wanted = accountIndex ?? w.activeAccountIndex;
    const stored = w.accounts.find((a) => a.index === wanted) ?? w.accounts[0];
    const accounts = payAccountsFor(stored?.evmAddress ?? '');
    if (accounts.length === 0) {
      set({ phase: 'error', failure: 'NO_EVM_ACCOUNT' });
      return;
    }

    /*
     * Le compte payeur est CONSERVÉ dans l'état : l'écran doit pouvoir dire
     * lequel a servi. Devant un « rien pour payer », savoir quelle adresse a été
     * interrogée est la moitié de l'explication — c'est celle qu'il faut
     * alimenter.
     */
    set({ ...EMPTY, phase: 'loading', link, payer: { index: stored.index, evmAddress: stored.evmAddress } });
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
        requested: payAmountText(options.info?.amount) ?? undefined,
        merchant: options.info?.merchant.name,
        /*
         * Le payeur RECONNU par le service, et la capture de données exigée au
         * niveau de la demande. Deux champs que le SDK rend depuis le début et
         * qu'on ne regardait pas — donc deux causes de « zéro option » qu'on ne
         * pouvait pas distinguer d'un solde insuffisant.
         */
        buyer: options.info?.buyer?.accountCaip10,
        buyerVia: options.info?.buyer?.accountProviderName,
        needsData: options.collectData ? 'oui' : 'non',
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
        /*
         * UNE CAPTURE EXIGÉE AU NIVEAU DE LA DEMANDE n'est pas une absence de
         * fonds. Le service ne produit aucune option tant qu'il n'a pas les
         * informations qu'il réclame ; conclure « rien pour payer » enverrait
         * l'utilisateur alimenter un portefeuille déjà suffisant. On ouvre donc
         * le formulaire, et le flux reprend ensuite son cours normal.
         */
        /*
         * LA DÉCISION EST DANS `decideNoOption`, pure et testée — c'est ici
         * qu'était la boucle, et une règle de ce genre n'a pas sa place au
         * milieu d'un magasin où rien ne peut la vérifier.
         */
        const next = decideNoOption({ rootCollectUrl: options.collectData?.url, afterInfo });
        if (next.kind === 'collect') {
          set({
            phase: 'collecting',
            options,
            /*
             * Le mode CLAIR ou SOMBRE de l'app accompagne le thème : la
             * documentation recommande de l'accorder, et un formulaire blanc
             * qui s'ouvre au milieu d'une app sombre se remarque.
             */
            collectUrl: buildCollectUrl(next.url, { theme, themeVariables: PAY_THEME_VARIABLES }),
            payer: get().payer,
            failure: null,
          });
          return;
        }
        set({ phase: 'error', failure: next.reason, options, detail: options.info?.status ?? null });
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
      collectUrl: url ? buildCollectUrl(url, { theme, themeVariables: PAY_THEME_VARIABLES }) : null,
      phase: url ? 'collecting' : 'choosing',
    });
  },

  recheck: async () => {
    const { link, payer } = get();
    // `afterInfo` : on ne repropose jamais le formulaire, il a déjà été envoyé.
    if (link) await get().open(link, { afterInfo: true, accountIndex: payer?.index });
  },

  collected: () => {
    /*
     * Deux situations, et elles ne se terminent pas de la même façon.
     *
     * La capture portée par une OPTION arrive alors que l'option est déjà
     * choisie : il n'y a plus qu'à signer. La capture portée par la DEMANDE
     * arrive avant qu'aucune option n'existe — le service les produit à partir
     * des informations qu'on vient de lui donner. Retomber sur « choisir »
     * afficherait alors une liste vide, sans rien expliquer.
     */
    const { options, link } = get();
    if (link && (options?.options.length ?? 0) === 0) {
      set({ collectUrl: null });
      /*
       * `afterInfo` : ce rechargement SUIT l'envoi du formulaire. Il interdit
       * d'y revenir, et c'est ce qui coupe la boucle. Le compte payeur est
       * repris tel quel, sans quoi la relance interrogerait un autre compte que
       * celui pour lequel les informations viennent d'être envoyées.
       */
      void get().open(link, { afterInfo: true, accountIndex: get().payer?.index });
      return;
    }
    set({ collectUrl: null, phase: 'choosing' });
  },

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
        sdkAvailable: payClient() !== null,
        appIdSet: PAY_APP_ID.length > 0,
        accountsSent: payAccountsFor(stored?.evmAddress ?? ''),
        optionCount: options?.options.length ?? null,
        paymentId: options?.paymentId ?? null,
        requestStatus: options?.info?.status ?? null,
        requested: payAmountText(options?.info?.amount),
        merchant: options?.info?.merchant.name ?? null,
        expiresAt: options?.info?.expiresAt ?? null,
        /** Le service a-t-il apparié un de nos comptes ? Absent = non. */
        buyerRecognised: options?.info?.buyer?.accountCaip10 ?? null,
        buyerProvider: options?.info?.buyer?.accountProviderName ?? null,
        collectDataAtRoot: options?.collectData?.url ?? null,
        /*
         * LA RÉPONSE ENTIÈRE, telle quelle.
         *
         * J'ai choisi les champs à la main trois fois de suite, et trois fois la
         * réponse se trouvait dans un champ que je n'avais pas pris — le montant
         * mal divisé, le payeur reconnu, la capture au niveau racine. Un
         * diagnostic dont le contenu dépend de mes hypothèses ne sert qu'à les
         * confirmer.
         *
         * Aucun secret n'y figure : identifiants de paiement, montants, marchand
         * et adresses publiques. Rien ne vient du portefeuille de l'utilisateur.
         */
        raw: options ?? null,
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
