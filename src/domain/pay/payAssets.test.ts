import { payEligibleHoldings, payCoverageLines, PAY_SUPPORTED_ASSETS } from './payAssets';

/** Correspondance Kalyx → EVM, telle que le registre la rendrait. */
const EVM: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  polygon: 137,
  base: 8453,
  arbitrum: 42161,
  solana: NaN, // volontairement absent de la table EVM
};
const evmChainIdOf = (id: string) => (Number.isFinite(EVM[id]) ? EVM[id] : undefined);

describe('payEligibleHoldings', () => {
  /*
   * LE CAS QUI A COÛTÉ CINQ HEURES. De l'USDC bien réel, mais sur un réseau que
   * ce paiement n'acceptait pas. Le symbole seul ne suffit donc jamais : le
   * couple actif + réseau est ce qui compte.
   */
  it('retient l’USDC sur Base, qui est couvert', () => {
    const r = payEligibleHoldings([{ chainId: 'base', symbol: 'USDC', amount: 0.17 }], evmChainIdOf);
    expect(r).toEqual([{ chainId: 'base', symbol: 'USDC', amount: 0.17 }]);
  });

  it('écarte un actif couvert sur un réseau qui ne l’est pas pour lui', () => {
    // EURC n'est réglé que sur Ethereum et Base : sur Polygon, il ne compte pas.
    expect(payEligibleHoldings([{ chainId: 'polygon', symbol: 'EURC', amount: 5 }], evmChainIdOf)).toEqual([]);
  });

  it('écarte un actif hors couverture, même sur un réseau couvert', () => {
    expect(payEligibleHoldings([{ chainId: 'base', symbol: 'DAI', amount: 100 }], evmChainIdOf)).toEqual([]);
  });

  it('écarte une chaîne non EVM', () => {
    expect(payEligibleHoldings([{ chainId: 'solana', symbol: 'USDC', amount: 42 }], evmChainIdOf)).toEqual([]);
  });

  /** Un solde nul n'est pas un moyen de payer : l'afficher serait mensonger. */
  it('écarte les soldes nuls ou négatifs', () => {
    expect(
      payEligibleHoldings(
        [
          { chainId: 'base', symbol: 'USDC', amount: 0 },
          { chainId: 'ethereum', symbol: 'USDT', amount: -1 },
        ],
        evmChainIdOf,
      ),
    ).toEqual([]);
  });

  it('la casse du symbole est indifférente, et la sortie est normalisée', () => {
    expect(payEligibleHoldings([{ chainId: 'base', symbol: 'usdc', amount: 1 }], evmChainIdOf)).toEqual([
      { chainId: 'base', symbol: 'USDC', amount: 1 },
    ]);
  });

  /** Le plus gros d'abord : c'est celui avec lequel l'utilisateur paierait. */
  it('trie par montant décroissant', () => {
    const r = payEligibleHoldings(
      [
        { chainId: 'base', symbol: 'USDC', amount: 0.17 },
        { chainId: 'polygon', symbol: 'USDT', amount: 12 },
        { chainId: 'ethereum', symbol: 'PYUSD', amount: 3 },
      ],
      evmChainIdOf,
    );
    expect(r.map((h) => h.symbol)).toEqual(['USDT', 'PYUSD', 'USDC']);
  });
});

describe('payCoverageLines', () => {
  const NAMES: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    56: 'BNB Chain',
    137: 'Polygon',
    8453: 'Base',
    42161: 'Arbitrum',
  };

  it('nomme les réseaux et omet ceux qu’on ne connaît pas', () => {
    const lines = payCoverageLines((id) => NAMES[id]);
    const usdc = lines.find((l) => l.symbol === 'USDC')!;
    expect(usdc.networks).toEqual(['Ethereum', 'Optimism', 'BNB Chain', 'Polygon', 'Base', 'Arbitrum']);
    // 143 (Monad) et 42220 (Celo) ne sont pas dans NAMES : ils disparaissent.
    expect(usdc.networks).not.toContain(undefined);
  });

  /*
   * Un actif dont AUCUN réseau n'est connu ne produit pas de ligne vide : une
   * ligne « USDG » sans réseau n'informe de rien.
   */
  it('n’émet aucune ligne pour un actif dont aucun réseau n’est nommé', () => {
    const lines = payCoverageLines(() => undefined);
    expect(lines).toEqual([]);
  });

  it('couvre tous les actifs de la table quand tous les réseaux sont connus', () => {
    const lines = payCoverageLines((id) => `chaîne ${id}`);
    expect(lines).toHaveLength(PAY_SUPPORTED_ASSETS.length);
  });
});
