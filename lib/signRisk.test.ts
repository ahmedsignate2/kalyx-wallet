import { signRisk, signRiskSignals, siteKnown } from './signRisk';
import { decodeTx } from '../src/domain/tx/decodeTx';
import { Interface } from 'ethers';

const approve = (spender: string, amount: bigint) => ({ to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', data: new Interface(['function approve(address,uint256)']).encodeFunctionData('approve', [spender, amount]) });
const MAX = (1n << 256n) - 1n;
const DEAD = '0x000000000000000000000000000000000000dEaD';

describe('score de risque dans l’app (même moteur que l’extension)', () => {
  it('illimitée vers une adresse sans code, site neuf : 90/100, élevé', async () => {
    const r = await signRisk({ host: 'drainer.example', decoded: decodeTx(approve(DEAD, MAX)), hasData: true, simulation: { source: 'node', changes: [], approvals: [] }, knownSite: false }, { codeOf: async () => '0x' });
    expect(r.factors.map((f) => f.code)).toEqual(['spenderNotContract', 'unlimitedApproval', 'firstVisit']);
    expect(r).toMatchObject({ score: 90, level: 'high' });
  });

  it('illimitée vers Uniswap, site connu : moyen, aucune lecture du code', async () => {
    let asked = false;
    const r = await signRisk({ host: 'app.uniswap.org', decoded: decodeTx(approve('0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', MAX)), hasData: true, simulation: { source: 'node', changes: [], approvals: [] }, knownSite: true }, { codeOf: async () => ((asked = true), '0x') });
    expect(asked).toBe(false);
    expect(r).toMatchObject({ score: 40, level: 'medium' });
  });

  it('sosie, SIWE d’un autre domaine, http public, plusieurs transactions', () => {
    const s = signRiskSignals({ host: 'uniswapp.org', url: 'http://uniswapp.org', siweDomain: 'evil.example', txCount: 3 });
    expect(s).toMatchObject({ lookalike: { brand: expect.any(String) }, domainMismatch: { domain: 'evil.example' }, insecureSite: true, manyTxs: { n: '3' } });
  });

  it('site connu : mémorisé, ou vu il y a plus de 24 h', () => {
    const now = 10 * 86_400_000;
    expect(siteKnown('a.com', { connections: [{ host: 'a.com', at: now - 1000 }], remembered: [], signatures: [] }, now)).toBe(false);
    expect(siteKnown('a.com', { connections: [], remembered: [], signatures: [{ host: 'a.com', at: now - 2 * 86_400_000 }] }, now)).toBe(true);
    expect(siteKnown('a.com', { connections: [], remembered: ['a.com'], signatures: [] }, now)).toBe(true);
  });
});
