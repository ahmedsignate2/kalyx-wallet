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

import { evmChainOfCaip, payAcceptedChains, splitByAcceptance, payRequestedUsd, isShortForPayment } from './payAssets';

describe('réseaux acceptés par le marchand', () => {
  it('lit eip155 dans CAIP-2, CAIP-10 et CAIP-19', () => {
    expect(evmChainOfCaip('eip155:1')).toBe(1);
    expect(evmChainOfCaip('eip155:8453:0xabc')).toBe(8453);
    expect(evmChainOfCaip('caip19/eip155:42161/erc20:0xaf88')).toBe(42161);
    expect(evmChainOfCaip('solana:5eykt')).toBeUndefined();
    expect(evmChainOfCaip('eip155:0')).toBeUndefined();
    expect(evmChainOfCaip(undefined)).toBeUndefined();
  });

  it('options : compte, unité, actions — sans doublon, trié', () => {
    expect(
      payAcceptedChains({
        options: [
          { account: 'eip155:8453:0x1', amount: { unit: 'caip19/eip155:8453/erc20:0x2' } },
          { amount: { unit: 'caip19/eip155:1/erc20:0x3' }, actions: [{ walletRpc: { chainId: 'eip155:1' } }] },
        ],
      }),
    ).toEqual([1, 8453]);
  });

  it('le lien peut porter les réseaux (JSON ou liste)', () => {
    expect(payAcceptedChains({ link: 'https://pay.walletconnect.com/?pid=x&chains=%5B%22eip155%3A1%22%5D' })).toEqual([1]);
    expect(payAcceptedChains({ link: 'https://x/?networks=eip155:1,eip155:10' })).toEqual([1, 10]);
    expect(payAcceptedChains({ link: 'https://x/?pid=1' })).toEqual([]);
    expect(payAcceptedChains({ link: 'https://x/?chains=%E0%A4%A' })).toEqual([]);
  });

  it('rien trouvé = inconnu (liste vide), jamais deviné', () => {
    expect(payAcceptedChains({ options: [] })).toEqual([]);
  });

  it('partage les soldes : réseau accepté / ailleurs', () => {
    const ids: Record<string, number> = { ethereum: 1, base: 8453 };
    const r = splitByAcceptance(
      [{ chainId: 'base', symbol: 'USDC', amount: 2 }, { chainId: 'ethereum', symbol: 'USDC', amount: 0.001 }],
      [1],
      (c) => ids[c],
    );
    expect(r.onAccepted.map((h) => h.chainId)).toEqual(['ethereum']);
    expect(r.elsewhere.map((h) => h.chainId)).toEqual(['base']);
  });

  it('solde insuffisant : seulement comparé en dollars', () => {
    const usd = payRequestedUsd({ unit: 'iso4217/USD', value: '1', display: { decimals: 2, assetSymbol: 'USD' } });
    expect(usd).toBeCloseTo(0.01);
    expect(isShortForPayment({ symbol: 'USDC', amount: 0.005 }, usd)).toBe(true);
    expect(isShortForPayment({ symbol: 'USDC', amount: 2 }, usd)).toBe(false);
    expect(isShortForPayment({ symbol: 'EURC', amount: 0.001 }, usd)).toBe(false);
    expect(payRequestedUsd({ unit: 'iso4217/EUR', value: '100', display: { decimals: 2, assetSymbol: 'EUR' } })).toBeUndefined();
  });
});
