import { AI_AUDIT_TIMEOUT_MS } from '../lib/aiToolBudget';
import { Pressable as KPressable } from './kit';
/**
 * Feuille de confirmation d'une action sensible, avec déverrouillage unifié :
 * biométrie AUTO à l'ouverture (si activée) + repli sur le pavé PIN.
 *
 * Contrat : le parent fournit `perform(unlock)` qui exécute l'action (signer,
 * envoyer, révéler…) et LÈVE en cas d'échec. La feuille :
 *  - à l'ouverture, si la biométrie est activée, appelle `perform({biometric:true})`
 *    → le prompt OS s'affiche (lecture de la seed gated). Succès = terminé ;
 *    annulation / non configurée = bascule silencieuse vers le PIN ;
 *  - sinon (ou après bascule), affiche le PinPad ; à la validation, appelle
 *    `perform({pin})`. Un `WRONG_PIN` fait vibrer + réessayer ; toute autre
 *    erreur est affichée.
 *
 * IMPORTANT (piège historique) : on NE fait PAS `authenticate()` puis lecture
 * gated (= double prompt). Le prompt unique EST la lecture gated déclenchée par
 * `perform({biometric:true})`.
 */
import { SafeModal } from './kit/SafeModal';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KalyxLogo } from './KalyxLogo';
import { PinPad } from './PinPad';
import { Icon } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { useSettings, useT } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import type { Unlock } from '../lib/walletStore';
import { auditFacts, auditTransaction, type TxAuditContext, type TxAuditFact, type TxAuditResult } from "../lib/aiTxAudit";
import { probeRecipient } from "../lib/txAuditProbe";
import { factLabel } from "./auditFactLabel";
import { useAiStore } from "../lib/aiStore";
import { isWalletError } from '../src';

export function ConfirmUnlock({
  visible,
  title,
  subtitle,
  statusText,
  perform,
  onDone,
  onCancel,
  aiContext,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Progression réseau pilotée par le parent (ex. « Envoi du swap… »). */
  statusText?: string | null;
  /** Exécute l'action ; DOIT lever en cas d'échec (WRONG_PIN pour un PIN faux). */
  perform: (unlock: Unlock) => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
  aiContext?: TxAuditContext;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const bioEnabled = useSettings((s) => s.biometricEnabled);
  const { language } = useSettings();
  const pinLength = useSettings((s) => s.pinLength);
  const [phase, setPhase] = useState<'working' | 'pin' | 'error'>('working');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errSignal, setErrSignal] = useState(0);
  const attemptRef = useRef(0);

  const aiStore = useAiStore();
  const [aiAnalysis, setAiAnalysis] = useState<TxAuditResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  /*
   * ANALYSE IA À LA DEMANDE. Elle partait d'office à chaque confirmation :
   * destination, montant et action envoyés au fournisseur d'IA sans que
   * l'utilisateur l'ait demandé. Désormais un bouton, qui dit ce qui part.
   */
  const [aiRequested, setAiRequested] = useState(false);
  // Contexte ENRICHI des données publiques relues au lancement de l'analyse.
  const [auditedCtx, setAuditedCtx] = useState<TxAuditContext | null>(null);
  const facts = auditedCtx ? auditFacts(auditedCtx) : [];
  const [probing, setProbing] = useState(false);
  const auditRun = useRef(0);
  useEffect(() => {
    if (!visible) {
      auditRun.current += 1; // une réponse tardive n'atterrit pas sur la fenêtre suivante
      setAiRequested(false);
      setAiAnalysis(null);
      setAiError(null);
      setAnalyzing(false);
      setAuditedCtx(null);
      setProbing(false);
    }
  }, [visible]);

  /*
   * Lancée par le bouton, et non plus par un effet : l'effet ne surveillait pas
   * le bouton, se relançait à chaque rendu, et la saisie du PIN effaçait le
   * résultat. Voir lib/aiTxAudit.ts pour ce qui faisait échouer la requête.
   */
  const startAudit = async () => {
    if (!aiContext || analyzing) return;
    const runId = ++auditRun.current;
    setAiRequested(true);
    setAiAnalysis(null);
    setAiError(null);
    setAnalyzing(true);
    console.log('[AI Audit] start', { provider: aiStore.provider });
    /*
     * Données PUBLIQUES d'abord : ton historique relu à l'instant, le profil
     * de l'adresse, les listes noires. L'IA juge ensuite sur des faits, et
     * l'utilisateur voit lesquels (« Analysé avec : … »).
     */
    let ctx = aiContext;
    if (aiContext.recipient && aiContext.chainId) {
      setProbing(true);
      const probe = await probeRecipient(aiContext.chainId, aiContext.from, aiContext.to);
      if (runId !== auditRun.current) return;
      setProbing(false);
      ctx = { ...aiContext, recipient: { ...aiContext.recipient, probe } };
    }
    setAuditedCtx(ctx);
    const out = await auditTransaction(ctx, language || 'fr', { timeout: t('aiAuditTimeout'), unreadable: t('aiAuditUnreadable') }, AI_AUDIT_TIMEOUT_MS);
    if (runId !== auditRun.current) return;
    console.log('[AI Audit] done', out.ok ? { riskLevel: out.result.riskLevel } : { error: out.error.slice(0, 120) });
    if (out.ok) setAiAnalysis(out.result);
    else setAiError(out.error);
    setAnalyzing(false);
  };


  const run = async (unlock: Unlock) => {
    const viaBio = 'biometric' in unlock;
    const attempt = ++attemptRef.current;
    const startedAt = Date.now();
    const unlockMode = viaBio ? 'biometric' : 'pin';
    console.log('[KALYX-AUTH][ConfirmUnlock] attempt:start', { attempt, unlockMode, title });
    setPhase('working');
    setError(null);
    try {
      if (viaBio) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const operation = perform(unlock)
          .then(() => {
            console.log('[KALYX-AUTH][ConfirmUnlock] perform:resolved', {
              attempt,
              unlockMode,
              elapsedMs: Date.now() - startedAt,
            });
          })
          .catch((error) => {
            console.warn('[KALYX-AUTH][ConfirmUnlock] perform:rejected', {
              attempt,
              unlockMode,
              elapsedMs: Date.now() - startedAt,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          });
        try {
          await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                console.warn('[KALYX-AUTH][ConfirmUnlock] perform:timeout', {
                  attempt,
                  unlockMode,
                  elapsedMs: Date.now() - startedAt,
                  timeoutMs: 15_000,
                });
                reject(new Error(t("authBiometricExpired")));
              }, 15_000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } else {
        await perform(unlock);
      }
      if (attempt !== attemptRef.current) return;
      console.log('[KALYX-AUTH][ConfirmUnlock] attempt:success', {
        attempt,
        unlockMode,
        elapsedMs: Date.now() - startedAt,
      });
      onDone();
    } catch (e) {
      if (attempt !== attemptRef.current) return;
      console.warn('[KALYX-AUTH][ConfirmUnlock] attempt:failure', {
        attempt,
        unlockMode,
        elapsedMs: Date.now() - startedAt,
        error: e instanceof Error ? e.message : String(e),
      });
      // console.warn('[ConfirmUnlock] Perform catch:', (e as Error).message || e);
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        setPin('');
        setErrSignal((x) => x + 1);
        setError(t('incorrectCode'));
        setPhase('pin');
      } else if (viaBio && e instanceof Error && e.message === t("authBiometricExpired")) {
        setPin('');
        setError(t("authBiometricTimeout"));
        setPhase('error');
      } else if (viaBio && isWalletError(e) && (e.code === 'BIOMETRIC_REFUSED' || e.code === 'BIOMETRIC_NOT_SET')) {
        // Biométrie annulée ou non configurée → repli silencieux sur le PIN.
        setPin('');
        setPhase('pin');
      } else {
        setPin('');
        setError(friendlyTxError(e, t));
        setPhase('error');
      }
    }
  };

  // À l'ouverture : biométrie auto si activée, sinon PIN d'emblée.
  useEffect(() => {
    if (!visible) return;
    attemptRef.current += 1;
    console.log('[KALYX-AUTH][ConfirmUnlock] visible', { title, bioEnabled });
    setPin('');
    setError(null);
    if (bioEnabled) {
      void run({ biometric: true });
    } else {
      setPhase('pin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cancel = () => {
    attemptRef.current += 1;
    onCancel();
  };

  if (!visible) return null;

  const working = phase === 'working';
  const canValidateManually = !pinLength && pin.length >= 6;

  return (
    <SafeModal transparent animationType="slide" onRequestClose={cancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <KPressable noScale haptic="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={cancel} />
        {/* Feuille : padding bas = inset système (barre de navigation Android /
            home indicator iOS) pour que la rangée « 0 » du pavé reste visible ;
            défilable pour ne jamais tronquer le pavé sur un petit écran. */}
        <ScrollView
          style={{ maxHeight: '92%', backgroundColor: colors.bg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl }}
          contentContainerStyle={{
            paddingTop: spacing(3),
            paddingBottom: insets.bottom + spacing(3),
            alignItems: 'center',
            gap: spacing(2.5),
          }}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <KalyxLogo size={56} />
          <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: spacing(3) }}>
            <Text style={[typography.title, { textAlign: 'center' }]}>{title}</Text>
            {subtitle ? <Text style={[typography.muted, { textAlign: 'center' }]}>{subtitle}</Text> : null}
          </View>

          {phase === 'working' ? (
            <View style={{ alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(2) }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.medium }}>
                {statusText ?? t('authenticating')}
              </Text>
            </View>
          ) : phase === 'error' ? (
            <View style={{ alignItems: 'center', gap: spacing(2), paddingVertical: spacing(2), paddingHorizontal: spacing(2) }}>
              <Icon name="warning" size={32} color={colors.danger} />
              <Text style={{ color: colors.danger, fontFamily: fonts.medium, textAlign: 'center', marginBottom: spacing(1) }}>
                {error}
              </Text>
              <KPressable onPress={onCancel} hitSlop={8} style={{ paddingVertical: 10, paddingHorizontal: 24, borderRadius: radii.pill, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 15, fontFamily: fonts.semibold }}>{t('closeWord') || t("aiClose")}</Text>
              </KPressable>
            </View>
          ) : (
            <>

              {aiStore.isEnabled && aiContext && !aiRequested ? (
                <KPressable onPress={() => void startAudit()} style={{ width: '90%', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}>
                  <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{t('aiAuditRun')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: fonts.medium, marginTop: 2 }}>{t('aiAuditRunNote')}</Text>
                </KPressable>
              ) : null}
              {aiStore.isEnabled && aiContext && aiRequested && (
                // « Sûr » n'est JAMAIS affiché en vert : l'IA n'a vu qu'une adresse et un montant.
                <View style={{ width: '90%', backgroundColor: colors.surface2, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: aiAnalysis ? (aiAnalysis.riskLevel === 'DANGER' ? colors.danger : aiAnalysis.riskLevel === 'WARNING' ? colors.warning : colors.border) : colors.border, marginBottom: 8 }}>
                  <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13, marginBottom: 4 }}>
                    {analyzing ? (probing ? t('aiAuditProbing') : t("aiAuditInProgress")) : (aiAnalysis ? `${t('aiAuditLabel')} ${t(`aiRisk${aiAnalysis.riskLevel}` as const)}` : t("aiAuditUndetermined"))}
                  </Text>
                  {/* Échec : la raison, puis de quoi réessayer — jamais un encadré muet. */}
                  {!analyzing && aiError ? (
                    <>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium }}>{aiError}</Text>
                      <KPressable onPress={() => void startAudit()} hitSlop={8} style={{ marginTop: 6 }}>
                        <Text style={{ color: colors.primary, fontSize: 12, fontFamily: fonts.semibold }}>{t('aiAuditRun')}</Text>
                      </KPressable>
                    </>
                  ) : null}
                  {!analyzing && aiAnalysis && (
                    <>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium }}>{aiAnalysis.explanation}</Text>
                      {aiAnalysis.threats && aiAnalysis.threats.length > 0 && (
                        <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4, fontFamily: fonts.semibold }}>{aiAnalysis.threats.join(', ')}</Text>
                      )}
                      {/* Ce que l'analyse a reçu : l'utilisateur voit sur quoi repose l'avis. */}
                      {facts.length > 0 ? (
                        <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 6, fontFamily: fonts.medium }}>
                          {t('aiFactsTitle')} {facts.map((f) => factLabel(f, t, language)).join(' · ')}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              )}
              <PinPad

                value={pin}
                onChange={(v) => {
                  setError(null);
                  setPin(v);
                }}
                expectedLength={pinLength || undefined}
                errorSignal={errSignal}
                onComplete={(p) => run({ pin: p })}
              />

              {error ? (
                <Text style={{ color: colors.danger, fontFamily: fonts.medium }}>{error}</Text>
              ) : null}

              {canValidateManually ? (
                <KPressable onPress={() => run({ pin })} hitSlop={8}>
                  <Text style={{ color: colors.primary, fontSize: 16, fontFamily: fonts.semibold }}>{t('validate')}</Text>
                </KPressable>
              ) : null}

              {bioEnabled ? (
                <KPressable
                  onPress={() => run({ biometric: true })}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}
                >
                  <Icon name="security" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, fontFamily: fonts.semibold }}>{t('useBiometry')}</Text>
                </KPressable>
              ) : null}
            </>
          )}

          {phase !== 'error' ? (
            <KPressable onPress={cancel} hitSlop={8}>
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{t('cancel')}</Text>
            </KPressable>
          ) : null}
        </ScrollView>
      </View>
    </SafeModal>
  );
}
