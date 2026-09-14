/**
 * Kalyx Copilot — la discussion (montée globalement dans app/_layout.tsx).
 *
 * Confidentialité : le modèle reçoit le contexte public compacté de
 * `serializeCopilotContext()` — réseau actif, soldes, activité récente MASQUÉE,
 * domaine du navigateur, logs techniques — et JAMAIS les adresses, clés, phrase
 * ou PIN. Aucune donnée n'est envoyée tant que l'utilisateur n'a pas activé le
 * Copilot avec sa propre clé (BYOK, Réglages → Copilot).
 *
 * Le modèle peut proposer d'ouvrir un écran avec le marqueur `[[go:/route]]`
 * (routes de lib/aiAppMap.ts) : rendu sous forme de bouton, jamais exécuté seul.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Sheet, Text, Button, Chip, Pressable, IconButton } from './kit';
import { Icon } from './icon';
import { useTheme } from './theme';
import { space, radius } from './tokens';
import { useAiStore } from '../lib/aiStore';
import { useAiChatHistoryStore, type ChatMessage } from '../lib/aiChatHistoryStore';
import { askAi } from '../lib/aiAsk';
import { serializeCopilotContext } from '../lib/copilotContext';
import { APP_ROUTES_MAP } from '../lib/aiAppMap';
import { useT, useSettings } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';

const GO_RE = /\[\[go:(\/[a-z0-9\-/]+)\]\]/gi;
const KNOWN_ROUTES = new Set(APP_ROUTES_MAP.map((r) => r.route));

/** Sépare le texte du modèle et les écrans proposés (seules les routes connues passent). */
function splitAnswer(text: string): { text: string; routes: string[] } {
  const routes: string[] = [];
  const clean = text
    .replace(GO_RE, (_, r: string) => {
      if (KNOWN_ROUTES.has(r) && !routes.includes(r)) routes.push(r);
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: clean, routes };
}

function buildSystem(lang: string, context: string): string {
  const routes = APP_ROUTES_MAP.map((r) => `${r.route} — ${r.description}`).join('\n');
  return `Tu es Kalyx Copilot, l'assistant intégré de Kalyx Wallet, un wallet crypto 100 % non-custodial.
Réponds dans la langue « ${lang} », en tutoyant, simple, direct, sobre, sans emoji, sans conseil d'investissement. 2 à 5 phrases, sauf explication technique demandée.

CE QUE TU SAIS DE L'UTILISATEUR (contexte public compacté, JSON) :
${context}
Légende : n = réseau actif ; b = soldes ; r = activité récente masquée ; l = logs techniques ; w = navigateur ; sec = état de sécurité RÉEL :
sec.phraseVerified (phrase de récupération vérifiée), sec.encryptedBackupAt (dernière sauvegarde chiffrée, fichier ou Drive, ISO ou null),
sec.driveBackupAt (dernière sauvegarde Google Drive, ISO ou null), sec.biometrics, sec.autoLockMinutes, sec.privacyGuard.
Réponds sur la sauvegarde ou la sécurité UNIQUEMENT à partir de sec — jamais de supposition : si sec.driveBackupAt est renseigné, la sauvegarde Google Drive EST faite à cette date.
Tu ne connais ni ses adresses, ni ses clés, ni sa phrase de récupération, ni son PIN. Ne les demande JAMAIS ; s'il t'en envoie, refuse et dis-lui de les supprimer du message.

CE QUE FAIT KALYX (faits, n'invente rien d'autre) :
- Clés chiffrées sur le téléphone (AES-256-GCM, clé dérivée du PIN par scrypt, Keystore/Keychain). Aucun serveur Kalyx, aucun compte, aucune session distante.
- Sauvegarde : phrase de 12 mots à écrire ; export chiffré par mot de passe (fichier ou dossier privé Google Drive, chiffré sur l'appareil). Sans le mot de passe, la sauvegarde est inutilisable, même par Kalyx.
- Envoi en 4 étapes avec maintien 1,2 s ; détection d'empoisonnement d'adresse (bloquant).
- Signatures dApp simulées et expliquées (WalletConnect Verify, GoPlus).
- Swap : Jupiter (Solana), LI.FI et Relay (EVM, cross-chain) — frais Kalyx 0,3 % sur LI.FI, 0 % ailleurs. Earn : Aave v3, Lido, Rocket Pool, Benqi, Jito, Marinade, 0 % de frais Kalyx.
- Personne ne peut annuler une transaction confirmée ni récupérer une phrase perdue.

ÉCRANS DE L'APP : quand un écran aide, termine par un marqueur [[go:ROUTE]] parmi :
${routes}

Si les logs techniques montrent une erreur, explique la cause probable (RPC, solde, gas, rejet) et l'action à faire. Pour un ticket support, propose [[go:/support]].`;
}

export function CopilotSheet() {
  const t = useT();
  const { colors } = useTheme();
  const language = useSettings((s) => s.language);
  const isOpen = useAiStore((s) => s.isOpen);
  const isEnabled = useAiStore((s) => s.isEnabled);
  const initialPrompt = useAiStore((s) => s.initialPrompt);
  const closeChat = useAiStore((s) => s.closeChat);

  const sessions = useAiChatHistoryStore((s) => s.sessions);
  const activeSessionId = useAiChatHistoryStore((s) => s.activeSessionId);
  const createNewSession = useAiChatHistoryStore((s) => s.createNewSession);
  const addMessageToActive = useAiChatHistoryStore((s) => s.addMessageToActive);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const session = useMemo(() => sessions.find((s) => s.id === activeSessionId) ?? null, [sessions, activeSessionId]);
  const messages: ChatMessage[] = session?.messages ?? [];

  useEffect(() => {
    if (isOpen && !session) createNewSession();
  }, [isOpen, session, createNewSession]);

  useEffect(() => {
    if (isOpen && initialPrompt) {
      setInput(initialPrompt);
    }
  }, [isOpen, initialPrompt]);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length, busy]);

  const suggestions = [t('copilotQ1'), t('copilotQ2'), t('copilotQ3'), t('copilotQ4')];

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    haptic.light();
    setInput('');
    addMessageToActive({ sender: 'user', text: q });
    setBusy(true);
    // Transcription des derniers échanges (le fournisseur ne garde aucune mémoire).
    const transcript = [...messages.slice(-8), { sender: 'user', text: q } as ChatMessage]
      .map((m) => `${m.sender === 'user' ? 'Utilisateur' : 'Copilot'} : ${m.text}`)
      .join('\n');
    let context = '{}';
    try {
      context = serializeCopilotContext();
    } catch {
      /* contexte refusé par le filtre : on continue sans */
    }
    const r = await askAi(transcript, buildSystem(language, context));
    setBusy(false);
    addMessageToActive({ sender: 'assistant', text: 'text' in r ? r.text : `⚠ ${r.error}` });
  }

  return (
    <Sheet visible={isOpen} onClose={closeChat}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon name="sparkles" size={20} />
          <Text variant="title2">{t('copilotTitle')}</Text>
        </View>
        <IconButton icon="add" label={t('copilotNewChat')} tone="ghost" onPress={() => createNewSession()} />
      </View>
      <Text variant="caption" tone="tertiary">{t('copilotPrivacy')}</Text>

      {!isEnabled ? (
        <View style={{ gap: space[3] }}>
          <Text tone="secondary">{t('copilotNotEnabled')}</Text>
          <Button
            label={t('copilotByok')}
            onPress={() => {
              closeChat();
              router.push('/ai-settings');
            }}
          />
        </View>
      ) : (
        <>
          <ScrollView ref={scrollRef} style={{ maxHeight: 360 }} contentContainerStyle={{ gap: space[3] }} keyboardShouldPersistTaps="handled">
            {messages.length === 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {suggestions.map((s) => (
                  <Chip key={s} label={s} onPress={() => send(s)} />
                ))}
              </View>
            ) : null}
            {messages.map((m) => {
              const mine = m.sender === 'user';
              const { text, routes } = mine ? { text: m.text, routes: [] as string[] } : splitAnswer(m.text);
              return (
                <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: space[2] }}>
                  <View
                    style={{
                      backgroundColor: mine ? colors.primary : colors.surface1,
                      borderRadius: radius.container,
                      paddingHorizontal: space[4],
                      paddingVertical: space[3],
                    }}
                  >
                    <Text tone={mine ? 'onPrimary' : 'primary'}>{text}</Text>
                  </View>
                  {routes.length ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                      {routes.map((r) => (
                        <Chip
                          key={r}
                          icon="forward"
                          label={t('copilotOpen')}
                          onPress={() => {
                            closeChat();
                            router.push(r as never);
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {busy ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <ActivityIndicator color={colors.textSecondary} />
                <Text variant="caption" tone="secondary">{t('copilotThinking')}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('copilotPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              multiline
              style={{
                flex: 1,
                minHeight: 48,
                maxHeight: 120,
                color: colors.text,
                fontSize: 16,
                paddingHorizontal: space[4],
                paddingVertical: space[3],
                backgroundColor: colors.surface1,
                borderRadius: radius.input,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
            <Pressable
              onPress={() => send(input)}
              disabled={busy || !input.trim()}
              accessibilityLabel={t('copilotSend')}
              style={{ width: 48, height: 48, borderRadius: radius.input, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.5 : 1 }}
            >
              <Icon name="send" size={20} color={colors.onPrimary} />
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}
