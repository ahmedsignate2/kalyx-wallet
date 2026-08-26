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
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { NovaLogo } from './NovaLogo';
import { PinPad } from './PinPad';
import { Icon } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { useSettings, useT } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import type { Unlock } from '../lib/walletStore';
import { buildAiRequestParams } from "../lib/aiConfig";
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
  aiContext?: { to: string; value: string; method?: string; url?: string };
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const bioEnabled = useSettings((s) => s.biometricEnabled);
  const { language } = useSettings();
  const pinLength = useSettings((s) => s.pinLength);
  const [phase, setPhase] = useState<'working' | 'pin' | 'error'>('working');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errSignal, setErrSignal] = useState(0);

  const aiStore = useAiStore();
  const [aiAnalysis, setAiAnalysis] = useState<{ riskLevel: string, explanation: string, threats: string[] } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (visible && aiStore.isEnabled && aiContext && !aiAnalysis && !analyzing) {
      setAnalyzing(true);
      (async () => {
        console.log('[AI Audit] Lancement de l\'audit de transaction pour:', aiContext.to);
        try {
          const prompt = `Tu es un expert en cybersécurité Web3. Analyse cette transaction et renvoie STRICTEMENT ET UNIQUEMENT un JSON valide (sans markdown) : {"riskLevel": "SAFE" | "WARNING" | "DANGER", "explanation": "Short explanation in ${language || 'fr'}", "threats": ["Menace éventuelle"]}.
Données:
Cible: ${aiContext.to}
Montant: ${aiContext.value}
Action: ${aiContext.method || 'Transfer'}`;

          const { url, headers, model } = buildAiRequestParams(aiStore.provider, aiStore.apiKey!, aiStore.customUrl, aiStore.customModel);
          let body: any = { model, max_tokens: 250, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] };
          if (aiStore.provider === 'anthropic') {
            delete body.response_format; // Anthropic handle differently but let's just pass prompt as user
            body.system = "Tu dois répondre UNIQUEMENT en JSON valide.";
          }

          console.log('[AI Audit] Requête envoyée à:', url, 'avec provider:', aiStore.provider);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
          
          const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
          clearTimeout(timeoutId);
          const data = await res.json();
          
          if (res.status === 429 || data?.error?.code === 429) {
            console.warn('[AI Audit] Quota 429 atteint, fallback neutre.');
            setAiAnalysis({
              riskLevel: 'MEDIUM',
              explanation: 'Vérification IA indisponible (quota atteint). Le contrat n\'a pas pu être validé.',
              threats: []
            });
            return;
          }

          console.log('[AI Audit] Réponse brute reçue:', JSON.stringify(data).substring(0, 200) + '...');
          let txt = data.choices?.[0]?.message?.content || '{}';
          // Clean markdown
          txt = txt.replace(/```json/g, '').replace(/```/g, '');
          const parsed = JSON.parse(txt);
          console.log('[AI Audit] Résultat de l\'analyse parsé:', parsed);
          setAiAnalysis(parsed);
        } catch (e) {
          if (String(e).includes('canceled') || String(e).includes('aborted') || (e as Error).name === 'AbortError') {
            console.log('[AI Audit] Timeout atteint (2s), fallback neutre.');
            setAiAnalysis({ riskLevel: 'MEDIUM', explanation: 'Audit rapide ignoré (timeout).', threats: [] });
          } else {
            console.warn('[AI Audit] Erreur silencieuse ignorée:', (e as Error).message);
          }
        } finally {
          setAnalyzing(false);
        }
      })();
    }
  }, [visible, aiStore.isEnabled, aiContext]);


  const run = async (unlock: Unlock) => {
    const viaBio = 'biometric' in unlock;
    setPhase('working');
      setAiAnalysis(null);
      setAnalyzing(false);
    setError(null);
    try {
      await perform(unlock);
      onDone();
    } catch (e) {
      // console.warn('[ConfirmUnlock] Perform catch:', (e as Error).message || e);
      if (isWalletError(e) && e.code === 'WRONG_PIN') {
        setPin('');
        setErrSignal((x) => x + 1);
        setError(t('incorrectCode'));
        setPhase('pin');
      } else if (viaBio && e instanceof Error && (e.message.includes('refusée') || e.message.includes('non configurée') || e.message.includes('cancel') || e.message.includes('Authentification'))) {
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
    setPin('');
    setError(null);
    if (bioEnabled) {
      void run({ biometric: true });
    } else {
      setPhase('pin');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const working = phase === 'working';
  const canValidateManually = !pinLength && pin.length >= 6;

  return (
    <Modal transparent animationType="slide" onRequestClose={working ? undefined : onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={working ? undefined : onCancel} />
        <View
          style={{
            backgroundColor: colors.bgDeep,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingTop: spacing(3),
            paddingBottom: spacing(4),
            alignItems: 'center',
            gap: spacing(2.5),
          }}
        >
          <NovaLogo size={56} />
          <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: spacing(3) }}>
            <Text style={[typography.title, { textAlign: 'center' }]}>{title}</Text>
            {subtitle ? <Text style={[typography.muted, { textAlign: 'center' }]}>{subtitle}</Text> : null}
          </View>

          {phase === 'working' ? (
            <View style={{ alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(2) }}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.textMuted, fontFamily: fonts.medium }}>
                {statusText ?? t('authenticating')}
              </Text>
            </View>
          ) : phase === 'error' ? (
            <View style={{ alignItems: 'center', gap: spacing(2), paddingVertical: spacing(2), paddingHorizontal: spacing(2) }}>
              <Icon name="warning" size={32} color={colors.danger} />
              <Text style={{ color: colors.danger, fontFamily: fonts.medium, textAlign: 'center', marginBottom: spacing(1) }}>
                {error}
              </Text>
              <Pressable onPress={onCancel} hitSlop={8} style={{ paddingVertical: 10, paddingHorizontal: 24, borderRadius: radii.pill, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontSize: 15, fontFamily: fonts.semibold }}>{t('closeWord') || 'Fermer'}</Text>
              </Pressable>
            </View>
          ) : (
            <>

              {aiStore.isEnabled && aiContext && (
                <View style={{ width: '90%', backgroundColor: aiAnalysis ? (aiAnalysis.riskLevel === 'DANGER' ? '#3f0f15' : aiAnalysis.riskLevel === 'WARNING' ? '#3d2b0f' : '#0f291e') : '#18181b', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: aiAnalysis ? (aiAnalysis.riskLevel === 'DANGER' ? '#ef4444' : aiAnalysis.riskLevel === 'WARNING' ? '#f59e0b' : '#10b981') : '#27272a', marginBottom: 8 }}>
                  <Text style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: 13, marginBottom: 4 }}>
                    {analyzing ? 'Audit IA en cours...' : (aiAnalysis ? `Audit IA : ${aiAnalysis.riskLevel}` : 'Audit IA indéterminé')}
                  </Text>
                  {!analyzing && aiAnalysis && (
                    <>
                      <Text style={{ color: '#d4d4d8', fontSize: 12, fontFamily: fonts.medium }}>{aiAnalysis.explanation}</Text>
                      {aiAnalysis.threats && aiAnalysis.threats.length > 0 && (
                        <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4, fontFamily: fonts.semibold }}>⚠️ {aiAnalysis.threats.join(', ')}</Text>
                      )}
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
                <Pressable onPress={() => run({ pin })} hitSlop={8}>
                  <Text style={{ color: colors.accent, fontSize: 16, fontFamily: fonts.semibold }}>{t('validate')}</Text>
                </Pressable>
              ) : null}

              {bioEnabled ? (
                <Pressable
                  onPress={() => run({ biometric: true })}
                  hitSlop={8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}
                >
                  <Icon name="security" size={18} color={colors.accent} />
                  <Text style={{ color: colors.accent, fontSize: 13, fontFamily: fonts.semibold }}>{t('useBiometry')}</Text>
                </Pressable>
              ) : null}
            </>
          )}

          {phase !== 'error' ? (
            <Pressable onPress={onCancel} disabled={phase === 'working'} hitSlop={8}>
              <Text style={{ color: colors.textMuted, fontSize: 15, opacity: phase === 'working' ? 0.4 : 1 }}>{t('cancel')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
