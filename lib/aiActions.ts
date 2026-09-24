/**
 * Actions PROPOSÉES par l'assistant — et jamais exécutées sans un tap.
 *
 * AVANT : les actions émises par le modèle étaient jouées AUTOMATIQUEMENT,
 * 200 ms après la réponse (`actions.forEach(a => setTimeout(a, …))`). L'écran se
 * fermait et l'app sautait ailleurs sans que l'utilisateur ait rien demandé.
 * D'où la sensation, juste, que l'assistant « redirige pour rien » au lieu de
 * proposer.
 *
 * Désormais une action est une PROPOSITION : elle devient un bouton sous la
 * réponse, et rien ne se produit tant qu'on ne le touche pas.
 *
 * PLANCHER DE SÉCURITÉ, appliqué ICI et non dans le prompt.
 *
 * Un prompt se contourne — il suffit qu'un texte venu de l'extérieur (nom de
 * token, titre de dApp, message collé) atteigne le modèle pour qu'il émette ce
 * qu'on lui a soufflé. Un analyseur, non. Deux règles donc, en dur :
 *
 *  1. Une action ne peut mener qu'à un écran de la liste blanche, et jamais à
 *     ceux qui exposent un secret (phrase, clé privée, PIN).
 *  2. Une action vers l'écran d'envoi ne transporte NI destinataire NI montant.
 *     Ouvrir l'écran d'envoi est anodin ; pré-remplir qui reçoit l'argent ne
 *     l'est pas — un formulaire déjà rempli est précisément ce qu'on valide
 *     sans le relire. L'utilisateur saisit lui-même la destination.
 */
import { APP_ROUTES_MAP } from './aiAppMap';

/** Écrans qu'une action ne doit JAMAIS ouvrir, quoi que demande le modèle. */
const FORBIDDEN_ROUTES = [
  '/reveal-phrase',
  '/reveal-private-key',
  '/set-pin',
  '/change-pin',
  '/backup',
  '/verify',
  '/cloud-backup',
  '/restore-drive',
];

/** Paramètres qu'aucune action ne transporte, sur aucun écran. */
const FORBIDDEN_PARAMS = ['to', 'recipient', 'address', 'amount', 'value', 'pin', 'phrase', 'privateKey'];

export interface ProposedAction {
  /** Libellé du bouton, tel que le modèle l'a formulé (ou un repli). */
  label: string;
  route: string;
  params: Record<string, string>;
}

interface RawAction {
  type?: string;
  target?: string;
  label?: string;
  params?: Record<string, unknown>;
}

/**
 * Extrait les actions d'une réponse de modèle et rend le texte nettoyé.
 * Tout ce qui ne passe pas les règles est simplement ignoré, sans erreur
 * visible : une action refusée ne doit pas casser la réponse.
 */
export function parseProposedActions(reply: string): { text: string; actions: ProposedAction[] } {
  const actions: ProposedAction[] = [];
  const regex = /<ACTION>([\s\S]*?)<\/ACTION>/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(reply)) !== null) {
    let raw: RawAction;
    try {
      raw = JSON.parse(m[1].trim()) as RawAction;
    } catch {
      continue; // JSON invalide : on ignore, la réponse texte reste lisible
    }
    const config = raw.target ? APP_ROUTES_MAP.find((r) => r.id === raw.target) : undefined;
    if (!config) continue;
    if (FORBIDDEN_ROUTES.includes(config.route)) continue;

    // Paramètres : on ne garde que des chaînes, et jamais un champ interdit.
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.params ?? {})) {
      if (FORBIDDEN_PARAMS.includes(k)) continue;
      if (typeof v === 'string' || typeof v === 'number') params[k] = String(v);
    }

    actions.push({
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 60) : config.description,
      route: config.route,
      params,
    });
    // UNE action par réponse : enchaîner des navigations est désorientant, et
    // c'était possible auparavant (chaque action partait avec 150 ms d'écart).
    if (actions.length >= 1) break;
  }

  const text = reply.replace(regex, '').replace(/[^\S\r\n]{2,}/g, ' ').trim();
  return { text, actions };
}
