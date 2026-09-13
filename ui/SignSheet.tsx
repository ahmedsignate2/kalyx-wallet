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
import React, { useState } from 'react';
import { View, ScrollView, Image } from 'react-native';
import { Text, Button, HoldButton, Surface, Divider, RiskBadge, AddressGlyph, Sheet, Skeleton, Pressable } from './kit';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space, radius } from './tokens';
import type { SignExplanation } from '../src';

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
}) {
  const t = useT();
  const { colors } = useTheme();
  const [showRaw, setShowRaw] = useState(false);
  const host = peer?.url ? peer.url.replace(/^[a-z]+:\/\//i, '').split('/')[0] : '';
  const danger = explanation?.risk === 'danger';
  const verified = verify?.validation === 'VALID';
  const badDomain = verify?.validation === 'INVALID' || verify?.isScam;

  return (
    <Sheet visible={visible} onClose={onReject}>
      {/* 0. Bandeau rouge si le domaine est faux ou signalé */}
      {badDomain ? (
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center', backgroundColor: colors.danger, borderRadius: radius.input, padding: space[3] }}>
          <Icon name="alert" size={18} color="#fff" />
          <Text variant="caption" style={{ color: '#fff', flex: 1 }}>{verify?.isScam ? 'Site signalé comme frauduleux. Refuse.' : 'Ce site n’est pas celui qu’il prétend être. Refuse.'}</Text>
        </View>
      ) : null}

      {/* 1. Qui demande */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        {peer?.icon ? <Image source={{ uri: peer.icon }} style={{ width: 44, height: 44, borderRadius: radius.input, backgroundColor: colors.surface3 }} /> : <View style={{ width: 44, height: 44, borderRadius: radius.input, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon name="dapps" size={22} tone="muted" /></View>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" numberOfLines={1}>{peer?.name ?? 'Application'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="caption" tone={badDomain ? 'danger' : 'secondary'} numberOfLines={1} style={{ flexShrink: 1 }}>{host || 'domaine inconnu'}</Text>
            {verified ? <Icon name="check" size={14} color={colors.textSecondary} /> : null}
          </View>
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
        <Surface level={1} style={{ gap: space[2] }}><Skeleton width="50%" /><Skeleton width="40%" /></Surface>
      ) : explanation && (explanation.lose.length || explanation.receive.length) ? (
        <Surface level={1} padded={false}>
          {explanation.lose.map((l, i) => (
            <View key={`l${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space[3] }}>
              <Text variant="caption" tone="secondary">Tu perds</Text>
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
        </Surface>
      ) : null}

      {/* 4. Risque */}
      {explanation ? (
        <View style={{ gap: space[2] }}>
          <RiskBadge level={explanation.risk} />
          {explanation.reasons.map((r, i) => (
            <Text key={i} variant="caption" tone={explanation.risk === 'danger' ? 'danger' : explanation.risk === 'warning' ? 'warning' : 'secondary'}>• {r}</Text>
          ))}
          {explanation.canReduceApproval && onReduceApproval ? <Button label="Réduire au montant exact" variant="secondary" size="sm" onPress={onReduceApproval} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
      ) : null}

      {/* 5. Détails techniques repliés */}
      {raw ? (
        <View>
          <Pressable onPress={() => setShowRaw((v) => !v)} style={{ paddingVertical: space[1] }}>
            <Text variant="caption" tone="secondary">{showRaw ? 'Masquer les données techniques' : 'Voir les données techniques'}</Text>
          </Pressable>
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
          <HoldButton label={signLabel ?? 'Signer quand même'} danger icon="sign" onComplete={onSign} disabled={!explanation} />
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
