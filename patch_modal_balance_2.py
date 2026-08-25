import re

with open('ui/TokenPicker.tsx', 'r') as f:
    content = f.read()

# Add activeChain from useWallet
balance_hook_search = """  const nativeBalance = useWallet((s: any) => s.balance);"""
balance_hook_replace = """  const nativeBalance = useWallet((s: any) => s.balance);
  const activeChain = useWallet(s => s.activeChain);"""
content = content.replace(balance_hook_search, balance_hook_replace)

native_effect_search = """      if (nativeBalance && selectedChain === (account as any)?.chainId) {"""
native_effect_replace = """      if (nativeBalance && selectedChain === activeChain) {"""
content = content.replace(native_effect_search, native_effect_replace)

with open('ui/TokenPicker.tsx', 'w') as f:
    f.write(content)
