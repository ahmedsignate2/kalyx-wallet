/**
 * FICHE DU DESTINATAIRE, à l'étape « Vérifie avant d'envoyer ».
 *
 * Les faits sur l'adresse, en clair et sans IA : contact, déjà payée (combien
 * de fois, quand), première fois, sosie d'une adresse connue, contrat, adresse
 * neuve, signalée par une liste noire publique. Les données publiques (ton
 * historique relu, profil de l'adresse, listes noires) sont lues à l'ouverture
 * de l'étape ; tant qu'elles arrivent, les faits locaux s'affichent déjà.
 *
 * Couleur par gravité : rouge = danger (liste noire, sosie), ambre = à vérifier
 * (première fois, adresse neuve, contrat), vert = connu.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from './kit';
import { Icon, type IconName } from './icon';
import { useTheme } from './theme';
import { fontFamily } from './tokens';
import { useSettings, useT } from '../lib/settingsStore';
import { auditFacts, type TxAuditFact, type TxRecipientFacts } from '../lib/aiTxAudit';
import { probeRecipient, type RecipientProbe } from '../lib/txAuditProbe';
import { factLabel } from './auditFactLabel';

type Tone = 'danger' | 'warning' | 'up' | 'neutral';
const TONE: Record<TxAuditFact['kind'], Tone> = {
  flagged: 'danger', lookalike: 'danger', new: 'warning', fresh: 'warning', contract: 'warning', unverified: 'neutral',
  own: 'up', contact: 'up', paidN: 'up', paid: 'up', received: 'up', since: 'neutral', busy: 'neutral',
};
const ICON: Record<Tone, IconName> = { danger: 'warning', warning: 'alert', up: 'check', neutral: 'info' };

export function RecipientFacts({ to, chainId, from, facts }: { to: string; chainId: string; from?: string; facts: TxRecipientFacts }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useSettings((s) => s.language);
  const [probe, setProbe] = useState<RecipientProbe | null>(null);
  useEffect(() => {
    let alive = true;
    setProbe(null);
    probeRecipient(chainId, from, to).then((p) => alive && setProbe(p));
    return () => {
      alive = false;
    };
  }, [chainId, from, to]);

  const list = auditFacts({ to, value: '', recipient: { ...facts, probe: probe ?? undefined } });
  const color = (tone: Tone) => (tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : tone === 'up' ? colors.up : colors.textSecondary);
  return (
    <View style={{ gap: 8, padding: 14, borderRadius: 22, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="micro" tone="secondary" style={{ letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 }}>{t('recipientFactsTitle')}</Text>
        {probe === null ? <ActivityIndicator size="small" color={colors.textTertiary} /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {list.map((f, i) => {
          const tone = TONE[f.kind];
          const c = color(tone);
          return (
            <View key={`${f.kind}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, borderWidth: 1, borderColor: tone === 'neutral' ? colors.border : c + '55', backgroundColor: tone === 'neutral' ? colors.surface2 : c + '18' }}>
              <Icon name={ICON[tone]} size={13} color={c} />
              <Text variant="caption" style={{ color: tone === 'neutral' ? colors.textSecondary : c, fontFamily: fontFamily.semibold }}>{factLabel(f, t, language)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
