/**
 * Aura Engine — le halo comme UNIQUE indicateur d'état de l'app (docs/08 §3).
 *
 * Un seul objet vivant dit, sans texte, si Kalyx se repose, travaille, attend
 * ou vient de réussir. Les écrans n'animent JAMAIS le halo : ils émettent des
 * événements, l'Aura décide comment les montrer. C'est ce qui garantit une
 * grammaire unique, et c'est ce qui permettra au rendu Skia de ne remplacer
 * que le dessin sans toucher à la sémantique.
 *
 * RÈGLE FONDATRICE (§2.6, « jamais de faux progrès ») : un état n'existe ici
 * que s'il est adossé à une donnée réelle. `gasTrackerStore` renvoyant
 * aujourd'hui du `Math.random()`, l'ambiance « réseau chargé » prévue au plan
 * est VOLONTAIREMENT ABSENTE de ce type — on ne peut pas la déclarer par
 * erreur. Elle apparaîtra le jour où la donnée sera vraie, pas avant.
 */
import { create } from 'zustand';

/** Ce que le halo fait en permanence. */
export type AuraAmbient = 'rest' | 'sync' | 'offline';

/** Ce qu'il joue une fois, par-dessus l'ambiance, puis retour. */
export type AuraPulse = 'receive' | 'success' | 'error' | 'unlock';

/** §3.3 — une impulsion plus prioritaire interrompt une moins prioritaire. */
const PRIORITY: Record<AuraPulse, number> = { error: 4, success: 3, receive: 2, unlock: 1 };

/**
 * Deux événements IDENTIQUES dans cette fenêtre n'en font qu'un : trois
 * réceptions simultanées produisent une seule expansion, pas trois saccades.
 */
const COALESCE_MS = 500;

/** Écart minimal sous lequel deux impulsions ne se lisent plus séparément. */
const MIN_GAP_MS = 700;

/** Durée pendant laquelle une impulsion reste « en cours » pour le rendu. */
const PULSE_MS = 900;

export interface AuraEvent {
  kind: AuraPulse;
  /** Change à chaque impulsion retenue : c'est ce qui déclenche le rendu. */
  seq: number;
}

interface AuraState {
  ambient: AuraAmbient;
  /** Dernière impulsion retenue, ou null au repos. */
  event: AuraEvent | null;
  /**
   * Le halo est-il monté et visible ? Une impulsion émise alors qu'il ne l'est
   * pas est ABANDONNÉE, jamais mise en file : rejouer au retour sur l'écran
   * mentirait sur le moment où la chose s'est produite. La réception est
   * rattrapée autrement, par les chiffres qui roulent depuis l'ancienne valeur
   * affichée (§3.3, §8).
   */
  visible: boolean;

  setAmbient: (a: AuraAmbient) => void;
  setVisible: (v: boolean) => void;
  /** Point d'entrée unique des écrans. Retourne true si l'impulsion a été retenue. */
  emit: (kind: AuraPulse) => boolean;
}

/** État d'arbitrage, hors du store : il ne doit jamais provoquer de rendu. */
let lastAt = 0;
let lastKind: AuraPulse | null = null;
let lastPriority = 0;
let seq = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export const useAura = create<AuraState>((set, get) => ({
  ambient: 'rest',
  event: null,
  visible: false,

  setAmbient: (a) => {
    if (get().ambient !== a) set({ ambient: a });
  },

  setVisible: (v) => {
    if (get().visible !== v) set({ visible: v });
  },

  emit: (kind) => {
    if (!get().visible) return false;

    const now = Date.now();
    const since = now - lastAt;

    // Coalescence : le même événement, deux fois, coup sur coup = une fois.
    if (kind === lastKind && since < COALESCE_MS) return false;

    // Trop tôt : on ne cède la place qu'à strictement plus prioritaire.
    if (since < MIN_GAP_MS && PRIORITY[kind] <= lastPriority) return false;

    lastAt = now;
    lastKind = kind;
    lastPriority = PRIORITY[kind];
    seq += 1;
    set({ event: { kind, seq } });

    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      clearTimer = null;
      lastPriority = 0;
      // On ne retombe au repos que si aucune impulsion n'est arrivée depuis.
      if (useAura.getState().event?.seq === seq) useAura.setState({ event: null });
    }, PULSE_MS);

    return true;
  },
}));

/**
 * Façade impérative, pour les endroits qui ne sont pas des composants (stores,
 * couche réseau). Les écrans, eux, passent par `useAura`.
 */
export const aura = {
  setAmbient: (a: AuraAmbient) => useAura.getState().setAmbient(a),
  pulse: (k: AuraPulse) => useAura.getState().emit(k),
};

/** Réinitialisation complète — tests uniquement. */
export function __resetAura() {
  lastAt = 0;
  lastKind = null;
  lastPriority = 0;
  seq = 0;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  useAura.setState({ ambient: 'rest', event: null, visible: false });
}
