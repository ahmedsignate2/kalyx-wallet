with open('app/history.tsx', 'r') as f:
    content = f.read()

# Fix 1: Hide Etherscan hint for non-EVM chains
content = content.replace(
    "<Muted>{t('noTxHint')}</Muted>",
    "{chain.family === 'evm' ? <Muted>{t('noTxHint')}</Muted> : null}"
)

# Fix 2: Local refreshing state with timeout fallback
old_load = """  // Lancement du fetch réseau en arrière-plan.
  const load = useCallback(async () => {
    if (!account) return;
    await fetchHistory(activeChain, account.address);
  }, [account, activeChain, fetchHistory]);"""

new_load = """  // Lancement du fetch réseau en arrière-plan avec fallback local pour le spinner
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!account) return;
    setLocalRefreshing(true);
    try {
      // Sécurité : Timeout de 1.5s max pour le spinner visuel
      await Promise.race([
        fetchHistory(activeChain, account.address),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    } finally {
      setLocalRefreshing(false);
    }
  }, [account, activeChain, fetchHistory]);"""

content = content.replace(old_load, new_load)

# Replace the RefreshControl's refreshing prop
content = content.replace(
    "refreshing={loading}",
    "refreshing={localRefreshing}"
)

# Fix 3: Filter pills styling
old_style = """              style={{
                paddingVertical: spacing(0.75),
                paddingHorizontal: spacing(1.5),
                borderRadius: radii.pill,
                backgroundColor: active ? colors.accent : colors.glass,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.glassBorder,
              }}"""

new_style = """              style={{
                paddingHorizontal: 16,
                height: 38,
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 20,
                minWidth: 60,
                backgroundColor: active ? colors.accent : colors.glass,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.glassBorder,
              }}"""

content = content.replace(old_style, new_style)

with open('app/history.tsx', 'w') as f:
    f.write(content)
