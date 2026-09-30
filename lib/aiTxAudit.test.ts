jest.mock('./aiAsk', () => ({ askAi: jest.fn() }));
import { askAi } from './aiAsk';
import { auditTransaction, parseAuditReply } from './aiTxAudit';

const msgs = { timeout: 'TIMEOUT', unreadable: 'UNREADABLE' };
const ctx = { to: '0xabc', value: '1', method: 'transfer' };

describe('parseAuditReply', () => {
  it('lit un JSON entouré de markdown ou de texte', () => {
    expect(parseAuditReply('```json\n{"riskLevel":"warning","explanation":"x","threats":["a"]}\n```')).toEqual({ riskLevel: 'WARNING', explanation: 'x', threats: ['a'] });
    expect(parseAuditReply('Voici : {"riskLevel":"SAFE","explanation":"ok"} fin')).toEqual({ riskLevel: 'SAFE', explanation: 'ok', threats: [] });
  });

  it('normalise les niveaux formulés autrement', () => {
    expect(parseAuditReply('{"riskLevel":"HIGH","explanation":"x"}')?.riskLevel).toBe('DANGER');
    expect(parseAuditReply('{"risk":"medium","explanation":"x"}')?.riskLevel).toBe('WARNING');
  });

  it('rend null pour un contenu vide, un résultat vide ou un niveau inconnu', () => {
    expect(parseAuditReply('')).toBeNull();
    expect(parseAuditReply('{}')).toBeNull();
    expect(parseAuditReply('{"riskLevel":"???"}')).toBeNull();
  });
});

describe('auditTransaction', () => {
  it('une erreur du fournisseur (503 Gemini) devient un message, pas un résultat vide', async () => {
    (askAi as jest.Mock).mockResolvedValueOnce({ error: 'Serveur fournisseur indisponible (Erreur 500). (high demand)' });
    expect(await auditTransaction(ctx, 'fr', msgs, 1000)).toEqual({ ok: false, error: 'Serveur fournisseur indisponible (Erreur 500). (high demand)' });
  });

  it('réponse illisible : message dédié', async () => {
    (askAi as jest.Mock).mockResolvedValueOnce({ text: 'je ne sais pas' });
    expect(await auditTransaction(ctx, 'fr', msgs, 1000)).toEqual({ ok: false, error: 'UNREADABLE' });
  });

  it('délai dépassé : message de délai', async () => {
    (askAi as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    expect(await auditTransaction(ctx, 'fr', msgs, 10)).toEqual({ ok: false, error: 'TIMEOUT' });
  });

  it('réponse valide : résultat normalisé', async () => {
    (askAi as jest.Mock).mockResolvedValueOnce({ text: '{"riskLevel":"DANGER","explanation":"Adresse signalée","threats":["drainer"]}' });
    expect(await auditTransaction(ctx, 'fr', msgs, 1000)).toEqual({ ok: true, result: { riskLevel: 'DANGER', explanation: 'Adresse signalée', threats: ['drainer'] } });
  });
});
