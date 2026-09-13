import { EvmChainAdapter } from '../src/domain/chains/EvmChainAdapter';
import { SEPOLIA } from '../src/domain/chains/configs';
import { estimateGasReserve } from '../src/domain/chains/gasReserve';
const a = new EvmChainAdapter(SEPOLIA);
async function run() {
  const f = await a.getFeeOptions(21000n);
  const r = await estimateGasReserve(a);
  console.log('feeOptions normal:', f.normal.costWei);
  console.log('reserve:', r.raw);
}
run();
