import {
  payAccountsFor,
  caip10,
  parseCaip2,
  checkPayAction,
  checkPayPayload,
  PAY_EVM_CHAIN_IDS,
  PAY_ALLOWED_METHODS,
} from './payChains';

const ME = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('payAccountsFor', () => {
  it('rend un compte CAIP-10 par réseau couvert, adresse en MINUSCULES', () => {
    /*
     * CAIP-10 tolère la casse mixte de l'EIP-55, mais un comparateur de chaînes
     * naïf côté serveur ne trouverait rien avec elle — soldes bien présents,
     * zéro option en retour. La forme minuscule est celle qu'attendent la
     * plupart des services et ne coûte rien.
     */
    const accounts = payAccountsFor(ME);
    expect(accounts).toHaveLength(PAY_EVM_CHAIN_IDS.length);
    expect(accounts).toContain(`eip155:1:${ME.toLowerCase()}`);
    expect(accounts).toContain(`eip155:8453:${ME.toLowerCase()}`);
    expect(accounts.every((a) => a === a.toLowerCase())).toBe(true);
  });

  it('rien du tout si l\'adresse n\'est pas une adresse EVM', () => {
    // Envoyer une adresse malformée produirait des options impossibles à payer.
    expect(payAccountsFor('')).toEqual([]);
    expect(payAccountsFor('pas-une-adresse')).toEqual([]);
    expect(payAccountsFor('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toEqual([]);
  });

  it('tolère les espaces autour', () => {
    expect(payAccountsFor(`  ${ME}  `)[0]).toBe(caip10(1, ME));
    expect(caip10(1, ME)).toBe(`eip155:1:${ME.toLowerCase()}`);
  });
});

describe('parseCaip2', () => {
  it('découpe un identifiant valide', () => {
    expect(parseCaip2('eip155:8453')).toEqual({ namespace: 'eip155', reference: '8453' });
  });
  it('null sur ce qui n\'en est pas un', () => {
    for (const bad of ['', '8453', 'eip155:', ':8453', 'eip155:8453:0xabc', 'x:1']) {
      expect(parseCaip2(bad)).toBeNull();
    }
  });
});

describe('checkPayAction — le garde-fou', () => {
  it('accepte les trois méthodes prévues, sur un réseau couvert', () => {
    for (const method of PAY_ALLOWED_METHODS) {
      expect(checkPayAction({ chainId: 'eip155:8453', method })).toEqual({ ok: true, evmChainId: 8453 });
    }
  });

  it('REFUSE toute méthode hors de la liste fermée', () => {
    /*
     * C'est le serveur qui dicte les actions : méthode, chaîne et paramètres
     * viennent d'en face. Une méthode inattendue doit être refusée, pas
     * exécutée « au cas où » — `eth_sign` signe n'importe quel condensat, et
     * une phrase de récupération ne se récupère pas.
     */
    for (const method of ['eth_sign', 'eth_signTypedData', 'wallet_addEthereumChain', 'solana_signTransaction', '']) {
      const r = checkPayAction({ chainId: 'eip155:1', method });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('METHOD_NOT_ALLOWED');
    }
  });

  it('REFUSE un espace de noms qu\'on ne sait pas interpréter', () => {
    const r = checkPayAction({ chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', method: 'personal_sign' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('NAMESPACE_UNSUPPORTED');
  });

  it('REFUSE un réseau hors du périmètre de paiement', () => {
    // Une action sur une chaîne que Pay ne couvre pas ne vient pas du flux
    // qu'on croit.
    const r = checkPayAction({ chainId: 'eip155:999999', method: 'personal_sign' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('CHAIN_OUT_OF_SCOPE');
  });

  it('REFUSE une chaîne illisible ou absente', () => {
    for (const chainId of [undefined, null, 42, '', 'eip155', 'eip155:abc']) {
      expect(checkPayAction({ chainId, method: 'personal_sign' }).ok).toBe(false);
    }
  });

  it('le périmètre autorisé est injectable, pour les tests et une évolution', () => {
    expect(checkPayAction({ chainId: 'eip155:999', method: 'personal_sign' }, [999]).ok).toBe(true);
  });
});

describe('les refus portent un CODE, jamais une phrase', () => {
  it('chaque refus rend un code et non du texte traduisible', () => {
    /*
     * Un domaine pur ne connaît pas la langue de l'utilisateur. Des messages
     * écrits ici ressortent tels quels à l'écran — c'est ce qui s'est passé :
     * « Aucune option de paiement disponible pour tes soldes » s'est affiché en
     * français alors que les clés de traduction existaient déjà.
     */
    const cas: [Record<string, unknown>, string][] = [
      [{ chainId: 'eip155:1', method: 'eth_sign' }, 'METHOD_NOT_ALLOWED'],
      [{ chainId: 42, method: 'personal_sign' }, 'CHAIN_UNREADABLE'],
      [{ chainId: 'solana:abc', method: 'personal_sign' }, 'NAMESPACE_UNSUPPORTED'],
      [{ chainId: 'eip155:abc', method: 'personal_sign' }, 'CHAIN_INVALID'],
      [{ chainId: 'eip155:999999', method: 'personal_sign' }, 'CHAIN_OUT_OF_SCOPE'],
    ];
    for (const [action, code] of cas) {
      const r = checkPayAction(action);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(code);
      // Et surtout : aucun espace, donc aucune phrase.
      expect(r.reason).not.toMatch(/\s/);
    }
  });

  it('le détail accompagne le code, sans le remplacer', () => {
    expect(checkPayAction({ chainId: 'eip155:1', method: 'eth_sign' }).detail).toBe('eth_sign');
    expect(checkPayAction({ chainId: 'eip155:999999', method: 'personal_sign' }).detail).toBe('999999');
  });
});

describe('checkPayPayload', () => {
  const MAX = 'f'.repeat(64);
  const addr = (a: string) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const approve = (spender: string, amt: string) => `0x095ea7b3${addr(spender)}${amt}`;
  const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
  const EVIL = '0x1111111111111111111111111111111111111111';

  it('accepte l’approbation illimitée du contrat Permit2 (étape normale)', () => {
    expect(checkPayPayload('eth_sendTransaction', [{ to: EVIL, data: approve(PERMIT2, MAX) }]).ok).toBe(true);
  });
  it('refuse une approbation illimitée à un tiers', () => {
    const r = checkPayPayload('eth_sendTransaction', [{ to: EVIL, data: approve(EVIL, MAX) }]);
    expect(r).toEqual({ ok: false, reason: 'RISKY_APPROVAL', detail: EVIL });
  });
  it('accepte une approbation bornée', () => {
    expect(checkPayPayload('eth_sendTransaction', [{ to: EVIL, data: approve(EVIL, (1000n).toString(16).padStart(64, '0')) }]).ok).toBe(true);
  });
  it('refuse setApprovalForAll', () => {
    const data = `0xa22cb465${addr(EVIL)}${'1'.padStart(64, '0')}`;
    expect(checkPayPayload('eth_sendTransaction', [{ to: EVIL, data }]).ok).toBe(false);
  });
  it('refuse un Permit2 illimité signé', () => {
    const typed = {
      domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2 },
      primaryType: 'PermitSingle',
      types: { PermitSingle: [], PermitDetails: [] },
      message: { details: { token: EVIL, amount: (2n ** 160n - 1n).toString(), expiration: '0', nonce: '0' }, spender: EVIL, sigDeadline: '9999999999' },
    };
    expect(checkPayPayload('eth_signTypedData_v4', ['0xabc', JSON.stringify(typed)]).ok).toBe(false);
  });
  it('laisse passer personal_sign', () => {
    expect(checkPayPayload('personal_sign', ['0x00']).ok).toBe(true);
  });
});
