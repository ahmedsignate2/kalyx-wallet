import type { TxSummary } from './types';

export function parseAlchemyTransfers(json: any, ownerAddress: string): TxSummary[] {
  if (!json || !json.result || !Array.isArray(json.result.transfers)) return [];

  return json.result.transfers.map((t: any) => {
    const isOut = (t.from || '').toLowerCase() === ownerAddress.toLowerCase();
    
    let value = 0n;
    if (t.rawContract && t.rawContract.value) {
      try {
        value = BigInt(t.rawContract.value);
      } catch {}
    } else if (t.value !== null && t.value !== undefined) {
      // Si on n'a que la valeur float (ex: 15.5) et qu'on connait pas les décimales exactes, 
      // on tente d'interpoler sur 18 par sécurité, mais normalement Alchemy donne rawContract.
      try { value = BigInt(Math.floor(t.value * 1e18)); } catch {}
    }

    let timestamp = 0;
    if (t.metadata && t.metadata.blockTimestamp) {
      const rawTime = t.metadata.blockTimestamp;
      timestamp = typeof rawTime === 'number' 
        ? (rawTime > 1e11 ? Math.floor(rawTime / 1000) : rawTime) 
        : Math.floor(new Date(rawTime).getTime() / 1000);
      
      if (isNaN(timestamp)) timestamp = Math.floor(Date.now() / 1000);
    } else {
      timestamp = Math.floor(Date.now() / 1000);
    }

    // Filtrer les transferts d'airdrop spam / faux jetons ERC20 qui imitent le symbole "ETH"
    const isRealNative = t.category === 'external' || t.category === 'internal';
    let asset = isRealNative ? 'NATIVE' : (t.asset || 'TOKEN');
    let decimals = t.rawContract && t.rawContract.decimal ? parseInt(t.rawContract.decimal, 16) : 18;

    return {
      hash: t.hash,
      from: t.from,
      to: t.to || '',
      value,
      timestamp,
      direction: isOut ? 'out' : 'in',
      status: 'success',
      asset: isRealNative ? undefined : asset, // undefined falls back to chain.nativeSymbol
      decimals: isRealNative ? undefined : decimals,
    } as TxSummary;
  });
}
