/**
 * Recevoir (web) — même écran que l'app (app/receive.tsx, §4.4) : QR en grand
 * avec le glyphe du compte au centre, adresse mono lisible, phrases claires sur
 * les réseaux compatibles, Copier + Partager. Les réseaux proposés sont ceux
 * approuvés par le téléphone dans la session WalletConnect (une entrée par
 * famille d'adresse : EVM / Solana / Bitcoin).
 */
import React, { useMemo, useState } from 'react';
import { View, ScrollView, Share, Image, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Text, Button, IconButton, Surface, AddressGlyph, SegmentedControl } from '../kit';
import { useTheme } from '../theme';
import { space, SCREEN_MARGIN, radius } from '../tokens';
import { useT } from '../../lib/settingsStore';
import { useWebConnect } from '../../lib/webConnect';
import { toast } from '../../lib/toast';
import { listChains, chainIconUrl, type ChainConfig } from '../../src';

type Fam = 'evm' | 'solana' | 'bitcoin';

export function ReceiveScreen({ chain, onClose }: { chain: ChainConfig; onClose: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const accounts = useWebConnect((s) => s.accounts);
  const peerName = useWebConnect((s) => s.peerName);

  // Une entrée par famille : pour l'EVM on garde le réseau courant s'il est
  // EVM (l'adresse est la même partout, mais le texte d'aide cite le réseau).
  const networks = useMemo(() => {
    const all = listChains({ includeTestnets: true });
    const byFam = new Map<Fam, { chain: ChainConfig; address: string }>();
    for (const a of accounts) {
      const c = all.find((x) => x.id === a.chainId);
      if (!c) continue;
      const fam = c.family as Fam;
      const cur = byFam.get(fam);
      const preferred = c.id === chain.id || (!cur && !c.testnet);
      if (!cur || preferred) byFam.set(fam, { chain: c, address: a.address });
    }
    return [...byFam.values()];
  }, [accounts, chain.id]);

  const [fam, setFam] = useState<Fam>((chain.family as Fam) ?? 'evm');
  const selected = networks.find((n) => n.chain.family === fam) ?? networks[0];
  if (!selected) return null;
  const { chain: sel, address } = selected;
  const selFam = sel.family as Fam;
  const hint =
    selFam === 'evm' ? t('hintEvm').replace(/\$\{selected\?\.name[^}]*\}/, sel.name)
    : selFam === 'solana' ? t('hintSolana')
    : t('hintBitcoin');
  const warn = selFam === 'evm' ? t('warnEvm') : selFam === 'solana' ? t('warnSolana') : t('warnBitcoin');

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    toast.success(t('addressCopied'), address);
  };
  const share = () => Share.share({ message: address }).catch(copy);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, zIndex: 20 }}>
      <View style={{ paddingHorizontal: SCREEN_MARGIN, height: 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t('back')} tone="ghost" onPress={onClose} />
        <Text variant="title2" style={{ flex: 1 }}>{t('receive')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: space[6], gap: space[5] }}>
        {networks.length > 1 ? (
          <SegmentedControl
            items={networks.map((n) => ({ key: n.chain.family as Fam, label: n.chain.name }))}
            value={selFam}
            onChange={setFam}
          />
        ) : null}
        {selFam === 'evm' ? <Text variant="caption" tone="secondary">{t('evmDescription')}</Text> : null}

        <Surface style={{ alignItems: 'center', gap: space[4], paddingVertical: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {chainIconUrl(sel.id) ? <Image source={{ uri: chainIconUrl(sel.id) }} style={{ width: 22, height: 22, borderRadius: 11 }} /> : null}
            <Text variant="body">{sel.name}</Text>
          </View>
          {/*
            Même garde-fou que sur mobile : `react-native-qrcode-svg` lève
            « No input text » sur une valeur vide et fait tomber l'écran entier.
          */}
          {!address ? (
            <Text variant="caption" tone="secondary">{t('receiveNoAddressTitle')}</Text>
          ) : (
          <View style={{ padding: space[3], backgroundColor: '#FFFFFF', borderRadius: radius.container }}>
            <QRCode value={address} size={220} ecl="H" backgroundColor="#FFFFFF" color="#06070D" />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: radius.round, padding: 4 }}>
                <AddressGlyph address={address} size={48} background />
              </View>
            </View>
          </View>
          )}
          <Text
            variant="body"
            tabular
            selectable
            accessibilityLabel={t('a11yAddress').replace('${address}', address)}
            style={{ fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.text, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16, flexShrink: 1 }}
          >
            {address}
          </Text>
          {peerName ? <Text variant="caption" tone="secondary">{peerName}</Text> : null}
          {sel.testnet ? <Text variant="bodySecondary" tone="warning">{t('testnetWarning')}</Text> : null}
        </Surface>

        <View style={{ gap: space[2] }}>
          <Text variant="bodySecondary" tone="secondary">{hint}</Text>
          <Text variant="bodySecondary" tone="warning">{warn}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label={t('actionCopy')} icon="copy" variant="primary" style={{ flex: 1 }} onPress={copy} />
          <Button label={t('share')} icon="share" variant="secondary" style={{ flex: 1 }} onPress={share} />
        </View>
      </ScrollView>
    </View>
  );
}
