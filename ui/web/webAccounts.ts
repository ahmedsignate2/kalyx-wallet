/** Adresses de la session WalletConnect, sous la forme attendue par les stores
 *  partagés avec l'app (portefeuille agrégé, sélecteur de tokens…). */
import { useMemo } from 'react';
import { listChains, type ChainConfig } from '../../src';
import { useWebConnect, type ConnAccount } from '../../lib/webConnect';
import type { PortfolioAccount } from '../../lib/portfolio';

const ALL = listChains({ includeTestnets: true });

export function chainOf(chainId: string): ChainConfig | undefined {
  return ALL.find((c) => c.id === chainId);
}

/** Adresse du compte de la session sur `chainId` (même adresse pour tous les EVM). */
export function addressForChain(accounts: ConnAccount[], chainId: string): string {
  const direct = accounts.find((a) => a.chainId === chainId)?.address;
  if (direct) return direct;
  const fam = chainOf(chainId)?.family;
  return accounts.find((a) => chainOf(a.chainId)?.family === fam)?.address ?? '';
}

export function toPortfolioAccount(accounts: ConnAccount[]): PortfolioAccount | null {
  const fam = (f: string) => accounts.find((a) => chainOf(a.chainId)?.family === f)?.address;
  const evmAddress = fam('evm');
  if (!evmAddress) return null;
  return { evmAddress, solAddress: fam('solana'), btcAddress: fam('bitcoin') };
}

export function useWebPortfolioAccount(): PortfolioAccount | null {
  const accounts = useWebConnect((s) => s.accounts);
  const key = accounts.map((a) => `${a.chainId}:${a.address}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => toPortfolioAccount(accounts), [key]);
}
