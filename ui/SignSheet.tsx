import { useT } from "../lib/settingsStore";
/**
 * SignSheet — la modal de signature Kalyx (§4.7), dans cet ordre :
 *  1. QUI demande : logo, nom, VRAI domaine (WalletConnect Verify : domaine
 *     invalide ou site signalé → bandeau rouge en haut).
 *  2. CE QUI VA SE PASSER, en une phrase.
 *  3. Résultat de la SIMULATION : « Tu perds » / « Tu reçois ».
 *  4. NIVEAU DE RISQUE : Aucun risque détecté (neutre) / Attention / Danger.
 *  5. Détails techniques repliés.
 *  6. Refuser (secondaire) / Signer (principal). Danger : Refuser par défaut,
 *     signer = maintenir 2 s.
 * Composant de PRÉSENTATION : le parent fournit l'explication et gère l'action.
 */
import { dappHost } from '../src/domain/web/dappHost';
import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Text, Button, HoldButton, Divider, RiskBadge, AddressGlyph, Sheet, Skeleton, Pressable as KPressable, Card, RemoteIcon } from './kit';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space, radius } from './tokens';
import type { SignExplanation, RiskScore } from '../src';

export function SignSheet({
  visible,
  peer,
  verify,
  explanation,
  simulating,
  network,
  address,
  raw,
  onReject,
  onSign,
  onReduceApproval,
  signLabel,
  via,
  score,
}: {
  visible: boolean;
  peer: { name: string; url: string; icon?: string } | null;
  verify?: { validation?: 'VALID' | 'INVALID' | 'UNKNOWN'; isScam?: boolean } | null;
  explanation: SignExplanation | null;
  simulating?: boolean;
  network?: string;
  address?: string;
  /** JSON brut (détails techniques repliés). */
  raw?: string;
  onReject: () => void;
  onSign: () => void;
  onReduceApproval?: () => void;
  signLabel?: string;
  /** Demande relayée (extension Kalyx) : nom de l'intermédiaire, sous le vrai site. */
  via?: string;
  /** Score de risque 0-100 (même moteur que l'extension) et ses raisons, de la plus lourde à la plus légère. */
  score?: RiskScore | null;
}) {
  const t = useT();
  const { colors } = useTheme();
  const [showRaw, setShowRaw] = useState(false);
  // Hôte RÉEL (src/domain/web/dappHost) : « a.com@evil.com », « evil.com/@a.com » → evil.com.
  const host = dappHost(peer?.url ?? '');
  const verified = verify?.validation === 'VALID';
  const badDomain = verify?.validation === 'INVALID' || verify?.isScam;
  // Domaine usurpé ou signalé : signer exige le même appui long qu'un risque élevé.
  // Score élevé : comme un danger, signer exige l'appui long (même règle que l'extension).
  const danger = explanation?.risk === 'danger' || !!badDomain || score?.level === 'high';
  const fill = (s: string, p?: Record<string, string>) => (p ? Object.entries(p).reduce((a, [k, v]) => a.split(`{${k}}`).join(v), s) : s);
  const scoreTone = score?.level === 'high' ? 'danger' : score?.level === 'medium' ? 'warning' : 'secondary';

  return (
    <Sheet visible={visible} onClose={onReject}>
      {/* 0. Bandeau rouge si le domaine est faux ou signalé */}
      {badDomain ? (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', backgroundColor: colors.danger, borderRadius: radius.input, padding: space[3] }}>
          <Icon name="alert" size={18} color="#fff" />
          <Text variant="caption" style={{ color: '#fff', flex: 1 }}>{verify?.isScam ? t('domainScam') : t('domainImpersonating')}</Text>
        </View>
      ) : null}

      {/* 1. Qui demande */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        {peer?.icon ? <RemoteIcon uri={peer.icon} label={peer.name ?? '?'} size={44} radius={radius.input} /> : <View style={{ width: 44, height: 44, borderRadius: radius.input, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon name="dapps" size={22} tone="muted" /></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" numberOfLines={1}>{peer?.name ?? t('appGeneric')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="caption" tone={badDomain ? 'danger' : 'secondary'} numberOfLines={1} style={{ flexShrink: 1 }}>{host || t('unknownDomain')}</Text>
            {verified ? <Icon name="check" size={14} color={colors.textSecondary} /> : null}
          </View>
          {via ? <Text variant="micro" tone="tertiary" numberOfLines={1}>{t('wcVia').replace('{name}', via)}</Text> : null}
        </View>
        {address ? <AddressGlyph address={address} size={32} /> : null}
      </View>

      {/* 2. Ce qui va se passer */}
      {explanation ? (
        <View style={{ gap: space[1] }}>
          <Text variant="caption" tone="tertiary">{explanation.title}{network ? ` · ${network}` : ''}</Text>
          <Text variant="title2">{explanation.headline}</Text>
          {explanation.detail ? <Text variant="bodySecondary" tone="secondary">{explanation.detail}</Text> : null}
        </View>
      ) : (
        <View style={{ gap: space[2] }}><Skeleton width="80%" height={22} /><Skeleton width="60%" /></View>
      )}

      {/* 3. Simulation */}
      {simulating ? (
        <Card level={1} style={{ gap: space[2] }}><Skeleton width="50%" /><Skeleton width="40%" /></Card>
      ) : explanation && (explanation.lose.length || explanation.receive.length) ? (
        <Card level={1} padded={false}>
          {explanation.lose.map((l, i) => (
            <View key={`l${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space[3] }}>
              <Text variant="caption" tone="secondary">{t("tcLeaves")}</Text>
              <Text variant="body" tone="down" tabular>− {l}</Text>
            </View>
          ))}
          {explanation.lose.length && explanation.receive.length ? <Divider /> : null}
          {explanation.receive.map((r, i) => (
            <View key={`r${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space[3] }}>
              <Text variant="caption" tone="secondary">{t("youReceive")}</Text>
              <Text variant="body" tone="up" tabular>+ {r}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* 4. Risque */}
      {explanation ? (
        <View style={{ gap: space[2] }}>
          <RiskBadge level={explanation.risk} />
          {explanation.reasons.map((r, i) => (
            <Text key={i} variant="caption" tone={explanation.risk === 'danger' ? 'danger' : explanation.risk === 'warning' ? 'warning' : 'secondary'}>• {r}</Text>
          ))}
          {score && score.factors.length ? (
            <View testID="risk-score" style={{ gap: 2, marginTop: space[1] }}>
              <Text variant="caption" tone={scoreTone}>
                {`${t('rkTitle')} ${t(score.level === 'high' ? 'rkHigh' : score.level === 'medium' ? 'rkMedium' : 'rkLow')} · ${fill(t('rkScore'), { score: String(score.score) })}`}
              </Text>
              {score.factors.slice(0, 3).map((f) => (
                <Text key={f.code} variant="micro" tone="tertiary">• {fill(t(`rk_${f.code}` as 'rk_firstVisit'), f.params)}</Text>
              ))}
            </View>
          ) : null}
          {explanation.canReduceApproval && onReduceApproval ? <Button label={t('reduceToExact')} variant="secondary" size="sm" onPress={onReduceApproval} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
      ) : null}

      {/* 5. Détails techniques repliés */}
      {raw ? (
        <View>
          <KPressable onPress={() => setShowRaw((v) => !v)} hitSlop={8} style={{ paddingVertical: space[1] }} accessibilityLabel={showRaw ? t('hideTechDetails') : t('showTechDetails')}>
            <Text variant="caption" tone="secondary">{showRaw ? t('hideTechDetails') : t('showTechDetails')}</Text>
          </KPressable>
          {showRaw ? (
            <ScrollView style={{ maxHeight: 160 }}>
              <Text variant="micro" tone="tertiary" selectable style={{ fontFamily: undefined }}>{raw}</Text>
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {/* 6. Boutons */}
      {danger ? (
        <View style={{ gap: space[2] }}>
          <Button label={t("deny")} variant="primary" onPress={onReject} />
          <HoldButton label={signLabel ?? t('signAnyway')} danger icon="sign" onComplete={onSign} disabled={!explanation} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label={t("deny")} variant="secondary" style={{ flex: 1 }} onPress={onReject} />
          <Button label={signLabel ?? t("wcSign")} variant="primary" style={{ flex: 1 }} onPress={onSign} disabled={!explanation || !!simulating} />
        </View>
      )}
    </Sheet>
  );
}
