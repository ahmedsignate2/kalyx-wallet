/** Scan anti-arnaque d'un token via GoPlus Security (API publique, sans clé). */
import { fetchJson, isEvm, isSolana } from './env';

const GOPLUS = 'https://api.gopluslabs.io/api/v1';

/** Chaînes EVM interrogées (GoPlus n'a pas d'endpoint « toutes chaînes »). */
const EVM_CHAINS: { id: string; name: string }[] = [
  { id: '1', name: 'Ethereum' }, { id: '8453', name: 'Base' }, { id: '56', name: 'BNB Chain' },
  { id: '42161', name: 'Arbitrum' }, { id: '137', name: 'Polygon' }, { id: '10', name: 'Optimism' }, { id: '43114', name: 'Avalanche' },
];

export type ScanOutcome = ScanResult | 'not_token' | null;

export interface ScanResult {
  chain: string;
  honeypot: boolean;
  buyTax: string;
  sellTax: string;
  openSource: boolean;
  flags: string[]; // clés de scanFlags
}

type GoPlusToken = Record<string, string | undefined>;

function parse(chain: string, r: GoPlusToken): ScanResult {
  const on = (k: string) => r[k] === '1';
  const pct = (v?: string) => (v == null || v === '' ? '?' : (Number(v) * 100).toFixed(1));
  const flags: string[] = [];
  if (on('is_mintable')) flags.push('mintable');
  if (on('is_blacklisted')) flags.push('blacklist');
  if (on('transfer_pausable')) flags.push('pausable');
  if (on('is_proxy')) flags.push('proxy');
  if (on('hidden_owner')) flags.push('hiddenOwner');
  if (on('selfdestruct')) flags.push('selfDestruct');
  if (on('trading_cooldown')) flags.push('tradingCooldown');
  if (on('cannot_sell_all')) flags.push('cannotSellAll');
  if (on('slippage_modifiable')) flags.push('slippageModifiable');
  if (on('external_call')) flags.push('externalCall');
  return { chain, honeypot: on('is_honeypot'), buyTax: pct(r.buy_tax), sellTax: pct(r.sell_tax), openSource: on('is_open_source'), flags };
}

export async function scanToken(address: string): Promise<ScanOutcome> {
  if (isEvm(address)) {
    const a = address.toLowerCase();
    // Première chaîne où le token existe.
    for (const c of EVM_CHAINS) {
      try {
        const res = await fetchJson<{ result?: Record<string, GoPlusToken> }>(`${GOPLUS}/token_security/${c.id}?contract_addresses=${a}`, undefined, 6000);
        const r = res.result?.[a];
        if (r && Object.keys(r).length) return parse(c.name, r);
      } catch {
        /* chaîne suivante */
      }
    }
    return null;
  }
  if (isSolana(address)) {
    try {
      const res = await fetchJson<{ code?: number; result?: Record<string, GoPlusToken> | null }>(`${GOPLUS}/solana/token_security?contract_addresses=${address}`, undefined, 6000);
      // 7012 = « Not fungible spl token address » : c'est un wallet ou un NFT, pas un token.
      if (res.code === 7012) return 'not_token';
      const r = res.result?.[address];
      if (!r) return null;
      // Le schéma Solana diffère : on mappe ce qui existe.
      const flags: string[] = [];
      if (r.mintable === '1' || (typeof r.mintable === 'object' && (r.mintable as unknown as { status?: string }).status === '1')) flags.push('mintable');
      if (r.freezable === '1' || (typeof r.freezable === 'object' && (r.freezable as unknown as { status?: string }).status === '1')) flags.push('pausable');
      return { chain: 'Solana', honeypot: false, buyTax: '0', sellTax: '0', openSource: true, flags };
    } catch {
      return null;
    }
  }
  return null;
}
