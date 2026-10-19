/**
 * Tokens ERC-20 de TOUS les réseaux en UNE requête au relais Kalyx
 * (`/v1/erc20`) : c'est ce qui garde le Worker loin de son quota gratuit —
 * une actualisation du portefeuille = un appel, pas un par réseau.
 *
 * Le relais rend, par réseau, soit les tokens, soit « quota » / « upstream » :
 * les réseaux en échec passent au repli gratuit (tokens principaux lus sur les
 * nœuds publics), les autres sont gardés.
 */
import { isSpamToken, type Erc20Token } from './alchemyTokens';
import { noteRelayResponse, noteRelayUnreachable, RELAY_URL, relayPaused } from '../net/relay';
import { withTimeout } from '../chains/net';
import type { ChainConfig } from '../chains/types';

const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 60;

/** Réseau Alchemy d'une chaîne servie par le relais (`…/rpc/alchemy/<réseau>`). */
export function relaySlugOf(chain: ChainConfig): string | null {
  if (!RELAY_URL) return null;
  for (const u of chain.rpcUrls) {
    const m = u.startsWith(`${RELAY_URL}/rpc/alchemy/`) && u.match(/\/rpc\/alchemy\/([a-z0-9-]+)$/);
    if (m) return m[1];
  }
  return null;
}

type Raw = { contract?: unknown; raw?: unknown; name?: unknown; symbol?: unknown; decimals?: unknown; logo?: unknown };

/** Lit les tokens d'un réseau tels que le relais les rend ; rien de deviné. */
export function parseRelayTokens(list: unknown): Erc20Token[] {
  if (!Array.isArray(list)) throw new Error('réponse du relais illisible');
  const out: Erc20Token[] = [];
  for (const t of list as Raw[]) {
    if (typeof t.contract !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(t.contract) || typeof t.raw !== 'string' || !/^\d{1,78}$/.test(t.raw)) continue;
    if (typeof t.symbol !== 'string' || typeof t.decimals !== 'number') continue;
    const meta = { name: typeof t.name === 'string' ? t.name : t.symbol, symbol: t.symbol, decimals: t.decimals, logo: typeof t.logo === 'string' && t.logo.startsWith('https://') ? t.logo : undefined };
    if (isSpamToken(meta)) continue;
    out.push({ contract: t.contract, raw: BigInt(t.raw), ...meta });
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}

/**
 * Par chaîne : la liste, ou l'erreur (le réseau passe alors au repli).
 * Lève si le relais est en pause ou injoignable (tout passe au repli).
 */
export async function getErc20ViaRelay(address: string, chains: ChainConfig[]): Promise<Map<string, Erc20Token[] | Error>> {
  const bySlug = new Map<string, ChainConfig>();
  for (const c of chains) {
    const s = relaySlugOf(c);
    if (s) bySlug.set(s, c);
  }
  const out = new Map<string, Erc20Token[] | Error>();
  if (!bySlug.size) return out;
  if (relayPaused('alchemy')) throw new Error('relais en pause (quota)');
  const url = `${RELAY_URL}/v1/erc20`;
  let res: Response;
  try {
    res = await withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, chains: [...bySlug.keys()] }) }), TIMEOUT_MS, () => new Error('timeout'));
  } catch (e) {
    noteRelayUnreachable(`${RELAY_URL}/rpc/alchemy/x`);
    throw e;
  }
  noteRelayResponse(`${RELAY_URL}/rpc/alchemy/x`, res);
  if (!res.ok) throw new Error(`relais HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { chains?: Record<string, { tokens?: unknown; error?: unknown }> } | null;
  for (const [slug, chain] of bySlug) {
    const r = body?.chains?.[slug];
    if (!r || r.error !== undefined) out.set(chain.id, new Error(`relais : ${String(r?.error ?? 'absent')}`));
    else {
      try {
        out.set(chain.id, parseRelayTokens(r.tokens));
      } catch (e) {
        out.set(chain.id, e as Error);
      }
    }
  }
  return out;
}
