import { useWallet } from './walletStore';
import { useSettings } from './settingsStore';
import { useBrowserStore } from './browserStore';
import { useDappActivity } from './dappActivity';
import { usePortfolioStore } from './portfolio/portfolioStore';
import { useHistoryStore } from './historyStore';
import { getAdapter, listChains } from '../src';

export interface CopilotWalletContext {
  activeNetwork: { id: string; name: string; chainId: number | string; isTestnet: boolean; family: 'evm' | 'solana' | 'bitcoin' };
  environment: { showTestnets: boolean; activeTab: 'mainnet' | 'testnet' };
  addresses: { evm: string; solana: string; bitcoin: string };
  balances: Array<{ network: string; tokenSymbol: string; tokenName: string; amount: string; fiatValueEur: number; isTestnet: boolean }>;
  recentActivity: Array<{ id: string; timestamp: string; network: string; isTestnet: boolean; actionType: string; summary: string; counterpartyOrDapp: string; gasFeePaid: string | null; status: string; failureReason: string | null }>;
  browser: { activeUrl: string | null; domain: string | null; isPhishingBlocked: boolean };
}

function domainOf(url: string): string | null {
  try { return url ? new URL(url).hostname : null; } catch { return null; }
}

function formatAmount(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const value = negative ? -raw : raw;
  const digits = value.toString().padStart(decimals + 1, '0');
  const split = digits.length - decimals;
  return `${negative ? '-' : ''}${digits.slice(0, split)}.${digits.slice(split)}`.replace(/\.?0+$/, '');
}

/** Builds an explicit public-data allowlist. Never reads secure storage or signing state. */
export function getCopilotContextSnapshot(): CopilotWalletContext {
  const wallet = useWallet.getState();
  const settings = useSettings.getState();
  const portfolio = usePortfolioStore.getState();
  const browser = useBrowserStore.getState();
  const dapps = useDappActivity.getState();
  const history = useHistoryStore.getState();
  const config = getAdapter(wallet.activeChain).config;
  const account = wallet.accounts.find((a) => a.index === wallet.activeAccountIndex) ?? wallet.accounts[0];

  return {
    activeNetwork: {
      id: config.id,
      name: config.name,
      chainId: config.evmChainId ?? config.id,
      isTestnet: config.testnet === true,
      family: config.family,
    },
    environment: { showTestnets: settings.showTestnets, activeTab: config.testnet ? 'testnet' : 'mainnet' },
    addresses: { evm: account?.evmAddress ?? '', solana: account?.solAddress ?? '', bitcoin: account?.btcAddress ?? '' },
    balances: portfolio.holdings
      .filter((h) => h.raw > 0n)
      .map((h) => {
        const network = getAdapter(h.chainId).config;
        return { network: network.name, tokenSymbol: h.symbol, tokenName: h.name, amount: String(h.amount), fiatValueEur: Number.isFinite(h.fiat) ? h.fiat : 0, isTestnet: network.testnet === true };
      }),
    recentActivity: [
      ...listChains({ includeTestnets: settings.showTestnets }).flatMap((network) => {
        const address = network.family === 'solana' ? account?.solAddress : network.family === 'bitcoin' ? account?.btcAddress : account?.evmAddress;
        if (!address) return [];
        return history.getCached(network.id, address).map((tx) => ({
          id: tx.hash,
          timestamp: new Date(tx.timestamp * 1000).toISOString(),
          network: network.name,
          isTestnet: network.testnet === true,
          actionType: tx.type === 'swap' ? 'swap' : tx.direction === 'in' ? 'receive' : tx.direction === 'out' ? 'send' : 'contract_interaction',
          summary: tx.description || `${tx.direction === 'in' ? '+' : '-'}${formatAmount(tx.value, tx.decimals ?? network.nativeDecimals)} ${tx.asset || network.nativeSymbol}`,
          counterpartyOrDapp: tx.to,
          gasFeePaid: null,
          status: tx.status,
          failureReason: tx.status === 'failed' ? (tx.description || 'Transaction échouée') : null,
        }));
      }),
      ...dapps.signatures.map((entry) => ({
        id: `${entry.host}:${entry.at}`,
        timestamp: new Date(entry.at).toISOString(),
        network: config.name,
        isTestnet: config.testnet === true,
        actionType: entry.kind === 'tx' ? 'dapp_interaction' : entry.kind,
        summary: `${entry.kind} via ${entry.host}`,
        counterpartyOrDapp: entry.host,
        gasFeePaid: null,
        status: 'confirmed',
        failureReason: null,
      })),
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20),
    browser: { activeUrl: browser.currentUrl || null, domain: domainOf(browser.currentUrl), isPhishingBlocked: false },
  };
}

function scan(value: unknown, path: string, allowHash = false): void {
  if (typeof value === 'string') {
    if (!allowHash && /(?:private|secret|mnemonic|seed|password|pin|cipher|key)/i.test(path)) throw new Error(`Copilot context rejected sensitive field: ${path}`);
    if (!allowHash && /^(?:0x)?[a-f0-9]{64}$/i.test(value)) throw new Error(`Copilot context rejected secret-like value: ${path}`);
    if (value.trim().split(/\s+/).length >= 12 && value.trim().split(/\s+/).every((word) => /^[a-z]+$/i.test(word))) throw new Error(`Copilot context rejected mnemonic-like value: ${path}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, i) => scan(item, `${path}[${i}]`)); return; }
  if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => scan(item, `${path}.${key}`, key === 'id' && path.includes('recentActivity')));
}

export function serializeCopilotContext(snapshot = getCopilotContextSnapshot()): string {
  scan(snapshot, 'snapshot');
  const compact = {
    n: {
      id: snapshot.activeNetwork.id,
      name: snapshot.activeNetwork.name,
      chainId: snapshot.activeNetwork.chainId,
      testnet: snapshot.activeNetwork.isTestnet,
      family: snapshot.activeNetwork.family,
    },
    e: snapshot.environment,
    a: snapshot.addresses,
    b: snapshot.balances
      .filter((balance) => Number(balance.amount) > 0)
      .map((balance) => ({
        n: balance.network,
        s: balance.tokenSymbol,
        a: balance.amount,
        f: balance.fiatValueEur,
        t: balance.isTestnet,
      })),
    r: snapshot.recentActivity.slice(0, 5).map((tx) => ({
      h: tx.id.slice(0, 10),
      t: tx.actionType,
      v: tx.summary,
      s: tx.status,
      d: tx.timestamp,
    })),
    w: {
      u: snapshot.browser.activeUrl,
      d: snapshot.browser.domain,
      p: snapshot.browser.isPhishingBlocked,
    },
  };
  console.log('[CopilotContext] Transactions injectées:', compact.r.length);
  return JSON.stringify(compact);
}
