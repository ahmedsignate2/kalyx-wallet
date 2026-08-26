import type { TxSummary } from './types';

const ANKR_URL = 'https://rpc.ankr.com/multichain/a8acb82bb28e6bf5c1e4a1ea695c9cc09ecbb9161bbdf5cb7b055a447692cdac';

export async function fetchAnkrHistory(address: string, blockchain: string): Promise<TxSummary[]> {
  try {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'ankr_getTransactionsByAddress',
      params: {
        address,
        blockchain,
        descOrder: true,
        pageSize: 30,
        includeLogs: false,
      },
    };

    const res = await fetch(ANKR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!json || !json.result || !json.result.transactions) return [];

    return json.result.transactions.map((tx: any) => {
      const isOut = (tx.from || '').toLowerCase() === address.toLowerCase();

      let timestamp = 0;
      if (tx.timestamp) {
        const rawTime = tx.timestamp;
        timestamp = typeof rawTime === 'number' 
          ? (rawTime > 1e11 ? Math.floor(rawTime / 1000) : rawTime) 
          : Math.floor(new Date(rawTime).getTime() / 1000);
        
        if (isNaN(timestamp)) timestamp = Math.floor(Date.now() / 1000);
      }

      // value represents string (e.g. "0x0" or dec string). Ankr docs say it's hex or dec string of base units.
      let value = 0n;
      try { value = BigInt(tx.value || '0'); } catch {}

      return {
        hash: tx.hash || tx.transactionHash,
        from: tx.from,
        to: tx.to || '',
        value,
        timestamp,
        direction: isOut ? 'out' : 'in',
        status: (tx.status === '0x1' || tx.status === '1' || tx.status === 'SUCCESS' || tx.status === true) ? 'success' : 'failed',
        // Fallback for native chain tokens, Ankr provides token transfers in getTokenTransfers, but for basic getTransactions we assume Native.
      } as TxSummary;
    });
  } catch (e) {
    console.warn(`Ankr fallback failed for ${blockchain}:`, e);
    return [];
  }
}
