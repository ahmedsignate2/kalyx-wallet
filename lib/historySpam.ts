/**
 * Contexte du tri anti-spam de l'historique, construit depuis l'état de l'app :
 * tokens vérifiés du portefeuille, listes curées, contacts et propres comptes.
 * Le même pour l'accueil et l'écran Historique — deux listes qui ne filtreraient
 * pas pareil se contrediraient sous les yeux de l'utilisateur.
 */
import { useMemo } from 'react';
import { buildTrusted, pickHistoryChains } from './historyTrust';
import { listChains, type ChainConfig, type TxSummary } from '../src';
import { useHistoryStore } from './historyStore';
import { knownCounterparties, paidCounterparties, spamReason, type SpamCtx, type SpamReason } from '../src/domain/tx/spam';
import { usePortfolioStore } from './portfolio';
import { useWallet } from './walletStore';
import { useContacts } from './contactsStore';

// Partie pure (aussi utilisée par l'extension navigateur).
export { buildTrusted, CORE_HISTORY_CHAINS, pickHistoryChains } from './historyTrust';

/** Fonction de tri pour `humanizeTx({ spamOf })`, recalculée quand ses sources changent. */
export function useSpamOf(txs: TxSummary[]): (tx: TxSummary) => SpamReason | null {
  const holdings = usePortfolioStore((s) => s.holdings);
  const accounts = useWallet((s) => s.accounts);
  const contacts = useContacts((s) => s.contacts);
  return useMemo(() => {
    const verified = new Set(holdings.filter((h) => h.verified && h.contract).map((h) => `${h.chainId}:${h.contract!.toLowerCase()}`));
    const trusted = buildTrusted(verified);
    const own = accounts.flatMap((a) => [a.evmAddress, a.btcAddress, a.solAddress ?? '']);
    const known = knownCounterparties(txs, trusted, [...own, ...contacts.map((c) => c.address)]);
    const ctx: SpamCtx = { trusted, known };
    return (tx) => spamReason(tx, ctx);
  }, [holdings, accounts, contacts, txs]);
}


export function useHistoryChains(): ChainConfig[] {
  const holdings = usePortfolioStore((s) => s.holdings);
  const cache = useHistoryStore((s) => s.cache);
  const holdingKey = [...new Set(holdings.filter((h) => h.raw > 0n).map((h) => h.chainId))].sort().join(',');
  const cachedKey = [...new Set(Object.entries(cache).filter(([, v]) => v.length > 0).map(([k]) => k.split(':')[0]))].sort().join(',');
  return useMemo(
    () => pickHistoryChains(listChains({ includeTestnets: false }), new Set(holdingKey.split(',')), new Set(cachedKey.split(','))),
    [holdingKey, cachedKey],
  );
}

/**
 * Adresses que l'utilisateur a RÉELLEMENT payées, d'après tout l'historique
 * en cache (natif ou token de confiance, transaction réussie). L'écran d'envoi
 * s'en sert contre l'empoisonnement : sans elles, il ne connaissait que les
 * envois faits depuis Kalyx, alors que l'attaquant imite n'importe quel
 * destinataire — y compris ceux payés depuis un autre portefeuille.
 */
export function usePaidAddresses(): string[] {
  const cache = useHistoryStore((s) => s.cache);
  const holdings = usePortfolioStore((s) => s.holdings);
  return useMemo(() => {
    const verified = new Set(holdings.filter((h) => h.verified && h.contract).map((h) => `${h.chainId}:${h.contract!.toLowerCase()}`));
    const all = Object.values(cache).flat();
    return paidCounterparties(all, buildTrusted(verified));
  }, [cache, holdings]);
}
