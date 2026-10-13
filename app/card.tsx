/**
 * ONGLET « CARTE » — une vraie carte crypto, sans que Kalyx en émette une.
 *
 * Modèle « passerelle dApp » (src/domain/card/cardIssuers) : la carte est
 * émise par un partenaire public (Gnosis Pay, Holyheld, Spritz). Kalyx
 * l'habille, montre ce qui est prêt à dépenser, puis ouvre le SITE OFFICIEL de
 * l'émetteur dans son navigateur. Le KYC, les numéros, le CVV et Apple Pay /
 * Google Pay restent chez l'émetteur : Kalyx ne les voit jamais, et chaque
 * recharge passe par la confirmation de signature habituelle.
 *
 * DEUX ÉTATS, PERSISTANTS (lib/cardPrefs) :
 *  - configuration : choix de l'émetteur, du réseau de paiement, du style ;
 *  - carte configurée : l'écran s'ouvre DIRECTEMENT sur la carte, à chaque
 *    lancement, avec le solde prêt à dépenser et les actions.
 *
 * L'émetteur s'ouvre dans SON onglet du navigateur, réutilisé d'une fois sur
 * l'autre (page et session gardées), sur le réseau choisi — sans changer le
 * réseau du reste de l'app. Choisir un émetteur ici vaut accord pour qu'il voie
 * l'adresse du portefeuille : il se reconnecte ensuite sans redemander
 * (« sites mémorisés », révocable dans Sites connectés).
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { Screen, ScreenHeader, Card, Text, Button, Pressable, Divider, Input } from '../ui/kit';
import { NovaHero, Pills, SectionLabel, IconDisc } from '../ui/nova';
import { DappLogo } from '../ui/browser/DappTile';
import { KalyxCard } from '../ui/card/KalyxCard';
import { LogoImage } from '../ui/kit/LogoImage';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, radii } from '../ui/tokens';
import { useT, useSettings } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';
import { useCardPrefs, type CardTheme } from '../lib/cardPrefs';
import { useDappActivity } from '../lib/dappActivity';
import { usePortfolioStore, type Holding } from '../lib/portfolio/portfolioStore';
import { useWallet } from '../lib/walletStore';
import { cardAccountBalance, checkCardAccount, type CardBalanceLine } from '../lib/cardAccount';
import { CARD_ISSUERS, cardIssuer, cardChainFor, spendableOn, type CardIssuer } from '../src/domain/card/cardIssuers';
import { chainIconUrl, findAdapterV2 } from '../src';
import { decimalSeparator } from '../src/domain/validation/format';
import type { Key } from '../lib/i18n';

const THEME_LABEL: Record<CardTheme, Key> = { holo: 'cardThemeHolo', noir: 'cardThemeNoir', creme: 'cardThemeCreme' };
const REGION_LABEL: Record<'eu' | 'uk' | 'us', Key> = { eu: 'cardRegionEu', uk: 'cardRegionUk', us: 'cardRegionUs' };
const chainName = (id: string) => findAdapterV2(id)?.config.name ?? id;
const fmt = (n: number) => n.toFixed(2).replace('.', decimalSeparator());

/**
 * Carte À COMPTE ON-CHAIN (Gnosis Pay) : tout ce qui peut se faire sans API,
 * en natif. Solde réel de la carte lu sur la blockchain ; « Recharger » ouvre
 * l'envoi Kalyx vers le compte de la carte, pré-rempli (réseau, jeton,
 * destinataire), avec l'aperçu et la confirmation habituels. Seuls les numéros
 * et Apple Pay / Google Pay restent sur le site de l'émetteur — et le bouton
 * le dit.
 */
function OnchainCardPanel({ issuer, holdings, onOpenSite }: { issuer: CardIssuer; holdings: readonly Holding[]; onOpenSite: () => void }) {
  const t = useT();
  const { account, setAccount } = useCardPrefs(useShallow((s) => ({ account: s.account, setAccount: s.setAccount })));
  const own = useWallet(useShallow((s) => s.accounts.map((a) => a.evmAddress).filter(Boolean)));
  const chain = issuer.chainIds[0];
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<CardBalanceLine[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [noStable, setNoStable] = useState(false);

  const refresh = useCallback(() => {
    if (!account) return;
    setReadFailed(false);
    cardAccountBalance(account, issuer).then(setLines, () => setReadFailed(true));
  }, [account, issuer]);
  useFocusEffect(refresh);

  const link = async () => {
    setChecking(true);
    setErr(null);
    const r = await checkCardAccount(input, issuer, own);
    setChecking(false);
    if (r.ok) {
      haptic.success();
      setAccount(r.address);
      setInput('');
    } else {
      haptic.warning();
      setErr(t(({ format: 'cardLinkErrFormat', ownWallet: 'cardLinkErrOwn', notContract: 'cardLinkErrContract', network: 'cardLinkErrNetwork' } as const)[r.reason]));
    }
  };

  // Recharger : le stablecoin le mieux fourni du portefeuille, sur le réseau de la carte.
  const topUp = () => {
    const best = spendableOn(holdings, issuer, chain).parts.slice().sort((a, b) => b.amount - a.amount)[0];
    if (!best || !account) {
      haptic.warning();
      setNoStable(true);
      return;
    }
    haptic.light();
    router.push({ pathname: '/send', params: { to: account, chain, ...(best.contract ? { contract: best.contract } : {}), symbol: best.symbol, decimals: String(best.decimals) } });
  };

  if (!account) {
    return (
      <Card style={{ gap: space[3] }}>
        <Text variant="bodyStrong">{t('cardLinkTitle').replace('{issuer}', issuer.dapp.name)}</Text>
        <Text variant="caption" tone="secondary">{t('cardLinkHint').replace(/\{issuer\}/g, issuer.dapp.name)}</Text>
        <Input value={input} onChangeText={(v) => { setInput(v); setErr(null); }} placeholder="0x…" autoCapitalize="none" autoCorrect={false} sensitive error={err} accessibilityLabel={t('cardLinkTitle').replace('{issuer}', issuer.dapp.name)} />
        <Button label={t('cardLinkAction')} loading={checking} disabled={!input.trim() || checking} onPress={() => void link()} />
        <Button label={t('cardOrder').replace('{issuer}', issuer.dapp.name)} variant="secondary" onPress={onOpenSite} />
      </Card>
    );
  }

  const short = `${account.slice(0, 6)}…${account.slice(-4)}`;
  return (
    <>
      <Card style={{ gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="secondary">{t('cardBalanceTitle')}</Text>
          <Pressable onPress={refresh} accessibilityRole="button" accessibilityLabel={t('refresh')} hitSlop={8}>
            <Icon name="refresh" size={18} tone="muted" />
          </Pressable>
        </View>
        {readFailed ? (
          <Text variant="body" tone="secondary">{t('cardBalanceError')}</Text>
        ) : lines === null ? (
          <Text variant="title2" tone="secondary">…</Text>
        ) : lines.length === 0 ? (
          <Text variant="title2" tabular>{fmt(0)} {issuer.stables[0] === 'EURE' ? 'EURe' : 'USDC'}</Text>
        ) : (
          lines.map((l) => <Text key={l.contract} variant="title2" tabular>{fmt(l.amount)} {l.symbol}</Text>)
        )}
        <Text variant="micro" tone="secondary">{t('cardAccountOn').replace('{address}', short).replace('{chain}', chainName(chain))}</Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <ActionCell icon="add" label={t('cardTopUp')} onPress={topUp} primary />
        <ActionCell icon="eye" label={t('cardManage')} sub={issuer.dapp.name} onPress={onOpenSite} />
        <ActionCell icon="card" label={Platform.OS === 'android' ? 'Google Pay' : 'Apple Pay'} sub={issuer.dapp.name} onPress={onOpenSite} />
      </View>
      {noStable ? (
        <Card style={{ gap: space[2] }}>
          <Text variant="body">{t('cardNoStable').replace('{chain}', chainName(chain))}</Text>
          <Button label={t('cardGetStable')} variant="secondary" onPress={() => router.push('/swap')} />
        </Card>
      ) : null}
      <Pressable onPress={() => { haptic.selection(); setAccount(null); setLines(null); }} accessibilityRole="button" style={{ alignSelf: 'center', padding: space[2] }}>
        <Text variant="caption" tone="secondary">{t('cardUnlink')}</Text>
      </Pressable>
    </>
  );
}

/** Une action de la carte. `sub` : où elle se passe (le site de l'émetteur), écrit sous le libellé. */
function ActionCell({ icon, label, sub, onPress, primary }: { icon: 'add' | 'eye' | 'card'; label: string; sub?: string; onPress: () => void; primary?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${label}, ${sub}` : label} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: space[3], borderRadius: radii.lg, backgroundColor: primary ? colors.primary : colors.surface1, borderWidth: 1, borderColor: primary ? colors.primary : colors.border }}>
      <Icon name={icon} size={22} color={primary ? colors.onPrimary : colors.text} />
      <Text variant="caption" numberOfLines={1} style={{ textAlign: 'center', color: primary ? colors.onPrimary : colors.text }}>{label}</Text>
      {sub ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="micro" tone="secondary" numberOfLines={1}>{sub}</Text>
          <Icon name="arrowUpRight" size={10} tone="faint" />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function CardScreen() {
  const t = useT();
  const { colors } = useTheme();
  const p = useCardPrefs();
  const holder = useSettings((s) => s.profileName);
  const holdings = usePortfolioStore(useShallow((s) => s.holdings));
  const [memo, setMemo] = useState('');
  const loadPrefs = p.load;
  useEffect(() => {
    void loadPrefs();
    void useDappActivity.getState().load();
  }, [loadPrefs]);
  useEffect(() => setMemo(p.last4 ?? ''), [p.last4]);

  const chosen = p.issuer ? cardIssuer(p.issuer) : null;
  const chain = chosen ? cardChainFor(chosen, p.chain) : null;
  const spend = chosen && chain ? spendableOn(holdings, chosen, chain) : null;

  /*
   * L'émetteur, dans SON onglet (réutilisé), sur le réseau choisi. Le site est
   * mémorisé : il retrouve l'adresse sans nouvelle demande de connexion.
   */
  const open = async (i: CardIssuer) => {
    haptic.light();
    // Liste des sites mémorisés relue AVANT d'y ajouter l'émetteur : écrire sur une liste pas encore chargée l'écraserait.
    await useDappActivity.getState().load();
    useDappActivity.getState().remember(i.dapp.host);
    router.push({ pathname: '/browser', params: { url: i.dapp.url, chain: cardChainFor(i, p.chain), n: String(Date.now()) } });
  };

  const card = (
    <KalyxCard
      theme={p.theme}
      holder={holder || undefined}
      issuerName={chosen?.dapp.name}
      last4={p.last4}
      label={t('cardLabel')}
      backText={chosen ? t('cardBack').replace('{issuer}', chosen.dapp.name) : t('cardBackNone')}
    />
  );
  const stylePicker = (
    <>
      <SectionLabel>{t('cardStyle')}</SectionLabel>
      <Pills items={(Object.keys(THEME_LABEL) as CardTheme[]).map((k) => ({ key: k, label: t(THEME_LABEL[k]) }))} value={p.theme} onChange={(k) => { haptic.selection(); p.setTheme(k); }} />
    </>
  );

  /* ── CARTE CONFIGURÉE : on arrive directement dessus ── */
  if (p.loaded && p.configured && chosen && chain) {
    return (
      <Screen scene="top">
        <ScreenHeader />
        <NovaHero align="left" title={t('cardTitle')} subtitle={t('cardWithIssuer').replace('{issuer}', chosen.dapp.name)} />
        {card}

        {/* Prêt à dépenser : les stablecoins du portefeuille sur le réseau de paiement. */}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {chainIconUrl(chain) ? <LogoImage uri={chainIconUrl(chain)!} size={36} /> : null}
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="secondary">{t(chosen.topUp === 'onchain' ? 'cardInWallet' : 'cardSpendable').replace('{chain}', chainName(chain))}</Text>
            <Text variant="title2" tabular>{fmt(spend?.total ?? 0)} {spend?.parts.length === 1 ? spend.parts[0].symbol : chosen.stables[0] === 'EURE' ? 'EURe' : 'USDC'}</Text>
          </View>
        </Card>

        {chosen.topUp === 'onchain' ? (
          <OnchainCardPanel issuer={chosen} holdings={holdings} onOpenSite={() => void open(chosen)} />
        ) : (
          <>
            {/*
              Émetteur SANS accès public (Holyheld exige une clé d'API partenaire,
              Spritz aussi) : un seul bouton, qui dit ce qu'il fait. Plus de faux
              « Recharger / Mes numéros » qui ouvraient tous la même page.
            */}
            <Button label={t('cardOrder').replace('{issuer}', chosen.dapp.name)} onPress={() => void open(chosen)} />
            <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{t('cardSiteOnly').replace('{issuer}', chosen.dapp.name)}</Text>
          </>
        )}

        {stylePicker}

        <Card padded={false}>
          <View style={{ padding: space[4], gap: space[2] }}>
            <Text variant="bodyStrong">{t('cardLast4Title')}</Text>
            <Input
              value={memo}
              onChangeText={(v) => setMemo(v.replace(/\D/g, '').slice(0, 4))}
              onEndEditing={() => p.setLast4(memo || null)}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="1234"
              accessibilityLabel={t('cardLast4Title')}
            />
            <Text variant="micro" tone="secondary">{t('cardLast4Hint')}</Text>
          </View>
          <Divider />
          <Pressable onPress={() => { haptic.selection(); p.editSetup(); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
            <Icon name="gear" size={20} color={colors.text} />
            <Text variant="body" style={{ flex: 1 }}>{t('cardChangeSetup')}</Text>
            <Icon name="chevron" size={18} tone="faint" />
          </Pressable>
        </Card>
        <Text variant="micro" tone="secondary" style={{ textAlign: 'center' }}>{t('cardDisclaimer')}</Text>
      </Screen>
    );
  }

  /* ── CONFIGURATION : émetteur, réseau, style ── */
  return (
    <Screen scene="top">
      <ScreenHeader />
      <NovaHero align="left" title={t('cardTitle')} subtitle={t('cardSubtitle')} />
      {card}
      <Text variant="caption" tone="secondary" style={{ textAlign: 'center', marginTop: -space[2] }}>{t('cardTapToFlip')}</Text>

      <SectionLabel>{t('cardIssuerSection')}</SectionLabel>
      <Card padded={false}>
        {CARD_ISSUERS.map((i, idx) => {
          const on = chosen?.id === i.id;
          return (
            <View key={i.id}>
              {idx > 0 ? <Divider inset={68} /> : null}
              <Pressable onPress={() => { haptic.selection(); p.setIssuer(i.id); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={i.dapp.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] }}>
                <DappLogo host={i.dapp.host} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{i.dapp.name}</Text>
                  <Text variant="caption" tone="secondary">{t(i.modelKey)}</Text>
                  <Text variant="micro" tone="secondary">{i.regions.map((r) => t(REGION_LABEL[r])).join(' · ')}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.warm : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warm }} /> : null}
                </View>
              </Pressable>
            </View>
          );
        })}
      </Card>

      {chosen && chain ? (
        <>
          <SectionLabel>{t('cardNetwork')}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {chosen.chainIds.map((c) => {
              const on = c === chain;
              const ic = chainIconUrl(c);
              return (
                <Pressable key={c} onPress={() => { haptic.selection(); p.setChain(c); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={chainName(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radii.full, borderWidth: 1.5, borderColor: on ? colors.warm : colors.border, backgroundColor: on ? colors.surface1 : 'transparent' }}>
                  {ic ? <LogoImage uri={ic} size={18} /> : null}
                  <Text variant="caption" style={{ fontWeight: on ? '700' : '500' }}>{chainName(c)}</Text>
                </Pressable>
              );
            })}
          </View>
          {chosen.dapp.families.includes('solana') ? <Text variant="caption" tone="secondary">{t('cardSolanaWc')}</Text> : null}
        </>
      ) : null}

      {stylePicker}

      <SectionLabel>{t('cardHowTitle')}</SectionLabel>
      <Card style={{ gap: space[3] }}>
        {([
          ['dapps', 'cardHow1'],
          ['security', 'cardHow2'],
          ['sign', 'cardHow3'],
        ] as const).map(([icon, key]) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <IconDisc name={icon} size={34} />
            <Text variant="caption" style={{ flex: 1 }}>{t(key)}</Text>
          </View>
        ))}
      </Card>
      <Button label={chosen ? t('cardSetupDone').replace('{issuer}', chosen.dapp.name) : t('cardPickIssuer')} disabled={!chosen} onPress={() => { haptic.success?.(); p.finishSetup(); }} />
      <Text variant="micro" tone="secondary" style={{ textAlign: 'center' }}>{t('cardDisclaimer')}</Text>
    </Screen>
  );
}
