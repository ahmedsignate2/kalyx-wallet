jest.mock('./aiAsk', () => ({ askAi: jest.fn() }));
import { askAi } from './aiAsk';
import { auditFacts, auditTransaction, buildAuditPrompt, parseAuditReply } from './aiTxAudit';

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

describe('contexte local transmis à l’audit', () => {
  const base = { to: 'UQabc', value: '0,5 TON', method: 'transfer', network: 'TON', fiatValue: '1,20 $' };

  it('un contact déjà payé est présenté comme CONNU, sans divulguer son nom', () => {
    const prompt = buildAuditPrompt({ ...base, recipient: { contactName: 'Maman', paidBefore: true } });
    expect(prompt).toContain("saved in the user's address book");
    expect(prompt).toContain('already sent funds to this exact address');
    expect(prompt).not.toContain('never sent');
    expect(prompt).not.toContain('Maman');
    expect(prompt).toContain('Network: TON');
    expect(prompt).toContain('0,5 TON (≈ 1,20 $)');
  });

  it('une adresse nouvelle est dite nouvelle, un sosie est signalé', () => {
    expect(buildAuditPrompt({ ...base, recipient: {} })).toContain('never sent to this address');
    const p = buildAuditPrompt({ ...base, recipient: { lookalikeOf: 'UQabd' } });
    expect(p).toContain('address poisoning');
    expect(p).not.toContain('never sent');
  });

  it('faits affichés à l’utilisateur', () => {
    expect(auditFacts({ ...base, recipient: { contactName: 'Maman', paidBefore: true } })).toEqual([{ kind: 'contact', name: 'Maman' }, { kind: 'paid' }]);
    expect(auditFacts({ ...base, recipient: { isContract: true } })).toEqual([{ kind: 'new' }, { kind: 'contract' }]);
    expect(auditFacts(base)).toEqual([]);
  });

  it('le prompt envoyé au modèle contient les faits', async () => {
    (askAi as jest.Mock).mockResolvedValueOnce({ text: '{"riskLevel":"SAFE","explanation":"ok"}' });
    await auditTransaction({ ...base, recipient: { ownAccount: true } }, 'fr', msgs, 1000);
    const [prompt, system] = (askAi as jest.Mock).mock.calls.at(-1);
    expect(prompt).toContain("user's own accounts");
    expect(system).toContain('Never call a contact');
  });
});

describe('familier n’est pas sûr', () => {
  const base = { to: '0xbob', value: '1 ETH', network: 'Ethereum' };

  it('un contact déjà payé mais sur liste noire : le signalement passe en premier', () => {
    const ctx = { ...base, recipient: { contactName: 'Ami', probe: { history: { paidCount: 3, lastPaidAt: 1_700_000_000, receivedCount: 0 }, flags: ['gpPhishing'] } } };
    const prompt = buildAuditPrompt(ctx);
    expect(prompt).toContain('blacklists flag this address');
    expect(prompt).toContain('overrides any familiarity');
    expect(prompt).toContain('3 successful payment(s)');
    expect(prompt).toContain('does not prove who controls it');
    expect(auditFacts(ctx)[0]).toEqual({ kind: 'flagged' });
  });

  it('la consigne interdit de conclure à la confiance', async () => {
    (askAi as jest.Mock).mockResolvedValueOnce({ text: '{"riskLevel":"SAFE","explanation":"ok"}' });
    await auditTransaction(base, 'fr', msgs, 1000);
    const [, system] = (askAi as jest.Mock).mock.calls.at(-1);
    expect(system).toContain('FAMILIAR IS NOT TRUSTED');
    expect(system).toContain('A blacklist flag is always DANGER');
  });

  it('profil public et sources muettes', () => {
    const fresh = { ...base, recipient: { probe: { history: { paidCount: 0, receivedCount: 0 }, profile: { txCount: 0, capped: false, distinctSenders: 0, inCount: 0, outCount: 0 } } } };
    expect(buildAuditPrompt(fresh)).toContain('no transaction history at all');
    expect(auditFacts(fresh)).toEqual([{ kind: 'new' }, { kind: 'fresh' }]);
    const mute = { ...base, recipient: { probe: {} } };
    expect(buildAuditPrompt(mute)).toContain('could not be checked');
    expect(auditFacts(mute)).toContainEqual({ kind: 'unverified' });
  });
});
