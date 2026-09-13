/**
 * BridgeProgress (§4.5) — frise de progression d'un bridge : Départ → Pont →
 * Arrivée, alimentée par le statut LI.FI (toutes les 10 s). Remplace l'ancien
 * BridgeTrackerModal. On peut quitter : la notification suit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Text, Button, Surface, Sheet, Divider } from './kit';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space, radius } from './tokens';
import { getAdapter } from '../src';
import { useT } from '../lib/settingsStore';

type Stage = 'departure' | 'bridging' | 'arrived' | 'failed';

export function BridgeProgress({ visible, hash, summary, fromChainId, toChainId, onClose }: { visible: boolean; hash?: string; summary?: string; fromChainId?: string; toChainId?: string; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const [stage, setStage] = useState<Stage>('departure');
  const [destHash, setDestHash] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const from = fromChainId ? getAdapter(fromChainId).config : null;
  const to = toChainId ? getAdapter(toChainId).config : null;

  useEffect(() => {
    if (!visible || !hash || !from || !to) return;
    setStage('departure');
    setDestHash(null);
    const key = (c: typeof from) => (c.family === 'solana' ? 'SOL' : String(c.evmChainId ?? c.lifiKey));
    const check = async () => {
      try {
        const res = await fetch(`https://li.quest/v1/status?txHash=${hash}&fromChain=${key(from)}&toChain=${key(to)}`);
        const d = (await res.json()) as { status?: string; substatus?: string; receiving?: { txHash?: string } };
        if (d.status === 'PENDING') setStage('bridging');
        if (d.status === 'DONE') { setStage('arrived'); setDestHash(d.receiving?.txHash ?? null); }
        if (d.status === 'FAILED') setStage('failed');
        if (d.status === 'DONE' || d.status === 'FAILED') { if (timer.current) clearInterval(timer.current); }
      } catch { /* on réessaie */ }
    };
    timer.current = setInterval(check, 10_000);
    void check();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [visible, hash, fromChainId, toChainId]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps: { key: Stage; label: string }[] = [
    { key: 'departure', label: `Départ · ${from?.name ?? ''}` },
    { key: 'bridging', label: 'Pont en cours' },
    { key: 'arrived', label: `Arrivée · ${to?.name ?? ''}` },
  ];
  const reached = stage === 'failed' ? 2 : steps.findIndex((s) => s.key === stage) + 1;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text variant="title2">{stage === 'arrived' ? t('bridgeCompleted') : stage === 'failed' ? t('bridgeFailed') : t('bridgeInProgress')}</Text>
      {summary ? <Text variant="bodySecondary" tone="secondary">{summary}</Text> : null}
      <Surface style={{ gap: space[3] }}>
        {steps.map((s, i) => {
          const done = i < reached;
          const failedHere = stage === 'failed' && i === 1;
          return (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ width: 24, height: 24, borderRadius: radius.round, backgroundColor: done && !failedHere ? colors.primary : colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
                {failedHere ? <Icon name="close" size={14} color={colors.danger} /> : done ? <Icon name="checkmark" size={14} color={colors.onPrimary} /> : null}
              </View>
              <Text variant="body" style={{ color: failedHere ? colors.danger : done ? colors.text : colors.textTertiary }}>{failedHere ? t('bridgeFailed') : s.label}{i === reached - 1 && stage !== 'arrived' && !failedHere ? '…' : ''}</Text>
            </View>
          );
        })}
      </Surface>
      <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t('bridgeDurationHint')}</Text>
      {from?.explorerUrl && hash ? <Button label={t('sourceTransaction')} variant="secondary" size="md" onPress={() => router.push({ pathname: '/browser', params: { url: `${from.explorerUrl}/tx/${hash}` } })} /> : null}
      {to?.explorerUrl && destHash ? <Button label={t('destinationTransaction')} variant="secondary" size="md" onPress={() => router.push({ pathname: '/browser', params: { url: `${to.explorerUrl}/tx/${destHash}` } })} /> : null}
      <Divider />
      <Button label={stage === 'arrived' || stage === 'failed' ? t('done') : t('continueInBackground')} onPress={onClose} />
    </Sheet>
  );
}
