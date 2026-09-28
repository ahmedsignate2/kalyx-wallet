/**
 * Fenêtres globales TON Connect : demande de connexion, puis chaque demande de
 * transaction d'une dApp connectée. Monté à la racine, comme WalletConnect.
 *
 * Une transaction est montrée par ce qu'elle FAIT, pas par ce que la dApp en
 * dit : le bilan vient de l'émulation TonAPI (TON, jettons et NFT qui quittent
 * le portefeuille, vidage du solde, échec prévisible). Sans émulation, on le
 * dit, et on montre les montants bruts.
 */
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Sheet, Text, Button, Surface } from './kit';
import { ConfirmUnlock } from './ConfirmUnlock';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space, radius } from './tokens';
import { useTonConnect, type TcPending } from '../lib/tonconnect/store';
import { useWallet } from '../lib/walletStore';
import { usePortfolioStore } from '../lib/portfolio';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { UserFacingError } from '../lib/txError';
import { technicalLogger } from '../lib/technicalLogger';
import { haptic } from '../lib/haptics';
import { formatTokenAmount, shortAddress, isWalletError } from '../src';
import { totalOut } from '../src/domain/tonconnect/requests';

/**
 * Erreur lisible pour l'écran de code. Un code « tc… » est traduit ; un PIN
 * faux reste tel quel (l'écran le reconnaît) ; toute autre erreur garde son
 * VRAI message — l'écran l'aurait sinon remplacée par « Transaction failed »,
 * ce qui a caché la cause du premier échec sur STON.fi.
 */
function readable(e: unknown, t: (k: never) => string): unknown {
  const msg = e instanceof Error ? e.message : String(e);
  technicalLogger.logDapp(`tonconnect: ${msg}`);
  if (isWalletError(e)) return e;
  if (msg.startsWith('tc')) return new UserFacingError(t(msg as never));
  return new UserFacingError(`${t('connectionFailed' as never)} — ${msg}`);
}

function DappHeader({ name, domain, icon }: { name: string; domain: string; icon: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space[2] }}>
      {icon ? (
        <Image source={{ uri: icon }} style={{ width: 56, height: 56, borderRadius: radius.input, backgroundColor: colors.surface3 }} />
      ) : (
        <View style={{ width: 56, height: 56, borderRadius: radius.input, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="dapps" size={26} tone="muted" />
        </View>
      )}
      <Text variant="title2" style={{ textAlign: 'center' }}>{name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="lock" size={12} tone="muted" />
        <Text variant="caption" tone="secondary">{domain}</Text>
      </View>
    </View>
  );
}

/**
 * TON n'existe que sur le compte PRINCIPAL d'une phrase (une clé TON par
 * phrase, règle de Tonkeeper). Sur un sous-compte, on l'explique avant toute
 * demande de code, et on propose d'y passer — au lieu d'une erreur après coup.
 */
function useTonAccess(): { ok: boolean; mainIndex: number } {
  const accounts = useWallet((s) => s.accounts);
  const active = useWallet((s) => s.activeAccountIndex);
  return { ok: !!accounts[active]?.tonPublicKey, mainIndex: accounts.findIndex((a) => !!a.tonPublicKey) };
}

function TonAccessNotice({ mainIndex, message }: { mainIndex: number; message: string }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <Surface style={{ borderColor: colors.warning, gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
        <Icon name="alert" size={18} color={colors.warning} />
        <Text variant="bodySecondary" style={{ flex: 1 }}>{mainIndex >= 0 ? message : t('tcNoTonForWallet')}</Text>
      </View>
      {mainIndex >= 0 ? (
        <Button label={t('tcUseMainAccount')} variant="secondary" onPress={() => { haptic.selection(); useWallet.getState().setActiveAccount(mainIndex); }} />
      ) : null}
    </Surface>
  );
}

function ConnectSheet({ p }: { p: Extract<TcPending, { kind: 'connect' }> }) {
  const t = useT();
  const { approveConnect, rejectConnect } = useTonConnect.getState();
  const [confirming, setConfirming] = useState(false);
  const access = useTonAccess();
  return (
    <Sheet visible onClose={() => void rejectConnect()}>
      <DappHeader name={p.manifest.name} domain={p.domain} icon={p.manifest.iconUrl} />
      <Text variant="title2" style={{ textAlign: 'center' }}>{t('tcConnectTitle').replace('{name}', p.manifest.name)}</Text>
      {access.ok ? (
        <>
          <Text variant="bodySecondary" tone="secondary">{t('tcShares')}</Text>
          {p.proofPayload !== undefined ? <Text variant="caption" tone="secondary">{t('tcProofNote')}</Text> : null}
        </>
      ) : (
        <TonAccessNotice mainIndex={access.mainIndex} message={t('tcSubAccount')} />
      )}
      <Button label={t('connect')} onPress={() => setConfirming(true)} disabled={!access.ok} />
      <Button label={t('actionCancel')} variant="secondary" onPress={() => void rejectConnect()} />
      <ConfirmUnlock
        visible={confirming}
        title={t('confirmConnection')}
        subtitle={p.domain}
        perform={async (unlock) => {
          try {
            await approveConnect(unlock);
          } catch (e) {
            throw readable(e, t);
          }
          haptic.success();
        }}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}

function TxSheet({ p }: { p: Extract<TcPending, { kind: 'tx' }> }) {
  const t = useT();
  const { colors } = useTheme();
  const { approveTx, rejectTx } = useTonConnect.getState();
  const activeWalletId = useWallet((s) => s.activeWalletId);
  const [confirming, setConfirming] = useState(false);
  const e = p.draft?.emulation ?? null;
  const loading = !p.draft && !p.error;
  const wrongWallet = activeWalletId !== p.session.walletId;
  // Même portefeuille mais un autre compte : le compte connecté est le principal (le seul avec TON).
  const accounts = useWallet((s) => s.accounts);
  const activeIndex = useWallet((s) => s.activeAccountIndex);
  const sessionIndex = accounts.findIndex((a) => !!a.tonPublicKey);
  const wrongAccount = !wrongWallet && sessionIndex >= 0 && activeIndex !== sessionIndex;
  const tonOut = e ? e.risk.ton : totalOut(p.tx);

  return (
    <Sheet visible onClose={() => void rejectTx()}>
      <DappHeader name={p.session.manifest.name} domain={new URL(p.session.manifest.url).host} icon={p.session.manifest.iconUrl} />
      <Text variant="title2" style={{ textAlign: 'center' }}>{t('tcTxTitle').replace('{name}', p.session.manifest.name)}</Text>

      {e?.risk.allBalance ? (
        <Surface style={{ borderColor: colors.danger, flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          <Icon name="alert" size={18} color={colors.danger} />
          <Text variant="body" tone="danger" style={{ flex: 1 }}>{t('tcAllBalance')}</Text>
        </Surface>
      ) : null}
      {e?.failed ? (
        <Surface style={{ borderColor: colors.danger, flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
          <Icon name="alert" size={18} color={colors.danger} />
          <Text variant="body" tone="danger" style={{ flex: 1 }}>{t('tcWillFail')}</Text>
        </Surface>
      ) : null}

      <Surface style={{ gap: space[2] }}>
        <Text variant="caption" tone="secondary">{t('tcLeaves')}</Text>
        <Text variant="body" tabular>{formatTokenAmount(tonOut, 9)} TON</Text>
        {e?.risk.jettons.map((j, i) => (
          <Text key={i} variant="body" tabular tone={j.verified ? undefined : 'danger'}>
            {formatTokenAmount(j.amount, j.decimals)} {j.symbol}{j.verified ? '' : ` · ${t('tcUnverifiedToken')}`}
          </Text>
        ))}
        {e && e.risk.nfts > 0 ? <Text variant="body" tone="danger">{t('tcNfts').replace('{count}', String(e.risk.nfts))}</Text> : null}
        {e ? <Text variant="caption" tone="secondary">{t('labelNetworkFee')} · {formatTokenAmount(e.fee, 9)} TON</Text> : null}
        <Text variant="caption" tone="tertiary">
          {loading ? t('tcSimulating') : e ? t('tcSimulated') : t('tcNoSimulation')}
        </Text>
      </Surface>

      <Surface style={{ gap: space[1] }}>
        {p.tx.messages.map((m, i) => (
          <Text key={i} variant="caption" tone="secondary" numberOfLines={1}>
            → {shortAddress(m.to)} · {formatTokenAmount(m.amount, 9)} TON{m.payload ? ' · data' : ''}{m.init ? ' · deploy' : ''}
          </Text>
        ))}
      </Surface>

      {wrongWallet ? <Text variant="caption" tone="danger">{t('tcWrongWallet')}</Text> : null}
      {wrongAccount ? <TonAccessNotice mainIndex={sessionIndex} message={t('tcWrongAccount')} /> : null}
      <Button label={t('tcApprove')} onPress={() => setConfirming(true)} disabled={wrongWallet || wrongAccount || loading || !!e?.failed} />
      <Button label={t('tcReject')} variant="secondary" onPress={() => void rejectTx()} />
      <ConfirmUnlock
        visible={confirming}
        title={t('tcTxTitle').replace('{name}', p.session.manifest.name)}
        subtitle={`${formatTokenAmount(tonOut, 9)} TON`}
        perform={async (unlock) => {
          try {
            await approveTx(unlock);
          } catch (err) {
            throw readable(err, t);
          }
          usePortfolioStore.getState().invalidate();
          haptic.success();
          toast.success(t('txSent'));
        }}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />
    </Sheet>
  );
}

export function TonConnectHost() {
  const head = useTonConnect((s) => s.queue[0]);
  const hydrate = useTonConnect((s) => s.hydrate);
  // `isUnlocked` et non `!!account` : le compte reste en mémoire après verrouillage.
  const unlocked = useWallet((s) => s.isUnlocked && !!s.account);
  // Les sessions ne s'écoutent qu'une fois le portefeuille ouvert.
  useEffect(() => {
    if (unlocked) void hydrate();
  }, [unlocked, hydrate]);
  if (!head || !unlocked) return null;
  return head.kind === 'connect' ? <ConnectSheet key={head.link.clientId} p={head} /> : <TxSheet key={head.requestId} p={head} />;
}
