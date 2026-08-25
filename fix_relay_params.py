import re

with open('src/domain/swap/relay.ts', 'r') as f:
    content = f.read()

content = content.replace("toToken: string;", "toToken: string; fromAddress: string;")

with open('src/domain/swap/relay.ts', 'w') as f:
    f.write(content)

with open('src/domain/swap/index.ts', 'r') as f:
    content = f.read()

# Make sure we actually pass fromAddress
old_relay = """    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
    })));"""

new_relay = """    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
      fromAddress: params.fromAddress,
    })));"""

content = content.replace(old_relay, new_relay)

with open('src/domain/swap/index.ts', 'w') as f:
    f.write(content)
