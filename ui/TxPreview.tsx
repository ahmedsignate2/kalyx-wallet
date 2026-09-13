import { useT } from "../lib/settingsStore";
/**
 * Aperçu LISIBLE d'une transaction avant signature (mini-simulation locale).
 * Décode l'appel (transfert / approbation / setApprovalForAll / natif), résout le
 * symbole + décimales du token concerné pour un montant humain, et met en évidence
 * en ROUGE les cas dangereux (approbation illimitée, accès à tous les NFT).
 */
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Icon } from './icon';
import { spacing, useTheme } from './theme';
import {
  decodeTx,
  isRiskyTx,
  formatTokenAmount,
  getTokenMetadata,
  type ChainConfig,
  type TokenMeta,
} from '../src';

function short(a?: string) {
  return a && a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a ?? '';
}

export function TxPreview({ tx, chain }: { tx: { to?: string; value?: bigint | string; data?: string }; chain: ChainConfig }) {
  const t = useT();
  const { colors, typography } = useTheme();
  const decoded = decodeTx(tx);
  const risky = isRiskyTx(decoded);
  const [meta, setMeta] = useState<TokenMeta | null>(null);

  // Résout le token concerné (transfert/approbation) pour formater le montant.
  const tokenAddr =
    decoded.kind === 'transfer' || decoded.kind === 'approve' || decoded.kind === 'transferFrom'
      ? decoded.token
      : undefined;
  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    if (tokenAddr) getTokenMetadata(chain, tokenAddr).then((m) => !cancelled && setMeta(m)).catch(() => {});
    return () => { cancelled = true; };
  }, [tokenAddr, chain]);

  const sym = meta?.symbol || 'tokens';
  const amt = (raw: bigint) => (meta ? `${formatTokenAmount(raw, meta.decimals)} ${sym}` : `${raw} (unités ${sym})`);

  const rows: { label: string; value: string; danger?: boolean }[] = [];
  let title = t("txPreviewContractInteraction");
  let icon: Parameters<typeof Icon>[0]['name'] = 'developer';

  switch (decoded.kind) {
    case 'empty':
      title = t("txPreviewSend");
      icon = 'send';
      rows.push({ label: t("txLabelTo"), value: short(decoded.to) });
      rows.push({ label: t("txLabelAmount"), value: `${formatTokenAmount(decoded.value, chain.nativeDecimals)} ${chain.nativeSymbol}` });
      break;
    case 'transfer':
      title = t("txPreviewSendToken");
      icon = 'send';
      rows.push({ label: t("txLabelToken"), value: `${sym} · ${short(decoded.token)}` });
      rows.push({ label: t("txLabelTo"), value: short(decoded.to) });
      rows.push({ label: t("txLabelAmount"), value: amt(decoded.amount) });
      break;
    case 'transferFrom':
      title = t("txPreviewTransferToken");
      icon = 'send';
      rows.push({ label: t("txLabelFrom"), value: short(decoded.from) });
      rows.push({ label: t("txLabelTo"), value: short(decoded.to) });
      rows.push({ label: t("txLabelAmount"), value: amt(decoded.amount) });
      break;
    case 'approve':
      title = t("txPreviewApprove");
      icon = 'security';
      rows.push({ label: t("txLabelToken"), value: `${sym} · ${short(decoded.token)}` });
      rows.push({ label: t("txLabelSpender"), value: short(decoded.spender), danger: decoded.unlimited });
      rows.push({ label: t("txLabelAmount"), value: decoded.unlimited ? t("txLabelUnlimited") : amt(decoded.amount), danger: decoded.unlimited });
      break;
    case 'approveAll':
      title = decoded.approved ? t("txPreviewApproveAll") : t("txPreviewRevokeNFT");
      icon = 'warning';
      rows.push({ label: t("txLabelCollection"), value: short(decoded.collection) });
      rows.push({ label: t("txLabelOperator"), value: short(decoded.operator), danger: decoded.approved });
      rows.push({ label: 'Accès', value: decoded.approved ? t("txLabelAllNFTs") : t("txLabelRevoked"), danger: decoded.approved });
      break;
    case 'nftTransfer':
      title = t("txPreviewTransferNFT");
      icon = 'nft';
      rows.push({ label: t("txLabelCollection"), value: short(decoded.collection) });
      rows.push({ label: t("txLabelTo"), value: short(decoded.to) });
      rows.push({ label: t("txLabelTokenID"), value: `#${decoded.tokenId}` });
      break;
    default:
      rows.push({ label: t("txLabelContract"), value: short(decoded.to) });
      if (decoded.value > 0n) rows.push({ label: t("txLabelValue"), value: `${formatTokenAmount(decoded.value, chain.nativeDecimals)} ${chain.nativeSymbol}` });
      rows.push({ label: t("txLabelFunction"), value: decoded.selector });
  }

  return (
    <View style={{ gap: spacing(0.75) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
        <Icon name={icon} size={18} color={risky ? colors.danger : colors.accent} />
        <Text style={[typography.bodyStrong, risky ? { color: colors.danger } : undefined]}>{title}</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1) }}>
          <Text style={typography.muted}>{r.label}</Text>
          <Text style={[typography.bodyStrong, { flexShrink: 1, textAlign: 'right', color: r.danger ? colors.danger : colors.text, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
            {r.value}
          </Text>
        </View>
      ))}
      {risky ? (
        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.danger + '1E', borderRadius: 10, padding: spacing(1.25), marginTop: spacing(0.5) }}>
          <Icon name="warning" size={16} color={colors.danger} />
          <Text style={{ color: colors.text, flex: 1, fontSize: 12.5 }}>{t("txHighRiskWarning")}</Text>
        </View>
      ) : null}
    </View>
  );
}
