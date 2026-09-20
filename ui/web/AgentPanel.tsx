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
import { View, Text, Pressable, ScrollView, TextInput, Linking, ActivityIndicator } from 'react-native';
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
import { useWebCopilotContext } from './webCopilotContext';
import type { ChainConfig } from '../../src';

/** Même liste que app/ai-settings.tsx (tous les fournisseurs de aiConfig.ts,
 *  « custom » compris — pas une sélection restreinte). */
const PROVIDER_LABELS: Record<AiProvider, string> = {
  deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', groq: 'Groq',
  openrouter: 'OpenRouter', together: 'Together', huggingface: 'HuggingFace', custom: 'Autre (custom)',
};
const PROVIDERS = Object.keys(PROVIDER_DEFAULTS) as AiProvider[];

/** Or de marque Kalyx (déjà utilisé pour l'icône de notification, app.config.ts). */
const GOLD = '#DDB565';

const SUGGESTIONS: { title: string; description: string; prompt: string; icon: IconName; color: string }[] = [
  { title: 'Audit du portefeuille', description: 'Vérifie les permissions et contrats suspects', prompt: 'Analyse le niveau de risque de mon portefeuille et détecte les anomalies.', icon: 'security', color: GOLD },
  { title: 'Résumé des performances', description: 'Synthèse de tes gains et pertes récents', prompt: 'Fais un résumé complet de la répartition de mes tokens et de mes performances.', icon: 'market', color: '#4EA1FF' },
  { title: 'Frais du réseau', description: 'Comprendre ce que tu paies et pourquoi', prompt: 'Explique les frais de ce réseau et comment les réduire.', icon: 'defi', color: '#3CD98A' },
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
function AgentSetup() {
  const { colors, typography } = useTheme();
  const setApiKey = useAiStore((s) => s.setApiKey);
  const [provider, setProvider] = useState<AiProvider>('deepseek');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSave = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await validateAiKey(provider, key.trim(), customUrl.trim() || undefined, customModel.trim() || undefined);
      if (!r.success) {
        setErr(r.error ?? 'Clé invalide.');
        setBusy(false);
        return;
      }
      await setApiKey(key.trim(), provider, customUrl.trim() || undefined, customModel.trim() || undefined);
      toast.success('Agent Kalyx activé !');
    } catch (e) {
      // Filet de sécurité : ne devrait plus se produire (voir fix lib/aiStore.ts),
      // mais évite un bouton bloqué indéfiniment si un autre cas imprévu surgit.
      setErr(e instanceof Error ? e.message : 'Erreur inattendue.');
    }
    setBusy(false);
  };

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing(4), paddingHorizontal: spacing(2), gap: spacing(1.5) }}>
      <View style={{ width: 64, height: 64, borderRadius: radii.lg, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: GOLD + '33', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="sparkles" size={30} color={GOLD} />
      </View>
      <Text style={{ color: colors.text, fontSize: 19, fontFamily: fonts.bold, textAlign: 'center' }}>Active ton Agent Kalyx</Text>
      <Text style={[typography.muted, { textAlign: 'center', maxWidth: 320 }]}>
        Analyse tes soldes, ton activité et le marché. Ta clé API reste sur cet appareil — jamais envoyée à Kalyx.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%', maxWidth: 400 }} contentContainerStyle={{ flexDirection: 'row', gap: spacing(0.75), justifyContent: 'center', marginTop: spacing(1), paddingHorizontal: spacing(1) }}>
        {PROVIDERS.map((p) => {
          const on = p === provider;
          return (
            <Pressable key={p} onPress={() => setProvider(p)} style={{ paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.75), borderRadius: radii.pill, backgroundColor: on ? colors.accent : colors.text + '08', borderWidth: 1, borderColor: on ? colors.accent : colors.text + '12' }}>
              <Text style={{ color: on ? colors.onPrimary : colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 }} numberOfLines={1}>{PROVIDER_LABELS[p]}</Text>
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
          <Text style={{ color: colors.accent, fontSize: 12, textDecorationLine: 'underline' }}>Obtenir une clé gratuite</Text>
        </Pressable>
      ) : null}

      <View style={{ width: '100%', maxWidth: 340, gap: spacing(1) }}>
        {provider === 'custom' ? (
          <TextInput
            value={customUrl}
            onChangeText={setCustomUrl}
            placeholder="URL API (ex. https://api.together.xyz/v1/chat/completions)"
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
          placeholder={provider === 'custom' ? 'Nom du modèle (ex. qwen-2.5-72b)' : `Modèle (optionnel, ex. ${PROVIDER_DEFAULTS[provider]?.model ?? ''})`}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={{ color: colors.text, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.md, padding: spacing(1.25), fontSize: 13 }}
        />
      </View>
      {err ? <Text style={{ color: colors.danger, fontSize: 12, textAlign: 'center' }}>{err}</Text> : null}

      <Pressable onPress={onSave} disabled={busy || !key.trim()} style={({ pressed }) => ({ width: '100%', maxWidth: 340, marginTop: spacing(1), alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: spacing(1.3), opacity: pressed || busy || !key.trim() ? 0.7 : 1 })}>
        {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold }}>Enregistrer et activer</Text>}
      </Pressable>
    </View>
  );
}

/** Interface de discussion (clé déjà enregistrée). */
function AgentChat({ chain, address, worth }: { chain: ChainConfig; address: string; worth: { data: { total: number; slices: { chain: ChainConfig; address: string; native: number; tokens: number; value: number; price: number; change24h: number }[] } | null } }) {
  const { colors, typography } = useTheme();
  const language = useSettings((s) => s.language);
  const disableAi = useAiStore((s) => s.disableAi);
  const provider = useAiStore((s) => s.provider);
  const sessions = useAiChatHistoryStore((s) => s.sessions);
  const activeSessionId = useAiChatHistoryStore((s) => s.activeSessionId);
  const addMessageToActive = useAiChatHistoryStore((s) => s.addMessageToActive);
  const messages = sessions.find((s) => s.id === activeSessionId)?.messages ?? [];
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
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
      .map((m) => `${m.sender === 'user' ? 'Utilisateur' : 'Copilot'} : ${m.text}`)
      .join('\n');
    let ctx = '{}';
    try {
      ctx = serializeCopilotContext(context);
    } catch {
      /* contexte refusé par le filtre anti-secret : on continue sans */
    }
    const r = await askAi(transcript, buildWebSystem(language, ctx));
    setBusy(false);
    addMessageToActive({ sender: 'assistant', text: 'text' in r ? r.text : `⚠ ${r.error}` });
  };

  return (
    // flex:1 plutôt qu'une hauteur fixe/vh : le parent (WebDashboard, onglet
    // Agent) est maintenant un vrai conteneur flex NON scrollable dimensionné
    // exactement à l'espace dispo entre l'en-tête et la barre d'onglets — un
    // View flex:1 s'y cale correctement, contrairement à l'intérieur d'un
    // ScrollView où flex:1/vh ne représentent rien de fiable (c'était la
    // vraie cause de la barre de saisie poussée sous la nav du bas).
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing(0.75) }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: GOLD + '1A', borderWidth: 1, borderColor: GOLD + '33' }}>
          <Text style={{ color: GOLD, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5 }}>{`BETA · BYOK · ${provider.toUpperCase()}`}</Text>
        </View>
        <Pressable onPress={disableAi} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12' }}>
          <Icon name="developer" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: spacing(1.5), gap: spacing(1) }}>
        {messages.length === 0 ? (
          <View style={{ alignItems: 'center', paddingHorizontal: spacing(1), paddingTop: spacing(0.5) }}>
            <View style={{ width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: GOLD + '33', alignItems: 'center', justifyContent: 'center', marginBottom: spacing(1) }}>
              <Icon name="sparkles" size={22} color={GOLD} />
            </View>
            <Text style={{ color: colors.text, fontSize: 17, fontFamily: fonts.bold, marginBottom: 3 }}>Kalyx Intelligence</Text>
            <Text style={[typography.muted, { textAlign: 'center', maxWidth: 280, marginBottom: spacing(1.25), fontSize: 13 }]}>
              Analyse tes actifs et repère les tendances on-chain, à partir de ce qui est connecté ici.
            </Text>
            <View style={{ width: '100%', gap: spacing(0.75) }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s.title} onPress={() => send(s.prompt)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1), padding: spacing(1.25), borderRadius: radii.lg, backgroundColor: colors.text + '08', borderWidth: 1, borderColor: pressed ? GOLD + '55' : colors.text + '12' })}>
                  <View style={{ width: 30, height: 30, borderRadius: radii.md, backgroundColor: s.color + '1A', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.icon} size={15} color={s.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>{s.title}</Text>
                    <Text style={[typography.muted, { fontSize: 11, marginTop: 1 }]}>{s.description}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', gap: 8, maxWidth: '88%', alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
              {m.sender === 'assistant' ? (
                <View style={{ width: 22, height: 22, borderRadius: radii.sm, backgroundColor: GOLD + '22', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  <Icon name="sparkles" size={11} color={GOLD} />
                </View>
              ) : null}
              <View
                style={{
                  backgroundColor: m.sender === 'user' ? colors.accent : colors.text + '08',
                  borderWidth: m.sender === 'user' ? 0 : 1, borderColor: colors.text + '12',
                  borderRadius: radii.lg, padding: spacing(1.25), flexShrink: 1,
                }}
              >
                <Text style={{ color: m.sender === 'user' ? colors.onPrimary : colors.text, fontSize: 14, lineHeight: 20 }}>{m.text}</Text>
              </View>
            </View>
          ))
        )}
        {busy ? <ActivityIndicator color={colors.textMuted} style={{ alignSelf: 'flex-start' }} /> : null}
      </ScrollView>

      <View style={{ paddingTop: spacing(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.pill }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            placeholder="Pose une question à l'Agent…"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, backgroundColor: 'transparent', paddingHorizontal: spacing(1.75), paddingVertical: spacing(1.1), fontSize: 14 }}
          />
          <Pressable onPress={() => send(input)} disabled={busy || !input.trim()} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 4, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.4 : 1 }}>
            <Icon name="forward" size={15} color={colors.onPrimary} />
          </Pressable>
        </View>
      </View>
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
