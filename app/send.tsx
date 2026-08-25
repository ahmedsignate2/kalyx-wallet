import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, Card, Button, Title, Muted } from '../ui/components';
import { SuccessModal } from '../ui/SuccessModal';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import type { Unlock } from '../lib/walletStore';
import { Icon } from '../ui/icon';
import { notifyAndLog } from '../lib/notificationCenter';
import { watchConfirmation } from '../lib/txWatch';
import { fonts, spacing, useTheme } from '../ui/theme';
import { NovaRing } from '../ui/NovaRing';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { handleSmartError } from '../lib/errorHandler';
import { useRecentRecipients, type RecipientFamily } from '../lib/recentRecipientsStore';
import { getAdapter, isWalletError, isValidEvmAddress, isValidSolanaAddress, parseAmount, formatBalance, getCustomTokens, looksLikeEnsName, resolveEnsName, EvmChainAdapter, type FeeOptions, type FeeSpeed } from '../src';

export default function Send() {
  const { colors, typography } = useTheme();
  const t = useT();
  const signAndSend = useWallet((s) => s.signAndSend);
  const sendToken = useWallet((s) => s.sendToken);
  const sendSolToken = useWallet((s) => s.sendSolToken);
  const activeChain = useWallet((s) => s.activeChain);
  const account = useWallet((s) => s.account);
  const chain = getAdapter(activeChain).config;
  const addRecent = useRecentRecipients((s) => s.add);
  const allRecents = useRecentRecipients((s) => s.recents);
  const recents = allRecents.filter((r) => r.family === chain.family);
  const params = useLocalSearchParams<{ to?: string; amount?: string; contract?: string; mint?: string; symbol?: string; decimals?: string }>();
  const toParam = params.to;
  const amountParam = params.amount;
  const decimals = params.decimals != null ? Number(params.decimals) : 18;
  // 3 modes : token SPL (mint), token ERC-20 (contract), ou natif.
  const token = params.contract
    ? { kind: 'erc20' as const, contract: String(params.contract), symbol: String(params.symbol ?? 'TOKEN'), decimals }
    : params.mint
      ? { kind: 'spl' as const, mint: String(params.mint), symbol: String(params.symbol ?? 'TOKEN'), decimals }
      : null;
  const symbol = token ? token.symbol : chain.nativeSymbol;
  const [to, setTo] = useState('');

  useEffect(() => {
    if (toParam) setTo(String(toParam));
  }, [toParam]);
  const [amount, setAmount] = useState('');
  useEffect(() => {
    if (amountParam) setAmount(String(amountParam));
  }, [amountParam]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false); // feuille ConfirmUnlock ouverte
  // Frais de gas (EVM) : paliers Lent/Normal/Rapide.
  const [feeOptions, setFeeOptions] = useState<FeeOptions | null>(null);
  const [speed, setSpeed] = useState<FeeSpeed>('normal');
  useEffect(() => {
    if (chain.family !== 'evm') { setFeeOptions(null); return; }
    let cancelled = false;
    const adapter = getAdapter(activeChain);
    if (!(adapter instanceof EvmChainAdapter)) return;
    // gasLimit indicatif : ~21k natif, ~65k pour un transfert ERC-20.
    adapter.getFeeOptions(token?.kind === 'erc20' ? 65_000n : 21_000n)
      .then((o) => !cancelled && setFeeOptions(o))
      .catch(() => !cancelled && setFeeOptions(null));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChain, token?.kind]);
  // Succès : hash + résumé de ce qui vient d'être envoyé (pour l'écran animé).
  const [success, setSuccess] = useState<{ hash: string; summary: string } | null>(null);

  // Résolution ENS (mainnet, EVM uniquement) : `vitalik.eth` → adresse.
  const isEvm = chain.family === 'evm';
  const isEnsInput = isEvm && looksLikeEnsName(to);
  const [ens, setEns] = useState<{ status: 'idle' | 'resolving' | 'found' | 'notfound'; address: string | null }>({ status: 'idle', address: null });
  useEffect(() => {
    if (!isEnsInput) {
      setEns({ status: 'idle', address: null });
      return;
    }
    let cancelled = false;
    setEns({ status: 'resolving', address: null });
    const name = to.trim();
    const timer = setTimeout(() => {
      resolveEnsName(name)
        .then((addr) => {
          if (cancelled) return;
          setEns(addr ? { status: 'found', address: addr } : { status: 'notfound', address: null });
        })
        .catch(() => !cancelled && setEns({ status: 'notfound', address: null }));
    }, 400); // débruitage : on attend une pause de frappe
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [to, isEnsInput]);

  // Adresse réellement utilisée : l'adresse résolue si la saisie est un nom ENS.
  const recipient = isEnsInput ? ens.address ?? '' : to.trim();

  // Solde disponible de l'actif envoyé (natif ou ERC-20) : affiché + vérifié en amont.
  // SPL non couvert ici (undefined) → on garde le repli via l'échec on-chain.
  const [balance, setBalance] = useState<bigint | null>(null);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setBalance(null);
    const fetchBal = async (): Promise<bigint | null> => {
      if (token?.kind === 'spl') return null;
      // account.address = déjà l'adresse de la famille du réseau actif.
      if (token?.kind === 'erc20') {
        const [t] = await getCustomTokens(chain, account.address, [token.contract]);
        return t ? t.raw : null;
      }
      return (await getAdapter(activeChain).getBalance(account.address)).raw;
    };
    fetchBal()
      .then((b) => !cancelled && setBalance(b))
      .catch(() => !cancelled && setBalance(null));
    return () => {
      cancelled = true;
    };
    // chain est dérivé de activeChain (réf stable via l'adapter caché) → pas dans les deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, activeChain, token?.kind, token?.contract]);

  // Montant saisi dépasse-t-il le solde connu ? (natif/ERC-20 uniquement)
  const overBalance = (() => {
    if (balance == null || !amount) return false;
    try {
      return parseAmount(amount, token?.decimals ?? chain.nativeDecimals).raw > balance;
    } catch {
      return false; // montant mal formé : géré par la validation d'onReview
    }
  })();

  const onReview = () => {
    setError(null);
    if (overBalance) {
      setError(`Solde insuffisant. Tu possèdes ${formatBalance(balance!, token?.decimals ?? chain.nativeDecimals, 6)} ${symbol}.`);
      return;
    }
    // Si la saisie est un nom ENS, il faut une adresse résolue avant de continuer.
    if (isEnsInput && !ens.address) {
      setError(ens.status === 'resolving' ? 'Résolution du nom ENS en cours…' : 'Nom ENS introuvable.');
      return;
    }
    try {
      // Validation hors-ligne immédiate (adresse + montant).
      if (token?.kind === 'spl') {
        if (!isValidSolanaAddress(recipient)) throw new Error('Adresse Solana du destinataire invalide.');
        parseAmount(amount, token.decimals);
      } else if (token?.kind === 'erc20') {
        if (!isValidEvmAddress(recipient)) throw new Error('Adresse du destinataire invalide.');
        parseAmount(amount, token.decimals); // lève si le montant est mal formé
      } else {
        getAdapter(activeChain).buildTransfer({ to: recipient, amount });
      }
    } catch (e) {
      setError(isWalletError(e) ? e.message : e instanceof Error ? e.message : 'Saisie invalide');
      return;
    }
    // Validation OK → feuille de confirmation (biométrie auto ou PIN).
    setConfirming(true);
  };

  // Exécuté par ConfirmUnlock avec le déverrouillage choisi (biométrie ou PIN).
  // LÈVE en cas d'échec pour que la feuille gère (WRONG_PIN → réessai).
  const perform = async (unlock: Unlock) => {
    try {
      const gas = feeOptions ? feeOptions[speed] : undefined; // palier de frais choisi (EVM)
      const hash =
        token?.kind === 'spl'
          ? await sendSolToken(recipient, amount, { mint: token.mint, decimals: token.decimals }, unlock)
          : token?.kind === 'erc20'
            ? await sendToken(recipient, amount, { contract: token.contract, decimals: token.decimals }, unlock, gas)
            : await signAndSend(recipient, amount, unlock, gas);
      // Résumé : on privilégie le nom ENS s'il y en a un, sinon l'adresse tronquée.
      const dest = isEnsInput ? to.trim() : `${recipient.slice(0, 8)}…${recipient.slice(-6)}`;
      const summary = `${amount} ${symbol} envoyés à ${dest}`;
      setSuccess({ hash, summary });
      addRecent(recipient, chain.family as RecipientFamily); // mémorise le destinataire
      notifyAndLog('tx', t('transferSent'), summary);
      void watchConfirmation(activeChain, hash, summary); // notif à la confirmation
    } catch (e) {
      if (!(isWalletError(e) && e.code === 'WRONG_PIN')) {
        handleSmartError(e);
      }
      throw e;
    }
  };

  return (
    <Screen scroll>
      <Title>{t('send')} {token ? token.symbol : ''}</Title>
      <Muted>
        {token ? `${t('tokenTransfer')} ${token.symbol}` : t('nativeTransfer')} · {chain.name}
        {chain.testnet ? ' (testnet)' : ' — fonds réels'}.
      </Muted>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>{t('recipientAddr')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
            <Pressable onPress={() => router.push('/scan')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="scan" size={16} color={colors.accent} />
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('scan')}</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/contacts?pick=1')} hitSlop={8}>
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('addressBook')}</Text>
            </Pressable>
          </View>
        </View>
        <TextInput
          value={to}
          onChangeText={setTo}
          placeholder={chain.family === 'bitcoin' ? 'bc1…' : chain.family === 'solana' ? 'Adresse Solana…' : '0x…'}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ color: colors.text, fontSize: 16, paddingVertical: spacing(1) }}
        />
        {isEnsInput ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing(0.5) }}>
            {ens.status === 'resolving' ? (
              <Text style={{ color: colors.textMuted, fontFamily: fonts.medium }}>{t('resolvingEns')}</Text>
            ) : ens.status === 'found' && ens.address ? (
              <>
                <Icon name="check" size={14} color={colors.success} />
                <Text style={{ color: colors.success, fontFamily: fonts.semibold }}>
                  {ens.address.slice(0, 10)}…{ens.address.slice(-8)}
                </Text>
              </>
            ) : ens.status === 'notfound' ? (
              <Text style={{ color: colors.danger, fontFamily: fonts.medium }}>Nom ENS introuvable</Text>
            ) : null}
          </View>
        ) : null}

        {/* Destinataires récents (accès rapide) — masqués dès qu'on saisit une adresse */}
        {recents.length > 0 && to.trim().length === 0 ? (
          <View style={{ marginTop: spacing(1.25), gap: 6 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('recent')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {recents.slice(0, 6).map((r) => (
                <Pressable
                  key={r.address}
                  onPress={() => setTo(r.address)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 999, paddingHorizontal: spacing(1.25), paddingVertical: 6 }}
                >
                  <Icon name="history" size={13} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'] }}>{r.address.slice(0, 6)}…{r.address.slice(-4)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>Montant ({symbol})</Text>
          {balance != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              <Text style={{ color: overBalance ? colors.danger : colors.textMuted, fontSize: 13 }}>
                Solde : {formatBalance(balance, token?.decimals ?? chain.nativeDecimals, 6)} {symbol}
              </Text>
              {token?.kind === 'erc20' ? (
                <Pressable onPress={() => setAmount(formatBalance(balance, token.decimals, token.decimals))} hitSlop={6}>
                  <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 }}>Max</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          style={[typography.display, { color: overBalance ? colors.danger : colors.text, paddingVertical: spacing(1) }]}
        />
      </Card>

      {/* Frais de réseau (EVM) : Lent / Normal / Rapide + coût estimé */}
      {chain.family === 'evm' ? (
        <Card>
          <Text style={typography.muted}>{t('networkFee')}</Text>
          {feeOptions ? (
            <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(1) }}>
              {(['slow', 'normal', 'fast'] as FeeSpeed[]).map((s) => {
                const on = speed === s;
                const label = s === 'slow' ? t('feeSlow') : s === 'normal' ? t('feeNormal') : t('feeFast');
                const cost = formatBalance(feeOptions[s].costWei, chain.nativeDecimals, 6);
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSpeed(s)}
                    style={{ flex: 1, paddingVertical: spacing(1), borderRadius: 12, alignItems: 'center', gap: 2, backgroundColor: on ? colors.accent : colors.bgElevated, borderWidth: 1, borderColor: on ? colors.accent : colors.cardBorder }}
                  >
                    <Text style={{ color: on ? '#fff' : colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{label}</Text>
                    <Text style={{ color: on ? '#fff' : colors.textMuted, fontSize: 11 }}>≈ {cost} {chain.nativeSymbol}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: spacing(2) }}>
              <NovaRing size={24} spinning color={colors.accent} />
            </View>
          )}
        </Card>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <View style={{ flex: 1 }} />
      <Button label={t("reviewSend")} onPress={onReview} />

      <ConfirmUnlock
        visible={confirming}
        title={t('confirmSend')}
        subtitle={`${amount} ${symbol} · ${chain.name}\nÀ ${isEnsInput ? `${to.trim()} (${recipient.slice(0, 8)}…${recipient.slice(-6)})` : `${recipient.slice(0, 10)}…${recipient.slice(-8)}`}`}
        perform={perform}
        onDone={() => setConfirming(false)}
        onCancel={() => setConfirming(false)}
      />

      <SuccessModal
        visible={success != null}
        title={t('transferSent')}
        message={success?.summary}
        hash={success?.hash}
        explorerUrl={chain.explorerUrl}
        onClose={() => {
          setSuccess(null);
          router.replace('/home');
        }}
      />
    </Screen>
  );
}
