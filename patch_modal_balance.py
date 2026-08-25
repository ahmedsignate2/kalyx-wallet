import re

with open('ui/TokenPicker.tsx', 'r') as f:
    content = f.read()

# Add balance from useWallet
balance_hook_search = """  const loading = useTokenStore(s => s.loading);
  const account = useWallet(s => s.account);"""
balance_hook_replace = """  const loading = useTokenStore(s => s.loading);
  const account = useWallet(s => s.account);
  const nativeBalance = useWallet((s: any) => s.balance);"""
content = content.replace(balance_hook_search, balance_hook_replace)

# Apply native balance to heldTokens
native_effect_search = """  useEffect(() => {
    if (visible) {
      fetchTokens(selectedChain);
      // Optional: Fetch held balances for the selected chain here to display them."""
native_effect_replace = """  useEffect(() => {
    if (visible) {
      fetchTokens(selectedChain);
      if (nativeBalance && selectedChain === (account as any)?.chainId) {
        setHeldTokens(prev => ({ ...prev, ['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee']: nativeBalance.raw, '11111111111111111111111111111111': nativeBalance.raw }));
      }
      // Optional: Fetch held balances for the selected chain here to display them."""
content = content.replace(native_effect_search, native_effect_replace)

with open('ui/TokenPicker.tsx', 'w') as f:
    f.write(content)
