/**
 * Brûler un NFT Solana : ce qui revient (le loyer) et ce que ça coûte (les
 * frais), relevés et SIMULÉS avant le code. Rien ne part sans confirmation.
 */
import { friendlyTxError, UserFacingError } from '../lib/txError';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Sheet, Text, Button, Card, Skeleton } from './kit';
import { ConfirmUnlock } from './ConfirmUnlock';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space } from './tokens';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { isTranslationKey } from '../lib/i18n';
import { planSolBurn, burnSol, type SolBurnPlan } from '../lib/nftBurn';
import { formatTokenAmount } from '../src';

const sol = (lamports: bigint) => formatTokenAmount(lamports, 9);

/** Erreur de préparation : clé traduite si c'en est une, sinon la traduction commune. */
function reason(err: unknown, t: ReturnType<typeof useT>): string {
  const key = err instanceof Error ? err.message : '';
  return key.startsWith('nftBurn') && isTranslationKey(key) ? t(key as never) : friendlyTxError(err, t);
}

export function SolNftBurnSheet({ mint, name, onClose, onBurned }: { mint: string; name: string; onClose: () => void; onBurned: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const [plan, setPlan] = useState<SolBurnPlan | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    planSolBurn(mint).then(
      (p) => alive && setPlan(p),
      (e) => alive && setError(reason(e, t)),
    );
    return () => {
      alive = false;
    };
  }, [mint]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet visible onClose={onClose}>
      <Text variant="title2">{t('nftBurnTitle')}</Text>
      <Text variant="bodySecondary" tone="secondary" numberOfLines={2}>{name}</Text>
      {error ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Icon name="alert" size={18} color={colors.danger} />
          <Text variant="caption" tone="danger" style={{ flex: 1 }}>{error}</Text>
        </View>
      ) : !plan ? (
        <Skeleton height={96} />
      ) : (
        <>
          <Card style={{ gap: space[2] }}>
            <Text variant="caption" tone="secondary">{t('nftBurnRecover')}</Text>
            <Text variant="bodyStrong" tabular>+{sol(plan.rentLamports)} SOL</Text>
            <Text variant="caption" tone="secondary">{t('labelNetworkFee')} · ≈ {sol(plan.feeLamports)} SOL</Text>
            <Text variant="caption" tone="tertiary">{t('tcSimulated')}</Text>
          </Card>
          <Text variant="caption" tone="secondary">{t('nftBurnBody')}</Text>
          <Button label={t('nftBurnConfirm')} variant="destructive" onPress={() => setConfirming(true)} />
        </>
      )}
      <Button label={t('back')} variant="secondary" onPress={onClose} />
      <ConfirmUnlock
        visible={confirming}
        title={t('nftBurnTitle')}
        subtitle={name}
        perform={async (unlock) => {
          try {
            await burnSol(plan!, unlock);
          } catch (err) {
            throw err instanceof Error && !(err as { code?: string }).code && isTranslationKey(err.message) ? new UserFacingError(t(err.message as never)) : err;
          }
          haptic.success();
          toast.success(t('nftBurnDone').replace('{amount}', sol(plan!.rentLamports)));
          onBurned();
        }}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}
