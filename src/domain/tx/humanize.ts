/**
 * Activité HUMANISÉE (§4.6) : chaque transaction devient une phrase.
 *   « Envoyé 50 USDC à vitalik.eth » · « Reçu 0,1 ETH de 0xd8dA…f8F7 »
 *   « Échangé 0,1 ETH » · « Autorisé Uniswap à dépenser tes USDC » · « Reçu 1 NFT »
 * Les échecs disent qu'ils ont échoué ; les transferts spam à 0 sont masqués.
 * Regroupement par Aujourd'hui / Hier / date. Pur et testé.
 *
 * LES PHRASES NE SONT PAS ÉCRITES ICI. Elles l'étaient, en français, si bien que
 * l'historique restait français dans les quatorze autres langues — alors que
 * tout l'écran autour était traduit. Un module de domaine ne connaît pas la
 * langue de l'utilisateur : il reçoit un traducteur et lui passe une CLÉ et des
 * paramètres, comme `describeQr` le fait déjà pour les codes QR.
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
  /**
   * Diffusée mais pas encore incluse dans un bloc.
   *
   * Distinct de `failed` : rien n'a échoué, on attend. Bitcoin ne le disait pas
   * — son analyseur codait `success` en dur —, si bien qu'une transaction encore
   * dans le mempool s'affichait comme confirmée.
   */
  pending: boolean;
  /** Transfert entrant à 0 (poussière/spam) : masqué par défaut. */
  spam: boolean;
}

/**
 * Clés de phrases de l'activité. Liste fermée : une clé inconnue ne compile pas.
 */
export type ActivityKey =
  | 'actSent'
  | 'actReceived'
  | 'actSwapped'
  | 'actApproved'
  | 'actNftIn'
  | 'actNftOut'
  | 'actInternal'
  | 'actInteraction'
  | 'actTo'
  | 'actFrom'
  | 'actUnverified'
  | 'actFailedPrefix'
  | 'actFailedBody';

/** Traducteur injecté : rend la phrase de `key`, paramètres substitués. */
export type ActivityTranslate = (key: ActivityKey, params?: Record<string, string>) => string;

export interface HumanizeCtx {
  /** Traducteur de l'écran appelant. */
  t: ActivityTranslate;
  /** Repli quand la chaîne de la transaction est introuvable. */
  nativeSymbol: string;
  /** Repli quand la chaîne de la transaction est introuvable. */
  nativeDecimals: number;
  /**
   * Symbole et décimales natifs de la chaîne D'UNE transaction donnée.
   *
   * Sans ce résolveur, une liste qui mêle plusieurs réseaux — celle de l'accueil
   * — applique à toutes les lignes les décimales du réseau AFFICHÉ. Un envoi de
   * 1 000 satoshis vu depuis Base ressortait en « 0,000000000000001 ETH », et la
   * contre-valeur cherchait le prix de l'ETH pour du Bitcoin.
   *
   * Facultatif : un écran qui ne montre qu'un seul réseau a déjà le bon contexte
   * et n'a rien à résoudre.
   */
  nativeOf?: (chain: string) => { symbol: string; decimals: number } | undefined;
  /** Nom d'une adresse (contact, ENS, « Toi ») — sinon adresse courte. */
  nameOf?: (address: string) => string | undefined;
  /** Symboles des tokens VÉRIFIÉS : un token entrant hors de cette liste = airdrop spam probable. */
  verifiedSymbols?: Set<string>;
  /** Contre-valeur d'un montant (symbole, montant humain) → chaîne formatée, ou undefined. */
  fiatOf?: (symbol: string, amount: number) => string | undefined;
}

export function humanizeTx(tx: TxSummary, ctx: HumanizeCtx): HumanTx {
  /*
   * LA CHAÎNE DE LA TRANSACTION D'ABORD, jamais celle de l'écran. C'est la seule
   * façon d'afficher juste une liste qui mêle les réseaux.
   */
  const native = ctx.nativeOf?.(tx.chain);
  const symbol = tx.asset ?? native?.symbol ?? ctx.nativeSymbol;
  const decimals = tx.decimals ?? native?.decimals ?? ctx.nativeDecimals;
  const amountStr = formatTokenAmount(tx.value, decimals);
  const name = (a: string) => ctx.nameOf?.(a) ?? shortAddress(a);
  const failed = tx.status === 'failed';
  const type = (tx.type ?? '').toUpperCase();
  const inbound = tx.direction === 'in';
  const isToken = !!tx.asset && tx.asset.toUpperCase() !== (native?.symbol ?? ctx.nativeSymbol).toUpperCase();
  const unverified = isToken && !!ctx.verifiedSymbols && !ctx.verifiedSymbols.has(symbol.toUpperCase());
  const amountNum = Number(tx.value) / 10 ** decimals;
  const fiat = !unverified && ctx.fiatOf ? ctx.fiatOf(symbol, amountNum) : undefined;

  const pending = tx.status === 'pending';

  /*
   * Les branches ne décrivent QUE la nature de l'opération ; l'attente est un
   * état transversal, ajouté une seule fois plus bas. L'énumérer dans chacune
   * des huit branches n'aurait fait qu'offrir huit endroits pour l'oublier.
   */
  const t = ctx.t;
  const money = { amount: amountStr, symbol };

  let out: Omit<HumanTx, 'pending'>;
  if (type === 'SWAP') {
    out = { title: t('actSwapped', money), subtitle: tx.description ?? undefined, icon: 'exchange', tone: 'neutral', amount: undefined, failed, spam: false };
  } else if (type === 'APPROVE' || type === 'APPROVAL') {
    out = { title: t('actApproved', { name: name(tx.to), symbol }), icon: 'security', tone: 'neutral', failed, spam: false };
  } else if (type === 'NFT') {
    out = {
      title: inbound ? t('actNftIn', { name: name(tx.from) }) : t('actNftOut', { name: name(tx.to) }),
      icon: 'nft',
      tone: inbound ? 'up' : 'neutral',
      failed,
      spam: false,
    };
  } else if (tx.direction === 'self') {
    out = { title: t('actInternal', money), icon: 'send', tone: 'neutral', amount: `${amountStr} ${symbol}`, failed, spam: false };
  } else if (inbound && unverified) {
    // Token inconnu reçu sans rien demander : gris, sans « + », sans valeur, masqué par défaut.
    out = { title: t('actReceived', money), subtitle: t('actUnverified'), icon: 'alert', tone: 'neutral', amount: `${amountStr} ${symbol}`, failed, spam: true, counterparty: tx.from };
  } else if (inbound) {
    out = { title: t('actReceived', money), subtitle: t('actFrom', { name: name(tx.from) }), icon: 'receive', tone: 'up', amount: `+${amountStr} ${symbol}`, failed, spam: tx.value === 0n, counterparty: tx.from, fiat };
  } else if (tx.value === 0n && type !== 'TRANSFER') {
    out = { title: t('actInteraction', { name: name(tx.to) }), subtitle: tx.description ?? undefined, icon: 'dapps', tone: 'neutral', failed, spam: false };
  } else {
    out = { title: t('actSent', money), subtitle: t('actTo', { name: name(tx.to) }), icon: 'send', tone: 'down', amount: `−${amountStr} ${symbol}`, failed, spam: false, counterparty: tx.to, fiat };
  }
  const result: HumanTx = { ...out, pending };
  if (failed) {
    /*
     * Le titre est repris TEL QUEL. L'ancienne version en minusculait la
     * première lettre pour enchaîner « Échouée · envoyé … » : un réflexe de
     * français, qui n'a aucun sens en chinois, en japonais ou en arabe, et qui
     * abîme une phrase allemande commençant par un montant.
     */
    result.title = t('actFailedPrefix', { what: result.title });
    result.subtitle = t('actFailedBody');
    result.icon = 'errorCircle';
    result.tone = 'danger';
  }
  return result;
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
