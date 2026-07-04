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
