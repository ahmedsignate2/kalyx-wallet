# 1. Cahier des charges

## 1.1 Vision produit

Un wallet crypto mobile **plus simple que MetaMask**, **beau, rapide, multi-chain**. La cible : un utilisateur qui trouve MetaMask intimidant et veut une expérience type application bancaire moderne (Revolut), tout en gardant le contrôle total de ses fonds (non-custodial).

**Promesse :** « Tes cryptos, aussi simples qu'un compte Revolut, mais c'est toi qui as les clés. »

**Slogan directeur :** *« Le wallet qui te protège et que tu comprends. »*

## 1.0 Les 3 piliers (la boussole du projet)

On ne cherche **pas** à battre MetaMask sur le nombre de blockchains — c'est un combat déjà perdu et sans valeur (des wallets en supportent des centaines). On le bat sur trois choses, et **chaque arbitrage produit doit se demander : est-ce que ça sert un de ces piliers ?**

1. **Design** — une interface qui donne *envie* d'ouvrir l'app. Les gens ne partent pas parce qu'il manque un bouton, ils partent par manque de confiance et d'envie.
2. **Sécurité** — prévenir les erreurs *avant* qu'elles n'arrivent (détection d'arnaque avant signature = arme n°1).
3. **Simplicité** — un débutant doit pouvoir envoyer de la crypto sans avoir l'impression de piloter une centrale nucléaire.

Les blockchains supplémentaires s'ajoutent *ensuite*, facilement (le pattern `ChainAdapter` est fait pour ça). Elles ne sont jamais l'argument de vente.

## 1.2 Périmètre fonctionnel (version cible complète)

### Onboarding & sécurité
- Création d'un nouveau wallet → génération d'une seed **BIP-39** (12/24 mots).
- Sauvegarde guidée de la seed (affichage, puis vérification par re-saisie).
- Import d'un wallet existant via seed phrase BIP-39.
- Verrouillage par **code PIN** + **biométrie** (Face ID / Touch ID / empreinte Android).
- Auto-lock après inactivité.

### Comptes & chaînes
- **Multi-chain** : Ethereum, BNB Chain, Polygon (EVM), + Bitcoin, + Solana.
- Un même mnémonique dérive tous les comptes (chemins BIP-44 par chaîne).
- Vue portefeuille agrégée : solde total en devise fiat (€/$).
- Liste des tokens par chaîne (natif + ERC-20 / SPL principaux).

### Transactions
- **Recevoir** : adresse + QR code + copie.
- **Envoyer** : saisie/scan d'adresse, montant, estimation des frais (gas), confirmation.
- Historique des transactions par compte.
- Statut en temps réel (en attente / confirmée / échouée).

### Confort
- Prix en temps réel + variation 24h.
- Dark mode (par défaut) et light mode.
- Multi-langue (FR/EN au minimum).

## 1.3 Contraintes techniques imposées

| Contrainte | Détail |
|------------|--------|
| Non-custodial | Aucune clé côté serveur. L'app fonctionne sans backend propriétaire pour les fonds. |
| Clés locales | Clé privée / seed jamais transmises, jamais loggées, jamais en clair sur disque. |
| BIP-39 | Standard obligatoire pour la seed. Compatible import/export vers d'autres wallets. |
| Chiffrement local | Seed chiffrée au repos, déverrouillée uniquement via biométrie/PIN. |
| Stockage sécurisé | Keychain (iOS) / Keystore (Android), pas d'AsyncStorage pour les secrets. |
| RN / Expo | React Native avec Expo (dev builds / EAS, pas Expo Go car crypto native requise). |

## 1.4 Ce qui est HORS périmètre (au moins au début)

- Pas de swap / DEX intégré (phase avancée).
- Pas de bridge cross-chain.
- Pas de connexion WalletConnect / dApps (phase avancée).
- Pas de NFT (phase avancée).
- Pas de backend de custody, pas de KYC, pas de compte utilisateur serveur.
- Pas de staking, pas de DeFi complexe.

## 1.5 Exigences non-fonctionnelles

- **Sécurité** : priorité n°1, avant les fonctionnalités.
- **Performance** : démarrage < 2 s, navigation fluide 60 fps.
- **Fiabilité** : une transaction ne doit jamais partir sans confirmation explicite de l'utilisateur.
- **UX** : compréhensible par un non-technicien. Vocabulaire simple, pas de jargon inutile.
- **Offline-first** : l'app s'ouvre et affiche les clés/adresses sans réseau (seuls les soldes/prix nécessitent le réseau).

## 1.6 Critères d'acceptation du produit

- Je peux créer un wallet, noter ma seed, la vérifier, et retrouver mes fonds après réinstallation via cette seed.
- La seed importée dans MetaMask (ou l'inverse) donne **les mêmes adresses EVM** → preuve de conformité BIP-39/44.
- Aucune requête réseau ne contient de clé/seed (vérifiable au proxy réseau).
- L'app se verrouille et exige biométrie/PIN à la réouverture.
