/**
 * « Soutenez-nous » : Kalyx est un wallet non-custodial, gratuit à l'usage (une
 * commission de 0,3 % s'applique aux échanges intégrés), sans pub ni revente de
 * données, développé en indépendant.
 *
 * DON EN UN APPUI : chaque carte ouvre l'écran Envoyer pré-rempli (destinataire,
 * réseau, bénéficiaire « Kalyx ») ; l'utilisateur choisit le montant et confirme
 * comme pour tout envoi (PIN, contrôles habituels). Copie et QR restent en
 * action secondaire, pour donner depuis un autre wallet.
 *
 * Adresses : source unique `src/constants/donations.ts` (aucune ici).
 *
 * TON : `kalyxwallet.ton` est résolu juste avant l'envoi et COMPARÉ à l'adresse
 * enregistrée. Différence → alerte, et seule l'adresse enregistrée est proposée.
 * Résolution impossible → envoi à l'adresse enregistrée, avec un avertissement.
 *
 * Aucun chiffre ni compteur : « où va ton don » reste qualitatif.
 */
import { IconDisc, NovaHero, SectionLabel, SettingRow } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable, Card, RemoteIcon, Screen, Button, Chip } from '../ui/kit';
import { useState } from 'react';
import { View, Text, Alert, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { KalyxLogo } from '../ui/KalyxLogo';
import { Icon, type IconName } from '../ui/icon';
import { radii, spacing, useTheme } from '../ui/theme';
import { toast } from '../lib/toast';
import { fill } from '../lib/i18n';
import { useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';
import { chainIconUrl, getAdapter, hasChain, findAdapterV2, TonAdapterV2, withTimeout } from '../src';
import { DONATIONS, DONATION_PAYEE, sameTonAccount, type DonationTarget } from '../src/constants/donations';
import { LEGAL_CONSTANTS } from '../src/constants/legal';

/** Lien GitHub lisible dans un navigateur (sans le suffixe `.git` d'un clone). */
const GITHUB_PAGE = LEGAL_CONSTANTS.GITHUB_URL.replace(/\.git$/, '');

const TON_RESOLVE_TIMEOUT_MS = 8000;

export default function Support() {
  const { colors, typography } = useTheme();
  const t = useT();
  const [openQr, setOpenQr] = useState<string | null>(null);
  /** Réseau choisi par carte (EVM : Base par défaut, frais bas). */
  const [chainOf, setChainOf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const REASONS: { icon: IconName; title: string; text: string }[] = [
    { icon: 'security', title: t('supReason1Title'), text: t('supReason1Text') },
    { icon: 'eyeOff', title: t('supReason2Title'), text: t('supReason2Text') },
    { icon: 'flash', title: t('supReason3Title'), text: t('supReason3Text') },
  ];
  const WHERE: { icon: IconName; title: string; text: string }[] = [
    { icon: 'networks', title: t('supWhereRpcTitle'), text: t('supWhereRpcText') },
    { icon: 'developer', title: t('supWhereApiTitle'), text: t('supWhereApiText') },
    { icon: 'sparkles', title: t('supWhereFeaturesTitle'), text: t('supWhereFeaturesText') },
  ];

  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    toast.success(t('copied'), t('copiedToClipboard').replace('{label}', label));
  };
  const open = (url: string) => Linking.openURL(url).catch(() => toast.error(t('cannotOpenLink')));

  const pickedChain = (c: DonationTarget) => chainOf[c.key] ?? c.chains[0];

  const openSend = (c: DonationTarget, to: string) => {
    const chain = pickedChain(c);
    if (!hasChain(chain)) return toast.error(t('networkNotSupported'));
    // Comme depuis l'accueil : le réseau actif suit l'envoi (l'écran Envoyer le relit aussi).
    useWallet.getState().setActiveChain(chain);
    router.push({ pathname: '/send', params: { to, chain, payee: DONATION_PAYEE, note: t('supDonationNote') } });
  };

  const donate = async (c: DonationTarget) => {
    if (c.family !== 'ton' || !c.domain) return openSend(c, c.address);
    setBusy(c.key);
    let resolved: string | null = null;
    let failed = false;
    try {
      const ton = findAdapterV2(pickedChain(c));
      // Délai : un TonAPI qui accepte la connexion sans répondre laissait le bouton tourner sans fin.
      resolved = ton instanceof TonAdapterV2 ? await withTimeout(ton.resolveDomain(c.domain), TON_RESOLVE_TIMEOUT_MS, () => new Error('TON_RESOLVE_TIMEOUT')) : null;
      if (!resolved) failed = true;
    } catch {
      failed = true;
    } finally {
      setBusy(null);
    }
    if (failed || !resolved) {
      // Nom non vérifiable maintenant : l'adresse enregistrée dans l'app fait foi.
      toast.info(t('supTonUnverifiedTitle'), fill(t('supTonUnverifiedBody'), { domain: c.domain }));
      return openSend(c, c.address);
    }
    if (sameTonAccount(resolved, c.address)) return openSend(c, c.address);
    Alert.alert(
      t('supTonMismatchTitle'),
      fill(t('supTonMismatchBody'), { domain: c.domain, resolved, address: c.address }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('supTonUseRecorded'), onPress: () => openSend(c, c.address) },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader />
      {/* En-tête masqué → le dégradé remonte jusqu'en haut (pas de bandeau noir) */}
      <Stack.Screen options={{ headerShown: false }} />

      <NovaHero title={t('supportKalyxHero')} subtitle={t('supportIntroHonest')}>
        <KalyxLogo size={72} />
      </NovaHero>

      {/* Pourquoi nous soutenir */}
      <Card rise delay={120}>
        {REASONS.map((r, i) => (
          <View key={r.title} style={{ flexDirection: 'row', gap: spacing(1.5), alignItems: 'flex-start', paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
            <IconDisc name={r.icon} tone="gold" />
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{r.title}</Text>
              <Text style={typography.muted}>{r.text}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Où va ton don — qualitatif, aucun chiffre */}
      <SectionLabel>{t('supWhereTitle')}</SectionLabel>
      <Card rise delay={160}>
        {WHERE.map((r, i) => (
          <View key={r.title} style={{ flexDirection: 'row', gap: spacing(1.5), alignItems: 'flex-start', paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
            <IconDisc name={r.icon} />
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{r.title}</Text>
              <Text style={typography.muted}>{r.text}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Don en crypto : un appui ouvre Envoyer pré-rempli */}
      <SectionLabel>{t('inCrypto')}</SectionLabel>
      <Text style={[typography.muted, { marginTop: -spacing(0.5) }]}>{t('supDonateHint')}</Text>
      {DONATIONS.map((c, ci) => {
        const qrOpen = openQr === c.key;
        const chain = pickedChain(c);
        return (
          <Card rise key={c.key} delay={200 + ci * 50} style={{ gap: spacing(1.25) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <RemoteIcon uri={chainIconUrl(c.key)} label={c.symbol} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={typography.bodyStrong}>{c.name}</Text>
                <Text style={typography.muted}>{c.domain ? `${c.symbol} · ${c.domain}` : c.symbol}</Text>
              </View>
            </View>

            {c.chains.length > 1 ? (
              <View style={{ gap: spacing(0.75) }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
                  {c.chains.filter(hasChain).map((id) => (
                    <Chip key={id} label={getAdapter(id).config.name} selected={id === chain} onPress={() => setChainOf((m) => ({ ...m, [c.key]: id }))} />
                  ))}
                </View>
                <Text style={typography.muted}>{t('supEvmLowFees')}</Text>
              </View>
            ) : null}

            <Button
              label={fill(t('supDonateIn'), { symbol: c.chains.length > 1 ? getAdapter(chain).config.nativeSymbol : c.symbol })}
              icon="send"
              loading={busy === c.key}
              onPress={() => void donate(c)}
            />

            {/* Action secondaire : copier / QR, pour donner depuis un autre wallet */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              <KPressable onPress={() => copy(c.address, `${t('addressLabel')} ${c.symbol}`)} accessibilityLabel={t('copyAddress')} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.surface2, borderRadius: radii.md, padding: spacing(1.25), overflow: 'hidden' }}>
                <Text selectable style={[typography.mono, { flex: 1, minWidth: 0 }]} numberOfLines={1} ellipsizeMode="middle">{c.address}</Text>
                <Icon name="copy" size={16} color={colors.primary} />
              </KPressable>
              <KPressable onPress={() => setOpenQr(qrOpen ? null : c.key)} hitSlop={8} accessibilityLabel="QR">
                <IconDisc name="scan" tone={qrOpen ? 'gold' : undefined} size={40} />
              </KPressable>
            </View>

            {qrOpen ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing(1) }}>
                <View style={{ backgroundColor: '#fff', padding: spacing(1.5), borderRadius: radii.md }}>
                  <QRCode value={c.address} size={168} />
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}

      {/* Communauté et code source */}
      <SectionLabel>{t('supCommunityTitle')}</SectionLabel>
      <Card rise delay={420}>
        <SettingRow icon="githubLogo" title={t('supSourceCode')} hint={GITHUB_PAGE.replace(/^https:\/\//, '')} onPress={() => open(GITHUB_PAGE)} />
        <SettingRow divider icon="telegramLogo" title={t('joinTelegram')} hint={LEGAL_CONSTANTS.TELEGRAM_URL.replace(/^https:\/\//, '')} onPress={() => open(LEGAL_CONSTANTS.TELEGRAM_URL)} />
        <SettingRow divider icon="xLogo" title={t('followOnX')} hint="@kalyxntw" onPress={() => open(LEGAL_CONSTANTS.X_URL)} />
        <SettingRow divider icon="bulb" title={t('suggestFeature')} hint={t('suggestFeatureSub')} onPress={() => router.push('/feature-request')} />
        <SettingRow divider icon="gift" tone="gold" title={t('inviteFriends')} hint={t('inviteFriendsSub')} onPress={() => router.push('/invite')} />
      </Card>

      <Text style={[typography.muted, { textAlign: 'center', marginTop: spacing(1), marginBottom: spacing(2) }]}>
        {t('thanksHeartfelt')}
      </Text>
    </Screen>
  );
}
