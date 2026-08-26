import { APP_ROUTES_MAP } from '../../lib/aiAppMap';
import React, { useState, useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useTheme, fonts, radii, spacing } from '../../ui/theme';
import { useAiStore } from '../../lib/aiStore';
import { useSettings } from '../../lib/settingsStore';
import { buildAiRequestParams, mapAiErrorToMessage } from '../../lib/aiConfig';
import { useAiChatHistoryStore } from '../../lib/aiChatHistoryStore';
import { useGasTracker } from '../../lib/gasTrackerStore';
import { Icon } from '../../ui/icon';
import { router } from 'expo-router';

export function AiChatModal({ visible, onClose, context }: { visible: boolean, onClose: () => void, context: any }) {
  const { colors, typography } = useTheme();
  const { provider, apiKey, customUrl, customModel } = useAiStore();
  const { profileName, language } = useSettings();
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
       useAiStore.getState().closeChat(); // Reset state but keep modal visible (wait we just want to clear initialPrompt)
       useAiStore.setState({ initialPrompt: null });
    }
  }, [visible, initialPrompt]);
  
  const [showHistory, setShowHistory] = useState(false);
  
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const messages = activeSession?.messages || [];
  const scrollViewRef = useRef<ScrollView>(null);

  // Initialiser une nouvelle session si aucune n'est active à l'ouverture
  useEffect(() => {
    if (visible && !activeSessionId) {
      createNewSession();
    }
  }, [visible, activeSessionId]);

  // Ajouter le greeting automatique sur une session vide
  useEffect(() => {
    if (visible && activeSessionId && messages.length === 0) {
      let greeting = language?.startsWith('en') 
        ? "I'm here! Want to check your portfolio or ask a question?"
        : language?.startsWith('es')
        ? "¡Estoy aquí! ¿Quieres revisar tu saldo o tienes alguna pregunta?"
        : "Dispo ! Tu veux checker un truc sur tes soldes ou poser une question ?";
        
      if (context?.screen === 'browser') {
        greeting = language?.startsWith('en') 
          ? "You are on the dApp browser. Need a security check on this URL?" 
          : "Tu es sur le navigateur dApp. Tu as un doute sur un protocole ou une URL ?";
      } else if (context?.url && context.url.includes('phishing')) {
        greeting = language?.startsWith('en') 
          ? "⚠️ Watch out, this URL looks suspicious. Do not connect your wallet." 
          : "⚠️ Fais gaffe, cette URL semble louche. Ne connecte pas ton wallet ici sans certitude.";
      }
      addMessageToActive({ sender: 'assistant', text: greeting });
    }
  }, [visible, activeSessionId, messages.length]);

  function buildSystemPrompt(ctx: any) {
    const base = `Tu es l'assistant personnel de Nova Wallet.

CONTEXTE UTILISATEUR :
- Prénom : ${profileName || "l'utilisateur"}
- Langue de l'application : ${language || 'fr'}

CONSIGNES DE COMMUNICATION :
1. Réponds STRICTEMENT dans la langue de l'application (${language || 'fr'}).
2. Tu t'adresses à ${profileName || "l'utilisateur"} de façon naturelle, directe et amicale (comme un pote expert). Tu peux utiliser son prénom occasionnellement quand c'est pertinent.
3. Reste toujours concis, sans pavé théorique ni disclaimers lourds : 2 à 4 phrases percutantes par réponse maximum.
4. Ne demande JAMAIS l'adresse ou les soldes : tu as déjà accès à ses données publiques dans le contexte ci-dessous.
5. Adapte-toi immédiatement : s'il pose une question rapide, réponds cash sans tourner autour du pot.` + `

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
NE JAMAIS diriger l'utilisateur vers des écrans liés à l'export de clé privée, à la phrase de récupération ou au changement de PIN.`;

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
    
    setInput('');
    addMessageToActive({ sender: 'user', text: msgToSend });
    setLoading(true);
    
    // Scroll au bas
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const SYSTEM_PROMPT = buildSystemPrompt(context);
      
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
      }

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      
      let rawReply = '';
      if (!res.ok) {
         const providerMsg = data?.error?.message || data?.message || '';
         const customMsg = typeof mapAiErrorToMessage === 'function' ? mapAiErrorToMessage(res.status) : 'Erreur IA';
         rawReply = `${customMsg}\n\n*(Provider: ${providerMsg || res.statusText || 'Erreur interne'})*`;
      } else {
         rawReply = provider === 'anthropic' ? data.content?.[0]?.text : data.choices?.[0]?.message?.content;
         rawReply = rawReply || 'Erreur de réponse du modèle IA.';
      }
      
      let cleanReply = rawReply;
      let actionToExecute = null;
      const actionMatch = rawReply.match(/<ACTION>(.*?)<\/ACTION>/s);
      if (actionMatch) {
        cleanReply = rawReply.replace(/<ACTION>.*?<\/ACTION>/s, "").trim();
        try {
          const action = JSON.parse(actionMatch[1]);
          const routeConfig = APP_ROUTES_MAP.find((r) => r.id === action.target);
          if (routeConfig) {
            actionToExecute = () => {
              onClose();
              if (action.target === "SEND" && action.params && action.params.to) {
                const addr = action.params.to;
                const isEvm = /^0x[a-fA-F0-9]{40}$/.test(addr);
                const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
                const isDomain = addr.endsWith(".eth") || addr.endsWith(".sol");
                if (!isEvm && !isSol && !isDomain) {
                   delete action.params.to;
                }
              }
              router.push({
                pathname: routeConfig.route as any,
                params: action.params || {}
              });
            };
          }
        } catch (e) {
          console.warn("[AI Action] Erreur parsing JSON:", e);
        }
      }
      addMessageToActive({ sender: "assistant", text: cleanReply });
      if (actionToExecute) {
        setTimeout(actionToExecute, 200);
      }
    } catch (e) {
      addMessageToActive({ sender: 'assistant', text: "Désolé, je n'ai pas pu joindre l'API." });
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (!visible) return null;

    return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} 
          style={styles.modalContainer}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Nova Copilot</Text>
              
              <TouchableOpacity onPress={() => setShowHistory(!showHistory)} style={styles.iconBtn}>
                <Icon name="history" size={18} color={showHistory ? colors.accent : "#A1A1AA"} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { createNewSession(); setShowHistory(false); }} style={styles.iconBtn}>
                <Icon name="add" size={18} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Fermer</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          {showHistory ? (
            <View style={styles.historyContainer}>
              <Text style={styles.historyTitle}>Discussions récentes</Text>
              <FlatList
                data={sessions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.historyItem,
                      item.id === activeSessionId && styles.historyItemActive,
                    ]}
                    onPress={() => {
                      setActiveSession(item.id);
                      setShowHistory(false);
                    }}
                  >
                    <Text style={styles.historyItemText} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <TouchableOpacity onPress={() => deleteSession(item.id)} style={{ padding: 4 }}>
                      <Icon name="close" size={14} color="#71717A" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            </View>
          ) : (
            <>
              <ScrollView ref={scrollViewRef} style={styles.messagesList} contentContainerStyle={{ paddingVertical: 12, gap: 10 }} keyboardShouldPersistTaps="handled">
                {messages.map((m, i) => (
                  <View key={i} style={{
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.sender === 'user' ? colors.accent : '#27272A',
                    padding: spacing(1.5),
                    borderRadius: radii.md,
                    maxWidth: '85%'
                  }}>
                    <Text style={{ color: '#fff', fontFamily: fonts.medium }}>{m.text}</Text>
                  </View>
                ))}
                {loading && <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start', margin: spacing(1) }} />}
              </ScrollView>

              <View style={styles.bottomSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
                  {['📊 Bilan rapide', '🔍 Check sécurité', '📈 Bilan P&L'].map(q => (
                    <Pressable key={q} onPress={() => sendMessage(q)} style={{ backgroundColor: '#27272A', padding: 8, borderRadius: 16 }}>
                      <Text style={{ color: colors.textFaint, fontSize: 12 }}>{q}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Posez une question..."
                    placeholderTextColor={colors.textFaint}
                    value={input}
                    onChangeText={setInput}
                    onSubmitEditing={() => sendMessage()}
                  />
                  <Pressable onPress={() => sendMessage()} style={{ backgroundColor: colors.accent, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="send" size={18} color="#000" />
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  modalContainer: {
    height: '85%',
    overflow: 'hidden',
    backgroundColor: '#161618',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#FFF',
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#27272A',
  },
  closeText: {
    color: '#A1A1AA',
    fontSize: 14,
  },
  historyContainer: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  historyTitle: {
    fontSize: 14,
    color: '#71717A',
    marginBottom: 12,
    fontFamily: fonts.medium,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#18181B',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  historyItemActive: {
    borderColor: '#E5A93C',
  },
  historyItemText: {
    color: '#FAFAFA',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
    fontFamily: fonts.medium,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  bottomSection: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingTop: 8,
    gap: 8,
  },
  chipsRow: {
    flexGrow: 0,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1, 
    backgroundColor: '#27272A', 
    color: '#fff',
    padding: 12, 
    borderRadius: 22, 
    fontFamily: fonts.medium
  }
});
