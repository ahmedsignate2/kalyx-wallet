import { APP_ROUTES_MAP } from '../../lib/aiAppMap';
import React, { useState, useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, View, TextInput, Pressable, ScrollView, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, IconButton, Skeleton, Chip } from '../../ui/kit';
import { space, radius } from '../../ui/tokens';
import { useTheme } from '../../ui/theme';
import { useAiStore } from '../../lib/aiStore';
import { useSettings, useT } from '../../lib/settingsStore';
import { buildAiRequestParams, mapAiErrorToMessage } from '../../lib/aiConfig';
import { useAiChatHistoryStore } from '../../lib/aiChatHistoryStore';
import { useGasTracker } from '../../lib/gasTrackerStore';
import { Icon, type IconName } from '../../ui/icon';
import { router } from 'expo-router';
import { serializeCopilotContext } from '../../lib/copilotContext';
import { fetchAddressTransactions } from '../../lib/explorerApi';
import { useHistoryStore } from '../../lib/historyStore';
import { useWallet } from '../../lib/walletStore';
import { getAdapter } from '../../src';
import { FETCH_WALLET_HISTORY_TOOL, WEB_SEARCH_TOOL } from '../../lib/copilotTools';
import { copilotError, copilotLog, newCopilotTraceId } from '../../lib/copilotLogger';
import * as Clipboard from 'expo-clipboard';
import { toast } from '../../lib/toast';
import { haptic } from '../../lib/haptics';
import { openTelegramTicket, normalizeSupportTicket, getClientEnvironmentInfo } from '../../lib/telegramSupport';
import { detectSensitiveSecrets, sanitizeSecrets } from '../../lib/secretDetector';
import { getFormattedTechnicalLogs } from '../../lib/technicalLogger';

function TicketSupportCard({ ticketContent }: { ticketContent: string }) {
  const { colors } = useTheme();
  const [normalizedTicket] = useState(() => normalizeSupportTicket(ticketContent));
  const [errorWarning, setErrorWarning] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [copied, setCopied] = useState(false);

  const secretCheck = detectSensitiveSecrets(normalizedTicket);

  const ticketIdMatch = normalizedTicket.match(/• ID\s*:\s*([^\n]+)/i);
  const ticketId = ticketIdMatch ? ticketIdMatch[1].trim() : null;

  const handleExport = async () => {
    setErrorWarning(null);
    const check = detectSensitiveSecrets(normalizedTicket);
    if (check.hasSecret) {
      setErrorWarning(check.warningMessage || 'Donnée secrète détectée dans le ticket.');
      return;
    }
    setIsOpening(true);
    try {
      await openTelegramTicket(normalizedTicket);
    } catch (e) {
      setErrorWarning(e instanceof Error ? e.message : "Erreur lors de l'ouverture de Telegram");
    } finally {
      setIsOpening(false);
    }
  };

  const handleCopy = async () => {
    setErrorWarning(null);
    const check = detectSensitiveSecrets(normalizedTicket);
    if (check.hasSecret) {
      setErrorWarning(check.warningMessage || 'Donnée secrète détectée dans le ticket.');
      return;
    }
    try {
      await Clipboard.setStringAsync(normalizedTicket);
      haptic.selection();
      setCopied(true);
      toast.success('Ticket copié', 'Le rapport a été copié dans le presse-papier.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErrorWarning("Impossible de copier le ticket dans le presse-papier.");
    }
  };

  return (
    <View
      style={{
        marginTop: space[2],
        width: '100%',
        backgroundColor: colors.surface1,
        borderRadius: radius.container,
        borderWidth: 1,
        borderColor: colors.border,
        padding: space[3],
        gap: space[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="telegramLogo" size={16} color={colors.primary} />
          </View>
          <View>
            <Text variant="body" style={{ fontWeight: '600' }}>Ticket Support</Text>
            {ticketId ? (
              <Text variant="micro" tone="tertiary" style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                {ticketId}
              </Text>
            ) : null}
          </View>
        </View>
        <Chip label="@kalyxntw" />
      </View>

      <View
        style={{
          backgroundColor: colors.surface2,
          padding: space[3],
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text variant="caption" tone="secondary" selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, lineHeight: 18 }}>
          {normalizedTicket}
        </Text>
      </View>

      {secretCheck.hasSecret || errorWarning ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            padding: space[2],
            backgroundColor: 'rgba(255, 77, 94, 0.12)',
            borderRadius: radius.chip,
            borderWidth: 1,
            borderColor: colors.danger,
          }}
        >
          <Icon name="alert" size={16} color={colors.danger} />
          <Text variant="caption" tone="danger" style={{ flex: 1 }}>
            {errorWarning || secretCheck.warningMessage}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Pressable
          onPress={handleCopy}
          disabled={secretCheck.hasSecret}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space[1],
            height: 44,
            borderRadius: radius.round,
            backgroundColor: colors.surface2,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: secretCheck.hasSecret ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          <Icon name={copied ? 'checkmark' : 'copy'} size={16} color={copied ? colors.up : colors.text} />
          <Text variant="body" style={{ fontWeight: '600', color: copied ? colors.up : colors.text, fontSize: 13 }}>
            {copied ? 'Ticket copié' : 'Copier le ticket'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleExport}
          disabled={secretCheck.hasSecret || isOpening}
          style={({ pressed }) => ({
            flex: 1.2,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space[1],
            height: 44,
            borderRadius: radius.round,
            backgroundColor: secretCheck.hasSecret ? colors.surface3 : colors.primary,
            opacity: secretCheck.hasSecret ? 0.4 : pressed ? 0.85 : 1,
          })}
        >
          <Icon name="telegramLogo" size={16} color={secretCheck.hasSecret ? colors.textTertiary : colors.onPrimary} />
          <Text variant="body" style={{ fontWeight: '600', color: secretCheck.hasSecret ? colors.textTertiary : colors.onPrimary, fontSize: 13 }}>
            Envoyer sur Telegram
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function AiChatModal({ visible, onClose, context }: { visible: boolean, onClose: () => void, context: any }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { provider, apiKey, customUrl, customModel, copilotStatus, currentSearchQuery, setCopilotStatus } = useAiStore();
  const { profileName, language } = useSettings();
  const activeChain = useWallet((s) => s.activeChain);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const { ethGas, fetchGas } = useGasTracker();
  useEffect(() => { if (visible) fetchGas(); }, [visible]);
  
  const { sessions, activeSessionId, createNewSession, setActiveSession, addMessageToActive, deleteSession } = useAiChatHistoryStore();
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const initialPrompt = useAiStore((s) => s.initialPrompt);
  useEffect(() => {
    if (visible && initialPrompt) {
       setInput(initialPrompt);
       setTimeout(() => sendMessage(initialPrompt), 200);
       useAiStore.getState().closeChat();
       useAiStore.setState({ initialPrompt: null });
    }
  }, [visible, initialPrompt]);
  
  const [showHistory, setShowHistory] = useState(false);
  
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];
  const scrollViewRef = useRef<ScrollView>(null);

  const requestAi = async (url: string, headers: Record<string, string>, body: unknown) => {
    const traceId = newCopilotTraceId();
    copilotLog(traceId, 'http.start', { url, provider, model: (body as { model?: string })?.model });
    const startedAt = Date.now();
    let response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    copilotLog(traceId, 'http.response', { status: response.status, ok: response.ok, elapsedMs: Date.now() - startedAt });
    if (response.status === 429) {
      copilotLog(traceId, 'http.rate_limit.retry', { delayMs: 1500 });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      copilotLog(traceId, 'http.retry.response', { status: response.status, ok: response.ok, elapsedMs: Date.now() - startedAt });
    }
    return response;
  };

  // Initialiser une nouvelle session si aucune n'est active à l'ouverture
  useEffect(() => {
    if (visible && !activeSessionId) {
      createNewSession();
    }
  }, [visible, activeSessionId]);

  // Accueil (session vide) : rendu au CENTRE, pas de bulle injectée dans l'historique.
  const greeting =
    context?.screen === 'browser'
      ? t('aiWelcomeBrowser')
      : t('aiWelcomeWallet');

  function buildSystemPrompt(ctx: any) {
    const base = `Tu es l'assistant personnel de Kalyx Wallet.

CONTEXTE UTILISATEUR :
- Prénom : ${profileName || "l'utilisateur"}
- Langue de l'application : ${language || 'fr'}

CONSIGNES DE COMMUNICATION :
1. Réponds STRICTEMENT dans la langue de l'application (${language || 'fr'}).
2. Sois direct, factuel et concis : 2 à 3 phrases percutantes par réponse maximum.
3. Supprime tout ton surjoué, formules creuses de service client ou surabondance d'emojis. Parle comme un développeur / expert crypto sobre.
4. Ne demande JAMAIS l'adresse ou les soldes : tu as déjà accès à ses données publiques dans le contexte ci-dessous.
5. Adapte-toi immédiatement : réponds cash et utilement sans tourner autour du pot.

RÈGLE STRICTE D'ARCHITECTURE NON-CUSTODIAL :
- L'application est un wallet 100 % non-custodial et décentralisé.
- Il n'y a AUCUN serveur de compte, AUCUNE session utilisateur distante, et AUCUNE base de données gérée par l'équipe.
- Interdiction FORMELLE de dire ou sous-entendre que "l'équipe va vérifier ta session", "ton compte" ou "ton état de connexion". L'équipe n'a accès à aucune donnée utilisateur ni compte distant.
- Le support ne sert qu'à analyser des logs d'erreurs publiques (RPC, hash de transaction, crash interface client) ou à recueillir des rapports de bugs logiciels.

RÈGLE ANTI-HALLUCINATION TECHNIQUE :
- N'invente JAMAIS de concepts ou termes inexistants (interdiction absolue d'inventer des termes bidons comme "session WebConnect", "serveur de session", etc.).
- Base tes diagnostics UNIQUEMENT sur les logs techniques fournis dans le contexte ou sur des causes réelles (problème d'URL, protocole WalletConnect standard, permission navigateur, connectivité réseau, RPC indisponible).

PROTOCOLE DE SUPPORT PROGRESSIF (PAS DE TICKET PRÉMATURÉ) :
- Quand l'utilisateur signale un problème, NE DÉGAINE PAS de ticket support immédiatement !
- Pose d'abord UNE question précise ou propose une manipulation concrète (ex: "Quelle dApp ou URL essaies-tu d'ouvrir ?", "Vérifie que l'adresse commence bien par https://").
- Ne propose JAMAIS de générer un ticket support au tout premier message. Le ticket ne doit être proposé qu'en DERNIER RECOURS, quand le problème persiste après vérification ou s'il s'agit d'un bug bloquant avéré dans les logs techniques récents.
- Exception : si l'utilisateur demande expressément et directement un ticket ("créer un ticket", "contacter le support").

RÈGLE DE SÉCURITÉ ABSOLUE :
Tu ne dois JAMAIS accepter, répéter, ni inclure dans un message ou un ticket de support une clé privée, une seed phrase (mots de récupération) ou un mot de passe. Si le message de l'utilisateur contient de tels éléments, refuse formellement et avertis-le de ne JAMAIS partager ses identifiants secrets.

FORMAT DU TICKET SUPPORT (EN DERNIER RECOURS SEULEMENT) :
Si et seulement si le diagnostic a échoué ou que l'utilisateur l'exige, encadre le ticket STRICTEMENT entre les balises <SUPPORT_TICKET> et </SUPPORT_TICKET> :
<SUPPORT_TICKET>
🎫 [TICKET SUPPORT NOVA]
• ID : KX-YYYYMMDD-XXXXX
• Version : ${getClientEnvironmentInfo()}
• Problème : [Résumé direct du problème en une ligne]
• Réseau : [Nom du réseau, ex: Sepolia, Solana, Bitcoin, Ethereum]
• Erreur détectée : [Message ou code d'erreur exact si disponible dans les logs, sinon Non déterminée]
• Montant visé : [Montant si applicable, sinon N/A]
• Description utilisateur : "[Résumé concis des propos de l'utilisateur]"
• Logs récents :
[Insérer les logs techniques récents pertinents issus de la clé 'l' du contexte ci-dessous, ou 'Aucun log récent']
</SUPPORT_TICKET>
Ce tag fera automatiquement apparaître une carte interactive permettant de copier le ticket ou de l'exporter vers Telegram (@kalyxntw).

ACTIONS AUTONOMES (INTENTS) :
Tu peux diriger l'utilisateur dans l'application.
Si l'utilisateur demande d'aller sur une page ou d'effectuer une action, renvoie un tag JSON à la fin de ta réponse :

Format :
<ACTION>{"type": "NAVIGATE", "target": "ROUTE_ID", "params": { ... }}</ACTION>

Exemples :
- "Ouvre Uniswap" -> <ACTION>{"type": "NAVIGATE", "target": "BROWSER", "params": {"url": "https://app.uniswap.org"}}</ACTION>
- "Je veux envoyer des USDC à 0x123..." -> <ACTION>{"type": "NAVIGATE", "target": "SEND", "params": {"symbol": "USDC", "to": "0x123...", "amount": "10"}}</ACTION>
- "Montre mon QR code" -> <ACTION>{"type": "NAVIGATE", "target": "RECEIVE"}</ACTION>

Voici la liste des ROUTE_ID autorisés : ${APP_ROUTES_MAP.map(r => r.id + ' (' + r.description + ')').join(', ')}
NE JAMAIS diriger l'utilisateur vers des écrans liés à l'export de clé privée, à la phrase de récupération ou au changement de PIN.

CONTEXTE TEMPS RÉEL (ALLOWLIST PUBLIQUE) :
${serializeCopilotContext()}
Utilise uniquement ces données présentes. N'invente jamais un solde, une transaction ou une raison d'échec. Ce contexte ne contient volontairement aucune seed, clé privée, PIN ou secret. (Dans le JSON ci-dessus, la clé 'l' contient les 15 derniers logs techniques horodatés).
Si l'historique local est vide ou insuffisant pour répondre à une question de transaction, utilise l'outil public ${FETCH_WALLET_HISTORY_TOOL.name} avec l'adresse et le réseau concernés avant de répondre.
Pour les cours, actualités ou informations de protocole qui peuvent changer, utilise ${WEB_SEARCH_TOOL.name} avant de répondre. N'affirme jamais qu'une recherche a été faite si l'outil n'a pas renvoyé de résultats.`;

    if (ctx.screen === 'browser') {
      return `${base}\n\nNAVIGATION ACTIVE (dApp) :\n- URL : ${ctx.url || 'Page vierge'}\n- Titre : ${ctx.title || 'Inconnu'}\n\nVérifie la réputation de l'URL, préviens contre le phishing et réponds aux questions sur la dApp.`;
    }
    if (ctx.screen === 'wallet') {
      return `${base}\n\nDONNÉES DU PORTEFEUILLE :\n- Valeur totale : ${ctx.totalUsd} $\n- Actifs détenus : \n${ctx.tokensSummary?.length ? ctx.tokensSummary.join('\n') : 'Aucun token'}\n\nPERFORMANCES ET P&L (24h) :\n- Variation 24h : ${ctx.pnl24h !== undefined ? (ctx.pnl24h >= 0 ? '+' : '') + ctx.pnl24h.toFixed(2) + ' $ (' + (ctx.pnl24hPct >= 0 ? '+' : '') + ctx.pnl24hPct.toFixed(2) + ' %)' : 'Inconnue'}\n- Meilleur performer : ${ctx.topGainer || 'Aucun'}\n- Pire performer : ${ctx.topLoser || 'Aucun'}\nLORSQUE l'utilisateur demande un bilan ou ses performances, réponds en 2 à 3 phrases percutantes sans jargon lourd (ex: 'Sur les dernières 24h, ton portefeuille est à +5.2% (+0.08 $), principalement porté par ta position BTC.').\n\nSAUVEGARDE ET SÉCURITÉ :\n- Sauvegarde cloud active : ${ctx.hasCloudBackup ? 'OUI' : 'NON'}\n- Approbations actives : ${ctx.activeApprovalsCount || 0}\n\nRéponds directement aux questions sur la gestion, la sécurité ou la répartition de ces fonds.`;
    }
    return base;
  }

  const sendMessage = async (userMsgOverride?: string) => {
    const msgToSend = userMsgOverride || input.trim();
    if (!msgToSend || !apiKey) return;
    
    // Contrôle de sécurité client : blocage immédiat si clé privée ou seed phrase
    const secretCheck = detectSensitiveSecrets(msgToSend);
    if (secretCheck.hasSecret) {
      setInput('');
      addMessageToActive({ sender: 'user', text: sanitizeSecrets(msgToSend) });
      addMessageToActive({
        sender: 'assistant',
        text: '🚨 **Alerte de sécurité** : Ton message semble contenir une information hautement confidentielle (clé privée ou mots de récupération).\n\nPour ta sécurité, ce message a été intercepté localement et n\'a pas été transmis au serveur IA. Ne partage JAMAIS ta clé privée ou ta seed phrase, ni dans un chat, ni à un support.',
      });
      return;
    }

    setInput('');
    const traceId = newCopilotTraceId();
    const startedAt = Date.now();
    copilotLog(traceId, 'request.start', { provider, messageLength: msgToSend.length, sessionId: activeSessionId, screen: context?.screen });
    addMessageToActive({ sender: 'user', text: msgToSend });
    setLoading(true);
    setCopilotStatus('thinking');
    
    // Scroll au bas
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const account = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
      const chain = getAdapter(activeChain).config;
      const publicAddress = chain.family === 'solana' ? account?.solAddress : chain.family === 'bitcoin' ? account?.btcAddress : account?.evmAddress;
      if (publicAddress && useHistoryStore.getState().getCached(activeChain, publicAddress).length === 0) {
        setCopilotStatus('analyzing_sources', null);
        try {
          await fetchAddressTransactions(publicAddress, activeChain);
          await useHistoryStore.getState().fetchHistory(activeChain, publicAddress);
        } catch (error) {
          console.warn('[CopilotContext] Échec de la consultation on-chain:', error instanceof Error ? error.message : 'erreur inconnue');
        }
      }
      const SYSTEM_PROMPT = buildSystemPrompt(context);
      copilotLog(traceId, 'context.ready', { systemPromptChars: SYSTEM_PROMPT.length, historyMessages: messages.length });
      
      // Mapper les messages pour l'API
      let apiMessages = messages.map(m => ({ role: m.sender, content: m.text }));
      apiMessages.push({ role: 'user', content: msgToSend });
      
      if (apiMessages.length > 0 && apiMessages[0].role === 'assistant') {
        apiMessages = apiMessages.slice(1);
      }

      const { url, headers, model } = buildAiRequestParams(provider, apiKey, customUrl, customModel);
      let body: any = { model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...apiMessages] };
      
      if (provider === 'anthropic') {
        body.system = SYSTEM_PROMPT;
        body.messages = apiMessages;
        body.max_tokens = 1000;
      } else {
        body.tools = [
          { type: 'function', function: FETCH_WALLET_HISTORY_TOOL },
          { type: 'function', function: WEB_SEARCH_TOOL },
        ];
        body.tool_choice = 'auto';
      }

      let res = await requestAi(url, headers, body);
      let data = await res.json().catch(() => ({}));
      const toolCalls = data?.choices?.[0]?.message?.tool_calls;
      if (res.ok && provider !== 'anthropic' && Array.isArray(toolCalls) && toolCalls.length > 0) {
        copilotLog(traceId, 'tools.received', { count: toolCalls.length, names: toolCalls.map((call: { function?: { name?: string } }) => call.function?.name) });
        const call = toolCalls[0];
        if (call.function?.name === FETCH_WALLET_HISTORY_TOOL.name || call.function?.name === WEB_SEARCH_TOOL.name) {
          const parsedArgs = JSON.parse(call.function.arguments || '{}') as { query?: unknown };
          if (call.function.name === WEB_SEARCH_TOOL.name) {
            setCopilotStatus('searching_web', typeof parsedArgs.query === 'string' ? parsedArgs.query : null);
          } else {
            setCopilotStatus('analyzing_sources', null);
          }
          copilotLog(traceId, 'tool.dispatch', { name: call.function.name, args: parsedArgs });
          let toolResult: unknown;
          try {
            toolResult = await (await import('../../lib/copilotTools')).executeCopilotTool(call.function.name, parsedArgs);
          } catch (error) {
            copilotError(traceId, 'tool.failed', error, { name: call.function.name });
            toolResult = { error: error instanceof Error ? error.message : 'Consultation blockchain impossible.' };
          }
          copilotLog(traceId, 'tool.result', { name: call.function.name, resultChars: JSON.stringify(toolResult).length });
          body.messages = [
            ...body.messages,
            data.choices[0].message,
            { role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) },
          ];
          setCopilotStatus('generating');
          res = await requestAi(url, headers, body);
          data = await res.json().catch(() => ({}));
        }
      }
      
      let rawReply = '';
      if (!res.ok) {
         const providerMsg = data?.error?.message || data?.message || '';
         const customMsg = res.status === 429
           ? 'Kalyx est très sollicité, réessaie dans quelques secondes.'
           : typeof mapAiErrorToMessage === 'function' ? mapAiErrorToMessage(res.status) : 'Erreur IA';
         rawReply = res.status === 429
           ? customMsg
           : `${customMsg}\n\n*(Provider: ${providerMsg || res.statusText || 'Erreur interne'})*`;
      } else {
         setCopilotStatus('generating');
         rawReply = provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
         rawReply = rawReply || 'Erreur de réponse du modèle IA.';
      }
      
      let cleanReply = rawReply;
      const actions: (() => void)[] = [];
      const actionRegex = /<ACTION>([\s\S]*?)<\/ACTION>/gi;
      let actionMatch: RegExpExecArray | null;
      while ((actionMatch = actionRegex.exec(rawReply)) !== null) {
        try {
          const action = JSON.parse(actionMatch[1].trim()) as { target?: string; params?: Record<string, string> };
          const routeConfig = action.target ? APP_ROUTES_MAP.find((r) => r.id === action.target) : undefined;
          if (routeConfig) {
            actions.push(() => {
              onClose();
              const params = { ...(action.params ?? {}) };
              if (action.target === 'SEND' && params.to) {
                const addr = params.to;
                const valid = /^0x[a-fA-F0-9]{40}$/.test(addr) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr) || addr.endsWith('.eth') || addr.endsWith('.sol');
                if (!valid) delete params.to;
              }
              router.push({ pathname: routeConfig.route as any, params });
            });
          }
        } catch (error) {
          console.warn('[AI Action] Erreur parsing JSON:', error instanceof Error ? error.message : 'JSON invalide');
        }
      }
      cleanReply = cleanReply.replace(actionRegex, '').replace(/[^\S\r\n]{2,}/g, ' ').trim();
      addMessageToActive({ sender: "assistant", text: cleanReply });
      copilotLog(traceId, 'response.complete', { responseChars: cleanReply.length, actionCount: actions.length, totalElapsedMs: Date.now() - startedAt });
      actions.forEach((action, index) => setTimeout(action, 200 + index * 150));
    } catch (e) {
      copilotError(traceId, 'request.failed', e, { totalElapsedMs: Date.now() - startedAt });
      setCopilotStatus('idle');
      addMessageToActive({ sender: 'assistant', text: t('aiErrorNetwork') });
    } finally {
      setLoading(false);
      setCopilotStatus('idle');
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (!visible) return null;

  const SUGGESTIONS: { icon: IconName; label: string }[] = [
    { icon: 'defi', label: t('aiSuggestionBalance') },
    { icon: 'security', label: t('aiSuggestionSecurity') },
    { icon: 'market', label: t('aiSuggestionPerformance') },
    { icon: 'support', label: 'Créer un ticket support' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} accessibilityLabel={t('aiClose')} />
        <View style={{ height: '88%', backgroundColor: colors.surface2, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden' }}>
          {/* En-tête */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[3], paddingTop: space[3], paddingBottom: space[2] }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: space[2] }}>
              <Icon name="sparkles" size={18} />
              <Text variant="title2">{t('aiTitle')}</Text>
            </View>
            <IconButton icon="history" label={t('aiRecentChats')} tone={showHistory ? 'surface' : 'ghost'} onPress={() => setShowHistory((v) => !v)} />
            <IconButton icon="add" label={t('aiNewChat')} tone="ghost" onPress={() => { createNewSession(); setShowHistory(false); }} />
            <IconButton icon="close" label={t('aiClose')} tone="ghost" onPress={onClose} />
          </View>

          {showHistory ? (
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: insets.bottom + space[4] }}
              ListHeaderComponent={<Text variant="caption" tone="secondary" style={{ marginBottom: space[2] }}>{t('aiRecentChats')}</Text>}
              ListEmptyComponent={<Text variant="bodySecondary" tone="secondary">{t('aiNoChats')}</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => { setActiveSession(item.id); setShowHistory(false); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: space[2], borderRadius: radius.input, paddingHorizontal: space[2], backgroundColor: pressed || item.id === activeSessionId ? colors.surface3 : 'transparent' })}>
                  <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text>
                  <Pressable onPress={() => deleteSession(item.id)} hitSlop={8} accessibilityLabel={t('aiDelete')}><Icon name="close" size={14} tone="faint" /></Pressable>
                </Pressable>
              )}
            />
          ) : (
            <>
              {messages.length === 0 ? (
                /* État d'accueil au centre */
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[8], gap: space[3] }}>
                  <View style={{ width: 64, height: 64, borderRadius: radius.round, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="sparkles" size={28} />
                  </View>
                  <Text variant="title2" style={{ textAlign: 'center' }}>{profileName ? t('aiGreetingName').replace('{name}', profileName) : t('aiGreeting')}</Text>
                  <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center' }}>{greeting}</Text>
                  {ethGas ? <Text variant="micro" tone="tertiary">{t('aiEthGas').replace('{gas}', String(Math.round(ethGas.gwei))).replace('{usd}', ethGas.usdTransfer.toFixed(2))}</Text> : null}
                </View>
              ) : (
                <ScrollView ref={scrollViewRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
                  {messages.map((m, i) => {
                    const mine = m.sender === 'user';
                    const ticketRegex = /<SUPPORT_TICKET>([\s\S]*?)<\/SUPPORT_TICKET>/i;
                    const ticketMatch = !mine ? m.text.match(ticketRegex) : null;
                    const textWithoutTicket = ticketMatch ? m.text.replace(ticketRegex, '').trim() : m.text;

                    return (
                      <View
                        key={i}
                        style={{
                          alignSelf: mine ? 'flex-end' : 'flex-start',
                          maxWidth: ticketMatch ? '100%' : '85%',
                          width: ticketMatch ? '100%' : undefined,
                          gap: space[2],
                        }}
                      >
                        {textWithoutTicket ? (
                          <View
                            style={{
                              alignSelf: mine ? 'flex-end' : 'flex-start',
                              backgroundColor: mine ? colors.primary : colors.surface1,
                              borderWidth: mine ? 0 : 1,
                              borderColor: colors.border,
                              paddingHorizontal: space[3],
                              paddingVertical: space[2],
                              borderRadius: 18,
                              borderBottomRightRadius: mine ? 6 : 18,
                              borderBottomLeftRadius: mine ? 18 : 6,
                            }}
                          >
                            <Text
                              variant="bodySecondary"
                              style={{
                                color: mine ? colors.onPrimary : colors.text,
                                fontSize: 15,
                                lineHeight: 20,
                              }}
                              selectable
                            >
                              {textWithoutTicket}
                            </Text>
                          </View>
                        ) : null}
                        {ticketMatch ? (
                          <TicketSupportCard ticketContent={ticketMatch[1].trim()} />
                        ) : null}
                      </View>
                    );
                  })}
                  {loading ? (
                    <View style={{ alignSelf: 'flex-start', width: '60%', gap: space[1], padding: space[3], backgroundColor: colors.surface1, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                      <Text variant="caption" tone="secondary">
                        {copilotStatus === 'searching_web' ? t('aiStatusWebSearch').replace('{query}', currentSearchQuery ?? '') : copilotStatus === 'analyzing_sources' ? t('aiStatusReadingSources') : copilotStatus === 'generating' ? t('aiStatusWriting') : t('aiStatusThinking')}
                      </Text>
                      <Skeleton width="100%" height={12} /><Skeleton width="70%" height={12} />
                    </View>
                  ) : null}
                </ScrollView>
              )}

              {/* Suggestions + saisie */}
              <View style={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: insets.bottom + space[3], gap: space[3], borderTopWidth: 1, borderTopColor: colors.border }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[2] }}>
                  {SUGGESTIONS.map((sg) => <Chip key={sg.label} label={sg.label} icon={sg.icon} onPress={() => sendMessage(sg.label)} />)}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <View style={{ flex: 1, minHeight: 48, borderRadius: radius.round, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space[4], justifyContent: 'center' }}>
                    <TextInput
                      value={input}
                      onChangeText={setInput}
                      onSubmitEditing={() => sendMessage()}
                      placeholder={t('aiInputPlaceholder')}
                      placeholderTextColor={colors.textTertiary}
                      returnKeyType="send"
                      multiline
                      style={{ color: colors.text, fontSize: 15, lineHeight: 20, fontFamily: 'GeneralSans-Medium', paddingVertical: 12, maxHeight: 100 }}
                    />
                  </View>
                  <Pressable onPress={() => sendMessage()} disabled={!input.trim() || loading} accessibilityLabel={t('aiSend')} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: radius.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: !input.trim() || loading ? 0.4 : pressed ? 0.8 : 1 })}>
                    <Icon name="send" size={20} color={colors.onPrimary} />
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
