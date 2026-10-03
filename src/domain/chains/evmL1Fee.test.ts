import { EvmChainAdapter } from './EvmChainAdapter';
import { BASE, ETHEREUM } from './configs';

/** Adaptateur dont `call` répond sans réseau : frais du bloc + oracle L1. */
function stubbed(config: typeof BASE, l1: bigint | null) {
  const a = new EvmChainAdapter(config);
  (a as unknown as { call: unknown }).call = async (op: (p: unknown) => Promise<unknown>) =>
    op({
      getFeeData: async () => ({ maxFeePerGas: 2_000_000n, maxPriorityFeePerGas: 1_000n, gasPrice: null }),
      call: async () => {
        if (l1 === null) throw new Error('oracle muet');
        return '0x' + l1.toString(16).padStart(64, '0');
      },
    });
  return a;
}

it('Base : les frais L1 s’ajoutent à chaque palier (sinon « Max » est refusé)', async () => {
  const plain = await stubbed(ETHEREUM, 4_040_000_000n).getFeeOptions();
  const base = await stubbed(BASE, 4_040_000_000n).getFeeOptions();
  expect(base.normal.costWei - plain.normal.costWei).toBe(4_040_000_000n);
  expect(base.fast.costWei - plain.fast.costWei).toBe(4_040_000_000n);
});

it('oracle muet : aucun frais inventé, rien ne bloque', async () => {
  const plain = await stubbed(ETHEREUM, null).getFeeOptions();
  expect((await stubbed(BASE, null).getFeeOptions()).normal.costWei).toBe(plain.normal.costWei);
});
