/**
 * Paliers de frais de gas (Lent / Normal / Rapide) calculés à partir des données de
 * frais du réseau (ethers `getFeeData`). Logique PURE et testable ; le fetch réseau
 * vit dans EvmChainAdapter.getFeeOptions.
 *
 * EIP-1559 : on part de la base fee (≈ maxFee - priorité) et on module la priorité +
 * un tampon de base fee par palier. Repli « legacy » (gasPrice) si pas d'EIP-1559.
 */
export type FeeSpeed = 'slow' | 'normal' | 'fast';

export interface FeeTier {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** Coût estimé (wei) = maxFeePerGas × gasLimit. */
  costWei: bigint;
}

export type FeeOptions = Record<FeeSpeed, FeeTier>;

interface FeeDataLike {
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
  gasPrice: bigint | null;
}

// Multiplicateurs (×100 pour rester en entiers) : priorité et tampon de base fee.
const PRIO = { slow: 70n, normal: 100n, fast: 180n } as const;
const BASE = { slow: 112n, normal: 130n, fast: 165n } as const;

export function computeFeeTiers(fee: FeeDataLike, gasLimit: bigint): FeeOptions {
  const mk = (maxFee: bigint, prio: bigint): FeeTier => ({
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: prio,
    costWei: maxFee * gasLimit,
  });

  if (fee.maxFeePerGas != null && fee.maxPriorityFeePerGas != null) {
    const p = fee.maxPriorityFeePerGas;
    const base = fee.maxFeePerGas > p ? fee.maxFeePerGas - p : 0n; // base fee estimée
    const tier = (s: FeeSpeed) => {
      const prio = (p * PRIO[s]) / 100n;
      const maxFee = (base * BASE[s]) / 100n + prio;
      return mk(maxFee > 0n ? maxFee : 1n, prio > 0n ? prio : 1n);
    };
    return { slow: tier('slow'), normal: tier('normal'), fast: tier('fast') };
  }

  // Legacy : un seul gasPrice, on module par palier (priorité = gasPrice pour le repli).
  const gp = fee.gasPrice ?? 0n;
  const tier = (s: FeeSpeed) => {
    const g = (gp * BASE[s]) / 100n;
    return mk(g > 0n ? g : 1n, g > 0n ? g : 1n);
  };
  return { slow: tier('slow'), normal: tier('normal'), fast: tier('fast') };
}
