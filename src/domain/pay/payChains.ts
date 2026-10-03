/**
 * WalletConnect Pay — réseaux couverts et garde-fous de signature.
 *
 * Pur et testable : ce fichier ne parle ni au SDK natif ni au réseau. Il porte
 * les deux choses qu'on ne veut PAS voir dériver — la liste des chaînes où un
 * paiement est possible, et ce qu'on accepte de signer.
 *
 * LE GARDE-FOU EST ICI, DANS LE CODE, pas dans l'écran. Un paiement Pay se
 * déroule en signant des actions que le SERVEUR nous dicte : méthode, chaîne et
 * paramètres viennent d'en face. C'est exactement la situation où il ne faut pas
 * se contenter de faire confiance — la même raison qui avait fait mettre le
 * plancher de sécurité des actions de l'IA dans le parseur et non dans le
 * prompt.
 */
import { decodeTx } from '../tx/decodeTx';
import { summarizeTypedData } from '../wc/message';


/**
 * Identifiants EVM où WalletConnect Pay règle un paiement.
 *
 * Tirés de la documentation Reown (USDC, EURC, USDT, USDT0, PYUSD, USDG selon
 * les réseaux). Une chaîne absente d'ici ne produira aucune option de paiement :
 * inutile d'envoyer un compte que le service n'exploitera pas.
 */
export const PAY_EVM_CHAIN_IDS: readonly number[] = [
  1, // Ethereum
  10, // Optimism
  56, // BNB Smart Chain
  137, // Polygon
  143, // Monad
  8453, // Base
  42161, // Arbitrum
  42220, // Celo
] as const;

/**
 * Méthodes que l'on accepte de signer pour un paiement.
 *
 * Liste FERMÉE. Le serveur dicte les actions ; une méthode inattendue doit être
 * refusée, pas exécutée « au cas où ». Trois suffisent aujourd'hui, et un
 * paiement Permit2 sans autorisation préalable en combine deux — une
 * `eth_sendTransaction` d'approbation, puis une `eth_signTypedData_v4`.
 */
export const PAY_ALLOWED_METHODS = [
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'personal_sign',
] as const;

export type PayMethod = (typeof PAY_ALLOWED_METHODS)[number];

/**
 * Compte au format CAIP-10 (`eip155:<chainId>:<adresse>`).
 *
 * Adresse en MINUSCULES. CAIP-10 tolère la casse mixte de l'EIP-55, mais la
 * forme minuscule est celle qu'attendent la plupart des services, et un
 * comparateur de chaînes naïf côté serveur ne trouverait rien avec une adresse
 * en casse mixte — soldes bien présents, zéro option en retour. C'est une cause
 * plausible d'un refus inexpliqué, et la forme minuscule ne coûte rien.
 */
export function caip10(chainId: number, address: string): string {
  return `eip155:${chainId}:${address.toLowerCase()}`;
}

/**
 * Comptes à présenter au service, un par réseau couvert.
 *
 * Plus on en donne, plus l'utilisateur a d'options de paiement — c'est le
 * service qui choisit lesquelles sont finançables d'après ses soldes réels.
 */
export function payAccountsFor(address: string, chainIds: readonly number[] = PAY_EVM_CHAIN_IDS): string[] {
  const clean = (address ?? '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) return [];
  return chainIds.map((id) => caip10(id, clean));
}

/** Identifiant CAIP-2 décomposé, ou null s'il n'est pas exploitable. */
export function parseCaip2(chainId: string): { namespace: string; reference: string } | null {
  const m = /^([-a-z0-9]{3,8}):([-_a-zA-Z0-9]{1,32})$/.exec((chainId ?? '').trim());
  return m ? { namespace: m[1], reference: m[2] } : null;
}

/**
 * Raison d'un refus, sous forme de CODE.
 *
 * Pas un texte : un domaine pur ne connaît pas la langue de l'utilisateur, et
 * un message écrit ici ressortirait en français quelle que soit la langue
 * choisie. C'est exactement l'erreur que j'ai refaite dans le magasin de Pay.
 */
export type PayRefusal =
  | 'METHOD_NOT_ALLOWED'
  | 'CHAIN_UNREADABLE'
  | 'NAMESPACE_UNSUPPORTED'
  | 'CHAIN_INVALID'
  | 'CHAIN_OUT_OF_SCOPE'
  | 'RISKY_APPROVAL';

export interface PayActionCheck {
  ok: boolean;
  /** Renseigné quand l'action est refusée. */
  reason?: PayRefusal;
  /** Valeur en cause, à injecter dans le message traduit. */
  detail?: string;
  /** Chaîne EVM visée, quand l'action est acceptée. */
  evmChainId?: number;
}

/**
 * Une action dictée par le service est-elle signable ?
 *
 * Trois conditions, toutes nécessaires :
 * 1. la méthode est dans la liste fermée ;
 * 2. la chaîne est un `eip155` — on ne signe pas pour un espace de noms qu'on
 *    ne sait pas interpréter ;
 * 3. cette chaîne fait partie des réseaux couverts par Pay — sinon l'action ne
 *    vient pas du flux qu'on croit.
 */
export function checkPayAction(
  action: { chainId?: unknown; method?: unknown },
  allowed: readonly number[] = PAY_EVM_CHAIN_IDS,
): PayActionCheck {
  const method = typeof action?.method === 'string' ? action.method : '';
  if (!(PAY_ALLOWED_METHODS as readonly string[]).includes(method)) {
    return { ok: false, reason: 'METHOD_NOT_ALLOWED', detail: method };
  }

  const caip = typeof action?.chainId === 'string' ? parseCaip2(action.chainId) : null;
  if (!caip) return { ok: false, reason: 'CHAIN_UNREADABLE' };
  if (caip.namespace !== 'eip155') {
    return { ok: false, reason: 'NAMESPACE_UNSUPPORTED', detail: caip.namespace };
  }

  const evmChainId = Number(caip.reference);
  if (!Number.isInteger(evmChainId) || evmChainId <= 0) {
    return { ok: false, reason: 'CHAIN_INVALID' };
  }
  if (!allowed.includes(evmChainId)) {
    return { ok: false, reason: 'CHAIN_OUT_OF_SCOPE', detail: String(evmChainId) };
  }

  return { ok: true, evmChainId };
}

/** Contrat Permit2 canonique (même adresse sur toutes les chaînes EVM). */
const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';

/**
 * CONTENU d'une action de paiement : `checkPayAction` ne juge que la méthode et
 * le réseau. Un paiement porte un MONTANT : rien ne justifie une autorisation
 * illimitée à un tiers, un `setApprovalForAll`, ni un ordre de place de marché.
 * Seule exception : l'approbation du contrat Permit2 lui-même, première étape
 * normale d'un paiement Permit2 (la signature qui suit, elle, est bornée).
 */
export function checkPayPayload(method: string, args: unknown[]): { ok: true } | { ok: false; reason: 'RISKY_APPROVAL'; detail?: string } {
  if (method === 'eth_sendTransaction') {
    const tx = args[0] as { to?: string; data?: string; value?: string } | undefined;
    const d = decodeTx({ to: tx?.to, data: tx?.data, value: tx?.value });
    if (d.kind === 'approveAll' && d.approved) return { ok: false, reason: 'RISKY_APPROVAL', detail: d.operator };
    if (d.kind === 'approve' && d.unlimited && d.spender.toLowerCase() !== PERMIT2) return { ok: false, reason: 'RISKY_APPROVAL', detail: d.spender };
    return { ok: true };
  }
  if (method === 'eth_signTypedData_v4') {
    const raw = args.find((a) => typeof a === 'object' || (typeof a === 'string' && a.trim().startsWith('{')));
    let typed: unknown = raw;
    if (typeof raw === 'string') {
      try {
        typed = JSON.parse(raw);
      } catch {
        return { ok: true }; // illisible : la signature échouera d'elle-même plus loin
      }
    }
    const sum = summarizeTypedData(typed);
    if (sum?.unlimited || sum?.order) return { ok: false, reason: 'RISKY_APPROVAL', detail: sum.primaryType };
  }
  return { ok: true };
}
