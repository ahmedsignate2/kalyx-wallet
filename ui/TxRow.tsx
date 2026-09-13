/**
 * Ligne de transaction « premium », partagée entre l'Historique et l'accueil :
 * - logo de la crypto (au lieu d'une icône grise) + pastille de direction
 *   (flèche verte = reçu, neutre = envoyé) en surimpression ;
 * - statut lisible : Confirmée (discret) / Échouée (rouge). Pas de « En
 *   attente » : l'API (Etherscan) ne renvoie que les transactions minées ;
 * - date relative + heure exacte (« Aujourd'hui · 18:49 ») ;
 * - montant signé + contre-valeur fiat AU COURS ACTUEL (pas de prix
 *   historique : 1 appel API par tx, intenable en rate-limit gratuit) ;
 * - `expanded` : détail replié (adresses from/to copiables + explorateur).
 */
import React from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { PressableScale } from './premium';
import { Icon } from './icon';
import { fonts, spacing, useTheme } from './theme';
import { useEnsName } from '../lib/useEns';
import { useT } from '../lib/settingsStore';
import { formatTokenAmount, formatAmount, type TxSummary, formatFiat } from '../src';

function shortAddr(a: string) {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

/** Date relative localisée : « Today · 18:49 », « Yesterday · 09:12 », « 02 Jul · 18:49 ». */
export function txDate(ts: number, t?: (k: any) => string): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day =
    days <= 0 && now.getDate() === d.getDate()
      ? (t ? t('txToday') : 'Today')
      : days <= 1
        ? (t ? t('txYesterday') : 'Yesterday')
        : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  return `${day} · ${hm}`;
}

const money = formatFiat;

export function TxRow({
  tx,
  symbol,
  decimals,
  logoUri,
  price,
  fiatSymbol,
  divider,
  onPress,
  expanded,
  explorerUrl,
}: {
  tx: TxSummary;
  symbol: string;
  decimals: number;
  /** Logo de la crypto (CoinGecko) ; absent → pastille icône. */
  logoUri?: string;
  /** Prix actuel dans la devise → contre-valeur affichée. 0/absent = masquée. */
  price?: number;
  fiatSymbol?: string;
  divider?: boolean;
  onPress?: () => void;
  /** Affiche le détail (adresses + explorateur) sous la ligne. */
  expanded?: boolean;
  explorerUrl?: string;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const inbound = tx.direction === 'in';
  const failed = tx.status === 'failed';
  const dirColor = inbound ? colors.up : colors.textMuted;
  const amount = Number(formatAmount(tx.value, decimals));
  const fiat = price && price > 0 ? amount * price : null;

  const row = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1.5),
        paddingVertical: spacing(1.5),
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.glassBorder,
      }}
    >
      {/* Logo + pastille de direction */}
      <View style={{ width: 42, height: 42 }}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.glassStrong }} />
        ) : (
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={inbound ? 'receive' : 'send'} size={19} color={dirColor} />
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            right: -3,
            bottom: -3,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: inbound ? colors.up : colors.bgElevated,
            borderWidth: 2,
            borderColor: colors.bgDeep,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={tx.type === 'SWAP' ? 'exchange' : inbound ? 'receive' : 'send'} size={9} color={inbound ? '#fff' : colors.textMuted} />
        </View>
      </View>

      <View style={{ flex: 1, marginRight: spacing(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing(0.75) }}>
          <Text style={[typography.bodyStrong, { flexShrink: 1 }]} numberOfLines={2}>
            {tx.description || (inbound ? t('txReceived') : tx.direction === 'out' ? t('txSent') : t('txInternal'))}
          </Text>
          <Text style={{ fontSize: 11, fontFamily: fonts.semibold, color: failed ? colors.danger : colors.textFaint, marginTop: 2 }}>
            {failed ? `✕ ${t('txFailed')}` : `✓ ${t('txConfirmed')}`}
          </Text>
        </View>
        <Text style={typography.muted}>{txDate(tx.timestamp, t)}</Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        {tx.value > 0n ? (
          <Text style={{ color: failed ? colors.danger : inbound ? colors.up : colors.text, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
            {inbound ? '+' : tx.direction === 'out' ? '−' : ''}
            {formatTokenAmount(tx.value, tx.decimals ?? decimals)} {tx.asset ?? symbol}
          </Text>
        ) : (
          <Text style={{ color: colors.textMuted, fontFamily: fonts.semibold }}>{t("txInteraction")}</Text>
        )}
        {fiat != null && fiatSymbol && tx.value > 0n ? (
          <Text style={{ fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
            ≈ {money(fiat)} {fiatSymbol}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View>
      {onPress ? <PressableScale onPress={onPress}>{row}</PressableScale> : row}
      {expanded ? (
        <View style={{ paddingBottom: spacing(1.5), gap: spacing(0.75) }}>
          <AddrLine label={t('txFrom')} addr={tx.from} />
          <AddrLine label={t('txTo')} addr={tx.to} />
          {explorerUrl ? (
            <Text
              onPress={() => Linking.openURL(`${explorerUrl}/tx/${tx.hash}`)}
              style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 }}
            >
              {t('txViewExplorer')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Adresse raccourcie, copiable au tap. Affiche le nom ENS s'il existe. */
function AddrLine({ label, addr }: { label: string; addr: string }) {
  const { colors, typography } = useTheme();
  const ensName = useEnsName(addr);
  if (!addr) return null;
  return (
    <Pressable
      onPress={() => Clipboard.setStringAsync(addr)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}
    >
      <Text style={[typography.muted, { width: 24, fontSize: 13 }]}>{label}</Text>
      {ensName ? (
        <Text style={{ color: colors.accent, fontSize: 13, fontFamily: fonts.semibold }} numberOfLines={1}>
          {ensName}
        </Text>
      ) : null}
      <Text style={{ color: ensName ? colors.textMuted : colors.text, fontSize: 13, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>
        {shortAddr(addr)}
      </Text>
      <Icon name="copy" size={13} tone="muted" />
    </Pressable>
  );
}
