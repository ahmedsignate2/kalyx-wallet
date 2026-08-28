const balances = { 'SOL': 4100000n }; // 0.0041 SOL (assuming 9 decimals)
const targetProtocol = { underlyingAsset: 'SOL' };
const amountStr = '0.0020';

function formatBalance(balRaw, decimals) {
  return (Number(balRaw) / (10 ** decimals)).toFixed(decimals);
}

const isNative = targetProtocol?.asset === 'SOL' || targetProtocol?.asset === 'ETH' || targetProtocol?.asset === 'AVAX' || targetProtocol?.asset === 'BNB';
const estGas = ['ETH', 'USDC'].includes(targetProtocol?.underlyingAsset) ? 0.002 : 0.00001;
const totalNeeded = Number(amountStr || 0) + (isNative ? estGas : 0);
const userBal = Number(formatBalance(balances[targetProtocol?.underlyingAsset] || 0n, (targetProtocol?.underlyingAsset === 'USDC' || targetProtocol?.underlyingAsset === 'USDC_SOL') ? 6 : targetProtocol?.underlyingAsset === 'SOL' ? 9 : 18));
const isInsufficient = Number(amountStr) > 0 && totalNeeded > userBal;

console.log({ isNative, estGas, totalNeeded, userBal, isInsufficient });
