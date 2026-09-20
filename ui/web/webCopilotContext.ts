/**
 * Contexte Copilot pour le dashboard WEB — même interface que
 * lib/copilotContext.ts (CopilotWalletContext) et même sérialiseur
 * (serializeCopilotContext, avec son filtre anti-secret), mais peuplé depuis
 * les données du web (useWebConnect + soldes déjà chargés) plutôt que
 * lib/walletStore.ts (natif, hors de portée ici). Aucune adresse complète
 * n'est incluse (même règle que côté app).
 */
import { useMemo } from 'react';
import { getAdapter, humanizeTx, type ChainConfig, type TxSummary } from '../../src';
import type { CopilotWalletContext } from '../../lib/copilotContext';
import { maskId } from '../../lib/copilotContext';
import { useAsync } from './useAsync';

interface NetWorthLike {
  data: {
    total: number;
    slices: { chain: ChainConfig; address: string; native: number; tokens: number; value: number }[];
  } | null;
}

export function useWebCopilotContext(chain: ChainConfig, address: string, worth: NetWorthLike): CopilotWalletContext {
  const { data: history } = useAsync<TxSummary[]>(() => getAdapter(chain.id).getHistory(address), [chain.id, address]);

  return useMemo(() => {
    const balances = (worth.data?.slices ?? [])
      .filter((s) => s.value > 0)
      .map((s) => ({
        network: s.chain.name,
        tokenSymbol: s.chain.nativeSymbol,
        tokenName: s.chain.name,
        amount: '', // montant natif non renvoyé par useNetWorth (juste sa valeur) — pas critique pour le Copilot
        fiatValueEur: s.value,
        isTestnet: s.chain.testnet === true,
      }));

    const recentActivity = (history ?? []).slice(0, 10).map((tx) => {
      const h = humanizeTx(tx, { nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals });
      return {
        id: tx.hash,
        timestamp: new Date(tx.timestamp * 1000).toISOString(),
        network: chain.name,
        isTestnet: chain.testnet === true,
        actionType: tx.type === 'swap' ? 'swap' : tx.direction === 'in' ? 'receive' : tx.direction === 'out' ? 'send' : 'contract_interaction',
        summary: h.title,
        counterpartyOrDapp: maskId(tx.to),
        gasFeePaid: null,
        status: tx.status,
        failureReason: tx.status === 'failed' ? 'Transaction échouée' : null,
      };
    });

    const snapshot: CopilotWalletContext = {
      activeNetwork: {
        id: chain.id,
        name: chain.name,
        chainId: chain.evmChainId ?? chain.id,
        isTestnet: chain.testnet === true,
        family: chain.family,
      },
      environment: { showTestnets: false, activeTab: chain.testnet ? 'testnet' : 'mainnet' },
      addresses: { evm: '', solana: '', bitcoin: '' },
      balances,
      recentActivity,
      browser: { activeUrl: null, domain: null, isPhishingBlocked: false },
      // Etat de sécurité du TÉLÉPHONE (sauvegarde, biométrie, PIN) : hors de
      // portée d'une session web lecture-seule — jamais déduit à false, le
      // prompt système dit explicitement au modèle de ne pas s'en servir.
      security: {
        phraseVerified: false,
        encryptedBackupAt: null,
        driveBackupAt: null,
        biometrics: false,
        autoLockMinutes: 0,
        privacyGuard: false,
      },
    };
    return snapshot;
  }, [chain, history, worth.data]);
}
