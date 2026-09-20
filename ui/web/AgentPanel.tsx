/**
 * Onglet Agent (BYOK) du dashboard web — réutilise entièrement l'infra IA de
 * l'app mobile (lib/aiStore.ts, lib/aiAsk.ts, lib/aiConfig.ts,
 * lib/aiValidator.ts, lib/aiChatHistoryStore.ts, lib/copilotContext.ts) :
 * aucune de ces briques n'a de dépendance native, elles sont déjà 100 %
 * portables. Seul le contexte (quel réseau, quels soldes) change de source
 * (webCopilotContext.ts, plutôt que lib/walletStore.ts qui n'existe pas ici).
 * La clé API reste stockée uniquement sur cet appareil (expo-secure-store,
 * qui a un repli localStorage sur le web) — jamais envoyée à Kalyx.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Linking, Animated, Easing } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text as KText, Button, Sheet, Surface, ListRow, Divider } from '../kit';
import { FadeInUp, KalyxSpinner, useTypewriter } from './motion';
import { WEB_FONTS } from './webTheme';
import { Icon, type IconName } from '../icon';
import { fonts, radii, spacing, useTheme } from '../theme';
import { useAiStore, type AiProvider } from '../../lib/aiStore';
import { useAiChatHistoryStore } from '../../lib/aiChatHistoryStore';
import { askAi } from '../../lib/aiAsk';
import { validateAiKey } from '../../lib/aiValidator';
import { PROVIDER_DEFAULTS } from '../../lib/aiConfig';
import { serializeCopilotContext } from '../../lib/copilotContext';
import { useT, useSettings } from '../../lib/settingsStore';
import { toast } from '../../lib/toast';
import { useWebT, type WebKey } from './webI18n';
import { useWebCopilotContext } from './webCopilotContext';
import type { ChainConfig } from '../../src';

/** Même liste que app/ai-settings.tsx (tous les fournisseurs de aiConfig.ts,
 *  « custom » compris — pas une sélection restreinte). */
export const PROVIDER_LABELS: Record<AiProvider, string> = {
  deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', groq: 'Groq',
  openrouter: 'OpenRouter', together: 'Together', huggingface: 'HuggingFace', custom: 'Custom',
};
const PROVIDERS = Object.keys(PROVIDER_DEFAULTS) as AiProvider[];

/** Laiton/or de marque Kalyx — même valeur que ui/web/WebDashboard.tsx. */
const GOLD = '#C89B5C';

const SUGGESTIONS: { title: WebKey; description: WebKey; prompt: WebKey; icon: IconName; color: string }[] = [
  { title: 'sugAuditTitle', description: 'sugAuditDesc', prompt: 'sugAuditPrompt', icon: 'security', color: GOLD },
  { title: 'sugPerfTitle', description: 'sugPerfDesc', prompt: 'sugPerfPrompt', icon: 'market', color: '#4EA1FF' },
  { title: 'sugFeesTitle', description: 'sugFeesDesc', prompt: 'sugFeesPrompt', icon: 'defi', color: '#3CD98A' },
];

function buildWebSystem(lang: string, context: string): string {
  return `Tu es Kalyx Copilot, l'assistant intégré de Kalyx Wallet, un wallet crypto 100 % non-custodial.
Réponds dans la langue « ${lang} », en tutoyant, simple, direct, sobre, sans emoji, sans conseil d'investissement. 2 à 5 phrases, sauf explication technique demandée.

Tu réponds ici depuis le TABLEAU DE BORD WEB (fenêtre lecture seule connectée au téléphone via WalletConnect) — pas depuis l'app mobile elle-même.

CE QUE TU SAIS DU RÉSEAU ACTIF ET DES SOLDES CONNECTÉS (contexte public compacté, JSON) :
${context}
Légende : n = réseau actif ; b = soldes (valeur en devise) ; r = activité récente masquée.

IMPORTANT : tu n'as PAS accès à l'état de sécurité du téléphone (sauvegarde, biométrie, PIN, phrase de récupération vérifiée) depuis cette session web — si on te pose une question là-dessus, dis clairement que tu ne peux pas le savoir depuis le web et renvoie vers l'app Kalyx sur le téléphone.
Tu ne connais ni les adresses complètes, ni les clés, ni la phrase de récupération, ni le PIN. Ne les demande JAMAIS ; si l'utilisateur t'en envoie, refuse et dis-lui de les supprimer du message immédiatement.

CE QUE FAIT KALYX (faits, n'invente rien d'autre) :
- Clés chiffrées sur le téléphone (AES-256-GCM, clé dérivée du PIN par scrypt, Keystore/Keychain). Aucun serveur Kalyx, aucun compte, aucune session distante.
- Ce site web ne stocke et ne voit jamais de clé privée : il ne fait que lire les soldes publics et transmettre les demandes de signature au téléphone (WalletConnect).
- Frais Kalyx : 0,3 % sur les swaps EVM via LI.FI, 0 % sur l'envoi/réception simple.`;
}

/** Écran de configuration BYOK (aucune clé enregistrée). */
export function AgentSetup() {
  const { colors, typography } = useTheme();
  const tw = useWebT();
  const setApiKey = useAiStore((s) => s.setApiKey);
  // Sélecteurs scalaires (zustand v5 : un objet neuf à chaque appel boucle).
  const curProvider = useAiStore((s) => s.provider);
  const curUrl = useAiStore((s) => s.customUrl);
  const curModel = useAiStore((s) => s.customModel);
  const curEnabled = useAiStore((s) => s.isEnabled);
  const current = { provider: curProvider, customUrl: curUrl, customModel: curModel, isEnabled: curEnabled };
  // Pré-rempli avec la config actuelle quand on vient « changer la clé » (la clé
  // elle-même n'est jamais réaffichée).
  const [provider, setProvider] = useState<AiProvider>(current.isEnabled ? current.provider : 'deepseek');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [customUrl, setCustomUrl] = useState(current.isEnabled ? current.customUrl ?? '' : '');
  const [customModel, setCustomModel] = useState(current.isEnabled ? current.customModel ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSave = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await validateAiKey(provider, key.trim(), customUrl.trim() || undefined, customModel.trim() || undefined);
      if (!r.success) {
        setErr(r.error ?? tw('invalidKey'));
        setBusy(false);
        return;
      }
      await setApiKey(key.trim(), provider, customUrl.trim() || undefined, customModel.trim() || undefined);
      toast.success(tw('agentEnabled'));
    } catch (e) {
      // Filet de sécurité : ne devrait plus se produire (voir fix lib/aiStore.ts),
      // mais évite un bouton bloqué indéfiniment si un autre cas imprévu surgit.
      setErr(e instanceof Error ? e.message : tw('unexpectedError'));
    }
    setBusy(false);
  };

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing(4), paddingHorizontal: spacing(2), gap: spacing(1.5) }}>
      <View style={{ width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: GOLD + '33', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sparkles" size={30} color={GOLD} />
      </View>
      <Text style={{ color: colors.text, fontSize: 19, fontFamily: fonts.bold, textAlign: 'center' }}>{tw('activateAgent')}</Text>
      <Text style={[typography.muted, { textAlign: 'center', maxWidth: 320 }]}>
        {tw('activateAgentBody')}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%', maxWidth: 400 }} contentContainerStyle={{ flexDirection: 'row', gap: spacing(0.75), justifyContent: 'center', marginTop: spacing(1), paddingHorizontal: spacing(1) }}>
        {PROVIDERS.map((p) => {
          const on = p === provider;
          return (
            <Pressable key={p} onPress={() => setProvider(p)} style={{ paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.75), borderRadius: radii.pill, backgroundColor: on ? colors.accent : colors.text + '08', borderWidth: 1, borderColor: on ? colors.accent : colors.text + '12' }}>
              <Text style={{ color: on ? colors.onPrimary : colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 }} numberOfLines={1}>{p === 'custom' ? tw('providerOther') : PROVIDER_LABELS[p]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ width: '100%', maxWidth: 340, flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.md, paddingHorizontal: spacing(1.25), marginTop: spacing(1) }}>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder="sk-…"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showKey}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          // Empêche Chrome de proposer d'"Enregistrer le mot de passe" sur ce
          // champ (ce n'est pas un mot de passe de compte, juste une clé API
          // BYOK stockée localement) — le bandeau recouvrait le clavier mobile.
          textContentType="oneTimeCode"
          style={{ flex: 1, color: colors.text, backgroundColor: 'transparent', fontSize: 14, paddingVertical: spacing(1.25) }}
        />
        <Pressable onPress={() => setShowKey((v) => !v)} hitSlop={6}>
          <Icon name={showKey ? 'eyeOff' : 'eye'} size={17} color={colors.textMuted} />
        </Pressable>
      </View>
      {PROVIDER_DEFAULTS[provider]?.helperUrl ? (
        <Pressable onPress={() => Linking.openURL(PROVIDER_DEFAULTS[provider].helperUrl!)}>
          <Text style={{ color: colors.accent, fontSize: 12, textDecorationLine: 'underline' }}>{tw('getFreeKey')}</Text>
        </Pressable>
      ) : null}

      <View style={{ width: '100%', maxWidth: 340, gap: spacing(1) }}>
        {provider === 'custom' ? (
          <TextInput
            value={customUrl}
            onChangeText={setCustomUrl}
            placeholder={tw('apiUrlPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={{ color: colors.text, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.md, padding: spacing(1.25), fontSize: 13 }}
          />
        ) : null}
        {/* L'accès aux modèles varie par compte, pas juste par fournisseur
         * (ex. Groq peut refuser un modèle sur un compte et l'accepter sur un
         * autre) — remplaçable sur n'importe quel fournisseur, pas juste "custom". */}
        <TextInput
          value={customModel}
          onChangeText={setCustomModel}
          placeholder={provider === 'custom' ? tw('modelNamePlaceholder') : tw('modelOptional', { model: PROVIDER_DEFAULTS[provider]?.model ?? '' })}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={{ color: colors.text, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.md, padding: spacing(1.25), fontSize: 13 }}
        />
      </View>
      {err ? <Text style={{ color: colors.danger, fontSize: 12, textAlign: 'center' }}>{err}</Text> : null}

      <Pressable onPress={onSave} disabled={busy || !key.trim()} style={({ pressed }) => ({ width: '100%', maxWidth: 340, marginTop: spacing(1), alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.3), opacity: pressed || busy || !key.trim() ? 0.7 : 1 })}>
        {busy ? <KalyxSpinner size={20} /> : <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold }}>{tw('saveAndEnable')}</Text>}
      </Pressable>
    </View>
  );
}

/* --------------------------------------------------------- Rendu des messages */

/** Markdown minimal des réponses : **gras**, `code`, puces « - » / « • » / « * ». */
function RichText({ text, color, bold, mono }: { text: string; color: string; bold: string; mono: string }) {
  const lines = text.split('\n');
  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, i) => {
        const bullet = /^\s*[-•*]\s+/.test(line);
        const body = bullet ? line.replace(/^\s*[-•*]\s+/, '') : line;
        const parts = body.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
        return (
          <View key={i} style={{ flexDirection: 'row', paddingLeft: bullet ? 4 : 0 }}>
            {bullet ? <Text style={{ color: GOLD, fontSize: 14, lineHeight: 20, marginRight: 6 }}>•</Text> : null}
            <Text style={{ color, fontSize: 14, lineHeight: 20, flexShrink: 1 }}>
              {parts.map((p, j) => {
                if (p.startsWith('**') && p.endsWith('**')) return <Text key={j} style={{ fontFamily: bold }}>{p.slice(2, -2)}</Text>;
                if (p.startsWith('`') && p.endsWith('`')) return <Text key={j} style={{ fontFamily: mono, fontSize: 13 }}>{p.slice(1, -1)}</Text>;
                return <Text key={j}>{p}</Text>;
              })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Trois points qui ondulent pendant que le modèle répond. */
function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 140),
      Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(v, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      Animated.delay(420 - i * 140),
    ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', height: 20 }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }} />
      ))}
    </View>
  );
}

function MessageBubble({ m, onCopy, live, tight, first }: { m: { id: string; sender: 'user' | 'assistant'; text: string }; onCopy: (t: string) => void; live?: boolean; tight?: boolean; first?: boolean }) {
  const { colors } = useTheme();
  const tw = useWebT();
  const user = m.sender === 'user';
  // Dernière réponse : révélée progressivement, comme une conversation.
  const shown = useTypewriter(m.text, !!live && !user);
  return (
    <FadeInUp distance={10} duration={320} style={{ marginTop: first ? 0 : tight ? 8 : 16 }}>
      <View style={{ flexDirection: 'row', gap: 8, maxWidth: '88%', alignSelf: user ? 'flex-end' : 'flex-start' }}>
        {!user ? (
          <View style={{ width: 22, height: 22, borderRadius: radii.sm, backgroundColor: GOLD + '22', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
            <Icon name="sparkles" size={11} color={GOLD} />
          </View>
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <View style={{ backgroundColor: user ? colors.accent : colors.text + '08', borderWidth: user ? 0 : 1, borderColor: colors.text + '12', borderRadius: radii.lg, paddingVertical: 12, paddingHorizontal: 16 }}>
            {user
              ? <Text style={{ color: colors.onPrimary, fontSize: 14, lineHeight: 20 }}>{m.text}</Text>
              : <RichText text={shown} color={colors.text} bold={fonts.bold} mono={WEB_FONTS.mono} />}
          </View>
          {!user ? (
            <Pressable onPress={() => onCopy(m.text)} hitSlop={6} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 6, opacity: pressed ? 0.5 : 1 })}>
              <Icon name="copy" size={11} color={colors.textFaint} />
              <Text style={{ color: colors.textFaint, fontSize: 11 }}>{tw('copyAnswer')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </FadeInUp>
  );
}

/** Interface de discussion (clé déjà enregistrée). */
function AgentChat({ chain, address, worth }: { chain: ChainConfig; address: string; worth: { data: { total: number; slices: { chain: ChainConfig; address: string; native: number; tokens: number; value: number; price: number; change24h: number }[] } | null } }) {
  const { colors, typography } = useTheme();
  const tw = useWebT();
  const language = useSettings((s) => s.language);
  const disableAi = useAiStore((s) => s.disableAi);
  const provider = useAiStore((s) => s.provider);
  const sessions = useAiChatHistoryStore((s) => s.sessions);
  const activeSessionId = useAiChatHistoryStore((s) => s.activeSessionId);
  const addMessageToActive = useAiChatHistoryStore((s) => s.addMessageToActive);
  const createNewSession = useAiChatHistoryStore((s) => s.createNewSession);
  const setActiveSession = useAiChatHistoryStore((s) => s.setActiveSession);
  const deleteSession = useAiChatHistoryStore((s) => s.deleteSession);
  const messages = sessions.find((s) => s.id === activeSessionId)?.messages ?? [];
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastAnswerAt = useRef(0);
  const context = useWebCopilotContext(chain, address, worth);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    addMessageToActive({ sender: 'user', text: q });
    setBusy(true);
    const transcript = [...messages.slice(-8), { sender: 'user', text: q }]
      .map((m) => `${m.sender === 'user' ? tw('you') : tw('copilot')} : ${m.text}`)
      .join('\n');
    let ctx = '{}';
    try {
      ctx = serializeCopilotContext(context);
    } catch {
      /* contexte refusé par le filtre anti-secret : on continue sans */
    }
    const r = await askAi(transcript, buildWebSystem(language, ctx));
    setBusy(false);
    lastAnswerAt.current = Date.now();
    addMessageToActive({ sender: 'assistant', text: 'text' in r ? r.text : `⚠ ${r.error}` });
  };

  const copyAnswer = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast.success(tw('copiedAnswer'));
  };

  const iconBtn = (name: IconName, onPress: () => void, label: string) => (
    <Pressable key={name} onPress={onPress} hitSlop={8} accessibilityLabel={label} style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', opacity: pressed ? 0.6 : 1 })}>
      <Icon name={name} size={14} color={colors.textMuted} />
    </Pressable>
  );

  return (
    // flex:1 : le parent (onglet Agent) est un conteneur flex non scrollable
    // dimensionné à l'espace disponible — le chat gère son propre scroll.
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: GOLD + '1A', borderWidth: 1, borderColor: GOLD + '33' }}>
          <Text style={{ color: GOLD, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5 }}>{`BETA · BYOK · ${provider.toUpperCase()}`}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {iconBtn('add', () => createNewSession(), tw('newChat'))}
          {iconBtn('history', () => setHistoryOpen(true), tw('chatHistory'))}
          {iconBtn('gear', () => setSettingsOpen(true), tw('agentSettings'))}
        </View>
      </View>

      {/* Hiérarchie des espaces : 24 px entre le badge et la conversation, 16 px
          entre deux auteurs, 8 px entre deux messages du même auteur (MessageBubble). */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 24, paddingBottom: 12 }}>
        {messages.length === 0 ? (
          <FadeInUp>
            <View style={{ alignItems: 'center', paddingHorizontal: spacing(1), paddingTop: spacing(0.5) }}>
              <View style={{ width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: GOLD + '33', alignItems: 'center', justifyContent: 'center', marginBottom: spacing(1) }}>
                <Icon name="sparkles" size={22} color={GOLD} />
              </View>
              <Text style={{ color: colors.text, fontSize: 17, fontFamily: fonts.bold, marginBottom: 3 }}>{tw('kalyxIntelligence')}</Text>
              <Text style={[typography.muted, { textAlign: 'center', maxWidth: 280, marginBottom: spacing(1.25), fontSize: 13 }]}>
                {tw('kalyxIntelligenceBody')}
              </Text>
              <View style={{ width: '100%', gap: spacing(0.75) }}>
                {SUGGESTIONS.map((s) => (
                  <View key={s.title}>
                    <Pressable onPress={() => send(tw(s.prompt))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1), padding: spacing(1.25), borderRadius: radii.lg, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: pressed ? GOLD + '55' : colors.text + '12', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                      <View style={{ width: 30, height: 30, borderRadius: radii.md, backgroundColor: s.color + '1A', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={s.icon} size={15} color={s.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{tw(s.title)}</Text>
                        <Text style={[typography.muted, { fontSize: 11, marginTop: 1 }]}>{tw(s.description)}</Text>
                      </View>
                      <Icon name="chevron" size={14} color={colors.textFaint} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          </FadeInUp>
        ) : (
          messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              m={m}
              onCopy={copyAnswer}
              live={i === messages.length - 1 && m.sender === 'assistant' && Date.now() - lastAnswerAt.current < 4000}
              tight={i > 0 && messages[i - 1].sender === m.sender}
              first={i === 0}
            />
          ))
        )}
        {busy ? (
          <FadeInUp distance={6} duration={200} style={{ marginTop: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-start', alignItems: 'center' }}>
              <View style={{ width: 22, height: 22, borderRadius: radii.sm, backgroundColor: GOLD + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="sparkles" size={11} color={GOLD} />
              </View>
              <View style={{ backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.lg, paddingHorizontal: spacing(1.5), paddingVertical: spacing(1) }}>
                <TypingDots color={colors.textMuted} />
              </View>
            </View>
          </FadeInUp>
        ) : null}
      </ScrollView>

      <View style={{ paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.pill }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            placeholder={tw('askAgentPlaceholder')}
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, backgroundColor: 'transparent', paddingHorizontal: spacing(1.75), paddingVertical: spacing(1.1), fontSize: 14 }}
          />
          <Pressable onPress={() => send(input)} disabled={busy || !input.trim()} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, marginRight: 4, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.4 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}>
            <Icon name="forward" size={15} color="#171310" />
          </Pressable>
        </View>
      </View>

      {/* Conversations passées */}
      <Sheet visible={historyOpen} onClose={() => setHistoryOpen(false)}>
        <KText variant="title2">{tw('chatHistory')}</KText>
        {sessions.length === 0 ? <KText variant="bodySecondary" tone="secondary">{tw('noChats')}</KText> : (
          <Surface padded={false}>
            {sessions.map((sess, i) => (
              <React.Fragment key={sess.id}>
                <ListRow
                  title={sess.title}
                  subtitle={new Date(sess.updatedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  onPress={() => { setActiveSession(sess.id); setHistoryOpen(false); }}
                  right={
                    <Pressable onPress={() => deleteSession(sess.id)} hitSlop={8} accessibilityLabel={tw('deleteChat')} style={{ padding: 6 }}>
                      <Icon name="reset" size={16} color={sess.id === activeSessionId ? colors.danger : colors.textFaint} />
                    </Pressable>
                  }
                />
                {i < sessions.length - 1 ? <Divider inset={16} /> : null}
              </React.Fragment>
            ))}
          </Surface>
        )}
        <Button label={tw('newChat')} variant="secondary" size="md" onPress={() => { createNewSession(); setHistoryOpen(false); }} />
      </Sheet>

      {/* Réglages de l'agent : changer la clé/le modèle ou désactiver */}
      <Sheet visible={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <KText variant="title2">{tw('agentSettings')}</KText>
        <AgentSetup />
        <Button label={tw('aiDisable')} variant="destructive" size="md" onPress={() => { setSettingsOpen(false); disableAi(); toast.info(tw('aiDisabled')); }} />
      </Sheet>
    </View>
  );
}

export function AgentPanel({ chain, address, worth }: { chain: ChainConfig; address: string; worth: { data: { total: number; slices: { chain: ChainConfig; address: string; native: number; tokens: number; value: number; price: number; change24h: number }[] } | null } }) {
  const isEnabled = useAiStore((s) => s.isEnabled);
  if (isEnabled) return <AgentChat chain={chain} address={address} worth={worth} />;
  // AgentChat gère son propre scroll interne et attend un parent flex:1 non
  // scrollable ; AgentSetup (formulaire, pas de scroll interne) a besoin
  // l'inverse — d'un ScrollView pour ne jamais déborder sur un petit écran.
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
      <AgentSetup />
    </ScrollView>
  );
}
