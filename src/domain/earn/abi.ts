/**
 * Encodage des appels de contrat Earn (purs, sans réseau) — ethers Interface.
 *
 * Sélecteurs vérifiés : submit(address)=0xa1903eab, submit()=0x5bcb2fc6,
 * supply=0x617ba037, withdraw=0x69328dec, getReserveData=0x35ea6a75.
 */
import { Interface } from 'ethers';

const LIDO = new Interface(['function submit(address _referral) payable returns (uint256)']);
const BENQI = new Interface(['function submit() payable returns (uint256)']);
const AAVE = new Interface([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
  'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
]);

const ZERO = '0x0000000000000000000000000000000000000000';
/** `type(uint256).max` : Aave le comprend comme « tout mon solde » (intérêts inclus). */
export const MAX_UINT256 = (1n << 256n) - 1n;

/** Lido : `submit(referral)` payable — l'ETH envoyé en `value`. */
export function encodeLidoSubmit(referral: string = ZERO): string {
  return LIDO.encodeFunctionData('submit', [referral]);
}

/** Benqi sAVAX : `submit()` payable — l'AVAX envoyé en `value`. */
export function encodeBenqiSubmit(): string {
  return BENQI.encodeFunctionData('submit', []);
}

/** Aave v3 : `supply(asset, amount, onBehalfOf, 0)`. Approve du Pool requis avant. */
export function encodeAaveSupply(asset: string, amount: bigint, onBehalfOf: string): string {
  return AAVE.encodeFunctionData('supply', [asset, amount, onBehalfOf, 0]);
}

/** Aave v3 : `withdraw(asset, amount, to)`. `amount = MAX_UINT256` = tout retirer. */
export function encodeAaveWithdraw(asset: string, amount: bigint, to: string): string {
  return AAVE.encodeFunctionData('withdraw', [asset, amount, to]);
}

export function encodeAaveGetReserveData(asset: string): string {
  return AAVE.encodeFunctionData('getReserveData', [asset]);
}

export interface AaveReserve {
  aToken: string;
  /** Taux de dépôt annuel en % (currentLiquidityRate est en RAY = 1e27). */
  supplyApy: number;
}

/** Décode `getReserveData` → aToken + APY de dépôt. `null` si réponse invalide. */
export function decodeAaveReserveData(hex: string): AaveReserve | null {
  try {
    const [r] = AAVE.decodeFunctionResult('getReserveData', hex);
    const rate = BigInt(r.currentLiquidityRate);
    // APR (RAY) → APY composé par seconde, comme l'UI Aave.
    const apr = Number(rate) / 1e27;
    const secondsPerYear = 31_536_000;
    const apy = (Math.pow(1 + apr / secondsPerYear, secondsPerYear) - 1) * 100;
    return { aToken: String(r.aTokenAddress).toLowerCase(), supplyApy: apy };
  } catch {
    return null;
  }
}
