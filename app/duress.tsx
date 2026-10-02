/**
 * CODE DE CONTRAINTE (Sécurité → Code de contrainte).
 * Logique : walletStore (setupDuress, removeDuress, unlockWithPin) et lib/sessionMode.ts.
 *
 * En session leurre, cet écran se présente comme « non configuré » (hasDuress
 * faux) : rien ne trahit l'existence du vrai réglage.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Input, ScreenHeader, Text } from '../ui/kit';
import { NovaCard, NovaHero } from '../ui/nova';
import { PremiumScreen } from '../ui/premium';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { spacing } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { friendlyTxError } from '../lib/txError';
import { useWallet, type Unlock } from '../lib/walletStore';
import { isWalletError } from '../src';
import type { StoredAccount } from '../lib/secureStore';

export default function DuressScreen() {
  const t = useT();
  const w = useWallet.getState();
  const [active, setActive] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [mainPin, setMainPin] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askRemove, setAskRemove] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const refresh = async () => {
    const on = await useWallet.getState().hasDuress();
    setActive(on);
    setAccounts(on ? await useWallet.getState().duressAccounts() : []);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const onSetup = async () => {
    setError(null);
    if (pin1 !== pin2) return setError(t('duressErrMismatch'));
    if (pin1 === mainPin) return setError(t('duressErrSame'));
    if (pin1.length !== mainPin.length) return setError(t('duressErrLength'));
    setBusy(true);
    try {
      await w.setupDuress(mainPin, pin1);
      setMainPin('');
      setPin1('');
      setPin2('');
      setReplacing(false);
      toast.success(t('duressTitle'), t('duressDone'));
      await refresh();
    } catch (e) {
      const msg = isWalletError(e) ? e.message : '';
      setError(msg === 'duress.SAME_AS_MAIN' ? t('duressErrSame') : msg === 'duress.LENGTH' ? t('duressErrLength') : friendlyTxError(e, t as never));
    } finally {
      setBusy(false);
    }
  };

  const pinInput = (value: string, set: (v: string) => void, ph: string) => (
    <Input value={value} onChangeText={(v) => set(v.replace(/\D/g, '').slice(0, 12))} placeholder={ph} keyboardType="number-pad" secureTextEntry />
  );

  return (
    <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="security" title={t('duressTitle')} subtitle={t('duressHint')} />
      {active && !replacing ? (
        <>
          <NovaCard delay={80} style={{ gap: spacing(1) }}>
            <Text variant="body">{t('duressActive')}</Text>
            <Text variant="caption" tone="secondary">{t('duressFund')}</Text>
            {accounts[0] ? (
              <View style={{ gap: 4 }}>
                {[
                  ['EVM', accounts[0].evmAddress],
                  ['Bitcoin', accounts[0].btcAddress],
                  ['Solana', accounts[0].solAddress ?? ''],
                ]
                  .filter(([, a]) => !!a)
                  .map(([k, a]) => (
                    <Text key={k} variant="caption" selectable numberOfLines={1} ellipsizeMode="middle">
                      {k} · {a}
                    </Text>
                  ))}
              </View>
            ) : null}
          </NovaCard>
          <Button label={t('duressReplace')} variant="secondary" onPress={() => setReplacing(true)} />
          <Button label={t('duressRemove')} variant="ghost" onPress={() => setAskRemove(true)} />
        </>
      ) : active === null ? null : (
        <NovaCard delay={80} style={{ gap: spacing(1.5) }}>
          {pinInput(mainPin, setMainPin, t('duressMainPin'))}
          {pinInput(pin1, setPin1, t('duressNewPin'))}
          {pinInput(pin2, setPin2, t('duressConfirmPin'))}
          {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
          <Button label={t('duressSetup')} icon="security" loading={busy} disabled={mainPin.length < 6 || pin1.length < 6 || pin2.length < 6} onPress={() => void onSetup()} />
        </NovaCard>
      )}
      <ConfirmUnlock
        visible={askRemove}
        title={t('duressRemoveConfirm')}
        perform={async (unlock: Unlock) => {
          await useWallet.getState().removeDuress(unlock);
          await refresh();
        }}
        onDone={() => setAskRemove(false)}
        onCancel={() => setAskRemove(false)}
      />
    </PremiumScreen>
  );
}
