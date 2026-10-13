/** EmptyState — un écran vide invite à une action (§6). Icône, phrase, bouton. */
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Text } from './Text';
import { Button } from './Button';
import { Icon, type IconName } from '../icon';
import { space, radius } from '../tokens';

export function EmptyState({ icon, title, body, actionLabel, onAction }: { icon: IconName; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[6], gap: space[3] }}>
      {/* La petite orbe de la marque (comme les en-têtes d'écran), au lieu d'un disque gris. */}
      <View style={{ width: 56, height: 56, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={56} height={56} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id="empty-orb" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#F6A57C" />
              <Stop offset="1" stopColor="#9C83EC" />
            </LinearGradient>
          </Defs>
          <Circle cx={28} cy={28} r={28} fill="url(#empty-orb)" opacity={0.9} />
        </Svg>
        <Icon name={icon} size={24} color="#FFFFFF" />
      </View>
      <Text variant="title2" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center' }}>{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" size="md" style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}
