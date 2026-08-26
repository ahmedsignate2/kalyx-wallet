import { create } from 'zustand';

interface PortfolioState {
  totalUsd: number;
  tokensSummary: string[];
  pnl24h?: number;
  pnl24hPct?: number;
  topGainer?: string;
  topLoser?: string;
  hasCloudBackup?: boolean;
  activeApprovalsCount?: number;
  setPortfolio: (total: number, tokens: string[], pnl24h?: number, pnl24hPct?: number, topGainer?: string, topLoser?: string) => void;
}

export const usePortfolio = create<PortfolioState>((set) => ({
  totalUsd: 0,
  tokensSummary: [],
  setPortfolio: (total, tokens, pnl24h, pnl24hPct, topGainer, topLoser) => set((s) => ({ ...s, totalUsd: total, tokensSummary: tokens, pnl24h, pnl24hPct, topGainer, topLoser })),
}));
