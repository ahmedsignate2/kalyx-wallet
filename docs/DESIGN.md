# Kalyx — Bible design & produit

> Source de vérité pour tout ce qui est visuel et produit. Les VALEURS (couleurs, typo,
> grille, rayons, ressorts, haptique) vivent dans `ui/tokens.ts` ; ce document explique
> le POURQUOI et les règles. Si une décision n'est pas ici, on la prend, puis on l'ajoute.
> Mis à jour : 2026-09-11 (Phase 0 renommage + Phase 1 tokens livrées).

## 0. Ce qu'on vise
Cohérence totale · un seul moment inoubliable (la lumière de la nova) · la confiance
visible (chaque signature expliquée, simulée) · la vitesse perçue (cache, < 100 ms).
Règle d'or : si un élément ne sert ni la compréhension ni la confiance, on le retire.

## 1. Nom
**Kalyx Wallet** (Nova Wallet existe déjà, écosystème Polkadot). Identifiant
`com.kalyx.wallet`, scheme `kalyx://`, slug EAS `kalyx-wallet`. Le concept « nova »
(lumière stellaire) reste ; seul le mot change.

## 2. Identité — voir `ui/tokens.ts`
- Encre spatiale bleutée + lumière blanche chaude/froide. Une seule chose brille : le halo.
- Pas de violet, bleu roi, orange, vert acide. Aucun dégradé décoratif (seul le halo).
- Zéro ombre : la profondeur vient des surfaces (Nuit → Orbite → Crépuscule).
- General Sans, une seule famille. Chiffres tabulaires sur tous les montants.
- Grille de 4, marge d'écran 20, ligne de token 64, zone tactile ≥ 48.
- Rayons hiérarchiques : chip 8 · input 12 · bouton principal 18 (h 56) · conteneur 22 · sheet 28.
- Solde aligné à GAUCHE (éditorial ; libère la droite pour le halo).
- Icônes : Phosphor regular (fill = onglet actif) + 4 icônes maison (Envoyer, Recevoir, Swap, Signer). Zéro emoji.
- Glyphe d'adresse : étoile unique dérivée du hash (Skia) — vérification visuelle anti-empoisonnement.

## 3. Mouvement
- Chaque animation répond à une action. Une seule animation ambiante par écran (le halo).
- Ressorts : Vif (20/400) appuis · Standard (22/220) sheets, nav · Doux (26/120) halo.
- Appui = scale 0.96, jamais d'opacité. Fondus 150 ms. « Réduire les animations » respecté.
- Trois moments signature : halo vivant (accueil, cycle 6 s, suit la journée) · roulement des
  chiffres du solde · l'éclat (maintenir 1,2 s pour envoyer → biométrie → 40 particules, 700 ms).
- Haptique : voir `hapticFor` dans les tokens.

## 4. Écrans (5 états chacun : chargement, normal, vide, erreur, hors ligne)
Accueil agrégé multi-chaîne · Détail token (shared element) · Envoyer en 4 étapes (détection
d'empoisonnement, clavier maison, récap simulé, maintenir pour envoyer, suivi) · Recevoir ·
Swap/Bridge · Activité humanisée · **Modal de signature** (qui demande / ce qui va se passer /
simulation / niveau de risque / détails repliés) · Centre de sécurité · Onboarding · Verrouillage · Réglages.

## 5. Sécurité visible
Simulation (`alchemy_simulateAssetChanges`, Tenderly en secours) · GoPlus (contrats, tokens) ·
WalletConnect Verify (domaine) · Keystore + biométrie · FLAG_SECURE · aucun secret en logs ·
app floutée dans les récents. Chaque décodage (SIWE, Permit, approvals, setApprovalForAll) testé.

## 6. Écriture
On tutoie, phrases courtes, même mot du bouton au résultat (« Envoyer » → « Envoyé »).
Pas de « Success! », « Oups », points d'exclamation. Une erreur dit ce qui s'est passé et quoi faire.

## 7. Performance
Froid < 2 s · accueil < 300 ms (cache) · 60 fps · toucher < 100 ms. Hermes, FlashList, MMKV,
TanStack Query persisté, images cachées, sélecteurs fins, écrans à la demande. Mesure : Flashlight.

## 8. Accessibilité
Contraste AA · labels lecteur d'écran · taille système respectée · `Intl.NumberFormat` par langue ·
tests FR/EN/DE sur chaque écran · RTL (`I18nManager`).

## 9. Composants (à construire, chacun dans tous ses états, deux thèmes)
Button (4 variantes), IconButton, HoldButton, ListRow, TokenRow, TokenIcon, AddressGlyph,
AmountDisplay (chiffres roulants), AmountKeypad, Input, SegmentedControl, Chip, Badge de risque,
Sheet (@gorhom/bottom-sheet), Toast, Skeleton, Chart, EmptyState, Halo.
**Design Lab** : écran caché (7 taps sur la version, dev only) montrant tous les composants.

## 10. Stack visuelle
reanimated 3 · gesture-handler · @shopify/react-native-skia · @gorhom/bottom-sheet ·
@shopify/flash-list · expo-haptics · phosphor-react-native · rive-react-native · react-native-mmkv ·
react-native-keychain.

## 11. Méthode
Un écran à la fois : spec → construction → capture → critique → checklist verte
(sombre/clair · FR/EN/DE · 360 dp · 5 états · haptique · réduire les animations · 60 fps ·
lecteur d'écran · tests · Design Lab).

## 12. Feuille de route
- [x] **0 — Direction** : nom (Kalyx), couleurs/typo (tokens). [ ] prototype du glyphe.
- [x] **1 — Fondations** : `ui/tokens.ts`, `ui/theme.ts` re-basé, General Sans embarquée,
      Phosphor (`ui/icon.tsx`), kit `ui/kit/` (Pressable, Text, Button ×4, IconButton, HoldButton,
      Surface/Divider, ListRow/TokenRow, TokenIcon monogramme, AddressGlyph, AmountDisplay
      roulant, Chip/RiskBadge, SegmentedControl, Input, Skeleton, EmptyState, Halo statique),
      Design Lab (`app/design-lab.tsx`, 7 taps sur la version, dev only).
      [ ] 4 icônes maison · [ ] Skia (halo respirant, particules, chart) → rebuild natif.
- [x] **2 — Accueil** (2026-09-11) : `app/home.tsx` sur `lib/portfolio/` (agrégé multi-chaîne
      natifs + ERC-20 Alchemy + SPL, cache AsyncStorage → affichage instantané puis refresh
      silencieux), solde à gauche + halo à droite, chiffres roulants, P&L du jour, courbe de valeur
      (Σ montants × historiques CoinGecko, 5 périodes, scrub + haptique), Recevoir/Envoyer/Swap,
      Tokens (petits soldes repliés, spam filtré) · NFT · Activité, maintenir = masquer.
      [ ] halo respirant + courbe morphante (Skia, rebuild) · [ ] tirer-pour-rafraîchir « étoile ».
- [x] **3 — Envoyer / Recevoir** (2026-09-11) : `app/send.tsx` en 4 étapes (StepBar) —
      destinataire (coller/scanner/ENS/récents/contacts, glyphe, **empoisonnement bloquant**
      `detectPoisoning` testé, « jamais envoyé » doux avec la fin en gras, contrat détecté),
      montant (clavier maison, bascule devise/token, Max − frais dynamiques, gas manquant en
      devise), récap en Sheet (groupes de 4, frais en devise + paliers, « ton solde passera de
      A à B », **maintenir pour envoyer**), suivi (Envoyée → Incluse → Confirmée, notification).
      `app/receive.tsx` : QR ecl H + glyphe au centre, groupes de 4, hints, copier/partager.
      [ ] l'éclat (40 particules Skia) · [ ] accélérer/annuler.
- [x] **4 — Modal de signature** (2026-09-11) : `src/domain/tx/simulate.ts` (Alchemy
      `simulateAssetChanges` → « Tu perds / Tu reçois », repli statique par calldata, 3 tests),
      `src/domain/wc/explain.ts` (phrase humaine + risque + raisons pour SIWE / message / Permit
      / approve / setApprovalForAll / swap simulé / inconnu ; 9 tests), `ui/SignSheet.tsx`
      (qui demande + Verify → bandeau rouge, ce qui va se passer, simulation, RiskBadge,
      détails repliés, Danger = Refuser par défaut + maintenir 2 s, « Réduire au montant exact »).
      Branchée dans WalletConnect ET le navigateur dApps (fin du champ PIN brut).
      [ ] Blockaid (option pro) · [ ] simulation Solana.
- [x] **5 — Swap / Bridge** (2026-09-11) : `app/swap.tsx` sur le kit — « Tu donnes / Tu reçois »,
      inversion 180° ressort Vif, anneau de validité (30 s, en pause pendant la confirmation),
      route en une phrase (« Via Jupiter sur Solana, environ 5 secondes »), impact prix
      > 3 % orange / > 10 % rouge + maintenir pour confirmer, glissement dans un réglage avancé
      replié, clavier maison, récap en Sheet, `ui/BridgeProgress.tsx` (Départ → Pont → Arrivée
      via statut LI.FI). ·
  [x] **6 — Activité + Centre de sécurité** (2026-09-11) : `src/domain/tx/humanize.ts`
      (« Envoyé 50 USDC à vitalik.eth », approbations, swaps, NFT, échecs expliqués, spam à 0
      masqué, groupes Aujourd’hui/Hier/date ; 6 tests), `app/history.tsx` sur le kit,
      `app/security.tsx` (score /5 : phrase vérifiée (`settings.backupVerified`, posé par
      verify.tsx), biométrie, verrouillage auto, approbations avec Révoquer, sessions WC avec
      Déconnecter). Menu → Sécurité ouvre le centre.· [x] **7 — Onboarding + verrouillage** (2026-09-11) : `welcome.tsx` (naissance du halo,
      ressort Doux, 1,5 s, passable d'un tap, réduit-les-animations respecté), `backup.tsx`
      (2 colonnes numérotées, mots MASQUÉS tant que le doigt n'est pas maintenu, FLAG_SECURE,
      pas de copier, « Plus tard » possible), `verify.tsx` (3 mots, pose `backupVerified`),
      `import.tsx` (validation mot par mot BIP-39 en direct, `unknownWords` testé), bandeau
      permanent sur l'accueil + vérification différée depuis « Révéler la phrase »
      (`/verify?then=security`). Verrouillage : déjà conforme (bio auto, PIN maison, secousse).
      AuroraBackground/ShineLogo retirés (décoratifs).· [ ] 8 — Finition.

## 13. Checklist anti « fait par une IA »
Aucun dégradé décoratif · aucune ombre grise · aucun label en majuscules · aucun emoji ·
aucun anglais oublié · aucun « Success! » · aucune carte par ligne · aucun élément qui glisse
sans raison · aucune icône hors Phosphor (+ 4 maison) · chiffres formatés par langue ·
aucun rayon/espacement hors tokens.

## 14. Inspirations
Phantom (flux) · Rainbow (personnalité) · Rabby (sécurité) · Family (finition) · Revolut (montants) · Linear (discipline).
