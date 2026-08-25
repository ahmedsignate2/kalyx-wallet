import re

with open('src/domain/swap/index.ts', 'r') as f:
    content = f.read()

old_logic = """  // 1. Intra-EVM
  if (fromChain.family === 'evm' && toChain.family === 'evm') {
    const lifiArgs = {
      fromChainId: Number(fromChain.evmChainId || fromChain.id),
      toChainId: Number(toChain.evmChainId || toChain.id),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: BigInt(params.fromAmount),
      fromAddress: params.fromAddress,
    };
    promises.push(query('LIFI', () => getLifiQuote(lifiArgs)));
    promises.push(query('0x', () => getZeroXQuote(lifiArgs)));
    
    // Relay supports EVM-EVM as well
    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
    })));
  }
  // 2. Intra-Solana
  else if (fromChain.family === 'solana' && toChain.family === 'solana') {
    promises.push(query('Jupiter', () => getJupiterQuote({
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: BigInt(params.fromAmount),
      fromAddress: params.fromAddress,
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
    })));
  }
  // 3. Cross-VM
  else {
    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
    })));
  }"""

new_logic = """  const getLifiChainId = (family: string, evmId?: number) => family === 'solana' ? 1151111081099710 : (evmId || 1);

  const lifiArgs = {
    fromChainId: getLifiChainId(fromChain.family, fromChain.evmChainId),
    toChainId: getLifiChainId(toChain.family, toChain.evmChainId),
    fromToken: params.fromToken === '0x0000000000000000000000000000000000000000' && fromChain.family === 'solana' ? '11111111111111111111111111111111' : params.fromToken,
    toToken: params.toToken === '0x0000000000000000000000000000000000000000' && toChain.family === 'solana' ? '11111111111111111111111111111111' : params.toToken,
    fromAmount: BigInt(params.fromAmount),
    fromAddress: params.fromAddress,
  };
  promises.push(query('LIFI', () => getLifiQuote(lifiArgs)));

  // 1. Intra-EVM
  if (fromChain.family === 'evm' && toChain.family === 'evm') {
    promises.push(query('0x', () => getZeroXQuote({
      fromChainId: Number(fromChain.evmChainId || fromChain.id),
      toChainId: Number(toChain.evmChainId || toChain.id),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: BigInt(params.fromAmount),
      fromAddress: params.fromAddress,
    })));
  }
  
  // 2. Intra-Solana
  if (fromChain.family === 'solana' && toChain.family === 'solana') {
    promises.push(query('Jupiter', () => getJupiterQuote({
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: BigInt(params.fromAmount),
      fromAddress: params.fromAddress,
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
    })));
  }

  // Relay (Cross-chain & EVM-EVM)
  if (fromChain.family !== 'solana' || toChain.family !== 'solana') {
    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
    })));
  }"""

content = content.replace(old_logic, new_logic)

with open('src/domain/swap/index.ts', 'w') as f:
    f.write(content)
