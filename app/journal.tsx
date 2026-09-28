/**
 * Journal de diagnostic : tout ce que l'app a fait, dans l'ordre (voir
 * lib/debugJournal.ts). Accessible depuis Développeur, et depuis l'écran de
 * déverrouillage (appui long sur le titre) — si c'est le déverrouillage qui
 * casse, c'est là qu'il faut pouvoir lire la trace. Lignes déjà filtrées :
 * aucune phrase, aucune clé, adresses raccourcies.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Share, Alert } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { clearJournal, formatLine, journalLines, journalText, subscribeJournal, type JournalLine } from '../lib/debugJournal';

const TONE: Partial<Record<JournalLine['k'], 'danger' | 'warning' | 'primary'>> = { crash: 'danger', error: 'danger', warn: 'warning', nav: 'primary', state: 'primary' };

export default function JournalScreen() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeJournal(() => setTick((n) => n + 1)), []);
  // Plus récent en haut ; 1 500 lignes affichées, tout est copié.
  const data = useMemo(() => journalLines().slice(-1500).reverse(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const btn = (label: string, onPress: () => void, danger = false) => (
    <KPressable onPress={onPress} accessibilityLabel={label} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: danger ? colors.danger : colors.border, alignItems: 'center' }}>
      <Text style={{ color: danger ? colors.danger : colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{label}</Text>
    </KPressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: spacing(2) }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={`${t('journalTitle')} (${journalLines().length})`} />
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: spacing(1) }}>{t('journalHint')}</Text>
      <View style={{ flexDirection: 'row', gap: spacing(1), marginBottom: spacing(1) }}>
        {btn(t('journalCopy'), () => {
          void Clipboard.setStringAsync(journalText()).then(() => toast.success(t('journalCopied')));
        })}
        {btn(t('journalShare'), () => {
          void Share.share({ message: journalText() }).catch(() => {});
        })}
        {btn(t('journalClear'), () => {
          Alert.alert(t('journalClear'), undefined, [
            { text: t('cancel'), style: 'cancel' },
            { text: t('journalClear'), style: 'destructive', onPress: clearJournal },
          ]);
        }, true)}
      </View>
      <FlatList
        data={data}
        keyExtractor={(l, i) => `${l.t}-${i}`}
        initialNumToRender={60}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing(2) }}
        ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: spacing(4) }}>{t('journalEmpty')}</Text>}
        renderItem={({ item }) => {
          const tone = TONE[item.k];
          return (
            <Text
              selectable
              style={{
                color: tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'primary' ? colors.primary : colors.text,
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: 15,
                paddingVertical: 2,
                borderBottomWidth: 0.5,
                borderBottomColor: colors.border,
              }}
            >
              {formatLine(item)}
            </Text>
          );
        }}
      />
    </View>
  );
}
