/**
 * Staking liquide TON (Tonstakers) : déposer ou retirer, avec le bilan ÉMULÉ
 * avant le code — ce qui sort, ce qui revient, les frais réels.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Sheet, Text, Button, Input, Surface, SegmentedControl } from './kit';
import { ConfirmUnlock } from './ConfirmUnlock';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space } from './tokens';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { UserFacingError } from '../lib/txError';
import { usePortfolioStore } from '../lib/portfolio';
import { planStake, planUnstake, sendStaking, type StakingInfo } from '../lib/ton/staking';
import { TONSTAKERS_STAKE_RESERVE, TONSTAKERS_UNSTAKE_TON, type UnstakeMode } from '../src/domain/chains/ton/tonstakers';
import type { DappDraft } from '../src/domain/chains/v2/TonAdapterV2';
import { formatAmount, formatTokenAmount, parseAmount } from '../src';

export function TonStakingSheet({ info, action, onClose, onDone }: { info: StakingInfo; action: 'stake' | 'unstake'; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<UnstakeMode>('standard');
  const [draft, setDraft] = useState<DappDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const stake = action === 'stake';
  const rate = info.tsTonInTon ?? 0;

  let raw = 0n;
  try {
    raw = amount ? parseAmount(amount, 9).raw : 0n;
  } catch {
    raw = 0n;
  }
  const n = Number(amount) || 0;
  const receive = rate > 0 && n > 0 ? (stake ? `${(n / rate).toFixed(4)} tsTON` : `${(n * rate).toFixed(4)} TON`) : null;
  const max = stake
    ? info.tonBalance > TONSTAKERS_STAKE_RESERVE + 50_000_000n ? info.tonBalance - TONSTAKERS_STAKE_RESERVE - 50_000_000n : 0n
    : info.tsTon?.raw ?? 0n;

  const review = async () => {
    setBusy(true);
    try {
      setDraft(stake ? await planStake(info, raw) : await planUnstake(info, raw, mode));
    } catch (e) {
      const key = e instanceof Error ? e.message : '';
      toast.error(stake ? t('stkStake') : t('stkUnstake'), /^(stake|unstake)/.test(key) ? t(key as never) : key);
    } finally {
      setBusy(false);
    }
  };
  const e = draft?.emulation ?? null;

  return (
    <Sheet visible onClose={onClose}>
      <Text variant="title2">{stake ? t('stkStake') : t('stkUnstake')} · Tonstakers</Text>
      {!draft ? (
        <>
          <Input value={amount} onChangeText={setAmount} placeholder={stake ? t('stkAmountTon') : t('stkAmountTs')} keyboardType="decimal-pad" />
          <Button label={`${t('stkMax')} · ${formatTokenAmount(max, 9)} ${stake ? 'TON' : 'tsTON'}`} variant="secondary" onPress={() => setAmount(formatAmount(max, 9))} />
          {receive ? <Text variant="body">{t('stkReceive').replace('{amount}', receive)}</Text> : null}
          {stake ? (
            <Text variant="caption" tone="secondary">{t('stkReserve')}</Text>
          ) : (
            <>
              <SegmentedControl<UnstakeMode>
                items={[{ key: 'standard', label: t('stkModeStandard') }, { key: 'instant', label: t('stkModeInstant') }, { key: 'bestRate', label: t('stkModeBest') }]}
                value={mode}
                onChange={setMode}
              />
              <Text variant="caption" tone="secondary">
                {t(mode === 'standard' ? 'stkModeStandardHelp' : mode === 'instant' ? 'stkModeInstantHelp' : 'stkModeBestHelp')}
              </Text>
            </>
          )}
          <Button label={t('next')} loading={busy} disabled={raw <= 0n} onPress={review} />
        </>
      ) : (
        <>
          <Surface style={{ gap: space[2] }}>
            <Text variant="caption" tone="secondary">{t('tcLeaves')}</Text>
            <Text variant="body" tabular>{formatTokenAmount(e ? e.risk.ton : stake ? raw + TONSTAKERS_STAKE_RESERVE : TONSTAKERS_UNSTAKE_TON, 9)} TON</Text>
            {e?.risk.jettons.map((j, i) => <Text key={i} variant="body" tabular>{formatTokenAmount(j.amount, j.decimals)} {j.symbol}</Text>)}
            {receive ? <Text variant="body">{t('stkReceive').replace('{amount}', receive)}</Text> : null}
            {e ? <Text variant="caption" tone="secondary">{t('labelNetworkFee')} · {formatTokenAmount(e.fee, 9)} TON</Text> : null}
            <Text variant="caption" tone="tertiary">{e ? t('tcSimulated') : t('tcNoSimulation')}</Text>
          </Surface>
          {e?.failed ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Icon name="alert" size={18} color={colors.danger} />
              <Text variant="caption" tone="danger" style={{ flex: 1 }}>{t('tcWillFail')}</Text>
            </View>
          ) : null}
          <Button label={stake ? t('stkStake') : t('stkUnstake')} disabled={!!e?.failed} onPress={() => setConfirming(true)} />
          <Button label={t('back')} variant="secondary" onPress={() => setDraft(null)} />
        </>
      )}
      <ConfirmUnlock
        visible={confirming}
        title={`${stake ? t('stkStake') : t('stkUnstake')} · Tonstakers`}
        subtitle={`${amount} ${stake ? 'TON' : 'tsTON'}`}
        perform={async (unlock) => {
          try {
            await sendStaking(info.chainId, draft!, unlock);
          } catch (err) {
            throw err instanceof Error && !(err as { code?: string }).code ? new UserFacingError(err.message) : err;
          }
          usePortfolioStore.getState().invalidate();
          haptic.success();
          toast.success(t('txSent'));
          onDone();
        }}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}
