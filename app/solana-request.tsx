/**
 * Requête de transaction Solana Pay.
 *
 * Ce qu'on signe ici vient d'un SERVEUR, pas de nous. C'est toute la différence
 * avec l'écran d'envoi : là-bas on construit la transaction et on sait donc ce
 * qu'elle fait ; ici on la reçoit. L'écran doit donc la DÉCODER et montrer ce
 * qu'elle fait avant de proposer de signer, et refuser tout ce qui ne tient pas
 * debout — payeur qui n'est pas nous, signature d'un tiers exigée.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Surface, ListRow, IconButton, Skeleton, EmptyState } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import {
  fetchTxRequestIdentity,
  fetchTxRequestPayload,
  checkTxRequest,
  describeSolanaTransaction,
  shortAddress,
  type TxRequestIdentity,
  type SolanaTxDescription,
  type TxRequestRefusal,
} from '../src';

export default function SolanaRequestScreen() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string }>();
  const url = params.url ? String(params.url) : '';

  const account = useWallet((s) => s.account);
  const signSolanaTransaction = useWallet((s) => s.signSolanaTransaction);

  const [identity, setIdentity] = useState<TxRequestIdentity | null>(null);
  const [description, setDescription] = useState<SolanaTxDescription | null>(null);
  const [transaction, setTransaction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/home')), []);

  /** Message d'un refus, depuis son code. */
  const refusalText = useCallback(
    (reason?: TxRequestRefusal) => {
      switch (reason) {
        case 'UNREADABLE':
          return t('solReqUnreadable');
        case 'NO_FEE_PAYER':
          return t('solReqNoFeePayer');
        case 'NOT_YOUR_ACCOUNT':
          return t('solReqNotYourAccount');
        case 'THIRD_PARTY_PENDING':
          return t('solReqThirdParty');
        default:
          return t('solReqFailed');
      }
    },
    [t],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const me = account?.address ?? '';
      if (!url || !me) {
        setError(t('solReqUnavailable'));
        setLoading(false);
        return;
      }

      // 1. QUI demande. Rien de l'utilisateur ne sort à cette étape.
      const who = await fetchTxRequestIdentity(url);
      if (!alive) return;
      setIdentity(who);

      // 2. La transaction. C'est ici, et seulement ici, que l'adresse sort.
      const payload = await fetchTxRequestPayload(url, me);
      if (!alive) return;
      if (!payload) {
        setError(t('solReqFailed'));
        setLoading(false);
        return;
      }

      // 3. DÉCODER avant de montrer. Une transaction qu'on ne sait pas lire
      //    n'est pas une transaction qu'on propose de signer.
      const desc = describeSolanaTransaction(payload.transaction, me);
      const check = checkTxRequest(desc, me);
      if (!check.ok) {
        /*
         * LA TRADUCTION SE FAIT ICI, à partir d'un code. Le contrôle portait ses
         * refus en français dans le domaine : ils sortaient en français quelle
         * que soit la langue choisie. Même faute que dans le magasin de Pay.
         */
        setError(refusalText(check.reason));
        setLoading(false);
        return;
      }

      setDescription(desc);
      setTransaction(payload.transaction);
      setMessage(payload.message ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, account?.address]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: SCREEN_MARGIN,
          height: insets.top + 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
        }}
      >
        <IconButton icon="back" label={t('back')} tone="ghost" onPress={close} />
        <Text variant="title2">{t('qrSolanaTxRequest')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SCREEN_MARGIN, gap: space[4], paddingBottom: insets.bottom + space[6] }}
      >
        {loading ? (
          <Surface>
            <View style={{ gap: space[2] }}>
              <Skeleton width="55%" />
              <Skeleton width="80%" height={12} />
            </View>
          </Surface>
        ) : null}

        {error ? (
          <Surface>
            <EmptyState icon="warning" title={t('solReqRefused')} body={error} actionLabel={t('back')} onAction={close} />
          </Surface>
        ) : null}

        {!loading && !error ? (
          <>
            <Surface>
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">{t('payMerchant')}</Text>
                <Text variant="title2">{identity?.label ?? t('solReqUnknownMerchant')}</Text>
                {message ? <Text variant="body" tone="secondary">{message}</Text> : null}
              </View>
            </Surface>

            {/* CE QUE LA TRANSACTION FAIT, décodé par nous et non annoncé par le serveur. */}
            <Surface padded={false}>
              <ListRow title={t('solReqAction')} subtitle={description?.action ?? '—'} />
              <ListRow
                title={t('solReqPrograms')}
                subtitle={description?.known.length ? description.known.join(', ') : t('solReqUnknownPrograms')}
              />
              <ListRow title={t('solReqInstructions')} subtitle={String(description?.instructions ?? 0)} />
              <ListRow title={t('solReqFeePayer')} subtitle={shortAddress(description?.feePayer ?? '')} />
            </Surface>

            {/*
              Programmes non reconnus : on le DIT au lieu d'afficher une liste
              vide qui laisserait croire que la transaction ne fait rien.
            */}
            {description && description.known.length < description.programs.length ? (
              <Text variant="caption" tone="warning">{t('solReqUnknownWarning')}</Text>
            ) : null}

            <Button label={t('sign')} onPress={() => setAsking(true)} disabled={!transaction} />
          </>
        ) : null}
      </ScrollView>

      <ConfirmUnlock
        visible={asking}
        title={t('qrSolanaTxRequest')}
        subtitle={identity?.label}
        perform={async (unlock) => {
          if (!transaction) throw new Error(t('solReqFailed'));
          await signSolanaTransaction(unlock, transaction);
          toast.success(t('sign'));
        }}
        onDone={() => {
          setAsking(false);
          close();
        }}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}
