import type { TxSummary } from './types';

function directionOf(from: string, to: string, owner: string): TxSummary['direction'] {
  const o = owner.toLowerCase();
  const f = (from || '').toLowerCase();
  const t = (to || '').toLowerCase();
  if (f === o && t === o) return 'self';
  if (f === o) return 'out';
  return 'in';
}

export function parseCovalentTxList(json: any, ownerAddress: string): TxSummary[] {
  if (!json || !json.data || !Array.isArray(json.data.items)) return [];

  return json.data.items
    .filter((r: any) => r && typeof r.tx_hash === 'string')
    .map((r: any) => {
      let value: bigint;
      try {
        value = BigInt(r.value ?? '0');
      } catch {
        value = 0n;
      }
      return {
        hash: r.tx_hash,
        from: r.from_address || '',
        to: r.to_address || '',
        value,
        timestamp: Math.floor(new Date(r.block_signed_at).getTime() / 1000) || 0,
        direction: directionOf(r.from_address, r.to_address, ownerAddress),
        status: r.successful ? ('success' as const) : ('failed' as const),
      };
    });
}
