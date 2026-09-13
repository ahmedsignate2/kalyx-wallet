/**
 * Activité HUMANISÉE (§4.6) : chaque transaction devient une phrase.
 *   « Envoyé 50 USDC à vitalik.eth » · « Reçu 0,1 ETH de 0xd8dA…f8F7 »
 *   « Échangé 0,1 ETH » · « Autorisé Uniswap à dépenser tes USDC » · « Reçu 1 NFT »
 * Les échecs disent qu'ils ont échoué ; les transferts spam à 0 sont masqués.
 * Regroupement par Aujourd'hui / Hier / date. Pur et testé.
 */
import type { TxSummary } from '../chains/types';
import { formatTokenAmount } from '../validation/format';
import { shortAddress } from '../validation/poisoning';

export interface HumanTx {
  title: string;
  /** Adresse de la contrepartie (glyphe), si pertinente. */
  counterparty?: string;
  /** Contre-valeur formatée (« 0,08 € ») — jamais pour un token non vérifié. */
  fiat?: string;
  /** Contrepartie lisible (nom de contact / ENS / adresse courte) ou détail. */
  subtitle?: string;
  icon: 'send' | 'receive' | 'exchange' | 'security' | 'nft' | 'dapps' | 'errorCircle' | 'alert';
  tone: 'up' | 'down' | 'neutral' | 'danger';
  /** Montant signé formaté (« +0.1 ETH ») ; vide pour une approbation. */
  amount?: string;
  failed: boolean;
  /** Transfert entrant à 0 (poussière/spam) : masqué par défaut. */
  spam: boolean;
}

export interface HumanizeCtx {
  nativeSymbol: string;
  nativeDecimals: number;
  /** Nom d'une adresse (contact, ENS, « Toi ») — sinon adresse courte. */
  nameOf?: (address: string) => string | undefined;
  /** Symboles des tokens VÉRIFIÉS : un token entrant hors de cette liste = airdrop spam probable. */
  verifiedSymbols?: Set<string>;
  /** Contre-valeur d'un montant (symbole, montant humain) → chaîne formatée, ou undefined. */
  fiatOf?: (symbol: string, amount: number) => string | undefined;
}

export function humanizeTx(tx: TxSummary, ctx: HumanizeCtx): HumanTx {
  const symbol = tx.asset ?? ctx.nativeSymbol;
  const decimals = tx.decimals ?? ctx.nativeDecimals;
  const amountStr = formatTokenAmount(tx.value, decimals);
  const name = (a: string) => ctx.nameOf?.(a) ?? shortAddress(a);
  const failed = tx.status === 'failed';
  const type = (tx.type ?? '').toUpperCase();
  const inbound = tx.direction === 'in';
  const isToken = !!tx.asset && tx.asset.toUpperCase() !== ctx.nativeSymbol.toUpperCase();
  const unverified = isToken && !!ctx.verifiedSymbols && !ctx.verifiedSymbols.has(symbol.toUpperCase());
  const amountNum = Number(tx.value) / 10 ** decimals;
  const fiat = !unverified && ctx.fiatOf ? ctx.fiatOf(symbol, amountNum) : undefined;

  let out: HumanTx;
  if (type === 'SWAP') {
    out = { title: `Échangé ${amountStr} ${symbol}`, subtitle: tx.description ?? undefined, icon: 'exchange', tone: 'neutral', amount: undefined, failed, spam: false };
  } else if (type === 'APPROVE' || type === 'APPROVAL') {
    out = { title: `Autorisé ${name(tx.to)} à dépenser tes ${symbol}`, icon: 'security', tone: 'neutral', failed, spam: false };
  } else if (type === 'NFT') {
    out = { title: inbound ? `Reçu 1 NFT de ${name(tx.from)}` : `Envoyé 1 NFT à ${name(tx.to)}`, icon: 'nft', tone: inbound ? 'up' : 'neutral', failed, spam: false };
  } else if (tx.direction === 'self') {
    out = { title: `Transfert interne · ${amountStr} ${symbol}`, icon: 'send', tone: 'neutral', amount: `${amountStr} ${symbol}`, failed, spam: false };
  } else if (inbound && unverified) {
    // Token inconnu reçu sans rien demander : gris, sans « + », sans valeur, masqué par défaut.
    out = { title: `Reçu ${amountStr} ${symbol}`, subtitle: 'Token non vérifié — n’interagis pas avec lui', icon: 'alert', tone: 'neutral', amount: `${amountStr} ${symbol}`, failed, spam: true, counterparty: tx.from };
  } else if (inbound) {
    out = { title: `Reçu ${amountStr} ${symbol}`, subtitle: `de ${name(tx.from)}`, icon: 'receive', tone: 'up', amount: `+${amountStr} ${symbol}`, failed, spam: tx.value === 0n, counterparty: tx.from, fiat };
  } else if (tx.value === 0n && type !== 'TRANSFER') {
    out = { title: `Interaction avec ${name(tx.to)}`, subtitle: tx.description ?? undefined, icon: 'dapps', tone: 'neutral', failed, spam: false };
  } else {
    out = { title: `Envoyé ${amountStr} ${symbol}`, subtitle: `à ${name(tx.to)}`, icon: 'send', tone: 'down', amount: `−${amountStr} ${symbol}`, failed, spam: false, counterparty: tx.to, fiat };
  }
  if (failed) {
    out.title = `Échouée · ${out.title.charAt(0).toLowerCase()}${out.title.slice(1)}`;
    out.subtitle = 'Rien n’a été débité (sauf les frais réseau). Cause fréquente : frais trop bas ou autorisation manquante.';
    out.icon = 'errorCircle';
    out.tone = 'danger';
  }
  return out;
}

export interface TxGroup<T> {
  label: string;
  items: T[];
}

/** Regroupe par jour : « Aujourd’hui », « Hier », puis la date. `now` injectable pour les tests. */
export function groupByDay<T extends { timestamp: number }>(txs: T[], now = Date.now(), locale = 'fr-FR', labels?: { today?: string; yesterday?: string }): TxGroup<T>[] {
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const today = dayKey(now);
  const yesterday = dayKey(now - 86_400_000);
  const groups = new Map<string, TxGroup<T>>();
  const todayLabel = labels?.today ?? 'Aujourd’hui';
  const yesterdayLabel = labels?.yesterday ?? 'Hier';
  for (const tx of [...txs].sort((a, b) => b.timestamp - a.timestamp)) {
    const ms = tx.timestamp * 1000;
    const k = dayKey(ms);
    const label = k === today ? todayLabel : k === yesterday ? yesterdayLabel : new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: new Date(ms).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
    const g = groups.get(k) ?? { label, items: [] };
    g.items.push(tx);
    groups.set(k, g);
  }
  return [...groups.values()];
}
