/**
 * SCORE DE RISQUE d'une signature, calculé ICI (rien n'est envoyé à une IA
 * ni à un serveur pour le produire). Chaque facteur a un poids fixe et une
 * phrase claire : l'écran montre le score, puis les raisons, de la plus
 * lourde à la plus légère — lisible en deux secondes.
 *
 * Les poids reflètent ce qui vide réellement les portefeuilles : site
 * signalé, autorisation illimitée, perte sans contrepartie, message signé
 * pour un autre site ou un autre réseau. Un site jamais vu ou en http ne
 * pèse que peu : prudence, pas alarme.
 */

export type RiskFactor =
  | 'phishingSite'
  | 'lookalike'
  | 'contractDanger'
  | 'domainMismatch'
  | 'unlimitedApproval'
  | 'approveAll'
  | 'permitNoExpiry'
  | 'nftOrder'
  | 'lossOnly'
  | 'noSimulation'
  | 'manyTxs'
  | 'pageTampered'
  | 'insecureSite'
  | 'firstVisit';

const WEIGHT: Record<RiskFactor, number> = {
  phishingSite: 70,
  lookalike: 45,
  contractDanger: 60,
  pageTampered: 40,
  domainMismatch: 50,
  approveAll: 40,
  unlimitedApproval: 35,
  lossOnly: 30,
  nftOrder: 25,
  permitNoExpiry: 10,
  noSimulation: 10,
  manyTxs: 10,
  insecureSite: 10,
  firstVisit: 5,
};

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskScore {
  /** 0 à 100. */
  score: number;
  level: RiskLevel;
  /** Du plus lourd au plus léger ; `params` remplit la phrase (nom de marque, nombre…). */
  factors: { code: RiskFactor; points: number; params?: Record<string, string> }[];
}

export type RiskSignals = Partial<Record<RiskFactor, boolean | Record<string, string>>>;

export const levelOf = (score: number): RiskLevel => (score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low');

export function scoreRisk(signals: RiskSignals): RiskScore {
  const factors = (Object.keys(WEIGHT) as RiskFactor[])
    .filter((k) => !!signals[k])
    .map((code) => {
      const v = signals[code];
      return { code, points: WEIGHT[code], ...(typeof v === 'object' ? { params: v } : {}) };
    })
    .sort((a, b) => b.points - a.points);
  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  return { score, level: levelOf(score), factors };
}
