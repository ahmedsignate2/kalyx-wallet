/**
 * ListRow / TokenRow — ligne de liste (64 dp, §2.6). Posée sur la Surface du
 * groupe ; l'état pressé change le FOND (Crépuscule), pas l'échelle.
 * TokenRow : icône, nom + solde, valeur + variation (signe + flèche + couleur :
 * la couleur n'est jamais la seule info, §2.4).
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable as RNPressable } from 'react-native';
import { Text } from './Text';
import { TokenIcon } from './TokenIcon';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { space, TOKEN_ROW_HEIGHT } from '../tokens';

/** Fond Crépuscule pendant l'appui (pas de scale sur une ligne de liste). */
function PressedBackground({ onPress, pressedColor, children }: { onPress: () => void; pressedColor: string; children: React.ReactNode }) {
  return (
    <RNPressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: pressed ? pressedColor : 'transparent' })}>
      {children}
    </RNPressable>
  );
}

export function ListRow({ left, title, subtitle, right, onPress, chevron, style }: { left?: React.ReactNode; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; chevron?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const content = (
    <View style={[{ minHeight: TOKEN_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }, style]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" tone="secondary" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={{ flexShrink: 0, marginLeft: 4 }}>{right}</View> : null}
      {chevron ? <Icon name="chevron" size={16} color={colors.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressedBackground onPress={onPress} pressedColor={colors.surface3}>
      {content}
    </PressedBackground>
  );
}

export function TokenRow({
  symbol, name, logo, address, balance, fiat, changePct, onPress, hidden,
}: {
  symbol: string; name: string; logo?: string | null; address?: string;
  /** Solde formaté (« 1.42 ETH »). */ balance: string;
  /** Valeur formatée (« 4 210,00 € »). */ fiat?: string;
  changePct?: number | null; onPress?: () => void; hidden?: boolean;
}) {
  const up = (changePct ?? 0) >= 0;
  return (
    <ListRow
      onPress={onPress}
      left={<TokenIcon symbol={symbol} logo={logo} seed={address ?? symbol} />}
      title={name}
      subtitle={hidden ? '••••' : balance}
      right={
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="body" tabular numberOfLines={1}>{hidden ? '••••' : fiat ?? '—'}</Text>
          {changePct != null && !hidden ? (
            <Text variant="caption" tone={up ? 'up' : 'down'} tabular>
              {up ? '↑ +' : '↓ −'}{Math.abs(changePct).toFixed(1).replace('.', ',')} %
            </Text>
          ) : null}
        </View>
      }
    />
  );
}
