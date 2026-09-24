import { collectDiagnosticContext, formatDiagnosticContext } from './diagnosticContext';

/*
 * Le test qui compte vraiment : la LIMITE de confidentialité. Le contexte de
 * diagnostic part dans l'assistant IA et dans les tickets de support, donc hors
 * de l'appareil. Il doit permettre de reproduire un bug, jamais de reconnaître
 * quelqu'un ni d'accéder à quoi que ce soit.
 */
describe('contexte de diagnostic — limite de confidentialité', () => {
  it('ne contient AUCUN champ dont le nom évoque un secret ou une identité', () => {
    const ctx = collectDiagnosticContext() as unknown as Record<string, unknown>;
    const interdits = /phrase|mnemonic|seed|key|pin|password|secret|address|adresse|balance|solde|amount|montant|label|nom/i;
    for (const k of Object.keys(ctx)) {
      expect(k).not.toMatch(interdits);
    }
  });

  it('ne contient aucune valeur ressemblant à une adresse ou à une clé', () => {
    const rendu = formatDiagnosticContext();
    // Adresse EVM, adresse Bitcoin, clé hex de 64, base58 long.
    expect(rendu).not.toMatch(/0x[a-fA-F0-9]{40}/);
    expect(rendu).not.toMatch(/\b(?:bc1|tb1)[a-z0-9]{20,}/);
    expect(rendu).not.toMatch(/\b[a-fA-F0-9]{64}\b/);
    expect(rendu).not.toMatch(/\b[1-9A-HJ-NP-Za-km-z]{32,}\b/);
  });

  it('expose l’INDICE du compte, pas son adresse — assez pour corréler les logs', () => {
    const ctx = collectDiagnosticContext();
    expect(typeof ctx.accountIndex === 'number' || ctx.accountIndex === null).toBe(true);
  });

  it('ne lève jamais, même si tous les stores sont absents', () => {
    // Appelé depuis des contextes variés, parfois avant l'initialisation.
    expect(() => collectDiagnosticContext()).not.toThrow();
    expect(() => formatDiagnosticContext()).not.toThrow();
  });

  it('rend des faits techniques exploitables', () => {
    const rendu = formatDiagnosticContext();
    for (const clef of ['réseau=', 'compte=#', 'réseau_disponible=', 'langue=', 'phrase_vérifiée=']) {
      expect(rendu).toContain(clef);
    }
  });
});
