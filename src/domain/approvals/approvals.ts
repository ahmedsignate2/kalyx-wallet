/**
 * Approbations ERC-20 (« allowances ») — façon revoke.cash.
 *
 * Quand tu utilises une dApp (swap, NFT…), tu autorises un contrat (le
 * « spender ») à dépenser tes tokens, souvent en montant ILLIMITÉ. Ces
 * autorisations restent actives indéfiniment : un contrat compromis peut vider
 * ce token. Cet écran les liste et permet de les RÉVOQUER (approve(spender, 0)).
 *
 * Ce module = helpers PURS (testés). La récupération réseau (getLogs +
 * allowance) est dans EvmChainAdapter.getApprovals.
 */
import { Interface, id, zeroPadValue, getAddress } from 'ethers';

/** topic0 de l'événement Approval(address,address,uint256). */
export const APPROVAL_TOPIC = id('Approval(address,address,uint256)');

const ERC20 = new Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

/** Seuil « illimité » : aucune autorisation finie légitime n'atteint 2^255. */
const UNLIMITED_THRESHOLD = 1n << 255n;

export interface ApprovalItem {
  /** Contrat du token. */
  token: string;
  /** Métadonnées du token (déjà connues via getErc20Tokens). */
  symbol: string;
  decimals: number;
  logo?: string;
  /** Contrat autorisé à dépenser. */
  spender: string;
  /** Allowance actuelle (0 = déjà révoquée, exclue de la liste). */
  allowance: bigint;
  /** Nom du contrat autorisé, quand il est connu (« LiFiDiamond »). */
  spenderName?: string;
  /** Contrat autorisé signalé comme malveillant ou douteux (GoPlus). */
  risky?: boolean;
}

/** Autorisation annoncée par GoPlus, à VÉRIFIER sur la chaîne avant affichage. */
export interface ApprovalCandidate {
  token: string;
  symbol: string;
  decimals: number;
  spender: string;
  spenderName?: string;
  risky: boolean;
}

/**
 * Réponse GoPlus `token_approval_security` → paires (token, contrat autorisé).
 *
 * Pourquoi GoPlus : la liste passait par `getLogs` depuis le bloc 0, une plage
 * que la plupart des RPC refusent. L'échec était avalé token par token, et
 * l'écran affirmait « aucune approbation active » sans avoir rien pu lire.
 * GoPlus indexe ces autorisations ; on ne lui fait confiance que pour les
 * TROUVER — le montant est relu sur la chaîne (`allowance`).
 */
export function parseGoPlusApprovals(json: unknown): ApprovalCandidate[] {
  const list = (json as { result?: unknown } | null)?.result;
  if (!Array.isArray(list)) return [];
  const out: ApprovalCandidate[] = [];
  for (const t of list as Record<string, unknown>[]) {
    const token = typeof t?.token_address === 'string' ? t.token_address : '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) continue;
    const decimals = Number(t.decimals);
    for (const a of (Array.isArray(t.approved_list) ? t.approved_list : []) as Record<string, unknown>[]) {
      const spender = typeof a?.approved_contract === 'string' ? a.approved_contract : '';
      if (!/^0x[0-9a-fA-F]{40}$/.test(spender)) continue;
      const info = (a.address_info ?? {}) as { contract_name?: unknown; malicious_behavior?: unknown; doubt_list?: unknown };
      const bad = (Array.isArray(info.malicious_behavior) && info.malicious_behavior.length > 0) || info.doubt_list === 1 || t.malicious_address === 1;
      out.push({
        token: getAddress(token),
        symbol: typeof t.token_symbol === 'string' && t.token_symbol ? t.token_symbol.slice(0, 20) : '?',
        decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18,
        spender: getAddress(spender),
        ...(typeof info.contract_name === 'string' && info.contract_name ? { spenderName: info.contract_name.slice(0, 40) } : {}),
        risky: bad,
      });
    }
  }
  return out;
}

/** Topic (32 octets) d'une adresse, pour filtrer les logs par propriétaire. */
export function addressTopic(address: string): string {
  return zeroPadValue(getAddress(address), 32).toLowerCase();
}

/** Adresse depuis un topic 32 octets (spender = topics[2]). */
export function addressFromTopic(topic: string): string {
  return getAddress('0x' + topic.slice(-40));
}

/** Spenders UNIQUES tirés des logs Approval (déduplique, garde l'ordre récent). */
export function spendersFromLogs(logs: { topics: readonly string[] }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Les logs arrivent du plus ancien au plus récent : on parcourt à l'envers
  // pour privilégier l'approbation la plus récente d'un même spender.
  for (let i = logs.length - 1; i >= 0; i--) {
    const t = logs[i]?.topics;
    if (!t || t.length < 3) continue;
    const spender = addressFromTopic(t[2]);
    if (!seen.has(spender)) {
      seen.add(spender);
      out.push(spender);
    }
  }
  return out;
}

/** Une allowance est-elle « illimitée » (à afficher comme telle) ? */
export function isUnlimited(allowance: bigint): boolean {
  return allowance >= UNLIMITED_THRESHOLD;
}

/** Données d'appel pour révoquer : approve(spender, 0). */
export function revokeCalldata(spender: string): string {
  return ERC20.encodeFunctionData('approve', [getAddress(spender), 0n]);
}

/**
 * RÉVOCATION GROUPÉE — un compte classique (EOA) ne peut pas tout révoquer en
 * UNE transaction : on en envoie une par autorisation, signées avec la même clé
 * (une seule confirmation), nonces suivis par le lot.
 *
 * Pour chacune, dans l'ordre :
 *  - `check` relit l'autorisation : déjà à 0 → « already », rien n'est envoyé ;
 *  - `send` envoie (et rend le nonce RÉELLEMENT utilisé : l'appelant prend le
 *    plus grand entre celui proposé et celui du réseau, au cas où une autre
 *    transaction serait partie entre-temps) ;
 *  - refus du contrat AVANT diffusion (CALL_EXCEPTION) → « skipped », nonce
 *    intact, on continue ;
 *  - erreur AVANT signature (frais insuffisants, réseau muet) → « failed »
 *    (rien n'est parti), arrêt ;
 *  - échec PENDANT la diffusion (`afterSign`) → « uncertain », arrêt :
 *    continuer risquerait de remplacer une transaction ; l'écran dit de
 *    vérifier l'historique avant de réessayer.
 * `shouldContinue` faux (demande annulée) : plus rien ne part.
 */
export type RevokeOutcome =
  | { status: 'sent'; hash: string }
  | { status: 'already' }
  | { status: 'skipped'; error: unknown }
  | { status: 'failed'; error: unknown }
  | { status: 'uncertain'; error: unknown }
  | { status: 'notSent' };

export async function runRevokeBatch<T>(
  items: readonly T[],
  firstNonce: number,
  io: {
    check?: (item: T) => Promise<'active' | 'revoked'>;
    send: (item: T, nonce: number) => Promise<{ hash: string; nonce: number }>;
    shouldContinue?: () => boolean;
  },
  onProgress?: (done: number, total: number) => void,
): Promise<RevokeOutcome[]> {
  const out: RevokeOutcome[] = items.map(() => ({ status: 'notSent' }));
  let nonce = firstNonce;
  for (let i = 0; i < items.length; i++) {
    if (io.shouldContinue && !io.shouldContinue()) break;
    onProgress?.(i, items.length);
    try {
      if (io.check && (await io.check(items[i])) === 'revoked') {
        out[i] = { status: 'already' };
        continue;
      }
    } catch {
      /* relecture impossible : on tente l'envoi, la simulation tranchera */
    }
    try {
      const r = await io.send(items[i], nonce);
      out[i] = { status: 'sent', hash: r.hash };
      nonce = r.nonce + 1;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'CALL_EXCEPTION') {
        out[i] = { status: 'skipped', error: e }; // pas diffusée : nonce intact
        continue;
      }
      // Incertaine seulement si l'échec est survenu APRÈS signature (diffusion) ; avant, rien n'est parti.
      const afterSign = !!(e as { afterSign?: boolean })?.afterSign;
      out[i] = afterSign && code !== 'INSUFFICIENT_FUNDS' ? { status: 'uncertain', error: e } : { status: 'failed', error: e };
      break;
    }
  }
  onProgress?.(items.length, items.length);
  return out;
}
