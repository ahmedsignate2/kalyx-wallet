import { fetchAddressTransactions, type PublicChainTransaction } from './explorerApi';
import { searchWeb, type WebSearchResult } from './webSearch';
import { copilotLog, copilotError } from './copilotLogger';

export const FETCH_WALLET_HISTORY_TOOL = {
  name: 'fetch_wallet_history',
  description: "Récupère les dernières transactions publiques d'une adresse sur un réseau.",
  parameters: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'Adresse publique EVM, Solana ou Bitcoin.' },
      network: { type: 'string', description: 'Identifiant du réseau Kalyx.' },
    },
    required: ['address', 'network'],
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
  const input = args as { address?: unknown; network?: unknown };
  if (typeof input.address !== 'string' || typeof input.network !== 'string') {
    throw new Error('Paramètres de consultation blockchain invalides.');
  }
  try {
    const result = await fetchAddressTransactions(input.address, input.network);
    copilotLog(traceId, 'tool.complete', { name, network: input.network, resultCount: result.length });
    return result;
  } catch (error) {
    copilotError(traceId, 'tool.error', error, { name, network: input.network });
    throw error;
  }
}
