/**
 * ONGLET « CARTE » — une vraie carte crypto, sans que Kalyx en émette une.
 *
 * Modèle « passerelle dApp » (src/domain/card/cardIssuers) : la carte est
 * émise par un partenaire public (Gnosis Pay, Holyheld, Spritz). Kalyx
 * l'habille (trois matières), puis ouvre le SITE OFFICIEL de l'émetteur dans
 * son navigateur, où le portefeuille de l'utilisateur se connecte. Le KYC, les
 * numéros, le CVV et Apple Pay / Google Pay restent chez l'émetteur : Kalyx ne
 * les voit jamais, et chaque recharge passe par la confirmation de signature
 * habituelle (aperçu, analyse de sécurité).
 */
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, ScreenHeader, Card, Text, Button, Pressable, Divider } from '../ui/kit';
import { NovaHero, Pills, SectionLabel, IconDisc } from '../ui/nova';
import { DappLogo } from '../ui/browser/DappTile';
import { KalyxCard } from '../ui/card/KalyxCard';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, radii } from '../ui/tokens';
import { useT, useSettings } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';
import { useCardPrefs, type CardTheme } from '../lib/cardPrefs';
import { CARD_ISSUERS, cardIssuer, type CardIssuer } from '../src/domain/card/cardIssuers';
import type { Key } from '../lib/i18n';

const THEME_LABEL: Record<CardTheme, Key> = { holo: 'cardThemeHolo', noir: 'cardThemeNoir', creme: 'cardThemeCreme' };
const REGION_LABEL: Record<'eu' | 'uk' | 'us', Key> = { eu: 'cardRegionEu', uk: 'cardRegionUk', us: 'cardRegionUs' };

export default function CardScreen() {
  const t = useT();
  const { colors } = useTheme();
  const { theme, issuer, setTheme, setIssuer, load } = useCardPrefs();
  const holder = useSettings((s) => s.profileName);
  useEffect(() => {
    void load();
  }, [load]);

  const chosen = issuer ? cardIssuer(issuer) : null;
  // Le site officiel de l'émetteur, dans le navigateur Kalyx (hôte vérifié, protégé des sosies).
  const open = (i: CardIssuer) => {
    haptic.light();
    setIssuer(i.id);
    router.push({ pathname: '/browser', params: { url: i.dapp.url } });
  };

  return (
    <Screen scene="top">
      <ScreenHeader />
      <NovaHero align="left" title={t('cardTitle')} subtitle={t('cardSubtitle')} />

      <KalyxCard
        theme={theme}
        holder={holder || undefined}
        issuerName={chosen?.dapp.name}
        label={t('cardLabel')}
        backText={chosen ? t('cardBack').replace('{issuer}', chosen.dapp.name) : t('cardBackNone')}
      />
      <Text variant="caption" tone="secondary" style={{ textAlign: 'center', marginTop: -space[2] }}>{t('cardTapToFlip')}</Text>

      <SectionLabel>{t('cardStyle')}</SectionLabel>
      <Pills items={(Object.keys(THEME_LABEL) as CardTheme[]).map((k) => ({ key: k, label: t(THEME_LABEL[k]) }))} value={theme} onChange={(k) => { haptic.selection(); setTheme(k); }} />

      {chosen ? (
        <Card style={{ gap: space[3] }}>
          <Button label={t('cardOrder').replace('{issuer}', chosen.dapp.name)} onPress={() => open(chosen)} />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {([
              ['add', 'cardTopUp'],
              ['eye', 'cardManage'],
              // Nom de marque, non traduit : celui du téléphone.
              ['card', Platform.OS === 'android' ? 'Google Pay' : 'Apple Pay'],
            ] as const).map(([icon, key]) => (
              <Pressable key={key} onPress={() => open(chosen)} accessibilityRole="button" accessibilityLabel={key.includes(' Pay') ? key : t(key as Key)} style={{ flex: 1, alignItems: 'center', gap: space[1], paddingVertical: space[3], borderRadius: radii.lg, backgroundColor: colors.surface2 }}>
                <Icon name={icon} size={22} color={colors.text} />
                <Text variant="caption" numberOfLines={1} style={{ textAlign: 'center' }}>{key.includes(' Pay') ? key : t(key as Key)}</Text>
              </Pressable>
            ))}
          </View>
          {chosen.dapp.families.includes('solana') ? <Text variant="caption" tone="secondary">{t('cardSolanaWc')}</Text> : null}
        </Card>
      ) : null}

      <SectionLabel>{t('cardIssuerSection')}</SectionLabel>
      <Card padded={false}>
        {CARD_ISSUERS.map((i, idx) => {
          const on = chosen?.id === i.id;
          return (
            <View key={i.id}>
              {idx > 0 ? <Divider inset={68} /> : null}
              <Pressable onPress={() => { haptic.selection(); setIssuer(i.id); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={i.dapp.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
                <DappLogo host={i.dapp.host} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{i.dapp.name}</Text>
                  <Text variant="caption" tone="secondary">{t(i.modelKey)}</Text>
                  <Text variant="micro" tone="secondary">{i.regions.map((r) => t(REGION_LABEL[r])).join(' · ')} — {i.chains.join(', ')}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.warm : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warm }} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>

      <SectionLabel>{t('cardHowTitle')}</SectionLabel>
      <Card style={{ gap: space[3] }}>
        {([
          ['dapps', 'cardHow1'],
          ['security', 'cardHow2'],
          ['sign', 'cardHow3'],
        ] as const).map(([icon, key]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <IconDisc name={icon} size={34} />
            <Text variant="caption" style={{ flex: 1 }}>{t(key)}</Text>
          </View>
        ))}
      </Card>
      <Text variant="micro" tone="secondary" style={{ textAlign: 'center' }}>{t('cardDisclaimer')}</Text>
    </Screen>
  );
}
