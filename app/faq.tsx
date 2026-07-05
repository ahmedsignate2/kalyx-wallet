import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';

interface QA { q: string; a: string; }
interface Section { title: string; items: QA[]; }

const FAQ: Section[] = [
  {
    title: 'Wallet',
    items: [
      { q: 'Comment créer un wallet ?', a: "Sur l'écran de bienvenue, appuie sur « Créer un wallet ». Nova génère une phrase de récupération de 12 mots que tu dois noter sur papier, puis tu vérifies quelques mots et tu choisis un code PIN. Tes clés sont créées directement sur ton téléphone." },
      { q: 'Comment restaurer un wallet ?', a: "Sur l'écran de bienvenue, appuie sur « J'ai déjà une phrase », colle ta phrase de récupération BIP-39 (12 ou 24 mots) et choisis un PIN. Ton wallet et ses comptes sont redérivés localement." },
      { q: 'Où est stockée ma phrase secrète ?', a: "Uniquement sur ton téléphone, chiffrée en AES-256-GCM sous ton PIN, dans le stockage sécurisé matériel (Keystore/Keychain). Elle n'est JAMAIS envoyée sur le réseau ni stockée sur un serveur." },
      { q: 'Puis-je changer mon PIN ?', a: 'Oui : Réglages → Changer le PIN. Le changement re-chiffre tous tes coffres avec le nouveau code.' },
    ],
  },
  {
    title: 'Sécurité',
    items: [
      { q: 'Que faire si je perds mon téléphone ?', a: 'Tes fonds sont sur la blockchain, pas dans le téléphone. Installe Nova sur un nouvel appareil et restaure avec ta phrase de récupération. Sans cette phrase, personne (toi inclus) ne peut accéder aux fonds — d’où l’importance de la garder en lieu sûr.' },
      { q: 'Nova peut-il voir ma seed phrase ?', a: 'Non. Nova est non-custodial : ta phrase est chiffrée sur ton appareil, déchiffrée à la volée uniquement pour signer, puis oubliée. Elle ne transite jamais par nos serveurs.' },
      { q: 'Pourquoi dois-je signer certaines transactions ?', a: 'Toute action qui déplace des fonds ou autorise un contrat à les dépenser doit être signée par ta clé privée, protégée par ton PIN. C’est ce qui empêche un site de faire quoi que ce soit sans ton accord explicite.' },
      { q: 'Comment reconnaître une arnaque ?', a: "Personne de légitime ne te demandera jamais ta phrase de récupération. Méfie-toi des sites qui imitent une marque connue (Nova t'alerte en rouge), des approbations « illimitées », et des messages trop beaux pour être vrais. Nova affiche aussi une analyse de sécurité (GoPlus) avant chaque signature." },
    ],
  },
  {
    title: 'Transactions',
    items: [
      { q: 'Pourquoi ma transaction est-elle en attente ?', a: 'Elle attend d’être incluse dans un bloc. Des frais de réseau trop bas ou une forte congestion la ralentissent. Nova te notifie dès qu’elle est confirmée.' },
      { q: 'Comment annuler une transaction ?', a: 'Une transaction confirmée est irréversible. Une transaction encore en attente peut parfois être remplacée (même nonce, frais plus élevés) — cette fonction n’est pas encore automatisée dans Nova.' },
      { q: 'Que sont les frais de gas ?', a: 'C’est le coût payé aux validateurs du réseau pour traiter ta transaction, réglé dans la crypto native (ETH, BNB, POL…). Il varie selon la congestion du réseau.' },
      { q: 'Pourquoi ma transaction a-t-elle échoué ?', a: 'Causes fréquentes : solde insuffisant (frais compris), slippage dépassé sur un swap, limite de gas trop basse, ou le contrat a rejeté l’opération. Note : les frais de gas d’une transaction échouée sont quand même prélevés.' },
    ],
  },
  {
    title: 'dApps',
    items: [
      { q: 'Comment connecter une dApp ?', a: 'Deux façons : le navigateur intégré (Menu → Navigateur dApps), ou WalletConnect (colle le lien « wc:… »). Dans les deux cas, tu confirmes la connexion avec ton PIN.' },
      { q: 'Comment déconnecter une dApp ?', a: 'Onglet WalletConnect : « Déconnecter » pour une session WalletConnect, « Oublier » pour un site du navigateur intégré.' },
      { q: 'Qu’est-ce que WalletConnect ?', a: 'Un protocole standard qui relie ton wallet à une dApp via un QR code ou un lien, sans extension de navigateur.' },
      { q: 'Comment révoquer une autorisation ?', a: 'Menu → Approbations : Nova liste les contrats que tu as autorisés à dépenser tes tokens. Révoque ceux que tu n’utilises plus (c’est une transaction, avec frais de réseau).' },
    ],
  },
  {
    title: 'Réseau',
    items: [
      { q: 'Comment changer de réseau ?', a: 'Depuis l’accueil (le badge du réseau) ou Réglages → Réseau. La même adresse fonctionne sur tous les réseaux EVM ; seul le réseau interrogé change.' },
      { q: 'Comment ajouter un réseau RPC ?', a: 'Active le Mode expert, puis Menu → Développeur → Réseaux personnalisés : renseigne le nom, le Chain ID, le symbole et l’URL du RPC (https).' },
    ],
  },
];

export default function Faq() {
  const { colors, typography } = useTheme();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'FAQ' }} />
      <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        {FAQ.map((section) => (
          <View key={section.title} style={{ gap: spacing(1) }}>
            <Text style={typography.section}>{section.title}</Text>
            <GlassCard style={{ paddingVertical: spacing(0.5) }}>
              {section.items.map((qa, i) => {
                const id = section.title + i;
                const expanded = open === id;
                return (
                  <View key={id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                    <Pressable onPress={() => setOpen(expanded ? null : id)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1.5) }}>
                      <Text style={[typography.bodyStrong, { flex: 1, fontSize: 15 }]}>{qa.q}</Text>
                      <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                        <Icon name="chevron" size={16} color={colors.textMuted} />
                      </View>
                    </Pressable>
                    {expanded ? <Text style={[typography.muted, { fontSize: 14, lineHeight: 20, paddingBottom: spacing(1.5) }]}>{qa.a}</Text> : null}
                  </View>
                );
              })}
            </GlassCard>
          </View>
        ))}
      </ScrollView>
    </PremiumScreen>
  );
}
