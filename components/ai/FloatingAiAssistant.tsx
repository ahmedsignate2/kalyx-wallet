import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAiStore } from '../../lib/aiStore';
import { usePortfolio } from '../../lib/portfolioStore';
import { useBrowserStore } from '../../lib/browserStore';
import { AiChatModal } from './AiChatModal';
import { Icon } from '../../ui/icon';

export function FloatingAiAssistant() {
  const { isEnabled } = useAiStore();
  const isOpen = useAiStore((s) => s.isOpen);
  const openChat = useAiStore((s) => s.openChat);
  const closeChat = useAiStore((s) => s.closeChat);
  const pathname = usePathname();

  const { totalUsd, tokensSummary } = usePortfolio();
  const { currentUrl, currentTitle } = useBrowserStore();

  // Uniquement sur les écrans principaux (Tabs)
  const allowedPaths = ['/', '/wallet', '/home', '/market', '/browser'];
  if (!isEnabled || !allowedPaths.includes(pathname)) {
    return null;
  }

  const getContextPayload = () => {
    if (pathname.includes('browser')) {
      return { screen: 'browser', url: currentUrl, title: currentTitle };
    }
    if (pathname.includes('market') || pathname.includes('swap')) {
      return { screen: 'markets' };
    }
    return {
      screen: 'wallet',
      totalUsd,
      tokensSummary,
    };
  };

  return (
    <>
      <TouchableOpacity
        style={styles.bubbleContainer}
        onPress={() => openChat()}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={['#2A2415', '#16140D']}
          style={styles.gradientBg}
        >
          <Icon name="starFilled" size={20} color="#E5A93C" />
        </LinearGradient>
      </TouchableOpacity>

      <AiChatModal
        visible={isOpen}
        onClose={() => closeChat()}
        context={getContextPayload()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bubbleContainer: {
    position: 'absolute',
    bottom: 105,
    right: 18,
    zIndex: 9999,
    shadowColor: '#E5A93C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  gradientBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(229, 169, 60, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
