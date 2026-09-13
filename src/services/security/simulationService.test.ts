import { ethers } from 'ethers';
import {
  simulateEvmTransaction,
  simulateSolanaTransaction,
  simulateSendTransaction,
  checkEvmAddressReputation,
  checkSolanaAddressReputation,
} from './simulationService';

// Mock fetch globally
const unmockedFetch = global.fetch;

describe('Anti-Drainer simulationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = unmockedFetch;
  });

  describe('checkEvmAddressReputation', () => {
    it('returns malicious true when GoPlus flags honeypot or phishing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            honeypot_related_address: '1',
            phishing_activities: '0',
          },
        }),
      } as Response);

      const rep = await checkEvmAddressReputation('0x1234567890123456789012345678901234567890', 1);
      expect(rep.isMalicious).toBe(true);
      expect(rep.flags).toContain('honeypot_related_address');
    });

    it('returns clean reputation when GoPlus returns no flags', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            honeypot_related_address: '0',
            phishing_activities: '0',
          },
        }),
      } as Response);

      const rep = await checkEvmAddressReputation('0x1234567890123456789012345678901234567890', 1);
      expect(rep.isMalicious).toBe(false);
      expect(rep.flags).toHaveLength(0);
    });

    it('fails safe silently when API fails or throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

      const rep = await checkEvmAddressReputation('0x1234567890123456789012345678901234567890', 1);
      expect(rep.isMalicious).toBe(false);
      expect(rep.flags).toEqual([]);
    });
  });

  describe('checkSolanaAddressReputation', () => {
    it('detects malicious Solana address via GoPlus Solana', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            malicious_address: '1',
            phishing: '0',
          },
        }),
      } as Response);

      const rep = await checkSolanaAddressReputation('So11111111111111111111111111111111111111112');
      expect(rep.isMalicious).toBe(true);
      expect(rep.flags).toContain('goplus_solana_malicious');
    });

    it('fails safe silently on Solana API errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Fetch timeout'));

      const rep = await checkSolanaAddressReputation('So11111111111111111111111111111111111111112');
      expect(rep.isMalicious).toBe(false);
      expect(rep.flags).toEqual([]);
    });
  });

  describe('simulateEvmTransaction', () => {
    const mockCleanFetch = () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: {} }),
      } as Response);
    };

    it('marks normal native ETH transfer to EOA as safe', async () => {
      mockCleanFetch();
      const mockProvider = {
        getCode: jest.fn().mockResolvedValue('0x'),
      };

      const res = await simulateEvmTransaction({
        provider: mockProvider,
        from: '0xSender',
        to: '0xRecipient',
        value: ethers.parseEther('1.5'),
        tokenSymbol: 'ETH',
        tokenDecimals: 18,
      });

      expect(res.isSafe).toBe(true);
      expect(res.warningLevel).toBe('none');
      expect(res.warnings).toHaveLength(0);
      expect(res.recipientIsContract).toBe(false);
      expect(res.hasUnlimitedApproval).toBe(false);
      expect(res.expectedAssetOut).toEqual({
        symbol: 'ETH',
        amount: '1.5',
        isNative: true,
      });
    });

    it('detects unlimited ERC20 approve (MaxUint256) as critical danger', async () => {
      mockCleanFetch();
      const spender = '0000000000000000000000001111111111111111111111111111111111111111';
      const maxUint256Hex = ethers.MaxUint256.toString(16).padStart(64, '0');
      const approveData = `0x095ea7b3${spender}${maxUint256Hex}`;

      const res = await simulateEvmTransaction({
        from: '0xSender',
        to: '0xTokenContract',
        value: 0n,
        data: approveData,
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
      });

      expect(res.isSafe).toBe(false);
      expect(res.warningLevel).toBe('critical');
      expect(res.hasUnlimitedApproval).toBe(true);
      expect(res.warnings).toContain('antiDrainerUnlimitedApproval');
    });

    it('allows normal reasonable ERC20 approve without unlimited flag', async () => {
      mockCleanFetch();
      const spender = '0000000000000000000000001111111111111111111111111111111111111111';
      const hundredTokensHex = (100n * 10n ** 6n).toString(16).padStart(64, '0');
      const approveData = `0x095ea7b3${spender}${hundredTokensHex}`;

      const res = await simulateEvmTransaction({
        from: '0xSender',
        to: '0xTokenContract',
        value: 0n,
        data: approveData,
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
      });

      expect(res.hasUnlimitedApproval).toBe(false);
      expect(res.warningLevel).toBe('none');
    });

    it('detects ERC721 setApprovalForAll as critical danger', async () => {
      mockCleanFetch();
      const operator = '0000000000000000000000001111111111111111111111111111111111111111';
      const approvedTrue = '0000000000000000000000000000000000000000000000000000000000000001';
      const setApprovalForAllData = `0xa22cb465${operator}${approvedTrue}`;

      const res = await simulateEvmTransaction({
        from: '0xSender',
        to: '0xNftContract',
        value: 0n,
        data: setApprovalForAllData,
        tokenSymbol: 'BAYC',
        tokenDecimals: 0,
      });

      expect(res.isSafe).toBe(false);
      expect(res.warningLevel).toBe('critical');
      expect(res.hasUnlimitedApproval).toBe(true);
      expect(res.warnings).toContain('antiDrainerNftApproval');
    });

    it('warns when sending native funds directly to a smart contract without call data', async () => {
      mockCleanFetch();
      const mockProvider = {
        getCode: jest.fn().mockResolvedValue('0x608060405234801561001057600080fd5b50'),
      };

      const res = await simulateEvmTransaction({
        provider: mockProvider,
        from: '0xSender',
        to: '0xSmartContract',
        value: ethers.parseEther('0.5'),
        data: '0x',
        tokenSymbol: 'ETH',
        tokenDecimals: 18,
      });

      expect(res.recipientIsContract).toBe(true);
      expect(res.warningLevel).toBe('warning');
      expect(res.warnings).toContain('antiDrainerNonInteractiveContract');
    });

    it('detects malicious address via GoPlus and marks critical', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            stealing_attack: '1',
          },
        }),
      } as Response);

      const res = await simulateEvmTransaction({
        from: '0xSender',
        to: '0xMaliciousHacker',
        value: ethers.parseEther('0.1'),
        tokenSymbol: 'ETH',
        tokenDecimals: 18,
      });

      expect(res.isSafe).toBe(false);
      expect(res.warningLevel).toBe('critical');
      expect(res.isMaliciousAddress).toBe(true);
      expect(res.warnings).toContain('security.simulation.maliciousAddress');
    });
  });

  describe('simulateSolanaTransaction', () => {
    it('simulates safe Solana transfer', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: {} }),
      } as Response);

      const res = await simulateSolanaTransaction({
        from: 'SenderSol11111111111111111111111111111111',
        to: 'RecipientSol111111111111111111111111111111',
        amount: 1_000_000_000n,
        tokenSymbol: 'SOL',
        tokenDecimals: 9,
      });

      expect(res.isSafe).toBe(true);
      expect(res.warningLevel).toBe('none');
      expect(res.expectedAssetOut.amount).toBe('1');
    });

    it('detects malicious Solana address and flags critical danger', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            malicious_address: '1',
          },
        }),
      } as Response);

      const res = await simulateSolanaTransaction({
        from: 'SenderSol11111111111111111111111111111111',
        to: 'MaliciousSol11111111111111111111111111111',
        amount: 1_000_000_000n,
        tokenSymbol: 'SOL',
        tokenDecimals: 9,
      });

      expect(res.isSafe).toBe(false);
      expect(res.warningLevel).toBe('critical');
      expect(res.isMaliciousAddress).toBe(true);
      expect(res.warnings).toContain('security.simulation.maliciousAddress');
    });
  });

  describe('simulateSendTransaction universal dispatcher', () => {
    it('routes bitcoin transfers cleanly', async () => {
      const res = await simulateSendTransaction({
        family: 'bitcoin',
        from: 'bc1qxxx',
        to: 'bc1qyyy',
        amount: 50_000_000n,
        tokenSymbol: 'BTC',
        tokenDecimals: 8,
      });

      expect(res.isSafe).toBe(true);
      expect(res.warningLevel).toBe('none');
      expect(res.expectedAssetOut.amount).toBe('0.5');
    });
  });
});
