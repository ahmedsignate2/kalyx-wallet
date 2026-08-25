import re

with open('src/domain/swap/index.ts', 'r') as f:
    content = f.read()

old_relay = """  // Relay (Cross-chain & EVM-EVM)
  if (fromChain.family !== 'solana' || toChain.family !== 'solana') {
    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
      fromAddress: params.fromAddress,
    })));
  }"""

new_relay = """  // Relay (Cross-chain & EVM-EVM)
  if (fromChain.family !== 'solana' || toChain.family !== 'solana') {
    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken === '0x0000000000000000000000000000000000000000' && fromChain.family === 'solana' ? '11111111111111111111111111111111' : params.fromToken,
      toToken: params.toToken === '0x0000000000000000000000000000000000000000' && toChain.family === 'solana' ? '11111111111111111111111111111111' : params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
      fromAddress: params.fromAddress,
    })));
  }"""

content = content.replace(old_relay, new_relay)

with open('src/domain/swap/index.ts', 'w') as f:
    f.write(content)
