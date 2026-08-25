import re

with open('app/swap.tsx', 'r') as f:
    content = f.read()

# 1. Imports: ensure sound is imported
if 'import { sound }' not in content:
    content = content.replace('import { haptic } from "../lib/haptics";', 'import { haptic } from "../lib/haptics";\nimport { sound } from "../lib/sound";')
    content = content.replace("import { NovaRing } from '../ui/NovaRing';", '') # might not exist
    content = content.replace("import { PremiumScreen", "import { NovaRing } from '../ui/NovaRing';\nimport { PremiumScreen")

# 2. State additions (slippage, countdown)
state_hook = """  const [pickerState, setPickerState] = useState<{ visible: boolean; side: 'from' | 'to' }>({ visible: false, side: 'from' });"""
if 'const [slippage, setSlippage]' not in content:
    new_states = """  const [pickerState, setPickerState] = useState<{ visible: boolean; side: 'from' | 'to' }>({ visible: false, side: 'from' });
  const [slippage, setSlippage] = useState('0.005');
  const [countdown, setCountdown] = useState(0);
  const countdownInterval = useRef<NodeJS.Timeout | null>(null);
"""
    content = content.replace(state_hook, new_states)

# 3. Modify getBestQuote to pass slippage? Wait, getBestQuote doesn't take slippage currently, it's hardcoded to 0.005 in lifi/jupiter.
# The user wants "Slippage ajustable par l'utilisateur". We should pass it or at least render it. Let's not break getBestQuote if it doesn't take it.
# Let's check src/domain/swap/index.ts for slippage parameter in RouteParams.

# 4. Invert button (↕) : vraie rotation 180° avec rebond + haptique
on_flip_search = """  const onFlip = () => {
    Animated.timing(flipAnim, { toValue: flipState === 0 ? 1 : 0, duration: 300, useNativeDriver: true }).start();"""
on_flip_replace = """  const onFlip = () => {
    haptic.selection();
    Animated.spring(flipAnim, { toValue: flipState === 0 ? 1 : 0, friction: 5, tension: 40, useNativeDriver: true }).start();"""
content = content.replace(on_flip_search, on_flip_replace)

# 5. Success triptych and optimistic feedback
on_confirm_search = """  const onConfirm = async (unlock: Unlock) => {
    if (!quote) return;
    setStep(t('preparing'));
    try {
      const hash = await executeSwap(quote, unlock, (s) => setStep(t(STATUS_KEY[s])));"""
on_confirm_replace = """  const onConfirm = async (unlock: Unlock) => {
    if (!quote) return;
    setStep(t('preparing'));
    sound.send();
    haptic.success();
    try {
      const hash = await executeSwap(quote, unlock, (s) => setStep(t(STATUS_KEY[s])));
      haptic.success();
      sound.success();"""
content = content.replace(on_confirm_search, on_confirm_replace)

# 6. Countdown logic
on_quote_search = """    } catch (e) { setError(friendlyTxError(e, t as any)); } finally { setLoading(false); }
  };"""
on_quote_replace = """    } catch (e) { setError(friendlyTxError(e, t as any)); } finally { setLoading(false); }
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    setCountdown(15);
    countdownInterval.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
           clearInterval(countdownInterval.current!);
           onQuote(); // Auto-refresh
           return 0;
        }
        return c - 1;
      });
    }, 1000);
  };
  
  useEffect(() => {
    return () => { if (countdownInterval.current) clearInterval(countdownInterval.current); };
  }, []);
"""
content = content.replace(on_quote_search, on_quote_replace)

with open('app/swap.tsx', 'w') as f:
    f.write(content)
