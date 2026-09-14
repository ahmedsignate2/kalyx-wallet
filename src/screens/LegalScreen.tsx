import React, { useRef } from 'react';
import { View, Text, Pressable, Linking, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { ScreenHeader } from '../../ui/kit';
import { PremiumScreen, GlassCard, ListRow } from '../../ui/premium';
import { KalyxLogo } from '../../ui/KalyxLogo';
import { Icon } from '../../ui/icon';
import { spacing, useTheme, fonts } from '../../ui/theme';
import { useT } from '../../lib/settingsStore';
import { LEGAL_CONSTANTS } from '../constants/legal';

export interface LegalScreenProps {
  onBack?: () => void;
}

export function LegalScreen({ onBack }: LegalScreenProps = {}) {
  const { colors, typography } = useTheme();
  const t = useT();

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

      <ScrollView
        contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identité de l'application */}
        <View style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1.5) }}>
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
        <GlassCard style={{ gap: spacing(1) }}>
          <Text
            style={[
              typography.caption,
              { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
            ]}
          >
            {t('legalPublisher')}
          </Text>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: spacing(0.5),
            }}
          >
            <Text style={typography.muted}>{t('legalCompanyNameLabel')}</Text>
            <Text style={typography.bodyStrong}>{LEGAL_CONSTANTS.COMPANY_NAME}</Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: spacing(0.5),
              borderTopWidth: 1,
              borderTopColor: colors.glassBorder,
            }}
          >
            <Text style={typography.muted}>{t('legalStatusLabel')}</Text>
            <Text style={typography.bodyStrong}>{t('legalStatusIndividual')}</Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: spacing(0.5),
              borderTopWidth: 1,
              borderTopColor: colors.glassBorder,
            }}
          >
            <Text style={typography.muted}>{t('legalSiretLabel')}</Text>
            <Text style={[typography.bodyStrong, { maxWidth: '60%', textAlign: 'right' }]}>
              {siretDisplay}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: spacing(0.5),
              borderTopWidth: 1,
              borderTopColor: colors.glassBorder,
            }}
          >
            <Text style={typography.muted}>{t('legalContactLabel')}</Text>
            <Pressable onPress={openEmail} hitSlop={6} accessibilityRole="link">
              <Text
                style={[
                  typography.bodyStrong,
                  { color: colors.primary, textDecorationLine: 'underline' },
                ]}
              >
                {LEGAL_CONSTANTS.CONTACT_EMAIL}
              </Text>
            </Pressable>
          </View>
        </GlassCard>

        {/* Section 2 : Hébergement */}
        <GlassCard style={{ gap: spacing(0.75) }}>
          <Text
            style={[
              typography.caption,
              { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6 },
            ]}
          >
            {t('legalHosting')}
          </Text>
          <Text style={[typography.body, { color: colors.text, lineHeight: 20 }]}>
            {hostingDisplay}
          </Text>
        </GlassCard>

        {/* Section 3 : Documents & Liens réglementaires */}
        <GlassCard>
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
              { textAlign: 'center', fontSize: 12, lineHeight: 18 },
            ]}
          >
            © 2026 {LEGAL_CONSTANTS.COMPANY_NAME}. {t('legalRightsReserved')}
          </Text>
        </View>
      </ScrollView>
    </PremiumScreen>
  );
}

export default LegalScreen;
