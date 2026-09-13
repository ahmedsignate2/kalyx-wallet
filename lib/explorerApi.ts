import { getAdapter } from '../src';

export interface PublicChainTransaction {
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string | null;
  status: 'success' | 'failed';
}

/** Reads public transaction data through the chain adapter/indexer only. */
export async function fetchAddressTransactions(address: string, network: string): Promise<PublicChainTransaction[]> {
  if (!address || !network) throw new Error('Adresse et réseau requis.');
  const history = await getAdapter(network).getHistory(address);
  return history.slice(0, 10).map((tx) => ({
    hash: tx.hash,
    timestamp: new Date(tx.timestamp * 1000).toISOString(),
    from: tx.from,
    to: tx.to,
    value: tx.value.toString(),
    gasUsed: null,
    status: tx.status,
  }));
}
