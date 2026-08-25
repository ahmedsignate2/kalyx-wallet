import re

with open('ui/TokenPicker.tsx', 'r') as f:
    content = f.read()

evm_balance_search = """        // For EVM, we might use getErc20Tokens if exposed, or Alchemy API"""
evm_balance_replace = """        // For EVM
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
content = content.replace(evm_balance_search, evm_balance_replace)

# Make sure to import getErc20Tokens if not imported
if 'getErc20Tokens' not in content:
    content = content.replace("import { formatAmount } from '../src';", "import { formatAmount } from '../src';\nimport { getErc20Tokens } from '../src/domain/chains/registry';")
    # Simplify the dynamic import since we just added it
    content = content.replace("""          import('../src/domain/chains/etherscan').then(m => {
             // We can use the getErc20Tokens which is available in swap.tsx
             import('../src/domain/chains/registry').then(reg => {
                reg.getErc20Tokens(adapter.config, account.address).then(tokens => {
                   const map: Record<string, bigint> = {};
                   tokens.forEach(t => map[t.contract.toLowerCase()] = t.balance);
                   setHeldTokens(prev => ({ ...prev, ...map }));
                }).catch(() => {});
             });
          });""", """          getErc20Tokens(adapter.config, account.address).then(tokens => {
             const map: Record<string, bigint> = {};
             tokens.forEach((t: any) => map[t.contract.toLowerCase()] = t.balance);
             setHeldTokens(prev => ({ ...prev, ...map }));
          }).catch(() => {});""")

with open('ui/TokenPicker.tsx', 'w') as f:
    f.write(content)
