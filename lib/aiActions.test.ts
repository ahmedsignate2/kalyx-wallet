import { parseProposedActions } from './aiActions';

const wrap = (o: unknown) => `Voici ce que je propose. <ACTION>${JSON.stringify(o)}</ACTION>`;

describe('actions proposées par l’assistant', () => {
  it('extrait une action valide et nettoie le texte', () => {
    const { text, actions } = parseProposedActions(wrap({ type: 'NAVIGATE', target: 'RECEIVE', label: 'Voir mon QR' }));
    expect(text).toBe('Voici ce que je propose.');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ label: 'Voir mon QR', route: '/receive' });
  });

  it('retombe sur la description de l’écran si le modèle n’a pas donné de libellé', () => {
    const { actions } = parseProposedActions(wrap({ target: 'MARKET' }));
    expect(actions[0].label.length).toBeGreaterThan(0);
  });
});

describe('plancher de sécurité — appliqué par l’analyseur, pas par le prompt', () => {
  it('REFUSE un destinataire et un montant vers l’écran d’envoi', () => {
    /*
     * Le cœur du sujet. Ouvrir l'écran d'envoi est anodin ; pré-remplir qui
     * reçoit l'argent ne l'est pas — un formulaire déjà rempli est précisément
     * ce qu'on valide sans le relire. Et un prompt se contourne : il suffit
     * qu'un nom de token ou un message collé atteigne le modèle.
     */
    const { actions } = parseProposedActions(
      wrap({ target: 'SEND', params: { to: '0x' + 'a'.repeat(40), amount: '10', symbol: 'USDC' } }),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].params.to).toBeUndefined();
    expect(actions[0].params.amount).toBeUndefined();
    // Le contexte inoffensif est conservé : on arrive sur le bon token.
    expect(actions[0].params.symbol).toBe('USDC');
  });

  it('refuse toute action menant à un secret, même si le modèle l’exige', () => {
    for (const target of ['PHRASE', 'SECURITY', 'PRIVATE_KEY', 'PIN', 'BACKUP']) {
      const { actions } = parseProposedActions(wrap({ target }));
      const routes = actions.map((a) => a.route);
      expect(routes).not.toContain('/reveal-phrase');
      expect(routes).not.toContain('/reveal-private-key');
      expect(routes).not.toContain('/change-pin');
      expect(routes).not.toContain('/backup');
    }
  });

  it('ignore une cible inconnue sans casser la réponse', () => {
    const { text, actions } = parseProposedActions(wrap({ target: 'TRANSFER_ALL_FUNDS' }));
    expect(actions).toHaveLength(0);
    expect(text).toBe('Voici ce que je propose.');
  });

  it('ignore un JSON invalide sans casser la réponse', () => {
    const { text, actions } = parseProposedActions('Réponse. <ACTION>{ceci nest pas du json}</ACTION>');
    expect(actions).toHaveLength(0);
    expect(text).toBe('Réponse.');
  });

  it('n’en garde qu’UNE : enchaîner des navigations désorientait', () => {
    const two = wrap({ target: 'RECEIVE' }) + wrap({ target: 'MARKET' });
    expect(parseProposedActions(two).actions).toHaveLength(1);
  });

  it('ne transporte jamais un PIN ni une phrase, sur aucun écran', () => {
    const { actions } = parseProposedActions(wrap({ target: 'MARKET', params: { pin: '4819', phrase: 'abandon able' } }));
    expect(actions[0].params.pin).toBeUndefined();
    expect(actions[0].params.phrase).toBeUndefined();
  });
});
