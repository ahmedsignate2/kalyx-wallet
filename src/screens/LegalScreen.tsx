import React, { useRef } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { ScreenHeader } from '../../ui/kit';
import { PremiumScreen, GlassCard, ListRow } from '../../ui/premium';
import { KalyxLogo } from '../../ui/KalyxLogo';
import { Icon } from '../../ui/icon';
import { spacing, useTheme, fonts } from '../../ui/theme';
import { useT } from '../../lib/settingsStore';
import { LEGAL_CONSTANTS } from '../constants/legal';

function getApplicationModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-application');
  } catch {
    return null;
  }
}

export interface LegalScreenProps {
  onBack?: () => void;
}

export function LegalScreen({ onBack }: LegalScreenProps = {}) {
  const { colors, typography } = useTheme();
  const t = useT();

  const Application = getApplicationModule();
  const appVersion =
    Application?.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';

  const siretDisplay =
    LEGAL_CONSTANTS.SIRET && LEGAL_CONSTANTS.SIRET !== 'EN_ATTENTE_INSEE'
      ? LEGAL_CONSTANTS.SIRET
      : t('legalSiretPending');

  const hostingDisplay =
    LEGAL_CONSTANTS.HOSTING_PROVIDER && LEGAL_CONSTANTS.HOSTING_PROVIDER.trim().length > 0
      ? LEGAL_CONSTANTS.HOSTING_PROVIDER
      : t('legalHostingNonCustodial');

  const openEmail = () => {
    Linking.openURL(`mailto:${LEGAL_CONSTANTS.CONTACT_EMAIL}`).catch(() => {});
  };

  const openTelegram = () => {
    Linking.openURL(LEGAL_CONSTANTS.TELEGRAM_URL).catch(() => {});
  };

  const openX = () => {
    Linking.openURL(LEGAL_CONSTANTS.X_URL).catch(() => {});
  };

  const openWebsite = () => {
    Linking.openURL(LEGAL_CONSTANTS.WEBSITE_URL).catch(() => {});
  };

  const openGithub = () => {
    Linking.openURL(LEGAL_CONSTANTS.GITHUB_URL).catch(() => {});
  };

  const openPrivacy = () => {
    router.push({ pathname: '/legal', params: { doc: 'privacy' } });
  };

  const openTerms = () => {
    router.push({ pathname: '/legal', params: { doc: 'terms' } });
  };

  // Secret Dev Taps on version: 7 taps opens /design-lab
  const taps = useRef(0);
  const onVersionTap = () => {
    if (!__DEV__) return;
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      router.push('/design-lab');
    }
  };

  return (
    <PremiumScreen>
      <ScreenHeader
        title={t('legalTitle')}
        onBack={onBack ? onBack : () => router.back()}
      />

      {/* Identité de l'application */}
      <View style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1) }}>
        <KalyxLogo size={80} />
        <Text
          style={{
            color: colors.text,
            fontSize: 24,
            fontFamily: fonts.bold,
            letterSpacing: 0.5,
          }}
        >
          Kalyx Wallet
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={onVersionTap}
            hitSlop={8}
            accessibilityLabel={`${t('legalAppVersion')} ${appVersion}`}
          >
            <Text style={typography.muted}>
              {t('legalAppVersion')} v{appVersion}
            </Text>
          </Pressable>
          <View
            style={{
              backgroundColor: colors.warning + '22',
              borderRadius: 6,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                color: colors.warning,
                fontSize: 10,
                fontFamily: fonts.bold,
                letterSpacing: 0.5,
              }}
            >
              {t('betaTag')}
            </Text>
          </View>
        </View>
      </View>

      {/* Section 1 : Éditeur de l'application */}
      <GlassCard style={{ gap: spacing(1.25), overflow: 'hidden' }}>
        <Text
          style={[
            typography.caption,
            { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
          ]}
        >
          {t('legalPublisher')}
        </Text>

        {/* Raison sociale / Marque */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingVertical: spacing(0.5),
            gap: spacing(1),
          }}
        >
          <Text style={[typography.muted, { flexShrink: 0 }]}>{t('legalCompanyNameLabel')}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={[typography.bodyStrong, { textAlign: 'right', flexWrap: 'wrap', flexShrink: 1 }]}>
              KALYX
            </Text>
            <Text style={[typography.micro, { color: colors.textSecondary, textAlign: 'right', marginTop: 2, flexWrap: 'wrap', flexShrink: 1 }]}>
              Entrepreneur individuel : Ahamed Signate
            </Text>
          </View>
        </View>

        {/* Statut juridique */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing(0.5),
            borderTopWidth: 1,
            borderTopColor: colors.glassBorder,
            gap: spacing(1),
          }}
        >
          <Text style={[typography.muted, { flexShrink: 0 }]}>{t('legalStatusLabel')}</Text>
          <Text style={[typography.bodyStrong, { flex: 1, textAlign: 'right', flexWrap: 'wrap', flexShrink: 1 }]}>
            {t('legalStatusIndividual')}
          </Text>
        </View>

        {/* SIRET */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing(0.5),
            borderTopWidth: 1,
            borderTopColor: colors.glassBorder,
            gap: spacing(1),
          }}
        >
          <Text style={[typography.muted, { flexShrink: 0 }]}>{t('legalSiretLabel')}</Text>
          <Text style={[typography.bodyStrong, { flex: 1, textAlign: 'right', flexWrap: 'wrap', flexShrink: 1 }]}>
            {siretDisplay}
          </Text>
        </View>

        {/* Contact */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing(0.5),
            borderTopWidth: 1,
            borderTopColor: colors.glassBorder,
            gap: spacing(1),
          }}
        >
          <Text style={[typography.muted, { flexShrink: 0 }]}>{t('legalContactLabel')}</Text>
          <Pressable onPress={openEmail} hitSlop={6} accessibilityRole="link" style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text
              style={[
                typography.bodyStrong,
                { color: colors.primary, textDecorationLine: 'underline', textAlign: 'right', flexWrap: 'wrap', flexShrink: 1 },
              ]}
            >
              {LEGAL_CONSTANTS.CONTACT_EMAIL}
            </Text>
          </Pressable>
        </View>

        {/* Type d'application */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: spacing(0.5),
            borderTopWidth: 1,
            borderTopColor: colors.glassBorder,
            gap: spacing(1),
          }}
        >
          <Text style={[typography.muted, { flexShrink: 0 }]}>{t('legalAppType')}</Text>
          <Text style={[typography.bodyStrong, { flex: 1, textAlign: 'right', flexWrap: 'wrap', flexShrink: 1 }]}>
            {t('legalAppTypeValue')}
          </Text>
        </View>
      </GlassCard>

      {/* Section 2 : Hébergement */}
      <GlassCard style={{ gap: spacing(0.75), overflow: 'hidden' }}>
        <Text
          style={[
            typography.caption,
            { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
          ]}
        >
          {t('legalHosting')}
        </Text>
        <Text style={[typography.body, { color: colors.text, lineHeight: 20, flexWrap: 'wrap' }]}>
          {hostingDisplay}
        </Text>
      </GlassCard>

      {/* Section 3 : Documents & Liens réglementaires */}
      <GlassCard style={{ overflow: 'hidden' }}>
        <ListRow
          left={<Icon name="security" size={20} color={colors.textMuted} />}
          title={t('legalPrivacyPolicy')}
          right={<Icon name="chevron" size={18} tone="faint" />}
          onPress={openPrivacy}
        />
        <ListRow
          divider
          left={<Icon name="phrase" size={20} color={colors.textMuted} />}
          title={t('legalTermsOfService')}
          right={<Icon name="chevron" size={18} tone="faint" />}
          onPress={openTerms}
        />
        <ListRow
          divider
          left={<Icon name="faq" size={20} color={colors.textMuted} />}
          title={t('faq')}
          right={<Icon name="chevron" size={18} tone="faint" />}
          onPress={() => router.push('/faq')}
        />
        <ListRow
          divider
          left={<Icon name="dapps" size={20} color={colors.textMuted} />}
          title={t('legalWebsite')}
          subtitle="kalyxwallet.com"
          right={<Icon name="chevron" size={18} tone="faint" />}
          onPress={openWebsite}
        />
        <ListRow
          divider
          left={<Icon name="githubLogo" size={20} color={colors.textMuted} />}
          title={t('legalGithub')}
          right={<Icon name="chevron" size={18} tone="faint" />}
          onPress={openGithub}
        />
        <ListRow
          divider
          left={<Icon name="telegramLogo" size={20} color={colors.textMuted} />}
          title={t('joinTelegram')}
          subtitle="t.me/kalyxntw"
          right={<Icon name="chevron" size={18} tone="faint" />}
          onPress={openTelegram}
        />
        <ListRow
          divider
          left={<Icon name="xLogo" size={20} color={colors.textMuted} />}
          title={t('followOnX')}
          subtitle="@kalyxntw"
          right={<Icon name="chevron" size={18} tone="faint" />}
          onPress={openX}
        />
      </GlassCard>

      {/* Footer & Mentions Droits réservés */}
      <View style={{ paddingVertical: spacing(1), alignItems: 'center' }}>
        <Text
          style={[
            typography.muted,
            { textAlign: 'center', fontSize: 12, lineHeight: 18, flexWrap: 'wrap' },
          ]}
        >
          © 2026 {LEGAL_CONSTANTS.COMPANY_NAME}. {t('legalRightsReserved')}
        </Text>
      </View>
    </PremiumScreen>
  );
}

export default LegalScreen;
