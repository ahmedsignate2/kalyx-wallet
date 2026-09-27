/**
 * Diagnostic du dernier chargement des soldes, lisible dans l'écran
 * Développeur et partageable.
 *
 * Pourquoi : un calcul stable depuis un serveur (même adresse, même clé, même
 * code) ne l'était pas sur le téléphone. Sans voir l'erreur réelle de
 * l'appareil, chaque correction était une hypothèse. Ceci la montre.
 */
import { create } from 'zustand';

export interface PortfolioDiag {
  at: number;
  ms: number;
  /** Erreur du chargement entier, s'il a échoué. */
  error?: string;
  /** Par réseau : nombre de jetons ERC-20 lus, ou l'erreur exacte. */
  erc20: Record<string, number | string>;
  spl?: number | string;
  jettons?: Record<string, number | string>;
  nativesFailed: string[];
  /** Prix obtenus / demandés auprès de DefiLlama, taux dollar → devise. */
  prices: { asked: number; got: number; fx: number };
  holdings: number;
}

interface DiagState {
  last: PortfolioDiag | null;
  set: (d: PortfolioDiag) => void;
}

export const usePortfolioDiag = create<DiagState>((set) => ({ last: null, set: (d) => set({ last: d }) }));

/** Texte à partager (aucune clé, aucune adresse : seulement des compteurs et des erreurs). */
export function diagText(d: PortfolioDiag): string {
  const lines = [
    `Kalyx — diagnostic des soldes, ${new Date(d.at).toISOString()} (${d.ms} ms)`,
    d.error ? `ERREUR : ${d.error}` : 'chargement : ok',
    `actifs : ${d.holdings}`,
    `prix DefiLlama : ${d.prices.got}/${d.prices.asked}, taux : ${d.prices.fx}`,
    `natifs en échec : ${d.nativesFailed.join(', ') || 'aucun'}`,
    'ERC-20 :',
    ...Object.entries(d.erc20).map(([c, v]) => `  ${c} : ${v}`),
  ];
  if (d.spl !== undefined) lines.push(`SPL : ${d.spl}`);
  if (d.jettons) lines.push('jettons :', ...Object.entries(d.jettons).map(([c, v]) => `  ${c} : ${v}`));
  // Une clé d'API ne doit jamais sortir de l'appareil, même dans un message d'erreur.
  return lines.join('\n').replace(/\/v2\/[A-Za-z0-9_-]{16,}/g, '/v2/•••');
}
