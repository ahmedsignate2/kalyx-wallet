/**
 * Fiche NFT (modal plein écran) : image grand format, nom, collection,
 * contrat / tokenId copiables, lien vers l'explorateur. Remplace l'Alert
 * de la galerie — c'est la fiche que Phantom montre au tap.
 */
import React from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { GlassCard } from './premium';
import { Button } from './components';
import { Icon } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { useT } from '../lib/settingsStore';
import type { NftItem } from '../src';

function shorten(a: string) {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

export function NftDetailModal({
  nft,
  explorerUrl,
  onClose,
}: {
  nft: NftItem | null;
  /** Base explorer du réseau actif (ex. https://etherscan.io). */
  explorerUrl?: string;
  onClose: () => void;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  if (!nft) return null;
  const tokenIdShort = nft.tokenId.length > 12 ? `${nft.tokenId.slice(0, 10)}…` : nft.tokenId;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.bgDeep,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: spacing(2.5),
            paddingBottom: insets.bottom + spacing(3),
            maxHeight: '92%',
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing(1.5) }}>
            <Image
              source={{ uri: nft.image }}
              style={{ width: '100%', aspectRatio: 1, borderRadius: radii.lg, backgroundColor: colors.glassStrong }}
              resizeMode="cover"
            />
            <View>
              <Text style={typography.title}>{nft.name}</Text>
              {nft.collection ? <Text style={typography.muted}>{nft.collection}</Text> : null}
            </View>

            <GlassCard>
              <Row label={t("txLabelTokenID")} value={tokenIdShort} onCopy={() => Clipboard.setStringAsync(nft.tokenId)} />
              <Row divider label={t('contractLabel')} value={shorten(nft.contract)} onCopy={() => Clipboard.setStringAsync(nft.contract)} />
            </GlassCard>

            {explorerUrl ? (
              <Text
                onPress={() => Linking.openURL(`${explorerUrl}/token/${nft.contract}?a=${nft.tokenId}`)}
                style={{ color: colors.accent, fontFamily: fonts.semibold, textAlign: 'center' }}
              >
                {t('nftViewOnExplorer')}
              </Text>
            ) : null}

            <Button label={t('closeWord')} variant="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, divider, onCopy }: { label: string; value: string; divider?: boolean; onCopy: () => void }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      onPress={onCopy}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(1),
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: colors.glassBorder,
      }}
    >
      <Text style={typography.muted}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) }}>
        <Text style={{ color: colors.text, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>{value}</Text>
        <Icon name="copy" size={14} tone="muted" />
      </View>
    </Pressable>
  );
}
