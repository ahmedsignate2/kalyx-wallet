jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    Version: '17.0',
    constants: { reactNativeVersion: { major: 0, minor: 72, patch: 0 } },
    select: jest.fn((dict: any) => dict.ios || dict.default),
  },
}));

import {
  maskRpcUrl,
  testRpcEndpoint,
  collectDiagnosticData,
  exportDiagnosticReport,
} from './diagnosticService';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { detectSensitiveSecrets } from '../../../lib/secretDetector';

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.3',
  nativeBuildVersion: '45',
}));

jest.mock('expo-device', () => ({
  osVersion: '15.4',
  brand: 'Apple',
  manufacturer: 'Apple',
  modelName: 'iPhone 13 Pro',
  isDevice: true,
  supportedCpuArchitectures: ['arm64'],
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-documents/',
  cacheDirectory: 'file:///mock-cache/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: {
    UTF8: 'utf8',
  },
}));

describe('Diagnostic Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('maskRpcUrl', () => {
    it('masks Alchemy-style API key in path', () => {
      const url = 'https://eth-mainnet.g.alchemy.com/v2/abcdef1234567890abcdef1234567890';
      const masked = maskRpcUrl(url);
      expect(masked).toBe('https://eth-mainnet.g.alchemy.com/v2/[REDACTED]');
      expect(masked).not.toContain('abcdef1234567890abcdef1234567890');
    });

    it('masks query parameter api_key, key, or token', () => {
      const url = 'https://rpc.example.com/?apiKey=super_secret_token_value&other=1';
      const masked = maskRpcUrl(url);
      expect(masked).toContain('apiKey=[REDACTED]');
      expect(masked).not.toContain('super_secret_token_value');
    });

    it('returns empty string if url is empty', () => {
      expect(maskRpcUrl('')).toBe('');
    });
  });

  describe('testRpcEndpoint', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('successfully probes EVM endpoint and parses block number', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x10d4f' }),
      } as any);

      const res = await testRpcEndpoint('ethereum', 'Ethereum', 'evm', 'https://mainnet.infura.io');
      expect(res.status).toBe('ok');
      expect(res.blockNumber).toBe(68943); // 0x10d4f en décimal
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.error).toBeUndefined();
    });

    it('successfully probes Solana endpoint and parses slot number', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: 250100200 }),
      } as any);

      const res = await testRpcEndpoint('solana', 'Solana', 'solana', 'https://api.mainnet-beta.solana.com');
      expect(res.status).toBe('ok');
      expect(res.blockNumber).toBe(250100200);
      expect(res.error).toBeUndefined();
    });

    it('handles HTTP error responses gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
      } as any);

      const res = await testRpcEndpoint('ethereum', 'Ethereum', 'evm', 'https://bad-rpc.com');
      expect(res.status).toBe('error');
      expect(res.error).toBe('HTTP 502');
    });

    it('handles network failure gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Failed to connect to host'));

      const res = await testRpcEndpoint('ethereum', 'Ethereum', 'evm', 'https://unreachable.com');
      expect(res.status).toBe('error');
      expect(res.error).toBe('Failed to connect to host');
    });
  });

  describe('collectDiagnosticData', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x100' }),
      } as any);
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('collects complete non-sensitive system data', async () => {
      const data = await collectDiagnosticData();

      expect(data.app.name).toBe('Kalyx');
      expect(data.app.version).toBe('1.2.3');
      expect(data.app.buildVersion).toBe('45');

      expect(data.device.brand).toBe('Apple');
      expect(data.device.modelName).toBe('iPhone 13 Pro');

      expect(data.system.timestamp).toBeDefined();
      expect(data.system.locale).toBeDefined();

      expect(Array.isArray(data.rpcConnectivity)).toBe(true);
      expect(data.rpcConnectivity.length).toBeGreaterThan(0);

      // Vérification absolue : aucune donnée sensible (clé privée, mnémonique)
      const serialized = JSON.stringify(data);
      const secretCheck = detectSensitiveSecrets(serialized);
      expect(secretCheck.hasSecret).toBe(false);
    });
  });

  describe('exportDiagnosticReport', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x100' }),
      } as any);
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('exports report via expo-sharing when sharing is available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

      const result = await exportDiagnosticReport();

      expect(result.success).toBe(true);
      expect(result.method).toBe('sharing');
      expect(result.fileUri).toBe('file:///mock-documents/nova_diagnostic.json');

      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        'file:///mock-documents/nova_diagnostic.json',
        expect.stringContaining('"name": "Kalyx"'),
        { encoding: 'utf8' }
      );

      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        'file:///mock-documents/nova_diagnostic.json',
        expect.objectContaining({
          mimeType: 'application/json',
          dialogTitle: 'Nova Diagnostic Report',
        })
      );
    });

    it('falls back to clipboard when expo-sharing is not available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      const result = await exportDiagnosticReport();

      expect(result.success).toBe(true);
      expect(result.method).toBe('clipboard');
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('"name": "Kalyx"')
      );
    });

    it('falls back to clipboard when Sharing.shareAsync throws', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('Sharing dismissed or failed'));

      const result = await exportDiagnosticReport();

      expect(result.success).toBe(true);
      expect(result.method).toBe('clipboard');
      expect(Clipboard.setStringAsync).toHaveBeenCalled();
    });
  });
});
