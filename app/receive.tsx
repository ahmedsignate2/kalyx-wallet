/**
 * Recevoir (§4.4) — QR en grand avec le glyphe du compte au centre (correction
 * d'erreur H), adresse en groupes de 4 pour la lire à voix haute, phrases
 * claires sur les réseaux compatibles, Copier (haptique + toast) et Partager.
 * Le réseau se choisit ici (famille d'adresse : EVM / Solana / Bitcoin).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, Share, Image, Modal, Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Text, Button, IconButton, Surface, AddressGlyph, SegmentedControl, Pressable as KPressable } from '../ui/kit';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { accountDisplayName } from '../lib/walletNames';
import { useSettings, useT } from '../lib/settingsStore';
import { useCustomChains } from '../lib/customChainsStore';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';
import { getAdapter, listChains, chainIconUrl } from '../src';

type Fam = 'evm' | 'solana' | 'bitcoin';

export default function Receive() {
  const t = useT();
  const language = useSettings((st) => st.language);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const accounts = useWallet((s) => s.accounts);
  const idx = useWallet((s) => s.activeAccountIndex);
  const activeChain = useWallet((s) => s.activeChain);
  const showTestnets = useSettings((s) => s.showTestnets);
  const customChains = useCustomChains((s) => s.chains);
  const stored = accounts.find((a) => a.index === idx) ?? accounts[0];
  const initial = getAdapter(activeChain).config;
  const [environment, setEnvironment] = useState<'mainnet' | 'testnet'>(initial.testnet && showTestnets ? 'testnet' : 'mainnet');
  const [selectedChain, setSelectedChain] = useState(activeChain);
  const [testnetPickerOpen, setTestnetPickerOpen] = useState(false);

  /**
   * Une adresse existe-t-elle pour cette famille sur ce portefeuille ?
   *
   * Un portefeuille importé par clé privée ne sert QU'UNE famille : les deux
   * autres adresses sont vides. Offrir l'onglet quand même menait à un écran sans
   * adresse — et, avant le garde-fou du QR, à un écran qui tombait.
   */
  const hasAddressFor = useCallback(
    (family: string) =>
      family === 'solana' ? !!stored?.solAddress : family === 'bitcoin' ? !!stored?.btcAddress : !!stored?.evmAddress,
    [stored?.evmAddress, stored?.solAddress, stored?.btcAddress],
  );

  const networks = useMemo(() => {
    if (environment === 'mainnet') {
      return listChains({ includeTestnets: false })
        .filter((c) => c.id === 'ethereum' || c.id === 'solana' || c.id === 'bitcoin')
        /*
         * ON NE PROPOSE QUE CE QU'ON PEUT SERVIR. Masquer plutôt que griser : un
         * onglet grisé pose une question — « pourquoi ? » — à laquelle cet écran
         * n'a pas la place de répondre, alors que son absence ne trompe personne.
         */
        .filter((c) => hasAddressFor(c.family));
    }
    const configured = listChains({ includeTestnets: true }).filter((c) => c.testnet);
    const custom = customChains.filter((c) => c.testnet);
    const byId = new Map([...configured, ...custom].map((chain) => [chain.id, chain]));
    // Même règle sur les réseaux de test : pas d'adresse, pas d'onglet.
    return [...byId.values()].filter((c) => hasAddressFor(c.family));
  }, [environment, customChains, hasAddressFor]);

  if (!stored) return null;
  const selected = networks.find((c) => c.id === selectedChain) ?? networks[0];
  const fam = selected?.family as Fam | undefined;
  const address = fam === 'solana' ? stored.solAddress ?? '' : fam === 'bitcoin' ? stored.btcAddress : stored.evmAddress;
  const isTestnet = selected?.testnet === true;
  const hint =
    // Regex et non littéral : chaque langue traduit le repli À L'INTÉRIEUR du
    // repère (`'ce réseau'`, `'this network'`, `'dieses Netzwerk'`…), donc
    // chercher la version française ne marchait qu'en français — partout
    // ailleurs le `${…}` s'affichait tel quel.
    fam === 'evm' ? t('hintEvm').replace(/\$\{[^}]*\}/, selected?.name ?? t('thisNetwork'))
    : fam === 'solana' ? t("hintSolana")
    : t("hintBitcoin");
  const warn =
    fam === 'evm' ? t("warnEvm")
    : fam === 'solana' ? t("warnSolana")
    : t("warnBitcoin");

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    haptic.light();
    toast.success(t("addressCopied"), address);
  };
  const share = () => Share.share({ message: address }).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => router.back()} />
        <Text variant="title2" style={{ flex: 1 }}>{t("receive")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[5] }}>
        {showTestnets ? <SegmentedControl items={[{ key: 'mainnet', label: t("tabMainnet") }, { key: 'testnet', label: t("tabTestnet") }]} value={environment} onChange={(value) => {
          const next = value as 'mainnet' | 'testnet';
          setEnvironment(next);
          setSelectedChain(next === 'testnet' ? 'sepolia' : 'ethereum');
        }} /> : null}
        {environment === 'mainnet' && networks.length > 1 ? <SegmentedControl
          items={networks.map((c) => ({ key: c.id, label: c.name }))}
          value={selected?.id ?? networks[0]?.id}
          onChange={setSelectedChain}
        /> : null}
        {environment === 'testnet' && selected ? (
          <KPressable
            onPress={() => setTestnetPickerOpen(true)}
            accessibilityLabel={t('a11yTestnetSelected').replace('${selected.name}', selected.name)}
            accessibilityRole="button"
            style={{
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.05)',
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            {chainIconUrl(selected.id) ? <Image source={{ uri: chainIconUrl(selected.id) }} style={{ width: 20, height: 20, borderRadius: 10 }} /> : null}
            <Text variant="caption">{selected.name}</Text>
            <Icon name="caretDown" size={16} tone="muted" />
          </KPressable>
        ) : null}
        {environment === 'mainnet' ? (
          <Text variant="caption" tone="secondary">{t("evmDescription")}</Text>
        ) : null}

        <Surface style={{ alignItems: 'center', gap: space[4], paddingVertical: space[6] }}>
          {selected && environment === 'mainnet' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {chainIconUrl(selected.id) ? <Image source={{ uri: chainIconUrl(selected.id) }} style={{ width: 22, height: 22, borderRadius: 11 }} /> : null}
            <Text variant="body">{selected.name}</Text>
          </View> : null}
          {/*
            JAMAIS DE QR SANS ADRESSE. `react-native-qrcode-svg` lève
            « No input text » sur une valeur vide, et cette exception faisait
            tomber tout l'écran — pas un champ vide, un écran blanc. Le cas arrive
            dès qu'un portefeuille importé par clé privée ne sert pas la famille
            affichée : l'adresse vaut alors la chaîne vide.
          */}
          {address ? (
            <View style={{ padding: space[3], backgroundColor: '#FFFFFF', borderRadius: radius.container }}>
              <QRCode value={address} size={220} ecl="H" backgroundColor="#FFFFFF" color="#06070D" />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: radius.round, padding: 4 }}>
                  <AddressGlyph address={address} size={48} background />
                </View>
              </View>
            </View>
          ) : (
            <View style={{ paddingHorizontal: space[4], gap: space[2], alignItems: 'center' }}>
              <Text variant="body">{t('receiveNoAddressTitle')}</Text>
              <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>
                {t('receiveNoAddressBody')}
              </Text>
            </View>
          )}
          <Text
            variant="body"
            tabular
            selectable
            accessibilityLabel={t('a11yAddress').replace('${address}', address)}
            style={{
              fontSize: 13,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              color: colors.text,
              textAlign: 'center',
              lineHeight: 20,
              paddingHorizontal: 16,
              flexShrink: 1,
            }}
          >
            {address}
          </Text>
          <Text variant="caption" tone="secondary">{accountDisplayName(stored, t)}</Text>
          {isTestnet ? <Text variant="bodySecondary" tone="warning">{t("testnetWarning")}</Text> : null}
        </Surface>

        <View style={{ gap: space[2] }}>
          <Text variant="bodySecondary" tone="secondary">{hint}</Text>
          <Text variant="bodySecondary" tone="warning">{warn}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label={t("actionCopy")} icon="copy" variant="primary" style={{ flex: 1 }} onPress={copy} />
          <Button label={t("share")} icon="share" variant="secondary" style={{ flex: 1 }} onPress={share} />
        </View>
      </ScrollView>
      <Modal
        visible={testnetPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTestnetPickerOpen(false)}
      >
        <KPressable
          onPress={() => setTestnetPickerOpen(false)}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <KPressable
            onPress={() => undefined}
            style={{
              maxHeight: '75%',
              backgroundColor: colors.bg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: SCREEN_MARGIN,
              gap: space[3],
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            <Text variant="title2">{t("chooseTestnetTitle")}</Text>
            <ScrollView contentContainerStyle={{ gap: space[2] }}>
              {networks.map((network) => {
                const selectedNetwork = network.id === selected?.id;
                const addressType = network.family === 'solana' ? t("addressTypeSolana") : t("addressTypeEvm");
                return (
                  <KPressable
                    key={network.id}
                    onPress={() => {
                      setSelectedChain(network.id);
                      setTestnetPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedNetwork }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space[2],
                      padding: space[3],
                      borderRadius: 14,
                      backgroundColor: selectedNetwork ? colors.surface2 : colors.surface1,
                      borderWidth: selectedNetwork ? 1 : 0,
                      borderColor: colors.primary,
                    }}
                  >
                    {chainIconUrl(network.id) ? <Image source={{ uri: chainIconUrl(network.id) }} style={{ width: 24, height: 24, borderRadius: 12 }} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text variant="body">{network.name}</Text>
                      <Text variant="caption" tone="secondary">{addressType}</Text>
                    </View>
                    {selectedNetwork ? <Icon name="checkmark" size={20} color={colors.primary} /> : null}
                  </KPressable>
                );
              })}
            </ScrollView>
          </KPressable>
        </KPressable>
      </Modal>
    </View>
  );
}
