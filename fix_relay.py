import re

with open('src/domain/swap/relay.ts', 'r') as f:
    content = f.read()

old_body = """    const body = {
      user: params.toAddress, // recipient is used as user to get full tx
      originChainId: isOriginSolana ? 792703809 : Number(params.fromChainId),
      destinationChainId: isDestSolana ? 792703809 : Number(params.toChainId),
      originCurrency: params.fromToken,
      destinationCurrency: params.toToken,
      amount: params.fromAmount,
      recipient: params.toAddress,
      tradeType: 'EXACT_INPUT',
      referrer: 'nova'
    };"""

new_body = """    const body = {
      user: params.fromAddress, // sender address on origin chain
      originChainId: isOriginSolana ? 792703809 : Number(params.fromChainId),
      destinationChainId: isDestSolana ? 792703809 : Number(params.toChainId),
      originCurrency: params.fromToken,
      destinationCurrency: params.toToken,
      amount: params.fromAmount,
      recipient: params.toAddress,
      tradeType: 'EXACT_INPUT',
      referrer: 'nova'
    };"""

content = content.replace(old_body, new_body)

with open('src/domain/swap/relay.ts', 'w') as f:
    f.write(content)
