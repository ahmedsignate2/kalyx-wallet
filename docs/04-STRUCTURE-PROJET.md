# 4. Structure du projet (arborescence cible)

> Ceci est la **structure visée**, pas encore créée (on ne code pas encore). Elle reflète les couches de [03-ARCHITECTURE.md](03-ARCHITECTURE.md).

```
crypto-wallet/
├── app/                          # Écrans (Expo Router, file-based routing)
│   ├── _layout.tsx               # Layout racine + gate de verrouillage
│   ├── index.tsx                 # Redirection selon état (onboardé ou non)
│   ├── (onboarding)/
│   │   ├── welcome.tsx
│   │   ├── create.tsx            # Génération seed
│   │   ├── backup.tsx            # Affichage seed
│   │   ├── verify.tsx            # Vérification seed
│   │   └── import.tsx            # Import seed existante
│   ├── (auth)/
│   │   ├── set-pin.tsx
│   │   └── unlock.tsx            # PIN + biométrie
│   └── (main)/
│       ├── _layout.tsx           # Tab bar
│       ├── home.tsx              # Portefeuille + solde total
│       ├── receive.tsx           # Adresse + QR
│       ├── send.tsx              # Envoi
│       ├── history.tsx           # (phase 2)
│       └── settings.tsx
│
├── src/
│   ├── domain/                   # Logique métier — NE dépend PAS de l'UI
│   │   ├── wallet/
│   │   │   ├── WalletService.ts  # create / import / lock / unlock
│   │   │   └── KeyManager.ts     # dérivation + signature (seul à voir les clés)
│   │   ├── chains/
│   │   │   ├── ChainAdapter.ts   # interface commune
│   │   │   ├── EvmAdapter.ts
│   │   │   ├── BitcoinAdapter.ts # (phase 3)
│   │   │   └── SolanaAdapter.ts  # (phase 4)
│   │   ├── prices/PriceService.ts
│   │   └── history/HistoryService.ts
│   │
│   ├── security/                 # Couche sécurité isolée
│   │   ├── SecureStorage.ts      # SecureStore + AES-GCM
│   │   ├── biometrics.ts         # expo-local-authentication
│   │   ├── pin.ts                # hash/verif du PIN
│   │   └── memory.ts             # helpers d'effacement mémoire (zeroize)
│   │
│   ├── crypto/                   # Adaptateurs fins autour de @noble/@scure
│   │   ├── mnemonic.ts           # BIP-39
│   │   ├── hd.ts                 # BIP-32/44
│   │   └── random.ts             # CSPRNG
│   │
│   ├── state/                    # Zustand stores
│   │   ├── walletStore.ts
│   │   ├── sessionStore.ts       # verrouillage / déverrouillage
│   │   └── settingsStore.ts
│   │
│   ├── config/
│   │   ├── chains.ts             # RPC, chainId, explorers par réseau
│   │   └── constants.ts
│   │
│   ├── ui/                       # Design system (style Revolut)
│   │   ├── theme/
│   │   │   ├── colors.ts         # palette dark/light
│   │   │   ├── typography.ts
│   │   │   ├── spacing.ts
│   │   │   └── radii.ts          # coins arrondis
│   │   └── components/
│   │       ├── Card.tsx          # carte arrondie
│   │       ├── Button.tsx
│   │       ├── BalanceCard.tsx
│   │       ├── TokenRow.tsx
│   │       ├── Sheet.tsx         # bottom sheet
│   │       └── QRCode.tsx
│   │
│   └── utils/
│       ├── format.ts             # formatage montants, adresses tronquées
│       └── validation.ts         # validation adresses/montants
│
├── polyfills.ts                  # import 'react-native-get-random-values' EN PREMIER
├── App entry (via expo-router)
├── app.config.ts                 # config Expo (permissions, plugins)
├── eas.json                      # profils de build EAS
├── tsconfig.json                 # strict: true
├── package.json
├── .env.example                  # RPC keys publiques (jamais de secret utilisateur)
├── .gitignore                    # exclut .env, builds, secrets
└── docs/                         # cette documentation
```

## Conventions

- **`src/domain` et `src/security` ne sont jamais importés depuis un composant UI directement** pour manipuler des clés — on passe par `WalletService`.
- **Aucun secret dans `.env`** : `.env` ne contient que des clés d'API publiques (RPC). Les secrets utilisateur vivent uniquement dans SecureStore.
- **`polyfills.ts` est importé en toute première ligne** de l'entrée de l'app, sinon la génération aléatoire n'est pas sûre.
- Tests unitaires à côté des fichiers (`*.test.ts`), surtout pour `crypto/`, `domain/wallet/`, `security/`.
