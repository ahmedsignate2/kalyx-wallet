import { describe, expect, test } from 'vitest';
import { levelOf, scoreRisk } from './riskScore';

describe('score de risque (local)', () => {
  test('aucun signal : 0, faible, aucune raison', () => {
    expect(scoreRisk({})).toEqual({ score: 0, level: 'low', factors: [] });
  });

  test('raisons triées de la plus lourde à la plus légère, paramètres gardés', () => {
    const r = scoreRisk({ firstVisit: true, unlimitedApproval: true, lookalike: { brand: 'Uniswap' } });
    expect(r.factors.map((f) => f.code)).toEqual(['lookalike', 'unlimitedApproval', 'firstVisit']);
    expect(r.factors[0].params).toEqual({ brand: 'Uniswap' });
    expect(r.score).toBe(45 + 35 + 5);
    expect(r.level).toBe('high');
  });

  test('plafonné à 100 ; seuils des niveaux', () => {
    expect(scoreRisk({ phishingSite: true, contractDanger: true, approveAll: true }).score).toBe(100);
    expect([levelOf(0), levelOf(24), levelOf(25), levelOf(59), levelOf(60)]).toEqual(['low', 'low', 'medium', 'medium', 'high']);
    // Un site seulement nouveau, ou en http : prudence, pas alarme.
    expect(scoreRisk({ firstVisit: true, insecureSite: true }).level).toBe('low');
  });
});
