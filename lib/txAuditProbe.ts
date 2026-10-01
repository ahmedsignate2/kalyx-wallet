/**
 * Données PUBLIQUES consultées juste avant l'audit IA d'un envoi.
 *
 * Trois sources, toutes publiques, interrogées en parallèle et bornées dans le
 * temps (une source muette n'empêche jamais l'analyse, elle est seulement dite
 * « non vérifiée ») :
 *  1. TON historique, relu sur le réseau à l'instant — et non le cache, limité
 *     aux 50 dernières transactions et parfois vieux : combien de fois tu as
 *     payé cette adresse, quand, et si elle t'a déjà envoyé des fonds ;
 *  2. le profil public de l'adresse : activité récente, date de la plus
 *     ancienne transaction vue, nombre d'expéditeurs distincts ;
 *  3. les listes noires publiques (GoPlus, réseaux EVM).
 *
 * « DÉJÀ PAYÉE » NE VEUT PAS DIRE « DIGNE DE CONFIANCE ». Si tu as payé un
 * escroc sans le savoir, son adresse est dans ton historique — et peut-être
 * dans ton carnet. Ces faits disent ce que l'adresse est POUR TOI, jamais qui
 * est derrière ; la consigne du modèle (lib/aiTxAudit.ts) le répète, et une
 * liste noire l'emporte toujours sur la familiarité.
 */
import { assessAddress, getAdapter, parseRawTonAddress, parseTonAddress, toRawTonAddress, type TxSummary } from '../src';

/**
 * Clé de comparaison d'une adresse.
 *  - TON : plusieurs écritures d'une même adresse (EQ…, UQ…, 0:…) → forme brute ;
 *  - EVM (0x + 40 hex) et bech32 Bitcoin (bc1…, tb1…) : la casse ne compte pas → minuscules ;
 *  - tout le reste (Solana, Bitcoin base58) : la casse COMPTE, comparaison exacte.
 *    Mettre une adresse Solana en minuscules ferait passer pour identique une
 *    adresse qui ne l'est pas.
 */
export function addressKey(address: string): string {
  const a = (address ?? '').trim();
  const ton = parseTonAddress(a) ?? parseRawTonAddress(a);
  if (ton) return toRawTonAddress(ton);
  if (/^0x[0-9a-fA-F]{40}$/.test(a) || /^(bc|tb|bcrt)1/i.test(a)) return a.toLowerCase();
  return a;
}

export function sameAddress(a: string, b: string): boolean {
  return !!a && !!b && addressKey(a) === addressKey(b);
}

/** Ta relation avec l'adresse, d'après TON historique. */
export interface RecipientHistory {
  paidCount: number;
  lastPaidAt?: number;
  receivedCount: number;
}

export function relationFromHistory(myTxs: TxSummary[], recipient: string): RecipientHistory {
  let paidCount = 0;
  let lastPaidAt: number | undefined;
  let receivedCount = 0;
  for (const tx of myTxs) {
    if (tx.status !== 'success') continue;
    if (tx.direction === 'out' && sameAddress(tx.to, recipient)) {
      paidCount++;
      if (!lastPaidAt || tx.timestamp > lastPaidAt) lastPaidAt = tx.timestamp;
    } else if (tx.direction === 'in' && sameAddress(tx.from, recipient)) {
      receivedCount++;
    }
  }
  return { paidCount, lastPaidAt, receivedCount };
}

/** Profil public de l'adresse, d'après SON historique récent. */
export interface RecipientProfile {
  /** Transactions vues (une page d'indexeur : un plancher, pas un total). */
  txCount: number;
  /** La page était pleine : l'adresse a au moins autant de transactions, sans doute plus. */
  capped: boolean;
  /** Plus ancienne transaction VUE (la vraie première, seulement si `capped` est faux). */
  oldestSeenAt?: number;
  /** Expéditeurs distincts parmi les entrées vues. */
  distinctSenders: number;
  inCount: number;
  outCount: number;
}

/** En dessous, une page d'historique est considérée complète. */
export const PROFILE_PAGE = 20;

export function profileFromHistory(txs: TxSummary[], page = PROFILE_PAGE): RecipientProfile {
  const senders = new Set<string>();
  let oldest: number | undefined;
  let inCount = 0;
  let outCount = 0;
  for (const tx of txs) {
    if (tx.timestamp > 0 && (!oldest || tx.timestamp < oldest)) oldest = tx.timestamp;
    if (tx.direction === 'in') {
      inCount++;
      if (tx.from) senders.add(addressKey(tx.from));
    } else if (tx.direction === 'out') outCount++;
  }
  return { txCount: txs.length, capped: txs.length >= page, oldestSeenAt: oldest, distinctSenders: senders.size, inCount, outCount };
}

export interface RecipientProbe {
  /** Absent : ton historique n'a pas pu être relu. */
  history?: RecipientHistory;
  /** Absent : le profil public n'a pas pu être lu. */
  profile?: RecipientProfile;
  /** Signalements de listes noires (clés i18n GoPlus) ; absent si non vérifié. */
  flags?: string[];
}

function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);
}

/** Ne lève jamais. Chaque source a son propre délai. */
export async function probeRecipient(chainId: string, myAddress: string | undefined, recipient: string, timeoutMs = 6000): Promise<RecipientProbe> {
  let adapter: ReturnType<typeof getAdapter>;
  try {
    adapter = getAdapter(chainId);
  } catch {
    return {};
  }
  const evmChainId = adapter.config.family === 'evm' ? adapter.config.evmChainId : undefined;
  const [mine, theirs, risk] = await Promise.all([
    myAddress ? within(adapter.getHistory(myAddress), timeoutMs) : Promise.resolve(undefined),
    within(adapter.getHistory(recipient), timeoutMs),
    evmChainId ? within(assessAddress(evmChainId, recipient), timeoutMs) : Promise.resolve(undefined),
  ]);
  /*
   * HISTORIQUE VIDE ≠ ADRESSE NEUVE. Quand tous les indexeurs d'un réseau
   * échouent, l'adaptateur rend une liste vide plutôt qu'une erreur : on aurait
   * affirmé « adresse sans aucun historique » à tort. Le vide n'est cru que si
   * le solde de l'adresse est lui aussi nul ; sinon le profil est « non vérifié ».
   */
  let profile = theirs ? profileFromHistory(theirs) : undefined;
  if (profile && profile.txCount === 0) {
    const bal = await within(adapter.getBalance(recipient), timeoutMs);
    if (!bal || bal.raw > 0n) profile = undefined;
  }
  return {
    history: mine ? relationFromHistory(mine, recipient) : undefined,
    profile,
    flags: risk && risk.level !== 'unknown' ? risk.reasons : undefined,
  };
}
