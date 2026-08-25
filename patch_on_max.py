import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

onmax_search = """  const onMax = () => {
    if (!balance) return;
    const isNativeFrom = fromTok.address === NATIVE_TOKEN;
    const raw = balance.raw;
    if (isNativeFrom) {
      const reserve = GAS_RESERVE[activeChain] ?? 3_000_000_000_000_000n;
      const maxRaw = raw > reserve ? raw - reserve : 0n;
      setAmount(formatAmount(maxRaw, fromTok.decimals));
    } else {
      setAmount(formatAmount(raw, fromTok.decimals));
    }
  };

  const onHalf = () => {
    if (!balance) return;
    setAmount(formatAmount(balance.raw / 2n, fromTok.decimals));
  };"""

onmax_replace = """  const getTokenBalance = () => {
    if (fromTok.address === NATIVE_TOKEN || fromTok.address === '11111111111111111111111111111111') {
      return balance?.raw ?? 0n;
    }
    const heldTok = held.find(t => t.address.toLowerCase() === fromTok.address.toLowerCase());
    return heldTok ? (heldTok as any).balance ?? 0n : 0n;
  };

  const onMax = () => {
    const isNativeFrom = fromTok.address === NATIVE_TOKEN || fromTok.address === '11111111111111111111111111111111';
    const raw = getTokenBalance();
    if (isNativeFrom) {
      const reserve = GAS_RESERVE[activeChain] ?? 3_000_000_000_000_000n;
      const maxRaw = raw > reserve ? raw - reserve : 0n;
      setAmount(formatAmount(maxRaw, fromTok.decimals));
    } else {
      setAmount(formatAmount(raw, fromTok.decimals));
    }
  };

  const onHalf = () => {
    const raw = getTokenBalance();
    setAmount(formatAmount(raw / 2n, fromTok.decimals));
  };"""
content = content.replace(onmax_search, onmax_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
