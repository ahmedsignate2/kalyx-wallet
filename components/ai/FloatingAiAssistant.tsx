/**
 * Bulle Copilot — visible dès qu'une clé API est configurée, sur TOUS les
 * endroits où l'on peut vouloir lui parler : accueil, marché, Earn, navigateur
 * et fiche token. Posée au-dessus de la barre d'onglets, à droite. Style
 * tokens (Nuit + Trait + étoiles), pas de dégradé doré.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAiStore } from '../../lib/aiStore';
import { usePortfolio } from '../../lib/portfolioStore';
import { useBrowserStore } from '../../lib/browserStore';
import { AiChatModal } from './AiChatModal';
import { Pressable } from '../../ui/kit';
import { Icon } from '../../ui/icon';
import { useTheme } from '../../ui/theme';
import { radius } from '../../ui/tokens';
import { useT } from '../../lib/settingsStore';

const TAB_PATHS = ['/', '/home', '/market', '/earn'];
const BROWSER = '/browser';

export function FloatingAiAssistant() {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const isEnabled = useAiStore((s) => s.isEnabled);
  const isOpen = useAiStore((s) => s.isOpen);
  const openChat = useAiStore((s) => s.openChat);
  const closeChat = useAiStore((s) => s.closeChat);
  const pathname = usePathname();
  const { totalUsd, tokensSummary, pnl24h, pnl24hPct, topGainer, topLoser } = usePortfolio();
  const { currentUrl, currentTitle } = useBrowserStore();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
    if (pathname === BROWSER) {
      const timer = setTimeout(() => setCollapsed(true), 4500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [pathname]);

  if (!isEnabled) return null;
  const onTabs = TAB_PATHS.includes(pathname);
  const onBrowser = pathname === BROWSER;
  const onToken = pathname.startsWith('/token/');
  const showBubble = onTabs || onBrowser || onToken;
  // Au-dessus de la barre d'onglets (≈ 88 + inset) ; sur le navigateur, au-dessus de la barre d'adresse.
  const bottom = onTabs ? insets.bottom + 96 : onBrowser ? insets.bottom + 72 : insets.bottom + 24;

  const context = onBrowser ? { screen: 'browser', url: currentUrl, title: currentTitle } : pathname.includes('market') ? { screen: 'markets' } : { screen: 'wallet', totalUsd, tokensSummary, pnl24h, pnl24hPct, topGainer, topLoser };

  return (
    <>
      {showBubble && !isOpen ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom, zIndex: 50 }}>
          <Pressable onPress={() => { if (collapsed) setCollapsed(false); else openChat(); }} accessibilityLabel={collapsed ? t('aiFloatingShow') : t('aiFloatingOpen')} style={{ width: collapsed ? 34 : 52, height: collapsed ? 40 : 52, borderRadius: radius.round, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={22} />
          </Pressable>
        </View>
      ) : null}
      <AiChatModal visible={isOpen} onClose={() => closeChat()} context={context} />
    </>
  );
}
