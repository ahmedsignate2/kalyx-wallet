import { Platform } from 'react-native';
import { listChains } from '../../domain/chains/registry';
import { detectSensitiveSecrets, sanitizeSecrets } from '../../../lib/secretDetector';

function getDeviceModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-device');
  } catch {
    return null;
  }
}

function getApplicationModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-application');
  } catch {
    return null;
  }
}

function getFileSystemModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-file-system/legacy');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('expo-file-system');
    } catch {
      return null;
    }
  }
}

function getSharingModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-sharing');
  } catch {
    return null;
  }
}

function getClipboardModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-clipboard');
  } catch {
    return null;
  }
}

export interface RpcNodeStatus {
  chainId: string;
  name: string;
  family: string;
  rpcUrlMasked: string;
  status: 'ok' | 'error' | 'timeout';
  latencyMs?: number;
  blockNumber?: string | number;
  error?: string;
}

export interface DiagnosticData {
  app: {
    name: string;
    version: string;
    buildVersion: string;
    environment: 'development' | 'production';
  };
  device: {
    osName: string;
    osVersion: string;
    brand: string;
    manufacturer: string;
    modelName: string;
    deviceType?: string;
    isDevice?: boolean;
    supportedCpuArchitectures?: string[];
  };
  system: {
    timestamp: string;
    locale: string;
    fiatCurrency: string;
  };
  rpcConnectivity: RpcNodeStatus[];
}

export interface DiagnosticExportResult {
  success: boolean;
  method: 'sharing' | 'clipboard';
  fileUri?: string;
  error?: string;
}

/**
 * Masque les clés privées et tokens d'API dans les URLs RPC pour préserver la confidentialité.
 */
export function maskRpcUrl(url: string): string {
  if (!url) return '';
  try {
    // Masquer les segments ressemblant à des clés d'API (Alchemy, Infura, etc.)
    return url
      .replace(/\/v2\/[a-zA-Z0-9_-]{16,}/g, '/v2/[REDACTED]')
      .replace(/([?&](?:api[_-]?key|key|token)=)[^&]+/gi, '$1[REDACTED]');
  } catch {
    return 'https://[RPC_MASKED]';
  }
}

/**
 * Teste la connectivité d'un nœud RPC avec un délai maximal (timeout).
 */
export async function testRpcEndpoint(
  chainId: string,
  name: string,
  family: string,
  rpcUrl: string,
  timeoutMs: number = 3000
): Promise<RpcNodeStatus> {
  const masked = maskRpcUrl(rpcUrl);
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let body = '';
    if (family === 'evm') {
      body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 });
    } else if (family === 'solana') {
      body = JSON.stringify({ jsonrpc: '2.0', method: 'getSlot', params: [], id: 1 });
    }

    const res = await fetch(rpcUrl, {
      method: body ? 'POST' : 'HEAD',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body || undefined,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        chainId,
        name,
        family,
        rpcUrlMasked: masked,
        status: 'error',
        latencyMs,
        error: `HTTP ${res.status}`,
      };
    }

    let blockNumber: string | number | undefined;
    if (body) {
      try {
        const data = await res.json();
        if (family === 'evm' && data?.result) {
          blockNumber = parseInt(data.result, 16);
        } else if (family === 'solana' && data?.result) {
          blockNumber = data.result;
        }
      } catch {}
    }

    return {
      chainId,
      name,
      family,
      rpcUrlMasked: masked,
      status: 'ok',
      latencyMs,
      blockNumber,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const isTimeout = err?.name === 'AbortError' || latencyMs >= timeoutMs;
    return {
      chainId,
      name,
      family,
      rpcUrlMasked: masked,
      status: isTimeout ? 'timeout' : 'error',
      latencyMs,
      error: err?.message || 'Network error',
    };
  }
}

/**
 * Collecte les informations système et teste les RPCs prioritaires.
 * Aucune donnée sensible (clé privée, seed, IP) n'est collectée.
 */
export async function collectDiagnosticData(): Promise<DiagnosticData> {
  const Application = getApplicationModule();
  const Device = getDeviceModule();

  let appVersion = '0.0.1';
  let buildVersion = '1';

  try {
    if (Application?.nativeApplicationVersion) {
      appVersion = Application.nativeApplicationVersion;
    } else {
      try {
        const Constants = require('expo-constants').default || require('expo-constants');
        if (Constants?.expoConfig?.version) appVersion = Constants.expoConfig.version;
      } catch {}
    }
    buildVersion = Application?.nativeBuildVersion || '1';
  } catch {}

  const osName = Platform?.OS || 'unknown';
  let osVersion = 'unknown';
  let brand = 'unknown';
  let manufacturer = 'unknown';
  let modelName = 'unknown';
  let supportedCpuArchitectures: string[] | undefined;

  try {
    osVersion = Device?.osVersion || String(Platform?.Version || 'unknown');
    brand = Device?.brand || 'unknown';
    manufacturer = Device?.manufacturer || 'unknown';
    modelName = Device?.modelName || 'unknown';
    supportedCpuArchitectures = Device?.supportedCpuArchitectures || undefined;
  } catch {}

  let locale = 'fr';
  let fiatCurrency = 'usd';
  try {
    const { useSettings } = require('../../../lib/settingsStore');
    const settings = useSettings?.getState ? useSettings.getState() : undefined;
    if (settings?.language) locale = settings.language;
    if (settings?.fiat) fiatCurrency = settings.fiat;
  } catch {}

  // Tester les RPCs configurés (principaux réseaux EVM + Solana + Sepolia)
  const chains = listChains();
  const targetChains = chains.filter(
    (c) => ['ethereum', 'bnb', 'polygon', 'solana', 'sepolia', 'arbitrum', 'base'].includes(c.id)
  );
  // Si targetChains est vide ou restreint, prendre les 5 premières chaînes
  const selectedChains = targetChains.length > 0 ? targetChains : chains.slice(0, 5);

  const rpcResults: RpcNodeStatus[] = await Promise.all(
    selectedChains.map((c) => {
      const primaryUrl = c.rpcUrls && c.rpcUrls.length > 0 ? c.rpcUrls[0] : '';
      if (!primaryUrl) {
        return Promise.resolve({
          chainId: c.id,
          name: c.name,
          family: c.family,
          rpcUrlMasked: '',
          status: 'error' as const,
          error: 'No RPC URL configured',
        });
      }
      return testRpcEndpoint(c.id, c.name, c.family, primaryUrl, 2500);
    })
  );

  return {
    app: {
      name: 'Kalyx',
      version: appVersion,
      buildVersion,
      environment: typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production',
    },
    device: {
      osName,
      osVersion,
      brand,
      manufacturer,
      modelName,
      isDevice: Device?.isDevice ?? true,
      supportedCpuArchitectures,
    },
    system: {
      timestamp: new Date().toISOString(),
      locale,
      fiatCurrency,
    },
    rpcConnectivity: rpcResults,
  };
}

/**
 * Génère le fichier de diagnostic `nova_diagnostic.json` et le partage via expo-sharing
 * avec un repli automatique sur le presse-papier si le partage n'est pas disponible.
 */
export async function exportDiagnosticReport(): Promise<DiagnosticExportResult> {
  const FileSystem = getFileSystemModule();
  const Sharing = getSharingModule();
  const Clipboard = getClipboardModule();

  try {
    const data = await collectDiagnosticData();
    let jsonString = JSON.stringify(data, null, 2);

    // Contrôle absolu d'intégrité et sécurité
    const secretCheck = detectSensitiveSecrets(jsonString);
    if (secretCheck.hasSecret) {
      jsonString = sanitizeSecrets(jsonString);
    }

    // Vérifier la disponibilité d'expo-sharing
    let canShare = false;
    try {
      if (Sharing && typeof Sharing.isAvailableAsync === 'function') {
        canShare = await Sharing.isAvailableAsync();
      }
    } catch {
      canShare = false;
    }

    const docDir = FileSystem?.documentDirectory || FileSystem?.cacheDirectory;

    if (canShare && docDir && FileSystem?.writeAsStringAsync) {
      const fileUri = `${docDir}nova_diagnostic.json`;
      await FileSystem.writeAsStringAsync(fileUri, jsonString, {
        encoding: FileSystem.EncodingType?.UTF8 ?? 'utf8',
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Kalyx Diagnostic Report',
        UTI: 'public.json',
      });

      return {
        success: true,
        method: 'sharing',
        fileUri,
      };
    } else {
      // Fallback presse-papier
      if (Clipboard && typeof Clipboard.setStringAsync === 'function') {
        await Clipboard.setStringAsync(jsonString);
      }
      return {
        success: true,
        method: 'clipboard',
      };
    }
  } catch (err: any) {
    // Si une exception survient pendant l'écriture de fichier ou le partage, tentative ultime vers le presse-papier
    try {
      const basicInfo = {
        app: 'Kalyx',
        timestamp: new Date().toISOString(),
        os: Platform.OS,
        error: err?.message,
      };
      if (Clipboard && typeof Clipboard.setStringAsync === 'function') {
        await Clipboard.setStringAsync(JSON.stringify(basicInfo, null, 2));
      }
      return {
        success: true,
        method: 'clipboard',
      };
    } catch {
      return {
        success: false,
        method: 'clipboard',
        error: err?.message || 'Export error',
      };
    }
  }
}
