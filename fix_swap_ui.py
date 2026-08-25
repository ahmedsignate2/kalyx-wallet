import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

old_quote_call = """      const q = await getBestQuote({ fromChainId: activeChain, toChainId: toChain, fromToken: fromTok.address, toToken: toTok.address, fromAmount: raw.toString(), fromAddress: account!.address, toAddress: account!.address });"""

new_quote_call = """      const w = useWallet.getState();
      const storedAccount = w.accounts[w.activeAccountIndex];
      const toFamily = getAdapter(toChain).config.family;
      let targetAddress = account!.address;
      if (toFamily === 'solana' && storedAccount.solAddress) targetAddress = storedAccount.solAddress;
      else if (toFamily === 'bitcoin' && storedAccount.btcAddress) targetAddress = storedAccount.btcAddress;
      else if (toFamily === 'evm') targetAddress = storedAccount.evmAddress;

      const q = await getBestQuote({ fromChainId: activeChain, toChainId: toChain, fromToken: fromTok.address, toToken: toTok.address, fromAmount: raw.toString(), fromAddress: account!.address, toAddress: targetAddress });"""

content = content.replace(old_quote_call, new_quote_call)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
