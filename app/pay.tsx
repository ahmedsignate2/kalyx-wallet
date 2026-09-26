/**
 * Paiement marchand (WalletConnect Pay).
 *
 * Trois temps visibles : on montre CE QU'ON PAIE et À QUI avant tout, on laisse
 * choisir avec quel actif, puis on signe. Le formulaire de capture de données
 * — exigé par la réglementation sur certaines options — est HÉBERGÉ et affiché
 * dans une WebView : ses champs évoluent sans nous prévenir, et une copie
 * native empêcherait de payer le jour où elle diverge.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { Text, Button, Surface, ListRow, IconButton, Skeleton, EmptyState, Chip, Pressable as KPressable } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { usePay, type PayOption } from '../lib/walletconnectPay';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { technicalLogger } from '../lib/technicalLogger';
import {
  formatTokenAmount,
  formatNumber,
  shortAddress,
  listChains,
  chainNameOf,
  payEligibleHoldings,
  payCoverageLines,
} from '../src';
import { useWallet } from '../lib/walletStore';
import { usePortfolioStore } from '../lib/portfolio';

/** Domaines autorisés dans la WebView de capture. */
const COLLECT_HOST = 'pay.walletconnect.com';

export default function PayScreen() {
  const t = useT();
  // `mode` sert à accorder le formulaire hébergé au thème actif de l'app.
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ link?: string }>();

  const { phase, options, selected, collectUrl, result, failure, detail, payer, open, select, collected, recheck, confirm, reset } =
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

  /*
   * DE QUOI EXPLIQUER, pas seulement constater.
   *
   * L'écran disait ce que Pay accepte EN GÉNÉRAL et se taisait sur ce que
   * l'utilisateur détient. Il a fallu cinq heures et un détour par un navigateur
   * pour découvrir qu'un paiement n'acceptait que des actifs sur Ethereum alors
   * que les fonds étaient sur Base — alors que l'app connaissait les deux.
   */
  const accounts = useWallet((w) => w.accounts);
  const holdings = usePortfolioStore((s) => s.holdings);
  const chains = useMemo(() => listChains({ includeTestnets: false }), []);
  const evmChainIdOf = useCallback((id: string) => chains.find((c) => c.id === id)?.evmChainId, [chains]);
  const nameOfEvm = useCallback(
    (evmChainId: number) => chains.find((c) => c.evmChainId === evmChainId)?.name,
    [chains],
  );
  const eligible = useMemo(() => payEligibleHoldings(holdings, evmChainIdOf), [holdings, evmChainIdOf]);
  const coverage = useMemo(() => payCoverageLines(nameOfEvm), [nameOfEvm]);
  /** Comptes autres que celui qui vient d'être interrogé. */
  const otherAccounts = useMemo(() => accounts.filter((a) => a.index !== payer?.index), [accounts, payer?.index]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const link = params.link ? String(params.link) : '';
    if (link) void open(link, { theme: mode === 'light' ? 'light' : 'dark' });
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
    /*
     * TOUT CE QUE LE FORMULAIRE DIT EST TRACÉ.
     *
     * Le formulaire compte plusieurs pages, et « Continuer » n'aboutissait pas.
     * Sans trace, on ne peut que théoriser — et j'ai déjà donné trois causes
     * fausses à ce paiement. On enregistre donc les messages du pont, les
     * navigations refusées et les erreurs de chargement. Rien de personnel n'y
     * figure : des types de messages et des hôtes, jamais le contenu des champs.
     */
    const onMessage = (e: WebViewMessageEvent) => {
      const raw = e.nativeEvent.data;
      try {
        const data = JSON.parse(raw) as { type?: string; error?: string };
        technicalLogger.log('DAPP', 'Pay : message du formulaire', { type: data.type ?? '(sans type)' });
        if (data.type === 'IC_COMPLETE') collected();
        else if (data.type === 'IC_ERROR') {
          technicalLogger.log('DAPP', 'Pay : formulaire en erreur', { error: data.error ?? '' });
          toast.error(t('payFailed'), data.error);
        }
      } catch {
        // Message non JSON : le formulaire en émet d'autres. On note sa taille,
        // jamais son contenu — il pourrait porter des données personnelles.
        technicalLogger.log('DAPP', 'Pay : message non JSON du formulaire', { length: raw.length });
      }
    };
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SCREEN_MARGIN, height: 48 }}>
          <IconButton icon="back" label={t('back')} tone="ghost" onPress={close} />
        </View>
        {/*
          CE QUI PART, ET CHEZ QUI. L'utilisateur s'apprête à saisir son nom
          légal, sa date de naissance et son lieu de résidence dans une page
          hébergée par un tiers. Le lui dire avant n'est pas une politesse :
          c'est la seule chose qui distingue un consentement d'une surprise.
        */}
        <View style={{ paddingHorizontal: SCREEN_MARGIN, paddingBottom: space[3] }}>
          <Text variant="caption" tone="secondary">{t('payCollectNotice')}</Text>
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
            /*
             * LES SCHÉMAS INTERNES PASSENT. On refusait tout ce qui n'était pas
             * `https://`, donc aussi `about:blank` et `blob:` — que les pages à
             * plusieurs étapes utilisent couramment pour enchaîner. Ils ne
             * chargent rien de distant : les bloquer ne protégeait de rien et
             * pouvait figer le formulaire sur sa première page.
             */
            if (/^(?:about|blob):/i.test(req.url)) return true;
            if (!req.url.startsWith('https://')) {
              technicalLogger.log('DAPP', 'Pay : navigation refusée (schéma)', {
                scheme: req.url.split(':')[0],
              });
              return false;
            }
            const host = req.url.slice('https://'.length).split(/[/?#]/)[0].toLowerCase();
            if (host === COLLECT_HOST || host.endsWith(`.${COLLECT_HOST}`)) return true;
            // Hôte tiers : on note lequel, puis on l'ouvre dehors.
            technicalLogger.log('DAPP', 'Pay : navigation sortie vers le navigateur', { host });
            void Linking.openURL(req.url);
            return false;
          }}
          /*
           * `window.open` DOIT NAVIGUER SUR PLACE.
           *
           * Android autorise par défaut les fenêtres multiples, et sans
           * gestionnaire un `window.open` ou un `target="_blank"` ne fait
           * RIEN — silencieusement. C'est exactement l'allure d'un bouton
           * « Continuer » mort. En refusant les fenêtres multiples, la
           * navigation se fait dans cette vue, où la règle ci-dessus décide.
           */
          setSupportMultipleWindows={false}
          onError={(e) =>
            technicalLogger.log('DAPP', 'Pay : échec de chargement du formulaire', {
              code: String(e.nativeEvent.code ?? ''),
              description: e.nativeEvent.description ?? '',
            })
          }
          onHttpError={(e) =>
            technicalLogger.log('DAPP', 'Pay : réponse HTTP en erreur', {
              status: String(e.nativeEvent.statusCode ?? ''),
            })
          }
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
            {/*
              LA RELANCE PLUTÔT QUE LE RETOUR. Quand la vérification est en cours
              d'examen, « Retour » oblige à rescanner le QR pour savoir où elle
              en est. Dans ce seul cas l'action principale redemande les options.
            */}
            <EmptyState
              icon={stating ? 'info' : 'warning'}
              title={failureTitle}
              body={failureBody}
              actionLabel={failure === 'INFO_NOT_ENOUGH' ? t('retry') : t('back')}
              onAction={failure === 'INFO_NOT_ENOUGH' ? () => void recheck() : close}
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

        {/*
          POURQUOI RIEN N'EST PROPOSÉ, en trois faits vérifiables : le compte
          interrogé, ce qu'on détient parmi les actifs réglables, et l'étendue de
          ce que le service règle. Sans ces trois-là, « rien pour payer » n'est
          pas une explication, c'est une porte fermée.
        */}
        {stating ? (
          <>
            <Surface>
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">{t('payAccountUsed')}</Text>
                <KPressable
                  onPress={() => {
                    if (!payer) return;
                    void Clipboard.setStringAsync(payer.evmAddress);
                    toast.success(t('copied'));
                  }}
                >
                  <Text variant="body" tabular>{payer ? shortAddress(payer.evmAddress) : '—'}</Text>
                </KPressable>
              </View>
            </Surface>

            <Surface>
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">{t('payYouHold')}</Text>
                {eligible.length === 0 ? (
                  <Text variant="body">{t('payHoldNone')}</Text>
                ) : (
                  eligible.map((h) => (
                    <Text key={`${h.chainId}:${h.symbol}`} variant="body" tabular>
                      {`${formatNumber(h.amount)} ${h.symbol} · ${chainNameOf(h.chainId) ?? h.chainId}`}
                    </Text>
                  ))
                )}
                {/*
                  LE PIÈGE, DIT EXPLICITEMENT. Détenir un actif de la liste ne
                  suffit pas : le marchand décide des réseaux acceptés, et c'est
                  exactement ce qui nous a échappé cinq heures.
                */}
                <Text variant="micro" tone="tertiary">{t('payMerchantDecides')}</Text>
              </View>
            </Surface>

            <Surface>
              <View style={{ gap: space[2] }}>
                <Text variant="caption" tone="secondary">{t('payAcceptedAssets')}</Text>
                {coverage.map((c) => (
                  <Text key={c.symbol} variant="micro" tone="secondary">
                    {`${c.symbol} — ${c.networks.join(', ')}`}
                  </Text>
                ))}
              </View>
            </Surface>

            {/*
              PAYER DEPUIS UN AUTRE COMPTE, sans rescanner. Les fonds ne sont pas
              toujours sur le compte qu'on regarde, et il fallait jusqu'ici en
              changer à l'accueil puis refaire le QR.
            */}
            {otherAccounts.length > 0 ? (
              <Surface>
                <View style={{ gap: space[2] }}>
                  <Text variant="caption" tone="secondary">{t('payOtherAccount')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                    {otherAccounts.map((a) => (
                      <Chip
                        key={a.index}
                        label={shortAddress(a.evmAddress)}
                        selected={false}
                        onPress={() => {
                          const link = params.link ? String(params.link) : '';
                          if (link) {
                            void open(link, {
                              theme: mode === 'light' ? 'light' : 'dark',
                              accountIndex: a.index,
                            });
                          }
                        }}
                      />
                    ))}
                  </View>
                </View>
              </Surface>
            ) : null}
          </>
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
