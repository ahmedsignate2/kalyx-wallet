/**
 * ÉMETTEURS DE CARTES CRYPTO accessibles depuis l'onglet « Carte » de Kalyx.
 *
 * MODÈLE « PASSERELLE DAPP ». Kalyx n'émet aucune carte et ne voit jamais ses
 * numéros : chaque émetteur est une dApp publique, faite pour être utilisée par
 * n'importe quel portefeuille. L'écran Carte l'ouvre dans le navigateur Kalyx,
 * le portefeuille de l'utilisateur s'y connecte (fournisseur injecté, ou
 * WalletConnect pour Solana), et c'est l'ÉMETTEUR qui fait le KYC, affiche les
 * numéros et le CVV, et propose Apple Pay / Google Pay. Aucune clé d'API,
 * aucun contrat, aucun identifiant d'un autre portefeuille.
 *
 * Les hôtes sont ceux du catalogue (src/domain/web/dappCatalog) : ils reçoivent
 * la coche « vérifié » et sont protégés contre les sosies. Disponibilité,
 * réseaux et frais sont ceux annoncés par chaque émetteur, susceptibles de
 * changer : l'écran les présente comme indicatifs et renvoie à l'émetteur.
 */
import { catalogEntry, type CatalogDapp } from '../web/dappCatalog';

export type CardIssuerId = 'gnosispay' | 'holyheld' | 'spritz';

export interface CardIssuer {
  id: CardIssuerId;
  /** Entrée du catalogue (nom, hôte vérifié, URL, familles, couleur). */
  dapp: CatalogDapp;
  /** Zones où l'émetteur annonce sa carte (indicatif). */
  regions: readonly ('eu' | 'uk' | 'us')[];
  /** Réseaux de recharge annoncés (indicatif), pour l'information seulement. */
  chains: readonly string[];
  /** Le fonctionnement en une phrase : clé i18n. */
  modelKey: 'cardModelSafe' | 'cardModelTopUp' | 'cardModelVirtual';
  /**
   * Réseaux Kalyx (identifiants de src/domain/chains) sur lesquels la page de
   * l'émetteur s'ouvre et où l'on montre le solde prêt à dépenser. Le premier
   * est celui par défaut.
   */
  chainIds: readonly string[];
  /** Stablecoins comptés comme « prêts à dépenser » (symboles). */
  stables: readonly string[];
  /**
   * Recharge NATIVE possible ? `onchain` : la carte dépense depuis un compte
   * on-chain à l'utilisateur (Gnosis Pay : un Safe sur Gnosis Chain). Recharger
   * = lui envoyer des stablecoins, et son solde se lit sur la blockchain — sans
   * API ni contrat. `site` : l'émetteur n'expose rien de public (Holyheld exige
   * une clé d'API partenaire) ; tout se fait sur son site.
   */
  topUp: 'onchain' | 'site';
}

const entry = (host: string): CatalogDapp => {
  const d = catalogEntry(host);
  if (!d) throw new Error(`Émetteur absent du catalogue : ${host}`);
  return d;
};

export const CARD_ISSUERS: readonly CardIssuer[] = [
  // Dépense des stablecoins depuis un Safe à soi, sans recharge préalable.
  { id: 'gnosispay', dapp: entry('app.gnosispay.com'), regions: ['eu', 'uk'], chains: ['Gnosis'], modelKey: 'cardModelSafe', chainIds: ['gnosis'], stables: ['EURE', 'USDC', 'USDC.E', 'USDCE', 'GBPE'], topUp: 'onchain' },
  // Recharge depuis le portefeuille sur plusieurs réseaux EVM.
  { id: 'holyheld', dapp: entry('app.holyheld.com'), regions: ['eu'], chains: ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon'], modelKey: 'cardModelTopUp', chainIds: ['base', 'arbitrum', 'optimism', 'polygon', 'ethereum'], stables: ['USDC', 'USDC.E', 'USDT', 'EURC'], topUp: 'site' },
  // Carte virtuelle, surtout aux États-Unis ; Solana par WalletConnect.
  { id: 'spritz', dapp: entry('app.spritz.finance'), regions: ['us'], chains: ['Ethereum', 'Base', 'Polygon', 'Arbitrum', 'Solana'], modelKey: 'cardModelVirtual', chainIds: ['base', 'polygon', 'arbitrum', 'ethereum'], stables: ['USDC', 'USDC.E', 'USDT'], topUp: 'site' },
];

export function cardIssuer(id: string | null | undefined): CardIssuer {
  return CARD_ISSUERS.find((i) => i.id === id) ?? CARD_ISSUERS[0];
}

/** Réseau d'ouverture : celui choisi s'il est pris en charge par l'émetteur, sinon son réseau par défaut. */
export function cardChainFor(issuer: CardIssuer, preferred: string | null | undefined): string {
  return preferred && issuer.chainIds.includes(preferred) ? preferred : issuer.chainIds[0];
}

/** Total « prêt à dépenser » : les stablecoins VÉRIFIÉS de l'émetteur, sur ce réseau. */
export function spendableOn<H extends { chainId: string; symbol: string; amount: number; verified?: boolean }>(
  holdings: readonly H[],
  issuer: CardIssuer,
  chainId: string,
): { total: number; parts: H[] } {
  const parts = holdings.filter((h) => h.chainId === chainId && h.verified !== false && issuer.stables.includes(h.symbol.toUpperCase()) && h.amount > 0);
  return { total: parts.reduce((s, h) => s + h.amount, 0), parts };
}
