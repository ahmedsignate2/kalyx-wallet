import re

with open('src/domain/swap/lifi.ts', 'r') as f:
    content = f.read()

old_parse = """export function parseSwapQuote(json: unknown): SwapQuote | null {
  const q = json as {
    estimate?: {
      fromAmount?: string;
      toAmount?: string;
      toAmountMin?: string;
      approvalAddress?: string;
      executionDuration?: number;
      fromAmountUSD?: string;
      toAmountUSD?: string;
      gasCosts?: { amountUSD?: string; amount?: string; token?: unknown }[];
      feeCosts?: { amountUSD?: string }[];
    };
    action?: { fromToken?: unknown; toToken?: unknown; slippage?: number };
    transactionRequest?: { to?: string; data?: string; value?: string; chainId?: number; gasLimit?: string; gasPrice?: string };
    toolDetails?: { name?: string };
    tool?: string;
  };
  const tr = q?.transactionRequest;
  const est = q?.estimate;
  if (!tr?.to || !tr?.data || typeof tr.chainId !== 'number' || !est) return null;

  const approval = est.approvalAddress && est.approvalAddress !== '' ? est.approvalAddress : null;
  const sumUsd = (arr?: { amountUSD?: string }[]) =>
    (arr ?? []).reduce((s, c) => s + (Number(c.amountUSD) || 0), 0);
  return {
    fromAmount: big(est.fromAmount),
    toAmount: big(est.toAmount),
    toAmountMin: big(est.toAmountMin),
    fromToken: tokenOf(q.action?.fromToken),
    toToken: tokenOf(q.action?.toToken),
    approvalAddress: approval,
    toolName: q.toolDetails?.name ?? q.tool ?? 'LI.FI',
    gasCostUsd: sumUsd(est.gasCosts),
    gasCostNative: (est.gasCosts ?? []).reduce((s, c) => s + big(c.amount), 0n),
    gasToken: est.gasCosts?.[0]?.token ? tokenOf(est.gasCosts[0].token) : null,
    feeCostUsd: sumUsd(est.feeCosts),
    durationSec: Number(est.executionDuration) || 0,
    fromAmountUsd: Number(est.fromAmountUSD) || 0,
    toAmountUsd: Number(est.toAmountUSD) || 0,
    slippage: typeof q.action?.slippage === 'number' ? q.action.slippage : Number(DEFAULT_SLIPPAGE),
    tx: {
      type: 'evm',
      to: tr.to,
      data: tr.data,
      value: big(tr.value),
      chainId: tr.chainId,
      gasLimit: tr.gasLimit ? big(tr.gasLimit) : undefined,
      gasPrice: tr.gasPrice ? big(tr.gasPrice) : undefined,
    },
  };
}"""

new_parse = """export function parseSwapQuote(json: unknown): SwapQuote | null {
  const q = json as {
    estimate?: {
      fromAmount?: string;
      toAmount?: string;
      toAmountMin?: string;
      approvalAddress?: string;
      executionDuration?: number;
      fromAmountUSD?: string;
      toAmountUSD?: string;
      gasCosts?: { amountUSD?: string; amount?: string; token?: unknown }[];
      feeCosts?: { amountUSD?: string }[];
    };
    action?: { fromChainId?: number; fromToken?: unknown; toToken?: unknown; slippage?: number };
    transactionRequest?: { to?: string; data?: string; value?: string; chainId?: number; gasLimit?: string; gasPrice?: string };
    toolDetails?: { name?: string };
    tool?: string;
  };
  const tr = q?.transactionRequest;
  const est = q?.estimate;
  if (!tr?.data || !est) return null;

  const isSolana = q.action?.fromChainId === 1151111081099710;
  if (!isSolana && (!tr.to || typeof tr.chainId !== 'number')) return null;

  let txReq: SwapTxRequest;
  if (isSolana) {
    txReq = { type: 'solana', data: tr.data };
  } else {
    txReq = {
      type: 'evm',
      to: tr.to!,
      data: tr.data,
      value: big(tr.value),
      chainId: tr.chainId!,
      gasLimit: tr.gasLimit ? big(tr.gasLimit) : undefined,
      gasPrice: tr.gasPrice ? big(tr.gasPrice) : undefined,
    };
  }

  const approval = est.approvalAddress && est.approvalAddress !== '' ? est.approvalAddress : null;
  const sumUsd = (arr?: { amountUSD?: string }[]) =>
    (arr ?? []).reduce((s, c) => s + (Number(c.amountUSD) || 0), 0);
  return {
    fromAmount: big(est.fromAmount),
    toAmount: big(est.toAmount),
    toAmountMin: big(est.toAmountMin),
    fromToken: tokenOf(q.action?.fromToken),
    toToken: tokenOf(q.action?.toToken),
    approvalAddress: approval,
    toolName: q.toolDetails?.name ?? q.tool ?? 'LI.FI',
    gasCostUsd: sumUsd(est.gasCosts),
    gasCostNative: (est.gasCosts ?? []).reduce((s, c) => s + big(c.amount), 0n),
    gasToken: est.gasCosts?.[0]?.token ? tokenOf(est.gasCosts[0].token) : null,
    feeCostUsd: sumUsd(est.feeCosts),
    durationSec: Number(est.executionDuration) || 0,
    fromAmountUsd: Number(est.fromAmountUSD) || 0,
    toAmountUsd: Number(est.toAmountUSD) || 0,
    slippage: typeof q.action?.slippage === 'number' ? q.action.slippage : Number(DEFAULT_SLIPPAGE),
    tx: txReq,
  };
}"""

content = content.replace(old_parse, new_parse)

with open('src/domain/swap/lifi.ts', 'w') as f:
    f.write(content)
