/**
 * Conteneurs d'écran — fond Encre, entrée douce, CLAVIER-AWARE (le contenu
 * remonte au-dessus du clavier et reste défilable).
 *
 * Deux mises en page, pas plus :
 *  - `page` (défaut) : écran de contenu défilant, marge d'écran, espacement
 *    `xl` entre blocs, place réservée à un pied ou à la barre d'onglets.
 *  - `form` : écran-formulaire plat (PIN, phrase, mot de passe). Marge `xxl`,
 *    espacement `lg`. Sans `scroll`, le contenu est fixe — pour les écrans
 *    qui gèrent DÉJÀ leur défilement (ScrollView/FlatList), afin d'éviter un
 *    double défilement ; `flexGrow: 1` garde les espaceurs `flex: 1`.
 *
 * `ScreenList` : variante virtualisée de `page` pour les longues listes.
 */
import React from 'react';
import { FlatList, Platform, ScrollView, StatusBar, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoid } from '../KeyboardAvoid';
import { useScreenEntrance } from './entrance';
import { useTheme } from '../theme';
import { SCREEN_MARGIN, spaces } from '../tokens';

/** Hauteur réservée sous le contenu quand un pied ou la barre d'onglets le recouvre. */
const OVERLAY_SPACE = 120;

function useTopPadding() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + spaces.md : insets.top + spaces.sm;
}

export function Screen({
  children,
  layout = 'page',
  scroll = layout === 'page',
  footer,
  tabBarSpace,
  refreshControl,
}: {
  children: React.ReactNode;
  layout?: 'page' | 'form';
  scroll?: boolean;
  footer?: React.ReactNode;
  /** Laisse la place de la barre d'onglets (dessinée par le navigateur d'onglets). */
  tabBarSpace?: boolean;
  /** Élément <RefreshControl> pour le « balayer vers le bas pour rafraîchir ». */
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const insets = useSafeAreaInsets();
  const topPadding = useTopPadding();
  const { colors } = useTheme();
  const entrance = useScreenEntrance();
  const form = layout === 'form';
  const content = form
    ? { flexGrow: 1, padding: spaces.xxl, paddingTop: spaces.xs, paddingBottom: spaces.xxl + insets.bottom, gap: spaces.lg }
    : {
        flexGrow: 1,
        paddingTop: topPadding,
        paddingHorizontal: SCREEN_MARGIN,
        paddingBottom: insets.bottom + (footer || tabBarSpace ? OVERLAY_SPACE : spaces.xxxl + spaces.sm),
        gap: spaces.xl,
      };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: form ? topPadding : 0 }}>
      <KeyboardAvoid style={{ flex: 1 }}>
        <Reanimated.View style={[{ flex: 1 }, entrance]}>
          {scroll ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              refreshControl={refreshControl}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[content, { flex: 1 }]}>{children}</View>
          )}
        </Reanimated.View>
      </KeyboardAvoid>
      {footer}
    </View>
  );
}

/**
 * Variante virtualisée de `Screen` : même habillage, mais le défilement est une
 * FlatList (seules les lignes visibles sont montées). Les contenus au-dessus et
 * au-dessous de la liste passent par `header` / `listFooter`.
 */
export function ScreenList<T>({
  header,
  listFooter,
  tabBarSpace,
  ...list
}: Omit<React.ComponentProps<typeof FlatList<T>>, 'ListHeaderComponent' | 'ListFooterComponent' | 'contentContainerStyle'> & {
  header?: React.ReactNode;
  listFooter?: React.ReactNode;
  tabBarSpace?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const topPadding = useTopPadding();
  const { colors } = useTheme();
  const entrance = useScreenEntrance();
  const gap = spaces.xl;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoid style={{ flex: 1 }}>
        <Reanimated.View style={[{ flex: 1 }, entrance]}>
          <FlatList<T>
            {...list}
            ListHeaderComponent={header ? <View style={{ gap, paddingBottom: gap }}>{header}</View> : null}
            ListFooterComponent={listFooter ? <View style={{ gap, paddingTop: gap }}>{listFooter}</View> : null}
            contentContainerStyle={{
              paddingTop: topPadding,
              paddingHorizontal: SCREEN_MARGIN,
              paddingBottom: insets.bottom + (tabBarSpace ? OVERLAY_SPACE : spaces.xxxl + spaces.sm),
              flexGrow: 1,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          />
        </Reanimated.View>
      </KeyboardAvoid>
    </View>
  );
}
