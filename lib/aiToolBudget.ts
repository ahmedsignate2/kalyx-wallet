/**
 * Budget des outils de l'assistant — le garde-fou contre le gaspillage.
 *
 * LE RISQUE. L'app accepte n'importe quel modèle, y compris des 8B et un
 * endpoint personnalisé. Un modèle qui boucle — parce qu'il n'a pas compris la
 * réponse, ou parce qu'il hallucine une raison de réessayer — peut enchaîner
 * les appels RPC et brûler un quota Alchemy ou Helius en quelques secondes. Ce
 * n'est pas une hypothèse : c'est le comportement par défaut d'un modèle faible
 * à qui on donne un outil.
 *
 * LE PRINCIPE. Le budget est appliqué ICI, en dur, jamais demandé au modèle.
 * Une consigne de prompt ne tient pas contre une boucle ; un compteur, oui.
 *
 * Trois limites, chacune répondant à un mode de gaspillage distinct :
 *  1. Par TOUR : un modèle qui s'entête dans une seule réponse est coupé net.
 *  2. Par HEURE : un modèle qui s'entête sur plusieurs échanges est coupé
 *     aussi — la limite par tour seule se contourne en relançant la question.
 *  3. Par CIBLE, avec cache : remesurer le même réseau deux fois de suite ne
 *     coûte rien. La deuxième réponse vient du cache, sans appel réseau.
 */

/** Appels facturables autorisés dans une seule réponse de l'assistant. */
export const MAX_CALLS_PER_TURN = 3;
/** Appels facturables autorisés sur une fenêtre glissante d'une heure. */
export const MAX_CALLS_PER_HOUR = 20;
/** Durée pendant laquelle une mesure est réutilisée au lieu d'être refaite. */
export const CACHE_TTL_MS = 30_000;
/** Délai au-delà duquel une mesure est abandonnée. */
export const TOOL_TIMEOUT_MS = 8_000;

const HOUR_MS = 3_600_000;

interface CacheEntry {
  at: number;
  value: unknown;
}

/** Horodatages des appels facturables, fenêtre glissante d'une heure. */
let billableCalls: number[] = [];
let callsThisTurn = 0;
const cache = new Map<string, CacheEntry>();

/** À appeler au début de chaque réponse de l'assistant. */
export function startTurn(): void {
  callsThisTurn = 0;
}

export interface BudgetVerdict {
  allowed: boolean;
  /** Motif du refus, destiné au modèle : il doit savoir POURQUOI et s'arrêter. */
  reason?: string;
  /** Valeur servie depuis le cache, s'il y en a une. */
  cached?: unknown;
}

/**
 * Autorise (ou non) un appel facturable. `key` identifie la CIBLE exacte
 * (outil + arguments), pour que le cache puisse jouer.
 */
export function requestBillableCall(key: string): BudgetVerdict {
  const now = Date.now();

  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    // Servi depuis le cache : ne consomme NI le quota du tour, NI celui de
    // l'heure. Remesurer la même chose ne coûte rien, donc ne coûte rien.
    return { allowed: true, cached: hit.value };
  }

  if (callsThisTurn >= MAX_CALLS_PER_TURN) {
    return {
      allowed: false,
      reason: `Limite atteinte : ${MAX_CALLS_PER_TURN} mesures maximum par réponse. Conclus avec ce que tu as déjà.`,
    };
  }

  billableCalls = billableCalls.filter((t) => now - t < HOUR_MS);
  if (billableCalls.length >= MAX_CALLS_PER_HOUR) {
    return {
      allowed: false,
      reason: `Limite horaire atteinte : ${MAX_CALLS_PER_HOUR} mesures par heure. Réponds sans mesurer.`,
    };
  }

  callsThisTurn += 1;
  billableCalls.push(now);
  return { allowed: true };
}

/** Enregistre le résultat d'une mesure pour que la même cible soit servie du cache. */
export function rememberResult(key: string, value: unknown): void {
  cache.set(key, { at: Date.now(), value });
  // Le cache ne doit pas croître indéfiniment sur une longue session.
  if (cache.size > 64) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/** État du budget, pour l'afficher ou le journaliser. */
export function budgetSnapshot() {
  const now = Date.now();
  billableCalls = billableCalls.filter((t) => now - t < HOUR_MS);
  return {
    turn: callsThisTurn,
    maxTurn: MAX_CALLS_PER_TURN,
    hour: billableCalls.length,
    maxHour: MAX_CALLS_PER_HOUR,
    cached: cache.size,
  };
}

/** Réinitialisation complète — tests uniquement. */
export function __resetBudget(): void {
  billableCalls = [];
  callsThisTurn = 0;
  cache.clear();
}
