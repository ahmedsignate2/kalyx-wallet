/**
 * ExplainSheet — « Comprendre X » (§ retours) : une bottom sheet qui demande au
 * Copilot une explication simple (3 points) d'un token ou d'un réseau.
 * Sans clé API : invite à l'ajouter. Squelette pendant la génération.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Text, Button, Sheet, Skeleton, TokenIcon } from '../../ui/kit';
import { Icon } from '../../ui/icon';
import { useTheme } from '../../ui/theme';
import { space } from '../../ui/tokens';
import { askAi } from '../../lib/aiAsk';
import { useAiStore } from '../../lib/aiStore';
import { useT, useSettings } from '../../lib/settingsStore';

export function ExplainSheet({ visible, onClose, subject }: { visible: boolean; onClose: () => void; subject: { kind: 'token' | 'network'; name: string; symbol?: string; logo?: string; seed?: string } | null }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useSettings((s) => s.language);
  const enabled = useAiStore((s) => s.isEnabled);
  const [state, setState] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false });

  useEffect(() => {
    if (!visible || !subject) return;
    let alive = true;
    setState({ loading: true });
    const prompt =
      subject.kind === 'token'
        ? `Explique très simplement l'utilité, les fondamentaux et les risques de ${subject.name}${subject.symbol ? ` (${subject.symbol})` : ''} en 3 points concis, en langue ${language || 'fr'}, pour un débutant.`
        : `Explique très simplement ce qu'est le réseau ${subject.name} (à quoi il sert, ses avantages, ses risques et frais typiques) en 3 points concis, en langue ${language || 'fr'}, pour un débutant.`;
    askAi(prompt).then((r) => {
      if (!alive) return;
      setState('error' in r ? { loading: false, error: r.error } : { loading: false, text: r.text });
    });
    return () => {
      alive = false;
    };
  }, [visible, subject?.name, subject?.kind, language]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        {subject ? <TokenIcon symbol={subject.symbol ?? subject.name} logo={subject.logo} seed={subject.seed ?? subject.name} size={40} /> : null}
        <View style={{ flex: 1 }}>
          <Text variant="title2" numberOfLines={1}>{t('aiExplainTitle').replace('{name}', subject?.name ?? '')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="sparkles" size={12} tone="muted" />
            <Text variant="caption" tone="secondary">{t('aiDisclaimer')}</Text>
          </View>
        </View>
      </View>
      {state.loading ? (
        <View style={{ gap: space[2] }}><Skeleton width="95%" /><Skeleton width="88%" /><Skeleton width="70%" /><Skeleton width="92%" /><Skeleton width="60%" /></View>
      ) : state.error ? (
        <View style={{ gap: space[3] }}>
          <Text variant="bodySecondary" tone={enabled ? 'danger' : 'secondary'}>{state.error}</Text>
          {!enabled ? <Button label={t('aiAddApiKey')} variant="secondary" size="md" onPress={() => { onClose(); router.push('/ai-settings'); }} /> : null}
        </View>
      ) : (
        <Text variant="body" style={{ lineHeight: 24 }}>{state.text}</Text>
      )}
      <Button label={t('aiClose')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
