import { capabilities, NO_CAPABILITIES } from './capabilities';

describe('capabilities', () => {
  it('part du tout-faux : une chaîne ne déclare que ce qu\'elle sait faire', () => {
    const c = capabilities({ tokens: true, tokenSend: true });
    expect(c.tokens).toBe(true);
    expect(c.accelerate).toBe(false);
    expect(c.messageSigning).toBe('none');
  });

  it('ajouter une capacité ne casse pas les chaînes existantes', () => {
    /*
     * C'est la raison du défaut tout-faux : le jour où une capacité est ajoutée
     * à l'interface, les adapters déjà écrits continuent de compiler ET de se
     * comporter correctement — ils ne la déclarent simplement pas.
     */
    const c = capabilities({});
    for (const [k, v] of Object.entries(NO_CAPABILITIES)) {
      expect(c[k as keyof typeof c]).toBe(v);
    }
  });

  it('ne partage pas l\'objet par défaut entre adapters', () => {
    // Sinon modifier les capacités d'une chaîne les changerait pour toutes.
    const a = capabilities({ tokens: true });
    const b = capabilities({});
    expect(b.tokens).toBe(false);
    expect(a).not.toBe(NO_CAPABILITIES);
  });
});
