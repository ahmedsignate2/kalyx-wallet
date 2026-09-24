import {
  requestBillableCall, rememberResult, startTurn, budgetSnapshot, __resetBudget,
  MAX_CALLS_PER_TURN, MAX_CALLS_PER_HOUR,
} from './aiToolBudget';

beforeEach(() => { __resetBudget(); startTurn(); });

describe('budget par tour — un modèle qui s’entête est coupé net', () => {
  it('autorise jusqu’à la limite puis refuse', () => {
    for (let i = 0; i < MAX_CALLS_PER_TURN; i++) {
      expect(requestBillableCall(`cible-${i}`).allowed).toBe(true);
    }
    const v = requestBillableCall('une-de-trop');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('par réponse');
  });

  it('donne au modèle un motif exploitable, pas un refus muet', () => {
    for (let i = 0; i < MAX_CALLS_PER_TURN; i++) requestBillableCall(`c${i}`);
    // Il doit comprendre qu'il faut CONCLURE, sinon il réessaie en boucle.
    expect(requestBillableCall('x').reason).toMatch(/Conclus/i);
  });

  it('repart à zéro au tour suivant', () => {
    for (let i = 0; i < MAX_CALLS_PER_TURN; i++) requestBillableCall(`c${i}`);
    expect(requestBillableCall('bloqué').allowed).toBe(false);
    startTurn();
    expect(requestBillableCall('nouveau-tour').allowed).toBe(true);
  });
});

describe('budget horaire — la limite par tour seule se contournerait', () => {
  it('coupe après la limite horaire, même en relançant des tours', () => {
    let allowed = 0;
    for (let t = 0; t < 40; t++) {
      startTurn();
      for (let i = 0; i < MAX_CALLS_PER_TURN; i++) {
        if (requestBillableCall(`t${t}-i${i}`).allowed) allowed++;
      }
    }
    // Sans limite horaire, 40 tours × 3 = 120 appels seraient passés.
    expect(allowed).toBe(MAX_CALLS_PER_HOUR);
  });

  it('le motif horaire demande de répondre SANS mesurer', () => {
    for (let t = 0; t < 40; t++) { startTurn(); for (let i = 0; i < 3; i++) requestBillableCall(`t${t}i${i}`); }
    startTurn();
    expect(requestBillableCall('z').reason).toMatch(/horaire/i);
  });
});

describe('cache — remesurer la même cible ne doit rien coûter', () => {
  it('sert la valeur en cache sans consommer de quota', () => {
    const v1 = requestBillableCall('rpc:ethereum');
    expect(v1.allowed).toBe(true);
    expect(v1.cached).toBeUndefined();
    rememberResult('rpc:ethereum', { latencyMs: 120 });

    const before = budgetSnapshot();
    const v2 = requestBillableCall('rpc:ethereum');
    expect(v2.cached).toEqual({ latencyMs: 120 });
    const after = budgetSnapshot();
    // Ni le tour ni l'heure n'ont bougé : aucun appel réseau n'a eu lieu.
    expect(after.turn).toBe(before.turn);
    expect(after.hour).toBe(before.hour);
  });

  it('une boucle sur la MÊME cible ne consomme qu’un seul appel', () => {
    requestBillableCall('rpc:solana');
    rememberResult('rpc:solana', 'ok');
    for (let i = 0; i < 50; i++) requestBillableCall('rpc:solana');
    expect(budgetSnapshot().hour).toBe(1);
  });

  it('des cibles DIFFÉRENTES consomment bien le quota', () => {
    // Le cache ne doit pas devenir une faille : changer d'argument coûte.
    requestBillableCall('rpc:a');
    requestBillableCall('rpc:b');
    expect(budgetSnapshot().hour).toBe(2);
  });

  it('borne la taille du cache sur une longue session', () => {
    for (let i = 0; i < 200; i++) rememberResult(`k${i}`, i);
    expect(budgetSnapshot().cached).toBeLessThanOrEqual(64);
  });
});
