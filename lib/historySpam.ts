/**
 * Contexte du tri anti-spam de l'historique, construit depuis l'état de l'app :
 * tokens vérifiés du portefeuille, listes curées, contacts et propres comptes.
 * Le même pour l'accueil et l'écran Historique — deux listes qui ne filtreraient
 * pas pareil se contrediraient sous les yeux de l'utilisateur.
 */
import { useMemo } from 'react';
import { getAdapter, knownTokensFor, listChains, KNOWN_MINTS, type ChainConfig, type TxSummary } from '../src';
import { useHistoryStore } from './historyStore';
import { knownCounterparties, paidCounterparties, spamReason, type SpamCtx, type SpamReason } from '../src/domain/tx/spam';
import { usePortfolioStore } from './portfolio';
import { useWallet } from './walletStore';
import { useContacts } from './contactsStore';

export function buildTrusted(verifiedIds: Set<string>): SpamCtx['trusted'] {
  const curated = new Map<string, Set<string>>();
  return (chain, contract) => {
    const c = contract.toLowerCase();
    if (verifiedIds.has(`${chain}:${c}`)) return true;
    let family: string;
    try {
      family = getAdapter(chain).config.family;
    } catch {
      return false;
    }
    // TON : l'historique n'admet déjà que les jettons de la liste blanche TonAPI.
    if (family === 'ton') return true;
    if (family === 'solana') return !!KNOWN_MINTS[contract];
    let set = curated.get(chain);
    if (!set) {
      set = new Set(knownTokensFor(getAdapter(chain).config.evmChainId).map((a) => a.toLowerCase()));
      curated.set(chain, set);
    }
    return set.has(c);
  };
}

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

/**
 * RÉSEAUX DONT ON LIT L'HISTORIQUE.
 *
 * Tous les réseaux du registre (soixante-six) étaient interrogés à chaque
 * ouverture de l'accueil et de l'Activité, y compris ceux où l'utilisateur n'a
 * jamais rien eu : des dizaines d'appels pour des listes vides, des quotas
 * brûlés et un écran lent. On lit les réseaux principaux, ceux où il détient
 * quelque chose, et ceux dont on a déjà un historique.
 */
export const CORE_HISTORY_CHAINS = new Set(['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche', 'solana', 'bitcoin', 'ton']);

export function pickHistoryChains<C extends { id: string }>(all: C[], holdingChains: Set<string>, cachedChains: Set<string>): C[] {
  return all.filter((c) => CORE_HISTORY_CHAINS.has(c.id) || holdingChains.has(c.id) || cachedChains.has(c.id));
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
