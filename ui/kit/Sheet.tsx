import { useT } from "../../lib/settingsStore";
/**
 * Sheet — bottom sheet Kalyx (rayon 28, Orbite), fond assombri 60 %, inset
 * système en bas, contenu défilable borné (85 %). Ressort Standard à
 * l'ouverture (Modal natif « slide » en attendant @gorhom/bottom-sheet).
 */
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';

export function Sheet({ visible, onClose, children, dismissable = true }: { visible: boolean; onClose: () => void; children: React.ReactNode; dismissable?: boolean }) {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={dismissable ? onClose : undefined}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={dismissable ? onClose : undefined} accessibilityLabel={t("aiClose")} />
        <View style={{ backgroundColor: colors.surface2, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, maxHeight: '85%', flexShrink: 1, paddingBottom: Math.max(insets.bottom, 16) + 12 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.surface3, marginTop: space[2], marginBottom: space[3] }} />
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: space[5], gap: space[4] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
