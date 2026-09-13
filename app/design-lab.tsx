/**
 * Design Lab (§9) — écran caché (7 taps sur la version dans « À propos »,
 * builds de dev uniquement). Tous les composants du kit dans tous leurs états,
 * dans les deux thèmes : c'est ici qu'on vérifie la cohérence avant release.
 */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings, useT } from '../lib/settingsStore';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN } from '../ui/tokens';
import { toast } from '../lib/toast';
import {
  Text, Button, IconButton, HoldButton, Surface, Divider, ListRow, TokenRow, TokenIcon, AddressGlyph,
  AmountDisplay, Chip, RiskBadge, SegmentedControl, Input, Skeleton, EmptyState, Halo,
} from '../ui/kit';

const ADDR = ['0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F7', '0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F8', '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', '0x28C6c06298d514Db089934071355E5743bf21d60', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <View style={{ gap: space[3] }}>
      <Text variant="title2">{title}</Text>
      {children}
    </View>
  );
}

export default function DesignLab() {
  const t = useT();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const setThemePref = useSettings((s) => s.setThemePref);
  const [seg, setSeg] = useState<'1J' | '1S' | '1M' | '1A'>('1S');
  const [amount, setAmount] = useState('12 480,32');
  const [input, setInput] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[4], paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + space[10], gap: space[8] }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title1">Design Lab</Text>
          <Chip label={mode === 'dark' ? 'Sombre' : 'Clair'} icon="appearance" onPress={() => setThemePref(mode === 'dark' ? 'light' : 'dark')} />
        </View>

        <Section title="Solde + halo">
          <View style={{ overflow: 'hidden' }}>
            <Halo size={260} mood="up" style={{ position: 'absolute', right: -90, top: -110 }} />
            <AmountDisplay value={amount} suffix="€" />
            <Text variant="caption" tone="up" tabular>↑ +214,10 € aujourd'hui</Text>
            <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
              <Button label="Rouler" variant="secondary" size="sm" onPress={() => setAmount(amount === '12 480,32' ? '12 694,42' : '12 480,32')} />
              <Button label="Zéro" variant="secondary" size="sm" onPress={() => setAmount('0,00')} />
            </View>
          </View>
        </Section>

        <Section title="Typographie">
          <Text variant="balance" tabular>48 000,00</Text>
          <Text variant="title1">Titre 1 — Choisis un code</Text>
          <Text variant="title2">Titre 2 — Mes positions</Text>
          <Text variant="body">Corps — Ces 12 mots sont ton wallet.</Text>
          <Text variant="bodySecondary" tone="secondary">Corps secondaire — Qui les a peut tout prendre.</Text>
          <Text variant="caption" tone="secondary">Légende — Frais réseau environ 0,04 €</Text>
          <Text variant="micro" tone="tertiary">Micro — badge</Text>
        </Section>

        <Section title="Boutons">
          <Button label={t("aiSend")} icon="send" onPress={() => toast.success(t("sendTitle"), '50 USDC sont en route')} />
          <Button label="Secondaire" variant="secondary" onPress={() => {}} />
          <Button label="Discret" variant="ghost" onPress={() => {}} />
          <Button label="Supprimer le wallet" variant="destructive" onPress={() => {}} />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label="Désactivé" disabled onPress={() => {}} size="md" style={{ flex: 1 }} />
            <Button label="Chargement" loading onPress={() => {}} size="md" style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <IconButton icon="receive" label={t("receive")} />
            <IconButton icon="send" label={t("aiSend")} tone="primary" />
            <IconButton icon="exchange" label={t("actionSwap")} tone="ghost" />
            <IconButton icon="scan" label={t("chipScan")} disabled />
          </View>
          <HoldButton label={t("holdToSend")} onComplete={() => toast.success(t("sendTitle"), 'Éclat !')} />
          <HoldButton label="Signer quand même" danger icon="sign" onComplete={() => toast.warning('Signé', 'Niveau danger')} />
        </Section>

        <Section title="Glyphes d'adresse (anti-empoisonnement)">
          <Surface>
            <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
              {ADDR.map((a) => (
                <View key={a} style={{ alignItems: 'center', gap: space[1] }}>
                  <AddressGlyph address={a} size={48} />
                  <Text variant="micro" tone="tertiary">…{a.slice(-4)}</Text>
                </View>
              ))}
            </View>
            <Text variant="caption" tone="secondary" style={{ marginTop: space[3] }}>Les deux premières diffèrent d'un seul caractère : étoiles différentes.</Text>
          </Surface>
        </Section>

        <Section title="Liste de tokens (une carte par groupe)">
          <Surface padded={false}>
            <TokenRow symbol="ETH" name="Ethereum" logo="https://assets.coingecko.com/coins/images/279/small/ethereum.png" balance="1.42 ETH" fiat="4 210,00 €" changePct={2.1} onPress={() => {}} />
            <Divider inset={68} />
            <TokenRow symbol="USDC" name="USD Coin" address="0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" balance="3 100 USDC" fiat="3 100,00 €" changePct={0} onPress={() => {}} />
            <Divider inset={68} />
            <TokenRow symbol="SOL" name="Solana" address="11111111111111111111111111111111" balance="0.5 SOL" fiat="49,52 €" changePct={-3.4} onPress={() => {}} />
            <Divider inset={68} />
            <TokenRow symbol="ETH" name="Masqué" balance="1 ETH" fiat="2 000 €" changePct={1} hidden />
          </Surface>
          <Surface padded={false}>
            <ListRow left={<TokenIcon symbol="K" seed="kalyx" size={36} />} title="Ligne simple" subtitle="Avec sous-titre" chevron onPress={() => {}} />
            <Divider inset={64} />
            <ListRow title="Sans icône" right={<Text variant="caption" tone="secondary">Détail</Text>} />
          </Surface>
        </Section>

        <Section title="Contrôles">
          <SegmentedControl items={[{ key: '1J', label: '1J' }, { key: '1S', label: '1S' }, { key: '1M', label: '1M' }, { key: '1A', label: '1A' }]} value={seg} onChange={setSeg} />
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            <Chip label={t("filterAll")} selected onPress={() => {}} />
            <Chip label="Staking" onPress={() => {}} />
            <Chip label="Prêt" icon="staking" onPress={() => {}} />
            <Chip label="Statique" />
          </View>
          <Input label={t("labelRecipient")} placeholder={t("placeholderAddress")} value={input} onChangeText={setInput} />
          <Input label="Erreur" value="0xd8dA…f8F8" error="Tu n'as jamais envoyé à cette adresse. Vérifie la fin : …f8F8" />
          <Input label="Désactivé" value="Lecture seule" editable={false} />
        </Section>

        <Section title="Risque">
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            <RiskBadge level="none" />
            <RiskBadge level="warning" />
            <RiskBadge level="danger" />
          </View>
        </Section>

        <Section title="États">
          <Surface style={{ gap: space[3] }}>
            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
              <Skeleton width={40} height={40} round />
              <View style={{ flex: 1, gap: space[2] }}>
                <Skeleton width="60%" />
                <Skeleton width="35%" height={12} />
              </View>
              <Skeleton width={64} />
            </View>
          </Surface>
          <Surface>
            <EmptyState icon="receive" title={t("emptyTokensTitle")} body={t("emptyTokensBody")} actionLabel={t("receive")} onAction={() => {}} />
          </Surface>
        </Section>

        <Section title="Surfaces">
          <Surface level={1}><Text variant="body">Nuit — conteneur</Text></Surface>
          <Surface level={2}><Text variant="body">Orbite — sheet, input</Text></Surface>
          <Surface level={3}><Text variant="body">Crépuscule — pressé</Text></Surface>
        </Section>
      </ScrollView>
    </View>
  );
}
