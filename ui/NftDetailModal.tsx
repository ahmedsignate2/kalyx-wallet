import { Pressable as KPressable, Button, Card } from './kit';
/**
 * Fiche NFT (modal plein écran) : image grand format, nom, collection, prix
 * plancher, traits et leur rareté, contrat / tokenId copiables, lien vers
 * l'explorateur — puis ce qu'on peut en faire : l'envoyer (TON), le masquer, ou
 * le brûler pour récupérer son loyer (Solana).
 *
 * Tout chiffre affiché vient d'un relevé réel (OpenSea, Alchemy) avec sa
 * source et sa date ; sans relevé, la ligne n'apparaît pas.
 */
import { SafeModal } from './kit/SafeModal';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { NftImage } from './NftImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Icon } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { listChains, getNftRarity, getNftFloor, getMarketsByIds, peekMarketsByIds, withRarity, formatFiat, type NftItem, type NftFloor, type NftTraitRarity } from '../src';

function shorten(a: string) {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

const pct = (p: number) => `${p < 0.01 ? (p * 100).toFixed(2) : p < 0.1 ? (p * 100).toFixed(1) : Math.round(p * 100)} %`;

function floorDate(at: string | undefined, lang: string): string {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function NftDetailModal({
  nft,
  chainId,
  explorerUrl,
  hidden,
  onToggleHidden,
  onBurn,
  onClose,
  onSend,
}: {
  nft: NftItem | null;
  /** Réseau du NFT : rareté et plancher frais (EVM), conseils propres au réseau. */
  chainId?: string;
  /** Présent si ce NFT peut être envoyé depuis Kalyx (TON pour l'instant). */
  onSend?: () => void;
  /** Base explorer du réseau actif (ex. https://etherscan.io). */
  explorerUrl?: string;
  hidden?: boolean;
  onToggleHidden?: () => void;
  /** Présent si ce NFT peut être brûlé avec récupération du loyer (Solana, non compressé). */
  onBurn?: () => void;
  onClose: () => void;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.language);
  const fiat = useSettings((s) => s.fiat);
  const insets = useSafeAreaInsets();
  const [side, setSide] = useState(0);
  const [rarity, setRarity] = useState<NftTraitRarity[]>([]);
  const [freshFloor, setFreshFloor] = useState<NftFloor | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  const chain = chainId ? listChains({ includeTestnets: true }).find((c) => c.id === chainId) : undefined;
  const evm = chain?.family === 'evm';
  const nftKey = nft ? `${chainId}:${nft.contract}:${nft.tokenId}` : '';

  // Rareté et plancher relevés à l'ouverture (EVM). Une panne n'efface rien : la fiche garde ce qu'elle a.
  useEffect(() => {
    setRarity([]);
    setFreshFloor(null);
    if (!nft || !chain || chain.family !== 'evm') return;
    let alive = true;
    if (nft.traits?.length) getNftRarity(chain, nft.contract, nft.tokenId).then((r) => alive && setRarity(r), () => {});
    getNftFloor(chain, nft.contract).then((f) => alive && f && setFreshFloor(f), () => {});
    return () => {
      alive = false;
    };
  }, [nftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const floor = freshFloor ?? nft?.floor ?? null;
  // getFloorPrice ne sert qu'Ethereum : son prix est en ETH quand la devise n'est pas précisée.
  const floorCurrency = floor?.currency ?? (freshFloor ? 'ETH' : undefined);
  useEffect(() => {
    if (floorCurrency !== 'ETH') return;
    const cached = peekMarketsByIds(fiat, ['ethereum'])?.[0]?.price;
    if (cached) setEthPrice(cached);
    let alive = true;
    getMarketsByIds(fiat, ['ethereum']).then((m) => alive && m[0]?.price && setEthPrice(m[0].price), () => {});
    return () => {
      alive = false;
    };
  }, [floorCurrency, fiat]);

  if (!nft) return null;
  const tokenIdShort = nft.tokenId.length > 12 ? `${nft.tokenId.slice(0, 10)}…` : nft.tokenId;
  const traits = withRarity(nft.traits ?? [], rarity);
  const date = floorDate(floor?.at, lang);
  const hint = { ...typography.muted, fontSize: 12, textAlign: 'center' as const };

  return (
    <SafeModal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radii.xxl,
            borderTopRightRadius: radii.xxl,
            padding: spacing(2.5),
            paddingBottom: insets.bottom + spacing(3),
            maxHeight: '92%',
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing(1.5) }}>
            <View onLayout={(e) => setSide(e.nativeEvent.layout.width)} style={{ width: '100%', aspectRatio: 1, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surface2 }}>
              {side ? <NftImage key={`${nft.contract}:${nft.tokenId}`} nft={nft} size={side} showName /> : null}
            </View>
            <View>
              <Text style={typography.title}>{nft.name}</Text>
              {nft.collection ? <Text style={typography.muted}>{nft.collection}</Text> : null}
            </View>

            {floor && floorCurrency ? (
              <Card variant="glass">
                <KPressable
                  onPress={floor.url ? () => Linking.openURL(floor.url!) : undefined}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(1) }}
                  accessibilityLabel={t('nftFloor')}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={typography.muted}>{t('nftFloor')}</Text>
                    <Text style={{ color: colors.textTertiary, fontFamily: fonts.medium, fontSize: 12 }}>
                      {date ? t('nftFloorSource').replace('{source}', floor.source).replace('{date}', date) : floor.source}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
                      {floor.price.toLocaleString(lang, { maximumFractionDigits: floor.price < 1 ? 4 : 2 })} {floorCurrency}
                    </Text>
                    {ethPrice && floorCurrency === 'ETH' ? (
                      <Text style={{ color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                        ≈ {formatFiat(floor.price * ethPrice)} {fiatSymbol(fiat)}
                      </Text>
                    ) : null}
                  </View>
                </KPressable>
              </Card>
            ) : null}

            {traits.length ? (
              <View style={{ gap: spacing(1) }}>
                <Text style={{ ...typography.muted, fontFamily: fonts.semibold }}>{t('nftTraits')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
                  {traits.map((tr, i) => (
                    <View key={`${tr.type}:${i}`} style={{ paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.75), borderRadius: radii.md, backgroundColor: colors.surface2, minWidth: '30%', flexGrow: 1 }}>
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 11, textTransform: 'uppercase' }}>{tr.type}</Text>
                      <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 14 }}>{tr.value}</Text>
                      {'prevalence' in tr && tr.prevalence !== undefined ? (
                        <Text style={{ color: tr.prevalence < 0.05 ? colors.primary : colors.textSecondary, fontFamily: fonts.medium, fontSize: 11 }}>{t('nftTraitShare').replace('{pct}', pct(tr.prevalence))}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <Card variant="glass">
              <Row label={t("txLabelTokenID")} value={tokenIdShort} onCopy={() => Clipboard.setStringAsync(nft.tokenId)} />
              <Row divider label={t('contractLabel')} value={shorten(nft.contract)} onCopy={() => Clipboard.setStringAsync(nft.contract)} />
            </Card>

            {explorerUrl ? (
              <Text
                onPress={() => Linking.openURL(nft.url ?? `${explorerUrl}/token/${nft.contract}?a=${nft.tokenId}`)}
                style={{ color: colors.primary, fontFamily: fonts.semibold, textAlign: 'center' }}
              >
                {t('nftViewOnExplorer')}
              </Text>
            ) : null}

            {onSend ? <Button label={t('nftSendTitle')} onPress={onSend} /> : null}
            {onBurn ? <Button label={t('nftBurnTitle')} variant="outline" onPress={onBurn} /> : null}
            {onToggleHidden ? <Button label={hidden ? t('nftUnhide') : t('nftHide')} variant="outline" onPress={onToggleHidden} /> : null}
            {onToggleHidden && !hidden && nft.compressed ? <Text style={hint}>{t('nftCompressedNoBurn')}</Text> : null}
            {onToggleHidden && !hidden && evm ? <Text style={hint}>{t('nftEvmHideHint')}</Text> : null}
            <Button label={t('closeWord')} variant="outline" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </SafeModal>
  );
}

function Row({ label, value, divider, onCopy }: { label: string; value: string; divider?: boolean; onCopy: () => void }) {
  const { colors, typography } = useTheme();
  return (
    <KPressable
      onPress={onCopy}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(1),
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.border,
      }}
    >
      <Text style={typography.muted}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) }}>
        <Text style={{ color: colors.text, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>{value}</Text>
        <Icon name="copy" size={14} tone="muted" />
      </View>
    </KPressable>
  );
}
