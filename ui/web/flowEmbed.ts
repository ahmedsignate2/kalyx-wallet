/**
 * Parcours (Envoyer / Recevoir / Swap) : plein écran sur téléphone, PANNEAU sur
 * ordinateur. Le panneau prenait toute la hauteur de la fenêtre quel que soit
 * le contenu — une liste de quatre jetons laissait 400 px de vide en dessous.
 * Intégré (`FlowEmbed`), le parcours prend la hauteur de son contenu, plafonnée
 * par le panneau, et défile au-delà.
 */
import { createContext, useContext } from 'react';
import type { ViewStyle } from 'react-native';

export const FlowEmbedContext = createContext(false);

/** Style de la racine d'un parcours : calque plein écran, ou bloc qui épouse son contenu. */
export function useFlowRootStyle(bg: string): ViewStyle {
  return useContext(FlowEmbedContext)
    ? { position: 'relative', flexShrink: 1, minHeight: 0, backgroundColor: bg }
    : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bg, zIndex: 20 };
}

/** Style du défilement d'un parcours : remplit l'écran, ou se rétracte au contenu. */
export function useFlowScrollStyle(): ViewStyle {
  return useContext(FlowEmbedContext) ? { flexGrow: 0, flexShrink: 1, minHeight: 0 } : { flex: 1 };
}
