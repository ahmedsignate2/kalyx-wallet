/**
 * Étape de build : 'beta' (dev/preview, montre les avertissements bêta) ou
 * 'stable' (production/store, aucune mention bêta). Contrôlé par
 * EXPO_PUBLIC_APP_STAGE, défini dans eas.json par profil de build — jamais
 * besoin de retoucher le code pour distinguer un build de test d'un build
 * publié sur un store.
 */
export const APP_STAGE: 'beta' | 'stable' = process.env.EXPO_PUBLIC_APP_STAGE === 'stable' ? 'stable' : 'beta';

export const IS_BETA = APP_STAGE === 'beta';
