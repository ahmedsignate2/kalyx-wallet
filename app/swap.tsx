import React from 'react';
import { View, Text, Alert } from 'react-native';
import { PremiumScreen, GlassCard, ListRow } from '../ui/premium';
import { colors, spacing, typography } from '../ui/theme';
import { useT } from '../lib/settingsStore';

function Ico({ e }: { e: string }) {
  return <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{e}</Text>;
}

export default function Swap() {
  const t = useT();
  const soon = (what: string) => Alert.alert(t('soon'), `${what} arrive prochainement.`);

  const rows: { icon: string; title: string; sub: string }[] = [
    { icon: '⇄', title: t('swap'), sub: 'Échange de tokens (agrégateur DEX)' },
    { icon: '🌉', title: t('bridge'), sub: 'Transfert cross-chain' },
    { icon: '💳', title: t('buy'), sub: 'Achat par carte / Apple Pay' },
    { icon: '🏦', title: t('sell'), sub: 'Vente vers compte bancaire' },
    { icon: '🔁', title: t('convert'), sub: 'Conversion rapide entre actifs' },
    { icon: '🕘', title: t('historyTab'), sub: 'Historique des échanges' },
  ];

  return (
    <PremiumScreen>
      <Text style={typography.title}>{t('navExchange')}</Text>
      <Text style={typography.muted}>
        Le hub d’échange arrive : ces fonctions demandent des partenaires (DEX, on-ramp).
      </Text>
      <GlassCard>
        {rows.map((r, i) => (
          <ListRow
            key={r.title}
            divider={i > 0}
            left={<Ico e={r.icon} />}
            title={r.title}
            subtitle={r.sub}
            right={<Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>BIENTÔT</Text>}
            onPress={() => soon(r.title)}
          />
        ))}
      </GlassCard>
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
  );
}
