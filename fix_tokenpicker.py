import re
with open('ui/TokenPicker.tsx', 'r') as f:
    content = f.read()

bad_block = """        // For EVM
        if (adapter.config.family === 'evm') {
          import('../src/domain/chains/etherscan').then(m => {
             // We can use the getErc20Tokens which is available in swap.tsx
             import('../src/domain/chains/registry').then(reg => {
                reg.getErc20Tokens(adapter.config, account.address).then(tokens => {
                   const map: Record<string, bigint> = {};
                   tokens.forEach(t => map[t.contract.toLowerCase()] = t.balance);
                   setHeldTokens(prev => ({ ...prev, ...map }));
                }).catch(() => {});
             });
          });
        }"""

good_block = """        // For EVM
        if (adapter.config.family === 'evm') {
          import('../src').then(src => {
             src.getErc20Tokens(adapter.config, account.address).then((tokens: any[]) => {
                const map: Record<string, bigint> = {};
                tokens.forEach((t: any) => { map[t.contract.toLowerCase()] = t.raw; });
                setHeldTokens(prev => ({ ...prev, ...map }));
             }).catch(() => {});
          });
        }"""
content = content.replace(bad_block, good_block)

with open('ui/TokenPicker.tsx', 'w') as f:
    f.write(content)
