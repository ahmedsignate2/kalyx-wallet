import {
  payAccountsFor,
  caip10,
  parseCaip2,
  checkPayAction,
  PAY_EVM_CHAIN_IDS,
  PAY_ALLOWED_METHODS,
} from './payChains';

const ME = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('payAccountsFor', () => {
  it('rend un compte CAIP-10 par réseau couvert', () => {
    const accounts = payAccountsFor(ME);
    expect(accounts).toHaveLength(PAY_EVM_CHAIN_IDS.length);
    expect(accounts).toContain(`eip155:1:${ME}`);
    expect(accounts).toContain(`eip155:8453:${ME}`);
  });

  it('rien du tout si l\'adresse n\'est pas une adresse EVM', () => {
    // Envoyer une adresse malformée produirait des options impossibles à payer.
    expect(payAccountsFor('')).toEqual([]);
    expect(payAccountsFor('pas-une-adresse')).toEqual([]);
    expect(payAccountsFor('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toEqual([]);
  });

  it('tolère les espaces autour', () => {
    expect(payAccountsFor(`  ${ME}  `)[0]).toBe(caip10(1, ME));
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
      expect(r.reason).toMatch(/non autorisée/);
    }
  });

  it('REFUSE un espace de noms qu\'on ne sait pas interpréter', () => {
    const r = checkPayAction({ chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', method: 'personal_sign' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Espace de noms/);
  });

  it('REFUSE un réseau hors du périmètre de paiement', () => {
    // Une action sur une chaîne que Pay ne couvre pas ne vient pas du flux
    // qu'on croit.
    const r = checkPayAction({ chainId: 'eip155:999999', method: 'personal_sign' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/hors du périmètre/);
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
