/**
 * Envoi d'un NFT TON : destinataire (adresse ou nom .ton), commentaire
 * facultatif, puis le bilan ÉMULÉ — le NFT qui part, les frais — avant le code.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Sheet, Text, Button, Input, Surface } from './kit';
import { ConfirmUnlock } from './ConfirmUnlock';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space } from './tokens';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { UserFacingError } from '../lib/txError';
import { planNftSend, sendNft, type NftSendPlan } from '../lib/ton/nftSend';
import { formatTokenAmount, shortAddress } from '../src';

export function TonNftSendSheet({ chainId, nftAddress, name, onClose, onSent }: { chainId: string; nftAddress: string; name: string; onClose: () => void; onSent: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const [recipient, setRecipient] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<NftSendPlan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const e = plan?.draft.emulation ?? null;

  const review = async () => {
    setBusy(true);
    try {
      setPlan(await planNftSend({ chainId, nftAddress, recipient, comment }));
    } catch (err) {
      const key = err instanceof Error ? err.message : '';
      toast.error(t('nftSendTitle'), key.startsWith('nftSend') ? t(key as never) : key);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose}>
      <Text variant="title2">{t('nftSendTitle')}</Text>
      <Text variant="bodySecondary" tone="secondary" numberOfLines={2}>{name}</Text>
      {!plan ? (
        <>
          <Input value={recipient} onChangeText={setRecipient} placeholder={t('nftSendTo')} autoCapitalize="none" autoCorrect={false} />
          <Button label={t('paste')} variant="secondary" onPress={async () => setRecipient((await Clipboard.getStringAsync()).trim())} />
          <Input value={comment} onChangeText={setComment} placeholder={t('nftSendComment')} />
          <Button label={t('next')} loading={busy} disabled={!recipient.trim()} onPress={review} />
        </>
      ) : (
        <>
          <Surface style={{ gap: space[2] }}>
            <Text variant="caption" tone="secondary">{t('nftSendRecipient')}</Text>
            <Text variant="body">{plan.name ? `${plan.name} · ${shortAddress(plan.to)}` : shortAddress(plan.to)}</Text>
            <Text variant="caption" tone="secondary">{t('tcLeaves')}</Text>
            <Text variant="body">{e ? t('tcNfts').replace('{count}', String(e.risk.nfts || 1)) : '1 NFT'}</Text>
            {e ? <Text variant="caption" tone="secondary">{t('labelNetworkFee')} · {formatTokenAmount(e.fee, 9)} TON</Text> : null}
            <Text variant="caption" tone="tertiary">{e ? t('tcSimulated') : t('tcNoSimulation')}</Text>
          </Surface>
          {e?.failed ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Icon name="alert" size={18} color={colors.danger} />
              <Text variant="caption" tone="danger" style={{ flex: 1 }}>{t('tcWillFail')}</Text>
            </View>
          ) : null}
          <Button label={t('actionSend')} disabled={!!e?.failed} onPress={() => setConfirming(true)} />
          <Button label={t('back')} variant="secondary" onPress={() => setPlan(null)} />
        </>
      )}
      <ConfirmUnlock
        visible={confirming}
        title={t('nftSendTitle')}
        subtitle={name}
        perform={async (unlock) => {
          try {
            await sendNft(plan!, unlock);
          } catch (err) {
            throw err instanceof Error && !(err as { code?: string }).code ? new UserFacingError(err.message) : err;
          }
          haptic.success();
          toast.success(t('txSent'));
          onSent();
        }}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}
