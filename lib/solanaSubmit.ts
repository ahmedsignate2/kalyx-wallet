/**
 * Envoi robuste d'une transaction Solana DÉJÀ SIGNÉE (swap, bridge, Earn) :
 * simulation obligatoire → diffusion → attente de confirmation (poll).
 * Ne résout QUE si la chaîne a confirmé ; lève sinon avec un message clair.
 */
import { getAdapter, SolanaChainAdapter } from '../src';

export type SolanaSubmitStatus = 'sending' | 'confirming';

export function friendlySolanaSimError(err: unknown, logs: string[]): string {
  const logsStr = logs.join('\n');
  const errStr = JSON.stringify(err ?? '');
  const m = logsStr.match(/insufficient lamports (\d+), need (\d+)/);
  if (m) {
    const missing = (Number(m[2]) - Number(m[1])) / 1e9;
    return `Solde SOL insuffisant : il manque ${missing.toFixed(4)} SOL (frais + rent).`;
  }
  if (errStr.includes('InsufficientFundsForRent')) return 'Solde SOL insuffisant pour le rent (gardez ≥ 0,01 SOL).';
  if (/0x1771|slippage|exceeds desired slippage|SlippageToleranceExceeded/i.test(logsStr + errStr)) {
    return 'Le prix a bougé (slippage dépassé). Demandez un nouveau devis.';
  }
  if (/blockhash/i.test(errStr + logsStr)) return 'Devis expiré. Demandez un nouveau devis.';
  if (/insufficient funds|Insufficient/i.test(logsStr)) return 'Solde insuffisant pour cet échange (montant + frais).';
  return `Simulation refusée par Solana : ${errStr.slice(0, 100)}`;
}

export async function submitSolanaSigned(
  signedBase64: string,
  onStatus?: (s: SolanaSubmitStatus) => void,
  opts: { confirmTimeoutMs?: number } = {},
): Promise<string> {
  const rpc = getAdapter('solana') as SolanaChainAdapter;

  onStatus?.('sending');
  const sim = await rpc.rpc<{ value?: { err?: unknown; logs?: string[] } }>('simulateTransaction', [
    signedBase64,
    { encoding: 'base64', commitment: 'processed' },
  ]);
  if (sim?.value?.err) throw new Error(friendlySolanaSimError(sim.value.err, sim.value.logs ?? []));

  const hash = await rpc.rpc<string>('sendTransaction', [signedBase64, { encoding: 'base64', maxRetries: 3 }]);
  if (!hash) throw new Error('Diffusion refusée par le réseau Solana');

  onStatus?.('confirming');
  const deadline = Date.now() + (opts.confirmTimeoutMs ?? 75_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    try {
      const st = await rpc.rpc<{ value?: ({ err?: unknown; confirmationStatus?: string } | null)[] }>('getSignatureStatuses', [[hash]]);
      const s = st?.value?.[0];
      if (s?.err) throw new Error(`Transaction échouée on-chain : ${JSON.stringify(s.err).slice(0, 100)}`);
      if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') return hash;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Transaction échouée')) throw e;
      /* RPC muet : on réessaie */
    }
  }
  throw new Error(`Confirmation non reçue après ${Math.round((opts.confirmTimeoutMs ?? 75_000) / 1000)} s. Vérifiez sur l’explorateur : ${hash}`);
}
