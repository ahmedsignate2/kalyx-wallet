/**
 * Prix Alchemy (Prices API) par le RELAIS Kalyx : la deuxième source, pour
 * les tokens que DefiLlama n'a pas chiffrés. 25 tokens par requête, gardés une
 * minute pour tout le monde côté relais. Un prix illisible reste ABSENT
 * (jamais 0) ; relais en pause ou en panne : rien, l'appelant garde ce qu'il a.
 */
import { withTimeout } from '../chains/net';
import { noteRelayResponse, noteRelayUnreachable, RELAY_URL, relayPaused } from '../net/relay';
import { relaySlugOf } from '../tokens/relayTokens';
import type { ChainConfig } from '../chains/types';

const PER_CALL = 25;
/** Au plus 4 requêtes par chargement (100 tokens) : au-delà, des queues de spam. */
const MAX_CALLS = 4;
const TIMEOUT_MS = 10_000;

/** Prix en USD, clés `<id du réseau Kalyx>:<adresse en minuscules>`. */
export async function getRelayTokenPricesUsd(items: { chain: ChainConfig; address: string }[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!RELAY_URL || relayPaused('alchemy')) return out;
  const bySlugAddr = new Map<string, string>(); // "<réseau Alchemy>:<adresse>" → "<id Kalyx>:<adresse>"
  const tokens: { chain: string; address: string }[] = [];
  for (const { chain, address } of items) {
    const slug = relaySlugOf(chain);
    if (!slug || !/^0x[0-9a-fA-F]{40}$/.test(address)) continue;
    const k = `${slug}:${address.toLowerCase()}`;
    if (bySlugAddr.has(k)) continue;
    bySlugAddr.set(k, `${chain.id}:${address.toLowerCase()}`);
    tokens.push({ chain: slug, address });
  }
  const url = `${RELAY_URL}/v1/prices`;
  const calls: { chain: string; address: string }[][] = [];
  for (let i = 0; i < tokens.length && calls.length < MAX_CALLS; i += PER_CALL) calls.push(tokens.slice(i, i + PER_CALL));
  await Promise.all(
    calls.map(async (batch) => {
      try {
        const res = await withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: batch }) }), TIMEOUT_MS, () => new Error('timeout'));
        noteRelayResponse(url, res);
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { prices?: Record<string, unknown> } | null;
        for (const [k, v] of Object.entries(body?.prices ?? {})) {
          const ours = bySlugAddr.get(k.toLowerCase());
          if (ours && typeof v === 'number' && Number.isFinite(v) && v > 0) out[ours] = v;
        }
      } catch {
        noteRelayUnreachable(url);
      }
    }),
  );
  return out;
}
