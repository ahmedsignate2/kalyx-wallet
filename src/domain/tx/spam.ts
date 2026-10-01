import { normalizeAddressCase } from '../validation/addressCase';
/**
 * Tri de l'historique : ce qui relève du SPAM, et pourquoi.
 *
 * Un portefeuille public reçoit sans rien demander des tokens inventés, des
 * transferts à zéro et des « bons » qui renvoient vers un site de vol. Les
 * montrer au même rang que ses vraies opérations rend l'historique illisible,
 * et certains sont des pièges actifs :
 *
 *   EMPOISONNEMENT D'ADRESSE. L'attaquant envoie 0 (ou une poussière) depuis
 *   une adresse qui commence et finit comme celle d'un vrai destinataire. La
 *   victime recopie plus tard « la dernière adresse utilisée » depuis son
 *   historique — et paie l'attaquant.
 *
 * Chaque règle rend une RAISON, montrée quand l'utilisateur déplie les
 * transactions masquées : un filtre qui cache sans dire pourquoi inspire la
 * méfiance qu'on cherche justement à éviter.
 */
import type { TxSummary } from '../chains/types';

export type SpamReason = 'poisoning' | 'scamName' | 'zeroValue' | 'unverifiedToken';

export interface SpamCtx {
  /**
   * Le token (réseau + adresse) est-il de confiance ? Vrai pour les tokens
   * détenus et vérifiés, et pour les listes curées. `undefined` si la
   * transaction ne porte pas d'adresse de token (on ne juge pas ce qu'on ne
   * connaît pas).
   */
  trusted: (chain: string, contract: string) => boolean;
  /**
   * Adresses (minuscules) avec lesquelles l'utilisateur a RÉELLEMENT traité :
   * destinataires de ses envois, contacts, ses propres comptes. Sert à
   * reconnaître un sosie.
   */
  known: Set<string>;
}

/**
 * Nom de token qui est une publicité : URL, domaine, « claim », « visit »,
 * récompense chiffrée… Aucun actif sérieux ne s'appelle ainsi.
 */
const SCAM_NAME =
  /(https?:|www\.|t\.me\/|\.(com|io|org|net|xyz|app|site|top|gift|live|pro|fi|cc|vip|click|link|online|finance)\b|claim|visit|reward|airdrop|voucher|bonus|giveaway|free\s|\bgift\b|✅|🎁|💎|\$\s?\d|\d\s?\$)/i;

/**
 * Symbole SOSIE : « EṬH », « UṢDC », « UЅDT » (S cyrillique)… Des lettres
 * accentuées ou d'un autre alphabet qui, à l'œil, redonnent un actif majeur. Relevé
 * sur un vrai portefeuille : c'est la forme des faux « envois » qu'un contrat
 * piégé émet au nom de sa victime.
 */
const MAJOR = new Set(['ETH', 'WETH', 'BTC', 'WBTC', 'USDC', 'USDT', 'DAI', 'SOL', 'BNB', 'POL', 'MATIC', 'ARB', 'OP', 'AVAX', 'TON', 'USDE', 'EURC', 'PYUSD', 'LINK', 'UNI']);
const CONFUSABLE: Record<string, string> = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'Ѕ': 'S', 'І': 'I', 'Ј': 'J', 'Ү': 'Y', 'Ԁ': 'D', 'Ο': 'O', 'Τ': 'T', 'Ε': 'E', 'Η': 'H', 'Β': 'B', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ρ': 'P', 'Χ': 'X', 'Ζ': 'Z', 'Α': 'A' };

export function isLookalikeSymbol(symbol: string | undefined): boolean {
  if (!symbol || /^[\x20-\x7e]*$/.test(symbol)) return false;
  const plain = [...symbol.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')].map((c) => CONFUSABLE[c.toUpperCase()] ?? c).join('').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return MAJOR.has(plain) || MAJOR.has(plain.replace(/^\$/, ''));
}

export function isScamName(name: string | undefined): boolean {
  return !!name && (SCAM_NAME.test(name) || isLookalikeSymbol(name));
}

/** Même 4 premiers et 4 derniers caractères, adresse différente. */
export function looksLike(a: string, b: string): boolean {
  // Même adresse (selon la règle de casse) : pas un sosie. Une variante de casse
  // d'une adresse Solana/base58, elle, EST une autre adresse — et un sosie parfait.
  if (normalizeAddressCase(a) === normalizeAddressCase(b)) return false;
  const x = a.toLowerCase().replace(/^0x/, '');
  const y = b.toLowerCase().replace(/^0x/, '');
  if (x.length < 12 || y.length < 12) return false;
  if (x === y) return true;
  return x.slice(0, 4) === y.slice(0, 4) && x.slice(-4) === y.slice(-4);
}

export function spamReason(tx: TxSummary, ctx: SpamCtx): SpamReason | null {
  const type = (tx.type ?? '').toUpperCase();
  // Ses propres échanges et approbations ne sont jamais du spam.
  if (type === 'SWAP' || type === 'APPROVE' || type === 'APPROVAL') return null;
  const inbound = tx.direction === 'in';
  const counterparty = normalizeAddressCase(inbound ? tx.from : tx.to);

  // Un sosie d'une adresse connue, qui n'est pas elle-même connue : piège.
  if (counterparty && !ctx.known.has(counterparty)) {
    for (const k of ctx.known) if (looksLike(counterparty, k)) return 'poisoning';
  }
  const names = [tx.asset, ...(tx.legs ?? []).map((l) => l.asset)];
  if (names.some(isScamName)) return 'scamName';

  // Transfert d'un TOKEN à 0 : sans intérêt pour personne, sauf pour l'empoisonneur.
  if (tx.contract && type !== 'NFT' && tx.value === 0n) return 'zeroValue';
  if (inbound && !tx.contract && tx.value === 0n && type !== 'NFT' && !tx.legs) return 'zeroValue';

  // Token fongible reçu, inconnu de tout ce qu'on tient pour fiable.
  if (inbound && tx.contract && type !== 'NFT' && !ctx.trusted(tx.chain, tx.contract)) return 'unverifiedToken';
  // « Envoi » d'un token inconnu dans une transaction que l'utilisateur n'a PAS signée : fabriqué.
  if (tx.direction === 'out' && tx.byOwner === false && tx.contract && type !== 'NFT' && !ctx.trusted(tx.chain, tx.contract)) return 'unverifiedToken';
  return null;
}

/** Transaction qui vaut « j'ai payé cette adresse » : envoi réussi, non nul, hors NFT et jeton douteux. */
function isPaidOut(tx: TxSummary, trusted: SpamCtx['trusted']): boolean {
  if (tx.direction !== 'out' || tx.status !== 'success' || tx.value <= 0n || !tx.to) return false;
  if ((tx.type ?? '').toUpperCase() === 'NFT') return false;
  return !(tx.contract && !trusted(tx.chain, tx.contract));
}

/**
 * Adresses PAYÉES, dans leur casse d'origine (pas en minuscules) : sur Solana
 * et en Bitcoin base58, la casse fait partie de l'adresse. Dédoublonnées selon
 * la règle unique de casse (addressCase.ts).
 */
export function paidCounterparties(txs: TxSummary[], trusted: SpamCtx['trusted']): string[] {
  const out = new Map<string, string>();
  for (const tx of txs) if (isPaidOut(tx, trusted)) out.set(normalizeAddressCase(tx.to), tx.to);
  return [...out.values()];
}

/**
 * Adresses « connues » tirées de l'historique lui-même : celles à qui
 * l'utilisateur a envoyé une valeur non nulle, depuis une transaction réussie,
 * en monnaie native ou en token DE CONFIANCE. Un faux token peut émettre un
 * transfert « de toi vers l'attaquant » sans ta signature ; un envoi natif, non.
 */
export function knownCounterparties(txs: TxSummary[], trusted: SpamCtx['trusted'], extra: Iterable<string> = []): Set<string> {
  const out = new Set<string>();
  for (const a of extra) if (a) out.add(normalizeAddressCase(a));
  for (const tx of txs) if (isPaidOut(tx, trusted)) out.add(normalizeAddressCase(tx.to));
  return out;
}
