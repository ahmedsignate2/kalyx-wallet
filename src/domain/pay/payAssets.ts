/**
 * WalletConnect Pay — ce que le service règle, et ce que l'utilisateur détient.
 *
 * POURQUOI CE MODULE EXISTE. Devant un « rien pour payer », l'écran disait ce
 * que Pay accepte EN GÉNÉRAL et se taisait sur l'essentiel : ce que
 * l'utilisateur détient, et où. Il a fallu cinq heures et un essai dans un
 * navigateur pour découvrir qu'un paiement n'acceptait que des actifs sur
 * Ethereum alors que les fonds étaient sur Base — une information que l'app
 * avait déjà, puisqu'elle venait d'interroger les huit réseaux et connaissait
 * les soldes.
 *
 * Pur et testable : aucune dépendance au SDK, au réseau ni au magasin.
 */

/** Un actif réglé par Pay, et les réseaux où il l'est. */
export interface PaySupportedAsset {
  symbol: string;
  /** Identifiants EVM. */
  chainIds: readonly number[];
}

/**
 * Couverture DOCUMENTÉE de WalletConnect Pay.
 *
 * Tirée du tableau « Supported Networks & Tokens » de la documentation du SDK.
 *
 * ELLE N'EST PAS LA VÉRITÉ D'UN PAIEMENT DONNÉ. Le portail web d'un paiement de
 * test a listé davantage d'actifs (ETH, WETH, WCT…) et sur un seul réseau —
 * Ethereum. Ce que chaque paiement accepte est décidé par le marchand et son
 * prestataire, pas par cette table. Elle sert à expliquer l'ordre de grandeur de
 * ce qui est réglable, jamais à promettre qu'un actif passera.
 */
export const PAY_SUPPORTED_ASSETS: readonly PaySupportedAsset[] = [
  { symbol: 'USDC', chainIds: [1, 10, 56, 137, 143, 8453, 42161, 42220] },
  { symbol: 'EURC', chainIds: [1, 8453] },
  { symbol: 'USDT', chainIds: [1, 56, 137] },
  { symbol: 'USDT0', chainIds: [42161] },
  { symbol: 'PYUSD', chainIds: [1, 42161] },
  { symbol: 'USDG', chainIds: [1] },
] as const;

/** Ce que l'appelant doit fournir d'un solde : le strict nécessaire. */
export interface HoldingLike {
  /** Identifiant Kalyx de la chaîne (ex. `base`). */
  chainId: string;
  symbol: string;
  /** Montant humain. Zéro ou négatif = ignoré. */
  amount: number;
}

/** Un solde qui figure dans la couverture de Pay. */
export interface PayEligibleHolding {
  chainId: string;
  symbol: string;
  amount: number;
}

/**
 * Soldes de l'utilisateur qui figurent dans la couverture de Pay.
 *
 * Le symbole ET le réseau doivent correspondre : de l'USDC sur un réseau non
 * couvert ne compte pas, et c'est précisément le cas qui a coûté cinq heures.
 * `evmChainIdOf` est injecté — un module de domaine ne consulte pas le registre
 * des chaînes.
 */
export function payEligibleHoldings(
  holdings: readonly HoldingLike[],
  evmChainIdOf: (chainId: string) => number | undefined,
): PayEligibleHolding[] {
  const out: PayEligibleHolding[] = [];
  for (const h of holdings) {
    if (!(h.amount > 0)) continue;
    const evm = evmChainIdOf(h.chainId);
    if (evm === undefined) continue;
    const asset = PAY_SUPPORTED_ASSETS.find((a) => a.symbol.toUpperCase() === h.symbol.toUpperCase());
    if (!asset || !asset.chainIds.includes(evm)) continue;
    out.push({ chainId: h.chainId, symbol: h.symbol.toUpperCase(), amount: h.amount });
  }
  // Le plus gros d'abord : c'est celui avec lequel l'utilisateur paierait.
  return out.sort((a, b) => b.amount - a.amount);
}

/** Une ligne de la table à afficher : un actif et les réseaux nommés. */
export interface PayCoverageLine {
  symbol: string;
  /** Noms des réseaux, dans l'ordre de la table. Un réseau inconnu est omis. */
  networks: string[];
}

/**
 * Couverture mise en forme pour l'affichage, réseaux nommés.
 *
 * Les noms viennent d'un résolveur injecté plutôt que d'être écrits ici : c'est
 * le registre des chaînes qui sait comment un réseau s'appelle, y compris
 * lorsque l'utilisateur en a ajouté un.
 */
export function payCoverageLines(nameOf: (evmChainId: number) => string | undefined): PayCoverageLine[] {
  return PAY_SUPPORTED_ASSETS.map((a) => ({
    symbol: a.symbol,
    networks: a.chainIds.map((id) => nameOf(id)).filter((n): n is string => !!n),
  })).filter((l) => l.networks.length > 0);
}
