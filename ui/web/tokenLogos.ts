/**
 * Logo d'un token quand la source principale (Alchemy/RPC) n'en fournit pas :
 * on retombe sur la liste curée LI.FI du réseau (déjà chargée pour le swap),
 * qui couvre l'essentiel des tokens vérifiés. Sinon → monogramme coloré (UI).
 */
import { useEffect } from 'react';
import { useTokenStore } from '../../lib/tokenStore';
import { chainOf } from './webAccounts';

export function useTokenLogo(chainId: string, address: string | undefined, primary?: string): string | undefined {
  const fetchTokens = useTokenStore((s) => s.fetchTokens);
  const list = useTokenStore((s) => s.tokensByChain[chainId]);
  const fam = chainOf(chainId)?.family;
  const need = !primary && !!address && (fam === 'evm' || fam === 'solana');
  useEffect(() => {
    if (need && !list) fetchTokens(chainId).catch(() => {});
  }, [need, list, chainId, fetchTokens]);
  if (primary) return primary;
  if (!need || !list) return undefined;
  const a = address!.toLowerCase();
  return list.find((tk) => tk.address.toLowerCase() === a)?.logo || undefined;
}
