import { fetchAddressTransactions, type PublicChainTransaction } from './explorerApi';
import { searchWeb, type WebSearchResult } from './webSearch';
import { copilotLog, copilotError } from './copilotLogger';
import { useWallet } from './walletStore';
import { getAdapter } from '../src';
import { maskId } from './copilotContext';

export const FETCH_WALLET_HISTORY_TOOL = {
  name: 'fetch_wallet_history',
  description: "Récupère les dernières transactions publiques du wallet de l'utilisateur sur un réseau. L'adresse est résolue localement : ne la demande jamais.",
  parameters: {
    type: 'object',
    properties: {
      network: { type: 'string', description: 'Identifiant du réseau Kalyx (ex. ethereum, solana, bitcoin).' },
    },
    required: ['network'],
  },
} as const;

export const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: 'Effectue une recherche sur le Web pour obtenir des données fraîches sur les cryptos, actualités Web3 et documentation de protocoles.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Mots-clés précis de la recherche.' } },
    required: ['query'],
  },
} as const;

export async function executeCopilotTool(name: string, args: unknown): Promise<PublicChainTransaction[] | WebSearchResult[]> {
  const traceId = 'tool';
  copilotLog(traceId, 'tool.start', { name, args });
  if (!args || typeof args !== 'object') {
    throw new Error('Outil Copilot inconnu.');
  }
  if (name === WEB_SEARCH_TOOL.name) {
    const query = (args as { query?: unknown }).query;
    if (typeof query !== 'string') throw new Error('Paramètre de recherche invalide.');
    try {
      const result = await searchWeb(query);
      copilotLog(traceId, 'tool.complete', { name, resultCount: result.length });
      return result;
    } catch (error) {
      copilotError(traceId, 'tool.error', error, { name });
      throw error;
    }
  }
  if (name !== FETCH_WALLET_HISTORY_TOOL.name) throw new Error('Outil Copilot inconnu.');
  const input = args as { network?: unknown };
  if (typeof input.network !== 'string') {
    throw new Error('Paramètres de consultation blockchain invalides.');
  }
  // Adresse du compte actif, résolue ici : le modèle ne la reçoit jamais en clair.
  const wallet = useWallet.getState();
  const account = wallet.accounts.find((a) => a.index === wallet.activeAccountIndex) ?? wallet.accounts[0];
  const family = getAdapter(input.network).config.family;
  const address = family === 'solana' ? account?.solAddress : family === 'bitcoin' ? account?.btcAddress : account?.evmAddress;
  if (!address) throw new Error('Aucun compte actif pour ce réseau.');
  try {
    const result = await fetchAddressTransactions(address, input.network);
    // Contreparties et hashs masqués avant de remonter au modèle.
    const masked = result.map((tx) => {
      const out = { ...tx } as Record<string, unknown>;
      for (const k of ['hash', 'from', 'to', 'txHash', 'address', 'counterparty']) if (typeof out[k] === 'string') out[k] = maskId(out[k] as string);
      return out as unknown as PublicChainTransaction;
    });
    copilotLog(traceId, 'tool.complete', { name, network: input.network, resultCount: masked.length });
    return masked;
  } catch (error) {
    copilotError(traceId, 'tool.error', error, { name, network: input.network });
    throw error;
  }
}
