import { fetchAddressTransactions, type PublicChainTransaction } from './explorerApi';
import { searchWeb, type WebSearchResult } from './webSearch';
import { copilotLog, copilotError } from './copilotLogger';
import { useWallet } from './walletStore';
import { getAdapter } from '../src';
import { maskId } from './copilotContext';
import { requestBillableCall, rememberResult, TOOL_TIMEOUT_MS } from './aiToolBudget';

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

/** Liste blanche : un nom d'outil halluciné ne doit rien déclencher. */
const TOOL_NAMES: ReadonlySet<string> = new Set<string>([FETCH_WALLET_HISTORY_TOOL.name, WEB_SEARCH_TOOL.name]);

/**
 * Abandonne un outil qui traîne. Sans cela, un explorateur lent ou une
 * recherche qui ne répond pas bloque la réponse de l'assistant indéfiniment.
 */
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Outil expiré')), TOOL_TIMEOUT_MS)),
  ]);
}

/**
 * Exécute un outil du copilote.
 *
 * GARDE-FOU DE BUDGET, ajouté ici et non demandé au modèle. Ces deux outils
 * sortent de l'appareil — l'un interroge un explorateur, l'autre une recherche
 * web — et n'avaient AUCUNE limite : ni compteur, ni cache, ni délai
 * d'expiration. Un modèle qui boucle, parce qu'il n'a pas compris la réponse ou
 * qu'il hallucine une raison de réessayer, pouvait donc enchaîner les appels et
 * brûler un quota. Ce n'est pas une hypothèse : c'est le comportement par défaut
 * d'un modèle faible à qui on donne un outil, et l'app en livre plusieurs de 8
 * milliards de paramètres par défaut.
 *
 * Une consigne de prompt ne tient pas contre une boucle. Un compteur, oui.
 */
export async function executeCopilotTool(name: string, args: unknown): Promise<PublicChainTransaction[] | WebSearchResult[]> {
  const traceId = 'tool';
  copilotLog(traceId, 'tool.start', { name, args });
  if (!args || typeof args !== 'object') {
    throw new Error('Outil Copilot inconnu.');
  }
  if (!TOOL_NAMES.has(name)) {
    throw new Error('Outil Copilot inconnu.');
  }

  /*
   * La clé inclut les ARGUMENTS : remesurer la même cible est servi par le
   * cache sans rien consommer, mais changer d'argument coûte bien un appel —
   * le cache ne doit pas devenir une faille.
   */
  const key = `${name}:${JSON.stringify(args)}`;
  const verdict = requestBillableCall(key);
  if (!verdict.allowed) {
    copilotLog(traceId, 'tool.budget_denied', { name, reason: verdict.reason });
    // On LÈVE avec le motif : l'appelant l'injecte dans la conversation, donc le
    // modèle apprend qu'il doit conclure au lieu de réessayer en boucle.
    throw new Error(verdict.reason ?? 'Budget des outils épuisé.');
  }
  if (verdict.cached !== undefined) {
    copilotLog(traceId, 'tool.cache_hit', { name });
    return verdict.cached as PublicChainTransaction[] | WebSearchResult[];
  }
  if (name === WEB_SEARCH_TOOL.name) {
    const query = (args as { query?: unknown }).query;
    if (typeof query !== 'string') throw new Error('Paramètre de recherche invalide.');
    try {
      const result = await withTimeout(searchWeb(query));
      copilotLog(traceId, 'tool.complete', { name, resultCount: result.length });
      rememberResult(key, result);
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
    const result = await withTimeout(fetchAddressTransactions(address, input.network));
    // Contreparties et hashs masqués avant de remonter au modèle.
    const masked = result.map((tx) => {
      const out = { ...tx } as Record<string, unknown>;
      for (const k of ['hash', 'from', 'to', 'txHash', 'address', 'counterparty']) if (typeof out[k] === 'string') out[k] = maskId(out[k] as string);
      return out as unknown as PublicChainTransaction;
    });
    copilotLog(traceId, 'tool.complete', { name, network: input.network, resultCount: masked.length });
    rememberResult(key, masked);
    return masked;
  } catch (error) {
    copilotError(traceId, 'tool.error', error, { name, network: input.network });
    throw error;
  }
}
