# Politique de confidentialité — extension Kalyx Wallet

*Dernière mise à jour : 19 octobre 2026*

Kalyx Wallet est un portefeuille **non-custodial** : tes clés et ta phrase de
récupération ne quittent jamais ton ordinateur. Kalyx n'a ni compte
utilisateur, ni serveur qui garde tes données.

## Ce qui reste sur ton ordinateur

- **Le coffre** : ta phrase de récupération et tes clés privées, chiffrées avec
  une clé dérivée de ton mot de passe (scrypt, puis AES-256-GCM). Ton mot de
  passe n'est jamais enregistré.
- **La session** : quand Kalyx est déverrouillé, la clé du coffre est gardée en
  mémoire par le navigateur (`storage.session`) et effacée au verrouillage ou à
  la fermeture du navigateur.
- **Tes réglages et données locales** : délai de verrouillage, devise, liste
  blanche, sites connectés, cache des soldes et de l'activité.

Désinstaller l'extension efface tout cela. Sans ta phrase de récupération,
personne, pas même Kalyx, ne peut récupérer tes fonds.

## Ce que Kalyx ne collecte pas

Aucune statistique d'usage, aucune télémétrie, aucun traceur, aucun journal
envoyé à Kalyx. Kalyx ne vend ni ne partage aucune donnée, et n'en utilise
aucune à des fins publicitaires.

## Ce qui part sur le réseau, et pourquoi

Un portefeuille doit interroger les blockchains. Pour afficher tes soldes, ton
activité et envoyer tes transactions, l'extension contacte directement, depuis
ton navigateur :

| Service | Ce qui est envoyé | Pourquoi |
|---|---|---|
| Nœuds publics de chaque réseau (RPC) | Tes adresses **publiques**, tes transactions **signées** | Lire les soldes, estimer les frais, diffuser une transaction |
| Explorateurs de blocs (par ex. Blockscout) | Tes adresses publiques | Lire ton historique |
| DefiLlama / CoinGecko | Les identifiants des jetons (pas tes adresses) | Afficher la valeur dans ta devise |
| GoPlus Security | L'adresse d'un contrat ou d'un destinataire, le domaine d'un site | Signaler un contrat ou un site dangereux avant une signature |
| Hébergeurs des logos de jetons (par ex. CoinGecko, wsrv.nl) | La demande de l’image, sans ton adresse | Afficher les logos des jetons |

Ces services voient ton adresse IP, comme tout site que tu visites. Les
adresses sur une blockchain sont publiques par nature. **Ni ta phrase, ni tes
clés, ni ton mot de passe ne sont jamais envoyés.** La liste exacte des
adresses contactées est dans le code source de l'extension.

## Les sites web (dApps)

Un site ne voit ton adresse que si tu acceptes de le connecter, dans une
fenêtre de Kalyx. Il ne peut rien signer sans ton accord, demandé à chaque
fois. Tu peux déconnecter un site à tout moment (Réglages → Sites connectés).

## Permissions

- `storage` : enregistrer localement le coffre chiffré et tes réglages.
- `alarms`, `idle` : verrouiller Kalyx après le délai choisi et dès que l'écran
  se verrouille.
- `sidePanel` : ouvrir Kalyx dans le panneau latéral.
- `scripting` et accès aux sites : permettre aux sites de proposer une
  connexion ou une signature, que tu acceptes ou refuses dans Kalyx.

## Contact

Pour toute question : [CONTACT]
