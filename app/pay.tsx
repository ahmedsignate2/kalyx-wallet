/**
 * Paiement marchand (WalletConnect Pay).
 *
 * Trois temps visibles : on montre CE QU'ON PAIE et À QUI avant tout, on laisse
 * choisir avec quel actif, puis on signe. Le formulaire de capture de données
 * — exigé par la réglementation sur certaines options — est HÉBERGÉ et affiché
 * dans une WebView : ses champs évoluent sans nous prévenir, et une copie
 * native empêcherait de payer le jour où elle diverge.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { Text, Button, Surface, ListRow, IconButton, Skeleton, EmptyState, Chip } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { usePay, type PayOption } from '../lib/walletconnectPay';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { formatTokenAmount } from '../src';

/** Domaines autorisés dans la WebView de capture. */
const COLLECT_HOST = 'pay.walletconnect.com';

export default function PayScreen() {
  const t = useT();
  // `mode` sert à accorder le formulaire hébergé au thème actif de l'app.
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ link?: string }>();

  const { phase, options, selected, collectUrl, result, failure, detail, open, select, collected, confirm, reset } =
    usePay();

  /*
   * LA TRADUCTION SE FAIT ICI, à partir d'un code. Le magasin portait des
   * phrases en français en dur : elles sortaient telles quelles à l'écran
   * quelle que soit la langue, alors que les clés existaient déjà.
   */
  const failureTitle =
    failure === 'NO_OPTION'
      ? detail === 'expired'
        ? t('payExpiredTitle')
        : detail === 'succeeded'
          ? t('payAlreadyPaidTitle')
          : t('payNoOptionTitle')
      : failure === 'UNAVAILABLE'
        ? t('payUnavailable')
        : failure === 'INFO_NOT_ENOUGH'
          ? t('payInfoSentTitle')
          : t('payFailed');
  const failureBody = (() => {
    switch (failure) {
      case 'UNAVAILABLE':
        return t('payUnavailableBody');
      case 'NO_EVM_ACCOUNT':
        return t('payNoEvmAccount');
      case 'NO_OPTION':
        /*
         * Zéro option a plusieurs causes, et elles n'ont rien à voir. Le statut
         * de la demande, quand le service le donne, tranche : expirée ou déjà
         * réglée, ce n'est pas une question de solde — et laisser croire le
         * contraire envoie l'utilisateur chercher un problème inexistant.
         */
        if (detail === 'expired') return t('payExpired');
        if (detail === 'succeeded') return t('payAlreadyPaid');
        /*
         * On NE SAIT PAS si l'utilisateur ne détient aucun jeton accepté ou s'il
         * n'en a pas assez pour le montant demandé : le service ne le dit pas.
         * Affirmer « tu n'en as aucun » serait faux dans le second cas — et
         * c'est précisément ce que disait la version précédente à quelqu'un qui
         * avait de l'USDC sur Base. On montre donc le MONTANT DEMANDÉ et on
         * laisse l'utilisateur juger.
         */
        return options?.info
          ? `${t('payRequested')} ${formatTokenAmount(BigInt(options.info.amount.value || '0'), options.info.amount.display.decimals)} ${options.info.amount.display.assetSymbol}. ${t('payNoOptionBody')}`
          : t('payNoOptionBody');
      case 'INFO_REQUIRED':
        return t('payInfoRequiredBody');
      /*
       * Les informations SONT parties. Le dire explicitement évite de laisser
       * croire que la saisie a échoué — et c'est l'état qui remplace la boucle
       * où le même formulaire revenait sans fin.
       */
      case 'INFO_NOT_ENOUGH':
        return t('payInfoSentBody');
      case 'ACTION_REFUSED':
        return `${t('payActionRefused')}${detail ? ` (${detail})` : ''}`;
      case 'FAILED':
        return detail ?? t('payFailedBody');
      default:
        return undefined;
    }
  })();
  /*
   * Un CONSTAT, pas une panne : ni « rien pour payer » ni « informations
   * envoyées » ne signalent une erreur de l'app ou de l'utilisateur. Un triangle
   * d'alerte ferait chercher un problème là où le service se contente de dire
   * qu'il n'a rien à proposer.
   */
  const stating = failure === 'NO_OPTION' || failure === 'INFO_NOT_ENOUGH';
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const link = params.link ? String(params.link) : '';
    if (link) void open(link);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.link]);

  const info = options?.info;
  const expiresIn = useMemo(() => {
    if (!info?.expiresAt) return null;
    const left = info.expiresAt * 1000 - Date.now();
    return left > 0 ? Math.round(left / 1000) : 0;
  }, [info?.expiresAt]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  /* ── Capture de données : formulaire hébergé ───────────────────────────── */
  if (collectUrl) {
    const onMessage = (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data) as { type?: string; error?: string };
        if (data.type === 'IC_COMPLETE') collected();
        else if (data.type === 'IC_ERROR') toast.error(t('payFailed'), data.error);
      } catch {
        // Message non JSON : ignoré, le formulaire en émet d'autres.
      }
    };
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_MARGIN, height: 48 }}>
          <IconButton icon="back" label={t('back')} tone="ghost" onPress={close} />
        </View>
        <WebView
          source={{ uri: collectUrl }}
          onMessage={onMessage}
          /*
           * Les liens externes (CGU, confidentialité) partent dans le
           * navigateur système : les suivre dans cette WebView sortirait
           * l'utilisateur du formulaire sans moyen d'y revenir.
           */
          onShouldStartLoadWithRequest={(req) => {
            if (!req.url.startsWith('https://')) return false;
            const host = req.url.slice('https://'.length).split(/[/?#]/)[0].toLowerCase();
            if (host === COLLECT_HOST || host.endsWith(`.${COLLECT_HOST}`)) return true;
            void Linking.openURL(req.url);
            return false;
          }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
        />
      </View>
    );
  }

  /* ── Choix de l'option et confirmation ─────────────────────────────────── */
  const renderOption = (o: PayOption) => {
    const active = selected?.id === o.id;
    const amount = formatTokenAmount(BigInt(o.amount.value || '0'), o.amount.display.decimals);
    return (
      <ListRow
        key={o.id}
        title={`${amount} ${o.amount.display.assetSymbol}`}
        subtitle={[o.amount.display.networkName, o.etaS ? `~${o.etaS}s` : null].filter(Boolean).join(' · ')}
        right={
          o.collectData ? (
            <Chip label={t('payInfoRequired')} selected={false} onPress={() => select(o, mode === 'light' ? 'light' : 'dark')} />
          ) : (
            <Text variant="caption" tone={active ? 'primary' : 'secondary'}>{active ? '✓' : ''}</Text>
          )
        }
        onPress={() => select(o, mode === 'light' ? 'light' : 'dark')}
      />
    );
  };

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
        <Text variant="title2">{t('qrPayTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, gap: space[4], paddingBottom: insets.bottom + space[6] }}>
        {phase === 'loading' ? (
          <Surface><View style={{ gap: space[2] }}><Skeleton width="60%" /><Skeleton width="40%" height={12} /></View></Surface>
        ) : null}

        {phase === 'error' ? (
          <Surface>
            <EmptyState
              icon={stating ? 'info' : 'warning'}
              title={failureTitle}
              body={failureBody}
              actionLabel={t('back')}
              onAction={close}
            />
            {/*
              Diagnostic copiable : zéro option a plusieurs causes que cet écran
              ne distingue pas, et sans données on en reste aux hypothèses.
            */}
            <Button
              label={t('payCopyDiagnostic')}
              variant="ghost"
              size="md"
              dense
              onPress={() => {
                void Clipboard.setStringAsync(usePay.getState().diagnostic());
                toast.success(t('copied'));
              }}
            />
          </Surface>
        ) : null}

        {/* CE QU'ON PAIE ET À QUI, avant tout le reste. */}
        {info ? (
          <Surface>
            <View style={{ gap: space[2] }}>
              <Text variant="caption" tone="secondary">{t('payMerchant')}</Text>
              <Text variant="title2">{info.merchant.name}</Text>
              <Text variant="body" tabular>
                {`${formatTokenAmount(BigInt(info.amount.value || '0'), info.amount.display.decimals)} ${info.amount.display.assetSymbol}`}
              </Text>
              {expiresIn != null ? (
                <Text variant="micro" tone={expiresIn < 60 ? 'warning' : 'tertiary'}>
                  {`${t('payExpiresIn')} ${Math.max(0, expiresIn)}s`}
                </Text>
              ) : null}
            </View>
          </Surface>
        ) : null}

        {options && options.options.length > 0 ? (
          <Surface padded={false}>{options.options.map(renderOption)}</Surface>
        ) : null}

        {phase === 'done' && result ? (
          <Surface>
            <EmptyState
              icon={result.status === 'succeeded' ? 'check' : 'clock'}
              title={result.status === 'succeeded' ? t('paySucceeded') : t('payProcessing')}
              actionLabel={t('back')}
              onAction={close}
            />
            {/*
              Diagnostic copiable : zéro option a plusieurs causes que cet écran
              ne distingue pas, et sans données on en reste aux hypothèses.
            */}
            <Button
              label={t('payCopyDiagnostic')}
              variant="ghost"
              size="md"
              dense
              onPress={() => {
                void Clipboard.setStringAsync(usePay.getState().diagnostic());
                toast.success(t('copied'));
              }}
            />
          </Surface>
        ) : null}

        {selected && phase !== 'done' ? (
          <Button
            label={t('payConfirm')}
            loading={phase === 'signing'}
            disabled={phase === 'signing' || !!collectUrl}
            onPress={() => setAsking(true)}
          />
        ) : null}
      </ScrollView>

      <ConfirmUnlock
        visible={asking}
        title={t('payConfirm')}
        subtitle={info?.merchant.name}
        perform={async (unlock) => {
          await confirm(unlock);
          const r = usePay.getState();
          // `confirm` ne lève pas : elle publie l'erreur dans le magasin. On la
          // relaie, parce que ConfirmUnlock distingue un PIN faux d'un échec
          // d'exécution à partir de ce qui est LEVÉ.
          if (r.phase === 'error') throw new Error(r.detail ?? t('payFailed'));
        }}
        onDone={() => setAsking(false)}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}
