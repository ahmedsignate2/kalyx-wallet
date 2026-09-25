/**
 * Réserve de gas DYNAMIQUE : combien de monnaie native garder pour qu'une
 * transaction (swap, bridge, dépôt) passe — estimée sur le RPC du réseau,
 * jamais codée en dur par chaîne (65 réseaux au catalogue).
 *
 * - EVM : `getFeeData()` → (maxFeePerGas ?? gasPrice) × gas d'un swap type
 *   (250 000) × marge de sécurité (+15 %). Sur un L2, le coût inclut de fait la
 *   part L1 via le gasPrice renvoyé par le nœud.
 * - Solana : frais de base (5 000 lamports/signature) + frais de priorité du
 *   moment (`getRecentPrioritizationFees`, percentile 75 des 150 derniers
 *   slots, plafonné) × marge. Le rent d'un compte temporaire (wSOL/ATA) n'est
 *   PAS inclus ici : il dépend de l'opération (voir Earn `nativeReserve`).
 * - Bitcoin : taille d'une transaction courante × le taux sat/vB du réseau. Une
 *   constante de 1 500 satoshis était renvoyée ici, EN SE DÉCLARANT estimée
 *   (`live: true`). C'était faux deux fois : rien n'était estimé, et 1 500
 *   satoshis ne couvrent pas une transaction dès que le réseau dépasse ~10
 *   sat/vB. Le « montant disponible » était donc surévalué, et un envoi du
 *   solde entier échouait après coup sur « solde insuffisant » — sur un montant
 *   que l'app venait elle-même de proposer.
 *
 * `estimateGasReserve` ne LÈVE jamais : RPC muet → repli prudent minimal.
 */
import type { EvmChainAdapter } from './EvmChainAdapter';
import type { SolanaChainAdapter } from './SolanaChainAdapter';
import type { ChainAdapter } from './types';

/** Gas typique d'un swap agrégé (approve + router). */
export const SWAP_GAS_UNITS = 250_000n;
/** Marge de sécurité sur l'estimation (×115/100). */
const MARGIN_NUM = 115n;
const MARGIN_DEN = 100n;

/** Solana : frais de base par signature. */
export const SOL_BASE_FEE = 5_000n;
/** Solana : compute units d'un swap Jupiter/LI.FI type (pour convertir µlamports/CU en lamports). */
const SOL_SWAP_CU = 400_000n;
/** Solana : priorité plafonnée (µlamports/CU) — au-delà, on ne sur-paie pas. */
const SOL_PRIO_CAP = 5_000n;

/**
 * Bitcoin : taille d'une transaction courante (1 entrée, 2 sorties).
 *
 * C'est l'hypothèse de référence pour réserver de quoi payer les frais. Une
 * transaction à plusieurs entrées coûtera davantage, mais la sélection de
 * pièces tranchera pour de bon au moment de l'envoi.
 */
export const BTC_TYPICAL_VBYTES = 141n;

export interface GasReserve {
  /** Unité brute du natif (wei / lamports). */
  raw: bigint;
  /** true = estimé sur le RPC ; false = repli (RPC muet). */
  live: boolean;
}

/** Repli si le RPC ne répond pas : volontairement bas, l'estimation à la signature tranchera. */
function fallback(adapter: ChainAdapter): GasReserve {
  const fam = adapter.config.family;
  if (fam === 'solana') return { raw: 100_000n, live: false }; // 0.0001 SOL
  if (fam === 'evm') return { raw: 10n ** BigInt(adapter.config.nativeDecimals - 4), live: false }; // 0.0001 natif
  if (fam === 'bitcoin') return { raw: 1_500n, live: false }; // 1 500 satoshis (≈ 0.000015 BTC)
  return { raw: 0n, live: false };
}

/** Pur : réserve EVM à partir des données de frais. */
export function evmReserveFromFeeData(fee: { maxFeePerGas: bigint | null; gasPrice: bigint | null }, gasUnits = SWAP_GAS_UNITS): bigint {
  const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  return (price * gasUnits * MARGIN_NUM) / MARGIN_DEN;
}

/** Pur : réserve Solana à partir des frais de priorité récents (µlamports/CU). */
export function solanaReserveFromPriorityFees(fees: number[], cu = SOL_SWAP_CU): bigint {
  const sorted = fees.filter((f) => Number.isFinite(f) && f >= 0).sort((a, b) => a - b);
  const p75 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))] : 0;
  const prio = BigInt(Math.min(Math.round(p75), Number(SOL_PRIO_CAP)));
  const prioLamports = (prio * cu) / 1_000_000n; // µlamports → lamports
  return ((SOL_BASE_FEE + prioLamports) * MARGIN_NUM) / MARGIN_DEN;
}

/** Estime la réserve de gas pour `adapter` (best-effort, jamais d'exception). */
export async function estimateGasReserve(adapter: ChainAdapter): Promise<GasReserve> {
  try {
    if (adapter.config.family === 'evm') {
      const evm = adapter as EvmChainAdapter;
      const fee = await evm.getFeeData();
      const raw = evmReserveFromFeeData(fee);
      return raw > 0n ? { raw, live: true } : fallback(adapter);
    }
    if (adapter.config.family === 'solana') {
      const sol = adapter as SolanaChainAdapter;
      const res = await sol.rpc<{ prioritizationFee?: number }[]>('getRecentPrioritizationFees', [[]]);
      const fees = (res ?? []).map((x) => Number(x?.prioritizationFee ?? 0));
      return { raw: solanaReserveFromPriorityFees(fees), live: true };
    }
    if (adapter.config.family === 'bitcoin') {
      const btc = adapter as { getFeeRates?: () => Promise<{ normal: number }> };
      if (typeof btc.getFeeRates !== 'function') return fallback(adapter);
      const rates = await btc.getFeeRates();
      const raw = (BigInt(Math.max(1, Math.ceil(rates.normal))) * BTC_TYPICAL_VBYTES * MARGIN_NUM) / MARGIN_DEN;
      return raw > 0n ? { raw, live: true } : fallback(adapter);
    }
  } catch {
    /* RPC muet */
  }
  return fallback(adapter);
}
