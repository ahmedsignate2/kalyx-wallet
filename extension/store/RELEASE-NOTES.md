# Extension Kalyx 0.10.0 — bêta

Bêta non répertoriée : pour les testeurs invités seulement.

Nouveau depuis la 0.9.0 :
- Bitcoin : adresses, soldes, activité, envoi, sites Bitcoin (Wallet Standard) et mode compagnon.
- TON : adresses, soldes, activité, envoi de TON et de jettons.
- Tokens ERC-20 sur tous les réseaux, par le relais Kalyx (aucune clé d'API dans l'extension).
- Fenêtre de signature : score de risque, simulation de la transaction, autorisations de tokens expliquées et plafonnées.
- Sécurité : passkeys en second facteur (plusieurs appareils), code de contrainte (profil leurre), mode « téléphone seulement ».
- Mode compagnon : tous les portefeuilles et comptes du téléphone en une liaison ; signe de vie pour que l'app affiche l'état réel de la connexion.
- Nouveaux sélecteurs (réseaux, tokens, langues, devises) avec logos et recherche ; fenêtres refaites.
- Plus rapide sur les appareils lents : chiffrement du coffre étalonné selon l'appareil, réseaux vides interrogés moins souvent.

Toujours là :
- Portefeuille non-custodial pour Ethereum, les réseaux EVM, Solana, Bitcoin et TON.
- Créer un portefeuille, ou importer une phrase de 12 à 24 mots, une clé privée ou une sauvegarde de l'app mobile.
- Connexion aux dApps (EIP-1193, EIP-6963, Wallet Standard) : chaque demande dans une fenêtre de Kalyx, avec l'explication de ce que tu signes.
- Acheter : USDC, ETH ou SOL livrés sur ton compte, paiement sur la page sécurisée de Stripe (mode test pendant la bêta).
- 15 langues.

Limites connues de la bêta :
- TON : pas encore de mode compagnon ni de sites TON Connect.
- Chromium seulement (Chrome, Brave, Edge).

Vérifier le paquet : `sha256sum -c SHA256SUMS.txt`. `BUILD-HASH.txt` est l'empreinte du contenu, identique à chaque build du même commit.
