import {
  parseTxRequestIdentity,
  parseTxRequestPayload,
  fetchTxRequestIdentity,
  fetchTxRequestPayload,
  checkTxRequest,
} from './solanaTxRequest';

const ME = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const AUTRE = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PQtwhpU';

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

describe('parseTxRequestIdentity', () => {
  it('retient le nom et une icône https', () => {
    expect(parseTxRequestIdentity({ label: 'Café Nova', icon: 'https://x.test/i.png' })).toEqual({
      label: 'Café Nova',
      icon: 'https://x.test/i.png',
    });
  });

  it('écarte une icône qui n\'est pas en https', () => {
    /*
     * Une URL en clair ou un `data:` affiché dans l'interface ferait passer du
     * contenu arbitraire pour l'identité d'un marchand.
     */
    for (const icon of ['http://x.test/i.png', 'data:image/png;base64,AAAA', 'javascript:alert(1)']) {
      expect(parseTxRequestIdentity({ label: 'X', icon })?.icon).toBeUndefined();
    }
  });

  it('null sans nom, ou sur une réponse malformée', () => {
    for (const bad of [null, undefined, 'texte', 42, {}, { label: '' }, { label: '   ' }, { label: 'x'.repeat(200) }]) {
      expect(parseTxRequestIdentity(bad)).toBeNull();
    }
  });
});

describe('parseTxRequestPayload', () => {
  it('retient la transaction et le message', () => {
    expect(parseTxRequestPayload({ transaction: 'AQAB', message: 'Commande 42' })).toEqual({
      transaction: 'AQAB',
      message: 'Commande 42',
    });
  });

  it('refuse ce qui n\'est pas du base64', () => {
    // Un contenu hors alphabet n'est pas une transaction : inutile d'aller
    // jusqu'au décodage pour s'en apercevoir.
    for (const t of ['pas du base64 !', 'AQ AB', '@@@', '']) {
      expect(parseTxRequestPayload({ transaction: t })).toBeNull();
    }
  });

  it('refuse une réponse démesurée', () => {
    // Une transaction Solana tient dans 1 232 octets ; au-delà, la réponse
    // n'est pas une transaction et n'a pas à occuper la mémoire.
    expect(parseTxRequestPayload({ transaction: 'A'.repeat(5000) })).toBeNull();
  });

  it('null sur une réponse malformée', () => {
    for (const bad of [null, 'texte', {}, { transaction: 42 }]) {
      expect(parseTxRequestPayload(bad)).toBeNull();
    }
  });
});

describe('fetchTxRequestIdentity', () => {
  it('ne transmet RIEN sur l\'utilisateur', async () => {
    // Le GET sert à savoir qui demande ; l'adresse ne sort qu'au POST.
    let seen: { method?: string; body?: string } = {};
    await fetchTxRequestIdentity('https://m.test/pay', (async (_u: string, init?: { method?: string; body?: string }) => {
      seen = init ?? {};
      return ok({ label: 'Nova' });
    }) as never);
    expect(seen.method).toBe('GET');
    expect(seen.body).toBeUndefined();
  });

  it('null si le serveur répond en erreur, sans lever', async () => {
    const res = await fetchTxRequestIdentity('https://m.test/pay', (async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as never);
    expect(res).toBeNull();
  });

  it('null si le serveur ne répond pas, sans lever', async () => {
    const res = await fetchTxRequestIdentity('https://m.test/pay', (async () => {
      throw new Error('réseau');
    }) as never);
    expect(res).toBeNull();
  });
});

describe('fetchTxRequestPayload', () => {
  it('envoie l\'adresse, et rien d\'autre', async () => {
    let body = '';
    await fetchTxRequestPayload('https://m.test/pay', ME, (async (_u: string, init?: { method?: string; body?: string }) => {
      body = init?.body ?? '';
      return ok({ transaction: 'AQAB' });
    }) as never);
    expect(JSON.parse(body)).toEqual({ account: ME });
  });
});

describe('checkTxRequest — le garde-fou', () => {
  it('accepte une transaction dont NOUS sommes le payeur, à une signature', () => {
    expect(checkTxRequest({ feePayer: ME, signerCount: 1 }, ME)).toEqual({ ok: true });
  });

  it('REFUSE si le payeur de frais est un autre compte', () => {
    /*
     * Sur Solana le compte n°0 paie et signe. Signer une transaction dont le
     * payeur est quelqu'un d'autre, c'est signer une opération dont on ne
     * maîtrise ni le coût ni l'intention.
     */
    const r = checkTxRequest({ feePayer: AUTRE, signerCount: 1 }, ME);
    expect(r.ok).toBe(false);
    // Un CODE, pas une phrase : le domaine ne connaît pas la langue de l'écran.
    expect(r.reason).toBe('NOT_YOUR_ACCOUNT');
  });

  it('REFUSE une transaction dont un tiers n\'a PAS encore signé', () => {
    /*
     * L'emplacement du second signataire est vide : l'opération ne s'exécutera
     * que lorsque ce tiers le décidera, au moment qu'il choisira, et notre
     * signature l'attendra jusque-là.
     */
    const r = checkTxRequest({ feePayer: ME, signerCount: 2, signaturesPresent: [false, false] }, ME);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('THIRD_PARTY_PENDING');
  });

  it('REFUSE une transaction illisible ou sans payeur', () => {
    expect(checkTxRequest(null, ME).ok).toBe(false);
    expect(checkTxRequest({ signerCount: 1 }, ME).ok).toBe(false);
  });
});

describe('checkTxRequest — transaction co-signée par le marchand', () => {
  /*
   * LA RÈGLE CORRIGÉE. L'ancienne refusait tout au-delà d'un signataire, ce qui
   * écartait les terminaux interactifs — remise, fidélité — qui co-signent
   * légitimement et dont la signature est DÉJÀ posée quand ils nous envoient la
   * transaction. C'est la moitié des caisses que la spécification vise.
   *
   * Ce qui compte n'est pas le nombre de signataires mais qu'aucune signature ne
   * manque à part la nôtre : la nôtre achève alors la transaction.
   */
  it('ACCEPTE quand la seule signature manquante est la nôtre', () => {
    const r = checkTxRequest({ feePayer: ME, signerCount: 2, signaturesPresent: [false, true] }, ME);
    expect(r.ok).toBe(true);
  });

  it('ACCEPTE trois signataires si les deux autres ont signé', () => {
    const r = checkTxRequest(
      { feePayer: ME, signerCount: 3, signaturesPresent: [false, true, true] },
      ME,
    );
    expect(r.ok).toBe(true);
  });

  it('REFUSE dès qu’une seule des autres manque', () => {
    const r = checkTxRequest(
      { feePayer: ME, signerCount: 3, signaturesPresent: [false, true, false] },
      ME,
    );
    expect(r.reason).toBe('THIRD_PARTY_PENDING');
  });

  /*
   * Sans la liste des emplacements, on ne peut RIEN affirmer. On refuse, comme
   * avant : mieux vaut bloquer un paiement légitime que signer une transaction
   * dont un tiers garderait la maîtrise du déclenchement.
   */
  it('REFUSE si la présence des signatures est inconnue', () => {
    expect(checkTxRequest({ feePayer: ME, signerCount: 2 }, ME).reason).toBe('THIRD_PARTY_PENDING');
  });

  /** Un seul signataire : la liste ne change rien, c'est nous et personne d'autre. */
  it('ACCEPTE un signataire unique, liste ou pas', () => {
    expect(checkTxRequest({ feePayer: ME, signerCount: 1 }, ME).ok).toBe(true);
    expect(checkTxRequest({ feePayer: ME, signerCount: 1, signaturesPresent: [false] }, ME).ok).toBe(true);
  });
});
