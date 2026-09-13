import {
  calculateReplacementGas,
  buildSpeedUpTx,
  buildCancelTx,
  fetchOriginalEvmTx,
  executeReplacement,
  type OriginalEvmTx,
} from './replacementService';
import type { EvmChainAdapter } from '../../domain/chains/EvmChainAdapter';

describe('EVM Replacement Service (Speed Up / Cancel)', () => {
  describe('calculateReplacementGas - EIP-1559', () => {
    it('enforces at least 20% increase over original gas fees when network gas is lower', () => {
      const originalGas = {
        maxFeePerGas: 10_000_000_000n, // 10 gwei
        maxPriorityFeePerGas: 2_000_000_000n, // 2 gwei
      };
      const currentNetworkGas = {
        maxFeePerGas: 9_000_000_000n, // 9 gwei
        maxPriorityFeePerGas: 1_500_000_000n, // 1.5 gwei
      };
      const gasLimit = 21_000n;

      const res = calculateReplacementGas(originalGas, currentNetworkGas, gasLimit);

      expect(res.isEip1559).toBe(true);
      // 10 gwei * 120 / 100 = 12 gwei
      expect(res.maxFeePerGas).toBe(12_000_000_000n);
      // 2 gwei * 120 / 100 = 2.4 gwei
      expect(res.maxPriorityFeePerGas).toBe(2_400_000_000n);
      // extra: (12 - 10) gwei * 21000 = 2 gwei * 21000 = 42_000_000_000_000n
      expect(res.extraCostWei).toBe(2_000_000_000n * 21_000n);
    });

    it('uses higher current network fee if network gas is more than +20% higher than original', () => {
      const originalGas = {
        maxFeePerGas: 10_000_000_000n, // 10 gwei
        maxPriorityFeePerGas: 2_000_000_000n, // 2 gwei
      };
      const currentNetworkGas = {
        maxFeePerGas: 20_000_000_000n, // 20 gwei (> 12 gwei)
        maxPriorityFeePerGas: 5_000_000_000n, // 5 gwei (> 2.4 gwei)
      };
      const gasLimit = 50_000n;

      const res = calculateReplacementGas(originalGas, currentNetworkGas, gasLimit);

      expect(res.maxFeePerGas).toBe(20_000_000_000n);
      expect(res.maxPriorityFeePerGas).toBe(5_000_000_000n);
      expect(res.extraCostWei).toBe(10_000_000_000n * 50_000n);
    });

    it('ensures maxFeePerGas is never lower than maxPriorityFeePerGas', () => {
      const originalGas = {
        maxFeePerGas: 10_000_000_000n,
        maxPriorityFeePerGas: 10_000_000_000n,
      };
      const currentNetworkGas = {
        maxFeePerGas: 11_000_000_000n,
        maxPriorityFeePerGas: 15_000_000_000n, // higher priority fee
      };

      const res = calculateReplacementGas(originalGas, currentNetworkGas, 21000n);
      expect(res.maxFeePerGas! >= res.maxPriorityFeePerGas!).toBe(true);
      expect(res.maxFeePerGas).toBe(15_000_000_000n);
    });
  });

  describe('calculateReplacementGas - Legacy (gasPrice)', () => {
    it('enforces at least 20% increase for legacy gasPrice transactions', () => {
      const originalGas = {
        gasPrice: 20_000_000_000n, // 20 gwei
      };
      const currentNetworkGas = {
        gasPrice: 15_000_000_000n,
      };
      const gasLimit = 21_000n;

      const res = calculateReplacementGas(originalGas, currentNetworkGas, gasLimit);

      expect(res.isEip1559).toBe(false);
      // 20 gwei * 120 / 100 = 24 gwei
      expect(res.gasPrice).toBe(24_000_000_000n);
      expect(res.extraCostWei).toBe(4_000_000_000n * 21_000n);
    });
  });

  describe('buildSpeedUpTx', () => {
    it('reconstructs transaction with same params and new gas', () => {
      const original: OriginalEvmTx = {
        hash: '0xabc123',
        from: '0xMyWallet',
        to: '0xRecipient',
        value: 1_000_000_000_000_000_000n, // 1 ETH
        nonce: 42,
        data: '0xa9059cbb0000',
        gasLimit: 65_000n,
        maxFeePerGas: 10_000_000_000n,
        maxPriorityFeePerGas: 2_000_000_000n,
        chainId: 1,
      };

      const calculatedGas = {
        isEip1559: true,
        maxFeePerGas: 15_000_000_000n,
        maxPriorityFeePerGas: 3_000_000_000n,
        extraCostWei: 5_000_000_000n * 65_000n,
        totalCostWei: 15_000_000_000n * 65_000n,
      };

      const txReq = buildSpeedUpTx(original, calculatedGas);

      expect(txReq.to).toBe('0xRecipient');
      expect(txReq.value).toBe(1_000_000_000_000_000_000n);
      expect(txReq.data).toBe('0xa9059cbb0000');
      expect(txReq.nonce).toBe(42);
      expect(txReq.gasLimit).toBe(65_000n);
      expect(txReq.chainId).toBe(1);
      expect(txReq.maxFeePerGas).toBe(15_000_000_000n);
      expect(txReq.maxPriorityFeePerGas).toBe(3_000_000_000n);
    });
  });

  describe('buildCancelTx', () => {
    it('reconstructs cancel tx: self-transfer, value 0, empty data, same nonce', () => {
      const original: OriginalEvmTx = {
        hash: '0xabc123',
        from: '0xMyWallet',
        to: '0xRecipient',
        value: 5_000_000_000_000_000_000n,
        nonce: 10,
        data: '0xdeadbeef',
        gasLimit: 100_000n,
        maxFeePerGas: 20_000_000_000n,
        maxPriorityFeePerGas: 2_000_000_000n,
        chainId: 11155111,
      };

      const calculatedGas = {
        isEip1559: true,
        maxFeePerGas: 25_000_000_000n,
        maxPriorityFeePerGas: 3_000_000_000n,
        extraCostWei: 5_000_000_000n * 21_000n,
        totalCostWei: 25_000_000_000n * 21_000n,
      };

      const cancelReq = buildCancelTx(original, '0xMyWallet', calculatedGas);

      expect(cancelReq.to).toBe('0xMyWallet'); // Envoi à soi-même
      expect(cancelReq.value).toBe(0n); // 0 valeur
      expect(cancelReq.data).toBe('0x'); // Données vides
      expect(cancelReq.nonce).toBe(10); // Même nonce
      expect(cancelReq.gasLimit).toBe(21_000n); // Gas standard natif
      expect(cancelReq.chainId).toBe(11155111);
      expect(cancelReq.maxFeePerGas).toBe(25_000_000_000n);
      expect(cancelReq.maxPriorityFeePerGas).toBe(3_000_000_000n);
    });
  });

  describe('fetchOriginalEvmTx', () => {
    it('extracts tx from adapter getTransaction', async () => {
      const mockAdapter = {
        config: { evmChainId: 1 },
        getTransaction: jest.fn().mockResolvedValue({
          hash: '0x123',
          from: '0xFrom',
          to: '0xTo',
          value: 100n,
          nonce: 5,
          data: '0x',
          gasLimit: 21000n,
          maxFeePerGas: 10n,
          maxPriorityFeePerGas: 1n,
          chainId: 1n,
        }),
      } as unknown as EvmChainAdapter;

      const tx = await fetchOriginalEvmTx(mockAdapter, '0x123');
      expect(tx).not.toBeNull();
      expect(tx?.nonce).toBe(5);
      expect(tx?.to).toBe('0xTo');
    });

    it('falls back to fallback data if RPC throws or returns null', async () => {
      const mockAdapter = {
        config: { evmChainId: 1 },
        getTransaction: jest.fn().mockRejectedValue(new Error('RPC error')),
      } as unknown as EvmChainAdapter;

      const tx = await fetchOriginalEvmTx(mockAdapter, '0x123', {
        hash: '0x123',
        to: '0xFallbackTo',
        value: 50n,
        nonce: 8,
      });

      expect(tx).not.toBeNull();
      expect(tx?.nonce).toBe(8);
      expect(tx?.to).toBe('0xFallbackTo');
    });
  });

  describe('executeReplacement', () => {
    it('invokes wallet sendRawTxOn and returns hash', async () => {
      const mockSendRaw = jest.fn().mockResolvedValue('0xNewReplacementHash');
      const hash = await executeReplacement(
        mockSendRaw,
        { biometric: true },
        'sepolia',
        {
          to: '0xMe',
          value: 0n,
          nonce: 1,
          chainId: 11155111,
        }
      );

      expect(hash).toBe('0xNewReplacementHash');
      expect(mockSendRaw).toHaveBeenCalledWith(
        { biometric: true },
        'sepolia',
        expect.objectContaining({ to: '0xMe', nonce: 1 })
      );
    });
  });
});
