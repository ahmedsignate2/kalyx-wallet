import { ethers } from 'ethers';
import { EvmChainAdapter, type RawTxRequest } from '../../domain/chains/EvmChainAdapter';
import type { Unlock } from '../../../lib/walletStore';

export interface GasParams {
  maxFeePerGas?: bigint | null;
  maxPriorityFeePerGas?: bigint | null;
  gasPrice?: bigint | null;
}

export interface CalculatedReplacementGas {
  isEip1559: boolean;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  extraCostWei: bigint;
  totalCostWei: bigint;
}

export interface OriginalEvmTx {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  nonce: number;
  data: string;
  gasLimit: bigint;
  maxFeePerGas?: bigint | null;
  maxPriorityFeePerGas?: bigint | null;
  gasPrice?: bigint | null;
  chainId: number;
}

/**
 * Calcule les nouveaux paramètres de Gas pour un remplacement EVM (Speed Up / Cancel).
 * Règle de consensus : au moins +20 % par rapport à la transaction initiale (oldGas * 120n / 100n)
 * pour être prioritaire et acceptée par la mempool des validateurs.
 */
export function calculateReplacementGas(
  originalGas: GasParams,
  currentNetworkFee: GasParams,
  gasLimit: bigint = 21000n
): CalculatedReplacementGas {
  const isEip1559 =
    originalGas.maxFeePerGas != null ||
    originalGas.maxPriorityFeePerGas != null ||
    currentNetworkFee.maxFeePerGas != null;

  if (isEip1559) {
    const oldMaxFee = originalGas.maxFeePerGas ?? originalGas.gasPrice ?? 1_000_000_000n;
    const oldPriorityFee = originalGas.maxPriorityFeePerGas ?? 1_000_000_000n;

    // Minimum +20 % par rapport à l'originale
    const minMaxFee = (oldMaxFee * 120n) / 100n;
    const minPriorityFee = (oldPriorityFee * 120n) / 100n;

    const currMaxFee = currentNetworkFee.maxFeePerGas ?? oldMaxFee;
    const currPriorityFee = currentNetworkFee.maxPriorityFeePerGas ?? oldPriorityFee;

    let newMaxFee = currMaxFee > minMaxFee ? currMaxFee : minMaxFee;
    let newPriorityFee = currPriorityFee > minPriorityFee ? currPriorityFee : minPriorityFee;

    // En EIP-1559, le maxFeePerGas doit être supérieur ou égal au maxPriorityFeePerGas
    if (newMaxFee < newPriorityFee) {
      newMaxFee = newPriorityFee;
    }

    const extraPerGas = newMaxFee > oldMaxFee ? newMaxFee - oldMaxFee : 0n;
    const extraCostWei = extraPerGas * gasLimit;
    const totalCostWei = newMaxFee * gasLimit;

    return {
      isEip1559: true,
      maxFeePerGas: newMaxFee,
      maxPriorityFeePerGas: newPriorityFee,
      extraCostWei,
      totalCostWei,
    };
  } else {
    const oldGasPrice = originalGas.gasPrice ?? 1_000_000_000n;
    const minGasPrice = (oldGasPrice * 120n) / 100n;
    const currGasPrice = currentNetworkFee.gasPrice ?? oldGasPrice;

    const newGasPrice = currGasPrice > minGasPrice ? currGasPrice : minGasPrice;
    const extraPerGas = newGasPrice > oldGasPrice ? newGasPrice - oldGasPrice : 0n;
    const extraCostWei = extraPerGas * gasLimit;
    const totalCostWei = newGasPrice * gasLimit;

    return {
      isEip1559: false,
      gasPrice: newGasPrice,
      extraCostWei,
      totalCostWei,
    };
  }
}

/**
 * Reconstruit la transaction pour "Speed Up" (Accélérer) :
 * Même destinataire, même montant, mêmes données d'appel, même nonce, mais avec le nouveau Gas calculé.
 */
export function buildSpeedUpTx(
  original: OriginalEvmTx,
  calculatedGas: CalculatedReplacementGas
): RawTxRequest {
  return {
    to: original.to,
    value: original.value,
    data: original.data || '0x',
    nonce: original.nonce,
    gasLimit: original.gasLimit,
    chainId: original.chainId,
    maxFeePerGas: calculatedGas.maxFeePerGas,
    maxPriorityFeePerGas: calculatedGas.maxPriorityFeePerGas,
    gasPrice: calculatedGas.gasPrice,
  };
}

/**
 * Reconstruit la transaction pour "Cancel" (Annuler) :
 * Même nonce, to = walletAddress (envoi à soi-même), value = 0n, data = '0x', avec le nouveau Gas calculé.
 */
export function buildCancelTx(
  original: OriginalEvmTx,
  walletAddress: string,
  calculatedGas: CalculatedReplacementGas
): RawTxRequest {
  return {
    to: walletAddress,
    value: 0n,
    data: '0x',
    nonce: original.nonce,
    gasLimit: 21000n, // Envoi natif standard à 0 de valeur
    chainId: original.chainId,
    maxFeePerGas: calculatedGas.maxFeePerGas,
    maxPriorityFeePerGas: calculatedGas.maxPriorityFeePerGas,
    gasPrice: calculatedGas.gasPrice,
  };
}

/**
 * Récupère les détails complets d'une transaction EVM en attente depuis le RPC ou avec repli.
 */
export async function fetchOriginalEvmTx(
  adapter: EvmChainAdapter,
  hash: string,
  fallback?: Partial<OriginalEvmTx>
): Promise<OriginalEvmTx | null> {
  try {
    const tx = await adapter.getTransaction(hash);
    if (tx) {
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to ?? fallback?.to ?? '',
        value: tx.value ?? fallback?.value ?? 0n,
        nonce: tx.nonce,
        data: tx.data ?? '0x',
        gasLimit: tx.gasLimit ?? 21000n,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        gasPrice: tx.gasPrice,
        chainId: Number(tx.chainId ?? adapter.config.evmChainId ?? 1),
      };
    }
  } catch {
    // Si le nœud RPC ne conserve pas la tx en mempool
  }

  // Repli sur les informations disponibles
  if (fallback && fallback.nonce != null && fallback.to != null) {
    return {
      hash: fallback.hash ?? hash,
      from: fallback.from ?? '',
      to: fallback.to,
      value: fallback.value ?? 0n,
      nonce: fallback.nonce,
      data: fallback.data ?? '0x',
      gasLimit: fallback.gasLimit ?? 21000n,
      maxFeePerGas: fallback.maxFeePerGas,
      maxPriorityFeePerGas: fallback.maxPriorityFeePerGas,
      gasPrice: fallback.gasPrice,
      chainId: fallback.chainId ?? Number(adapter.config.evmChainId ?? 1),
    };
  }

  return null;
}

/**
 * Exécute l'envoi de la transaction de remplacement via le wallet.
 */
export async function executeReplacement(
  walletSendRaw: (unlock: Unlock, chainId: string, req: RawTxRequest) => Promise<string>,
  unlock: Unlock,
  chainId: string,
  req: RawTxRequest
): Promise<string> {
  return walletSendRaw(unlock, chainId, req);
}
