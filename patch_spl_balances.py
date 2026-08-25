import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

spl_search = """  // Tokens réellement détenus sur la chaîne active → swappables même hors liste curée.
  useEffect(() => {
    let cancelled = false;
    setHeld([]);
    if (chain.family !== 'evm' || !account?.address) return;
    getErc20Tokens(chain, account.address)
      .then((detected) => {
        if (!cancelled)
          setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.contract, decimals: tk.decimals, logo: tk.logo, balance: tk.raw })));
      })
      .catch(() => {
        if (!cancelled) setHeld([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, account?.address]);"""

spl_replace = """  // Tokens réellement détenus sur la chaîne active → swappables même hors liste curée.
  useEffect(() => {
    let cancelled = false;
    setHeld([]);
    if (!account?.address) return;

    if (chain.family === 'evm') {
      getErc20Tokens(chain, account.address)
        .then((detected) => {
          if (!cancelled)
            setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.contract, decimals: tk.decimals, logo: tk.logo, balance: tk.raw })));
        })
        .catch(() => {
          if (!cancelled) setHeld([]);
        });
    } else if (chain.family === 'solana') {
      const adapter = getAdapter(activeChain) as any;
      if (adapter.getSplTokens) {
        adapter.getSplTokens(account.address)
          .then((detected: any[]) => {
            if (!cancelled)
              setHeld(detected.map((tk) => ({ symbol: tk.symbol, address: tk.mint, decimals: tk.decimals, logo: tk.logo, balance: tk.balance })));
          })
          .catch(() => {});
      }
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, account?.address]);"""

content = content.replace(spl_search, spl_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
