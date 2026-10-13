/**
 * ONGLET « CARTE » — une vraie carte crypto, sans que Kalyx en émette une.
 *
 * Modèle « passerelle dApp » (src/domain/card/cardIssuers) : la carte est
 * émise par un partenaire public (Gnosis Pay, Holyheld, Spritz). Kalyx
 * l'habille, montre ce qui est prêt à dépenser, puis ouvre le SITE OFFICIEL de
 * l'émetteur dans son navigateur. Le KYC, les numéros, le CVV et Apple Pay /
 * Google Pay restent chez l'émetteur : Kalyx ne les voit jamais, et chaque
 * recharge passe par la confirmation de signature habituelle.
 *
 * DEUX ÉTATS, PERSISTANTS (lib/cardPrefs) :
 *  - configuration : choix de l'émetteur, du réseau de paiement, du style ;
 *  - carte configurée : l'écran s'ouvre DIRECTEMENT sur la carte, à chaque
 *    lancement, avec le solde prêt à dépenser et les actions.
 *
 * L'émetteur s'ouvre dans SON onglet du navigateur, réutilisé d'une fois sur
 * l'autre (page et session gardées), sur le réseau choisi — sans changer le
 * réseau du reste de l'app. Choisir un émetteur ici vaut accord pour qu'il voie
 * l'adresse du portefeuille : il se reconnecte ensuite sans redemander
 * (« sites mémorisés », révocable dans Sites connectés).
 */
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { Screen, ScreenHeader, Card, Text, Button, Pressable, Divider, Input } from '../ui/kit';
import { NovaHero, Pills, SectionLabel, IconDisc } from '../ui/nova';
import { DappLogo } from '../ui/browser/DappTile';
import { KalyxCard } from '../ui/card/KalyxCard';
import { LogoImage } from '../ui/kit/LogoImage';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, radii } from '../ui/tokens';
import { useT, useSettings } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';
import { useCardPrefs, type CardTheme } from '../lib/cardPrefs';
import { useDappActivity } from '../lib/dappActivity';
import { usePortfolioStore } from '../lib/portfolio/portfolioStore';
import { CARD_ISSUERS, cardIssuer, cardChainFor, spendableOn, type CardIssuer } from '../src/domain/card/cardIssuers';
import { chainIconUrl, findAdapterV2 } from '../src';
import { decimalSeparator } from '../src/domain/validation/format';
import type { Key } from '../lib/i18n';

const THEME_LABEL: Record<CardTheme, Key> = { holo: 'cardThemeHolo', noir: 'cardThemeNoir', creme: 'cardThemeCreme' };
const REGION_LABEL: Record<'eu' | 'uk' | 'us', Key> = { eu: 'cardRegionEu', uk: 'cardRegionUk', us: 'cardRegionUs' };
const chainName = (id: string) => findAdapterV2(id)?.config.name ?? id;
const fmt = (n: number) => n.toFixed(2).replace('.', decimalSeparator());

export default function CardScreen() {
  const t = useT();
  const { colors } = useTheme();
  const p = useCardPrefs();
  const holder = useSettings((s) => s.profileName);
  const holdings = usePortfolioStore(useShallow((s) => s.holdings));
  const [memo, setMemo] = useState('');
  const loadPrefs = p.load;
  useEffect(() => {
    void loadPrefs();
    void useDappActivity.getState().load();
  }, [loadPrefs]);
  useEffect(() => setMemo(p.last4 ?? ''), [p.last4]);

  const chosen = p.issuer ? cardIssuer(p.issuer) : null;
  const chain = chosen ? cardChainFor(chosen, p.chain) : null;
  const spend = chosen && chain ? spendableOn(holdings, chosen, chain) : null;

  /*
   * L'émetteur, dans SON onglet (réutilisé), sur le réseau choisi. Le site est
   * mémorisé : il retrouve l'adresse sans nouvelle demande de connexion.
   */
  const open = async (i: CardIssuer) => {
    haptic.light();
    // Liste des sites mémorisés relue AVANT d'y ajouter l'émetteur : écrire sur une liste pas encore chargée l'écraserait.
    await useDappActivity.getState().load();
    useDappActivity.getState().remember(i.dapp.host);
    router.push({ pathname: '/browser', params: { url: i.dapp.url, chain: cardChainFor(i, p.chain), n: String(Date.now()) } });
  };

  const card = (
    <KalyxCard
      theme={p.theme}
      holder={holder || undefined}
      issuerName={chosen?.dapp.name}
      last4={p.last4}
      label={t('cardLabel')}
      backText={chosen ? t('cardBack').replace('{issuer}', chosen.dapp.name) : t('cardBackNone')}
    />
  );
  const stylePicker = (
    <>
      <SectionLabel>{t('cardStyle')}</SectionLabel>
      <Pills items={(Object.keys(THEME_LABEL) as CardTheme[]).map((k) => ({ key: k, label: t(THEME_LABEL[k]) }))} value={p.theme} onChange={(k) => { haptic.selection(); p.setTheme(k); }} />
    </>
  );

  /* ── CARTE CONFIGURÉE : on arrive directement dessus ── */
  if (p.loaded && p.configured && chosen && chain) {
    return (
      <Screen scene="top">
        <ScreenHeader />
        <NovaHero align="left" title={t('cardTitle')} subtitle={t('cardWithIssuer').replace('{issuer}', chosen.dapp.name)} />
        {card}

        {/* Prêt à dépenser : les stablecoins du portefeuille sur le réseau de paiement. */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {chainIconUrl(chain) ? <LogoImage uri={chainIconUrl(chain)!} size={36} /> : null}
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="secondary">{t('cardSpendable').replace('{chain}', chainName(chain))}</Text>
            <Text variant="title2" tabular>{fmt(spend?.total ?? 0)} {spend?.parts.length === 1 ? spend.parts[0].symbol : chosen.stables[0] === 'EURE' ? 'EURe' : 'USDC'}</Text>
          </View>
        </Card>

        <Button label={t('cardOrder').replace('{issuer}', chosen.dapp.name)} onPress={() => void open(chosen)} />
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {([
            ['add', t('cardTopUp')],
            ['eye', t('cardManage')],
            // Nom de marque, non traduit : celui du téléphone.
            ['card', Platform.OS === 'android' ? 'Google Pay' : 'Apple Pay'],
          ] as const).map(([icon, label]) => (
            <Pressable key={label} onPress={() => void open(chosen)} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', gap: space[1], paddingVertical: space[3], borderRadius: radii.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
              <Icon name={icon} size={22} color={colors.text} />
              <Text variant="caption" numberOfLines={1} style={{ textAlign: 'center' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text variant="micro" tone="secondary" style={{ textAlign: 'center' }}>{t('cardSessionKept').replace('{issuer}', chosen.dapp.name)}</Text>

        {stylePicker}

        <Card padded={false}>
          <View style={{ padding: space[4], gap: space[2] }}>
            <Text variant="bodyStrong">{t('cardLast4Title')}</Text>
            <Input
              value={memo}
              onChangeText={(v) => setMemo(v.replace(/\D/g, '').slice(0, 4))}
              onEndEditing={() => p.setLast4(memo || null)}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="1234"
              accessibilityLabel={t('cardLast4Title')}
            />
            <Text variant="micro" tone="secondary">{t('cardLast4Hint')}</Text>
          </View>
          <Divider />
          <Pressable onPress={() => { haptic.selection(); p.editSetup(); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
            <Icon name="gear" size={20} color={colors.text} />
            <Text variant="body" style={{ flex: 1 }}>{t('cardChangeSetup')}</Text>
            <Icon name="chevron" size={18} tone="faint" />
          </Pressable>
        </Card>
        <Text variant="micro" tone="secondary" style={{ textAlign: 'center' }}>{t('cardDisclaimer')}</Text>
      </Screen>
    );
  }

  /* ── CONFIGURATION : émetteur, réseau, style ── */
  return (
    <Screen scene="top">
      <ScreenHeader />
      <NovaHero align="left" title={t('cardTitle')} subtitle={t('cardSubtitle')} />
      {card}
      <Text variant="caption" tone="secondary" style={{ textAlign: 'center', marginTop: -space[2] }}>{t('cardTapToFlip')}</Text>

      <SectionLabel>{t('cardIssuerSection')}</SectionLabel>
      <Card padded={false}>
        {CARD_ISSUERS.map((i, idx) => {
          const on = chosen?.id === i.id;
          return (
            <View key={i.id}>
              {idx > 0 ? <Divider inset={68} /> : null}
              <Pressable onPress={() => { haptic.selection(); p.setIssuer(i.id); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={i.dapp.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
                <DappLogo host={i.dapp.host} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{i.dapp.name}</Text>
                  <Text variant="caption" tone="secondary">{t(i.modelKey)}</Text>
                  <Text variant="micro" tone="secondary">{i.regions.map((r) => t(REGION_LABEL[r])).join(' · ')}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.warm : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warm }} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>

      {chosen && chain ? (
        <>
          <SectionLabel>{t('cardNetwork')}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {chosen.chainIds.map((c) => {
              const on = c === chain;
              const ic = chainIconUrl(c);
              return (
                <Pressable key={c} onPress={() => { haptic.selection(); p.setChain(c); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={chainName(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radii.full, borderWidth: 1.5, borderColor: on ? colors.warm : colors.border, backgroundColor: on ? colors.surface1 : 'transparent' }}>
                  {ic ? <LogoImage uri={ic} size={18} /> : null}
                  <Text variant="caption" style={{ fontWeight: on ? '700' : '500' }}>{chainName(c)}</Text>
                </Pressable>
              );
            })}
          </View>
          {chosen.dapp.families.includes('solana') ? <Text variant="caption" tone="secondary">{t('cardSolanaWc')}</Text> : null}
        </>
      ) : null}

      {stylePicker}

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
      <Button label={chosen ? t('cardSetupDone').replace('{issuer}', chosen.dapp.name) : t('cardPickIssuer')} disabled={!chosen} onPress={() => { haptic.success?.(); p.finishSetup(); }} />
      <Text variant="micro" tone="secondary" style={{ textAlign: 'center' }}>{t('cardDisclaimer')}</Text>
    </Screen>
  );
}
