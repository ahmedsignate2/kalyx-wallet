import { useT } from "../../lib/settingsStore";
/**
 * Sheet — bottom sheet Kalyx (rayon 28, Orbite), fond assombri 60 %, inset
 * système en bas, contenu défilable borné (85 %). Ressort Standard à
 * l'ouverture (Modal natif « slide » en attendant @gorhom/bottom-sheet).
 */
import { SafeModal } from './SafeModal';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { radius, space, radii } from '../tokens';

export function Sheet({ visible, onClose, children, dismissable = true, showWhenLocked }: { visible: boolean; onClose: () => void; children: React.ReactNode; dismissable?: boolean; /** Voir SafeModal. */ showWhenLocked?: boolean }) {
  const t = useT();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <SafeModal visible={visible} showWhenLocked={showWhenLocked} transparent animationType="slide" statusBarTranslucent onRequestClose={dismissable ? onClose : undefined}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1, backgroundColor: mode === 'dark' ? 'rgba(4,4,10,0.66)' : 'rgba(40,28,20,0.38)' }} onPress={dismissable ? onClose : undefined} accessibilityLabel={t("aiClose")} />
        <View style={{ backgroundColor: mode === 'dark' ? colors.surface1 : colors.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, borderTopColor: colors.rim, maxHeight: '85%', flexShrink: 1, paddingBottom: Math.max(insets.bottom, 16) + 12 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: radii.full, backgroundColor: colors.textTertiary, opacity: 0.4, marginTop: space[2], marginBottom: space[3] }} />
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: space[5], gap: space[4] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeModal>
  );
}
