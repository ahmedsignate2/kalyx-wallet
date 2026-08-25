with open('app/swap.tsx', 'r') as f:
    content = f.read()

# Fix available condition
content = content.replace(
    "const available = chain.family === 'evm' && !chain.testnet && tokens.length > 0 && !!chain.evmChainId;",
    "const available = !chain.testnet && tokens.length > 0 && (chain.family === 'evm' || chain.family === 'solana');"
)

# Fix chainId passing for Solana
content = content.replace(
    "fromChainId: chain.evmChainId!,",
    "fromChainId: chain.family === 'solana' ? 1151111081099710 : chain.evmChainId!,"
)
content = content.replace(
    "toChainId: toChainCfg.evmChainId!,",
    "toChainId: toChainCfg.family === 'solana' ? 1151111081099710 : toChainCfg.evmChainId!,"
)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
