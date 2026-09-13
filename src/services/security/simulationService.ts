import { ethers } from 'ethers';

export interface SimulationResult {
  isSafe: boolean;
  warningLevel: 'none' | 'warning' | 'critical';
  warnings: string[];
  expectedAssetOut: {
    symbol: string;
    amount: string;
    isNative: boolean;
  };
  hasUnlimitedApproval: boolean;
  recipientIsContract: boolean;
  isMaliciousAddress?: boolean;
}

// Signatures courantes de vidage de wallet / approvals malveillantes
const ERC20_APPROVE_HASH = '0x095ea7b3';
const ERC721_SET_APPROVAL_FOR_ALL_HASH = '0xa22cb465';
const MAX_UINT256 = ethers.MaxUint256;

/**
 * Vérification de réputation d'adresse EVM via GoPlus Security
 * Timeout strict de 3 secondes avec AbortController (fail-safe silencieux).
 */
export async function checkEvmAddressReputation(
  address: string,
  chainId?: number
): Promise<{ isMalicious: boolean; flags: string[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const url = chainId
      ? `https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=${chainId}`
      : `https://api.gopluslabs.io/api/v1/address_security/${address}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { isMalicious: false, flags: [] };

    const json = await res.json().catch(() => null);
    const result = json?.result;
    if (!result || typeof result !== 'object') return { isMalicious: false, flags: [] };

    const flaggedKeys = [
      'honeypot_related_address',
      'phishing_activities',
      'blackmail_activities',
      'malicious_behavior',
      'stealing_attack',
      'fake_kyc',
      'sanctioned',
      'cybercrime',
      'darkweb_transactions',
      'money_laundering',
      'financial_crime',
      'blacklist_doubt',
    ];

    const detectedFlags = flaggedKeys.filter(
      (k) => String(result[k]) === '1' || result[k] === true || result[k] === 1
    );

    return {
      isMalicious: detectedFlags.length > 0,
      flags: detectedFlags,
    };
  } catch {
    // Fail-safe silencieux : l'application ne bloque jamais l'envoi si GoPlus est inaccessible
    return { isMalicious: false, flags: [] };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Vérification de réputation d'adresse Solana via Helius et GoPlus Solana
 * Timeout strict de 3 secondes avec AbortController (fail-safe silencieux).
 */
export async function checkSolanaAddressReputation(
  address: string
): Promise<{ isMalicious: boolean; flags: string[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    // 1. Contrôle Helius si clé disponible
    const heliusKey = process.env.EXPO_PUBLIC_HELIUS_KEY;
    if (heliusKey) {
      try {
        const res = await fetch(
          `https://api.helius.xyz/v0/addresses/${address}/names?api-key=${heliusKey}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.isScam || data?.malicious || data?.warning || (Array.isArray(data) && data.some((n: any) => n?.isScam))) {
            return { isMalicious: true, flags: ['helius_scam_flag'] };
          }
        }
      } catch {
        // silence Helius error, continue to fallback
      }
    }

    // 2. Contrôle GoPlus Solana
    try {
      const goPlusRes = await fetch(
        `https://api.gopluslabs.io/api/v1/solana/address_security/${address}`,
        { signal: controller.signal }
      );
      if (goPlusRes.ok) {
        const json = await goPlusRes.json().catch(() => null);
        const res = json?.result;
        if (
          res &&
          (String(res.malicious_address) === '1' ||
            String(res.phishing) === '1' ||
            String(res.honeypot) === '1' ||
            String(res.stealing_attack) === '1')
        ) {
          return { isMalicious: true, flags: ['goplus_solana_malicious'] };
        }
      }
    } catch {
      // silence GoPlus error
    }

    return { isMalicious: false, flags: [] };
  } catch {
    // Fail-safe silencieux
    return { isMalicious: false, flags: [] };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Simule une transaction EVM et analyse les risques Anti-Drainer.
 */
export async function simulateEvmTransaction(params: {
  provider?: ethers.Provider | { getCode: (address: string) => Promise<string> };
  from: string;
  to: string;
  value: bigint;
  data?: string;
  tokenSymbol: string;
  tokenDecimals: number;
  chainId?: number;
}): Promise<SimulationResult> {
  const warnings: string[] = [];
  let warningLevel: 'none' | 'warning' | 'critical' = 'none';
  let hasUnlimitedApproval = false;
  let recipientIsContract = false;
  let isMaliciousAddress = false;

  const data = params.data && params.data !== '0x' ? params.data.toLowerCase() : '';

  // 1. Vérification si le destinataire est un contrat
  if (params.provider && typeof params.provider.getCode === 'function') {
    try {
      const code = await params.provider.getCode(params.to);
      if (code && code !== '0x') {
        recipientIsContract = true;
      }
    } catch {
      // Si l'appel getCode échoue, on continue la vérification
    }
  }

  // 2. Détection d'approbation illimitée ou malveillante (ERC-20 & ERC-721)
  if (data.startsWith(ERC20_APPROVE_HASH)) {
    const amountHex = '0x' + data.slice(74, 138);
    try {
      const amountBigInt = BigInt(amountHex);
      if (amountBigInt >= MAX_UINT256 / 2n) {
        hasUnlimitedApproval = true;
        warningLevel = 'critical';
        warnings.push('antiDrainerUnlimitedApproval');
      }
    } catch {
      // ignore parse error
    }
  }

  if (data.startsWith(ERC721_SET_APPROVAL_FOR_ALL_HASH)) {
    hasUnlimitedApproval = true;
    warningLevel = 'critical';
    warnings.push('antiDrainerNftApproval');
  }

  // 3. Détection de transfert direct de valeur vers un smart contract sans data
  if (recipientIsContract && (!data || data === '0x') && params.value > 0n) {
    if (warningLevel !== 'critical') warningLevel = 'warning';
    warnings.push('antiDrainerNonInteractiveContract');
  }

  // 4. Détection de réputation d'adresse (GoPlus Security)
  try {
    const rep = await checkEvmAddressReputation(params.to, params.chainId);
    if (rep.isMalicious) {
      isMaliciousAddress = true;
      warningLevel = 'critical';
      warnings.push('security.simulation.maliciousAddress');
    }
  } catch {
    // Fail-safe silencieux
  }

  // 5. Calcul de l'actif sortant
  const formattedValue = ethers.formatUnits(params.value, params.tokenDecimals);

  return {
    isSafe: warningLevel === 'none',
    warningLevel,
    warnings,
    expectedAssetOut: {
      symbol: params.tokenSymbol,
      amount: formattedValue,
      isNative: !data || data === '0x',
    },
    hasUnlimitedApproval,
    recipientIsContract,
    isMaliciousAddress,
  };
}

/**
 * Simule une transaction Solana et analyse les risques Anti-Drainer.
 */
export async function simulateSolanaTransaction(params: {
  from: string;
  to: string;
  amount: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  isNative?: boolean;
}): Promise<SimulationResult> {
  const warnings: string[] = [];
  let warningLevel: 'none' | 'warning' | 'critical' = 'none';
  let isMaliciousAddress = false;

  // 1. Vérification réputation adresse Solana
  try {
    const rep = await checkSolanaAddressReputation(params.to);
    if (rep.isMalicious) {
      isMaliciousAddress = true;
      warningLevel = 'critical';
      warnings.push('security.simulation.maliciousAddress');
    }
  } catch {
    // Fail-safe silencieux
  }

  const formattedAmount = (Number(params.amount) / Math.pow(10, params.tokenDecimals)).toString();

  return {
    isSafe: warningLevel === 'none',
    warningLevel,
    warnings,
    expectedAssetOut: {
      symbol: params.tokenSymbol,
      amount: formattedAmount,
      isNative: params.isNative ?? true,
    },
    hasUnlimitedApproval: false,
    recipientIsContract: false,
    isMaliciousAddress,
  };
}

/**
 * Point d'entrée universel pour la simulation de transfert (EVM, Solana, Bitcoin).
 */
export async function simulateSendTransaction(params: {
  family: 'evm' | 'solana' | 'bitcoin';
  from: string;
  to: string;
  amount: bigint;
  data?: string;
  tokenSymbol: string;
  tokenDecimals: number;
  provider?: ethers.Provider | { getCode: (address: string) => Promise<string> };
  chainId?: number;
}): Promise<SimulationResult> {
  if (params.family === 'evm') {
    return simulateEvmTransaction({
      provider: params.provider,
      from: params.from,
      to: params.to,
      value: params.amount,
      data: params.data,
      tokenSymbol: params.tokenSymbol,
      tokenDecimals: params.tokenDecimals,
      chainId: params.chainId,
    });
  }

  if (params.family === 'solana') {
    return simulateSolanaTransaction({
      from: params.from,
      to: params.to,
      amount: params.amount,
      tokenSymbol: params.tokenSymbol,
      tokenDecimals: params.tokenDecimals,
      isNative: !params.data || params.data === '0x',
    });
  }

  // Bitcoin : transfert standard UTXO
  const formattedAmount = (Number(params.amount) / 1e8).toString();
  return {
    isSafe: true,
    warningLevel: 'none',
    warnings: [],
    expectedAssetOut: {
      symbol: params.tokenSymbol,
      amount: formattedAmount,
      isNative: true,
    },
    hasUnlimitedApproval: false,
    recipientIsContract: false,
    isMaliciousAddress: false,
  };
}
