import re

with open('src/domain/swap/lifi.ts', 'r') as f:
    content = f.read()

content = content.replace("fromAddress: string;", "fromAddress: string; toAddress?: string;")

old_qs = """  const qs = new URLSearchParams({
    fromChain: String(params.fromChainId),
    toChain: String(params.toChainId),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount.toString(),
    fromAddress: params.fromAddress,
    integrator: NOVA_INTEGRATOR,
    slippage: DEFAULT_SLIPPAGE,
  });"""

new_qs = """  const qs = new URLSearchParams({
    fromChain: String(params.fromChainId),
    toChain: String(params.toChainId),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount.toString(),
    fromAddress: params.fromAddress,
    integrator: NOVA_INTEGRATOR,
    slippage: DEFAULT_SLIPPAGE,
  });
  if (params.toAddress) {
    qs.set('toAddress', params.toAddress);
  }"""

content = content.replace(old_qs, new_qs)

with open('src/domain/swap/lifi.ts', 'w') as f:
    f.write(content)

with open('src/domain/swap/index.ts', 'r') as f:
    content = f.read()

old_args = """  const lifiArgs = {
    fromChainId: getLifiChainId(fromChain.family, fromChain.evmChainId),
    toChainId: getLifiChainId(toChain.family, toChain.evmChainId),
    fromToken: params.fromToken === '0x0000000000000000000000000000000000000000' && fromChain.family === 'solana' ? '11111111111111111111111111111111' : params.fromToken,
    toToken: params.toToken === '0x0000000000000000000000000000000000000000' && toChain.family === 'solana' ? '11111111111111111111111111111111' : params.toToken,
    fromAmount: BigInt(params.fromAmount),
    fromAddress: params.fromAddress,
  };"""

new_args = """  const lifiArgs = {
    fromChainId: getLifiChainId(fromChain.family, fromChain.evmChainId),
    toChainId: getLifiChainId(toChain.family, toChain.evmChainId),
    fromToken: params.fromToken === '0x0000000000000000000000000000000000000000' && fromChain.family === 'solana' ? '11111111111111111111111111111111' : params.fromToken,
    toToken: params.toToken === '0x0000000000000000000000000000000000000000' && toChain.family === 'solana' ? '11111111111111111111111111111111' : params.toToken,
    fromAmount: BigInt(params.fromAmount),
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
  };"""

content = content.replace(old_args, new_args)

with open('src/domain/swap/index.ts', 'w') as f:
    f.write(content)

