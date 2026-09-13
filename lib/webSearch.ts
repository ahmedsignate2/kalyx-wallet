export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface DuckDuckGoResponse {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: unknown[];
}

const PRICE_QUERY = /\b(sol(?:ana)?|btc|bitcoin|eth|ethereum|crypto(?:monnaie)?|cours|prix)\b/i;

function flattenTopics(topics: unknown[], output: WebSearchResult[]): void {
  for (const topic of topics) {
    if (!topic || typeof topic !== 'object') continue;
    const item = topic as { FirstURL?: unknown; Text?: unknown; Topics?: unknown };
    if (Array.isArray(item.Topics)) flattenTopics(item.Topics, output);
    else if (typeof item.FirstURL === 'string' && typeof item.Text === 'string') {
      output.push({ title: item.Text.split(' - ')[0] || item.Text, snippet: item.Text, url: item.FirstURL });
    }
  }
}

async function fetchCryptoPrices(query: string): Promise<WebSearchResult[]> {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum,bitcoin&vs_currencies=usd,eur&include_24hr_change=true',
  );
  const data = await response.json().catch(() => null) as Record<string, {
    usd?: number;
    eur?: number;
    usd_24h_change?: number;
    eur_24h_change?: number;
  }> | null;
  console.log('[WebSearch] CoinGecko réponse brute :', JSON.stringify(data));
  if (!response.ok) throw new Error(`CoinGecko indisponible (${response.status}).`);
  if (!data) throw new Error('Réponse CoinGecko invalide.');

  return [
    ['Solana', 'solana'],
    ['Ethereum', 'ethereum'],
    ['Bitcoin', 'bitcoin'],
  ].map(([label, id]) => {
    const price = data[id];
    return {
      title: `${label} — prix actuel`,
      snippet: `${label}: ${price?.eur ?? 'indisponible'} EUR / ${price?.usd ?? 'indisponible'} USD, variation 24h: ${price?.eur_24h_change?.toFixed(2) ?? 'indisponible'}%. Requête: ${query}`,
      url: `https://www.coingecko.com/en/coins/${id}`,
    };
  });
}

/** Public search with a deterministic price fallback; no provider key is embedded. */
export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) throw new Error('Requête de recherche vide.');
  const startedAt = Date.now();
  console.log('[WebSearch] Exécution de la requête :', normalized);
  try {
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(normalized)}&format=json&no_html=1&skip_disambig=1`);
    const raw = await response.text();
    let data: DuckDuckGoResponse;
    try {
      data = JSON.parse(raw) as DuckDuckGoResponse;
    } catch (error) {
      console.error('[WebSearch Error] JSON DuckDuckGo invalide :', error);
      throw new Error('Réponse DuckDuckGo invalide.');
    }
    console.log('[WebSearch] Réponse brute du service :', JSON.stringify(data));
    if (!response.ok) throw new Error(`DuckDuckGo indisponible (${response.status}).`);

    const results: WebSearchResult[] = [];
    if (data.AbstractText && data.AbstractURL) {
      results.push({ title: data.Heading || normalized, snippet: data.AbstractText, url: data.AbstractURL });
    }
    flattenTopics(data.RelatedTopics ?? [], results);
    if (results.length > 0) {
      console.log('[WebSearch] Résultats normalisés :', results.length, `(${Date.now() - startedAt} ms)`);
      return results.slice(0, 8);
    }
    console.warn('[WebSearch] DuckDuckGo ne renvoie aucun résultat.');
  } catch (error) {
    console.error('[WebSearch Error]', error);
    if (!PRICE_QUERY.test(normalized)) throw error;
  }

  if (PRICE_QUERY.test(normalized)) {
    try {
      const prices = await fetchCryptoPrices(normalized);
      console.log('[WebSearch] Fallback CoinGecko terminé :', prices.length, `(${Date.now() - startedAt} ms)`);
      return prices;
    } catch (error) {
      console.error('[WebSearch Error] Fallback CoinGecko :', error);
      throw error;
    }
  }
  return [];
}
