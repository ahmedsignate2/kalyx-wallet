# 08 — Finition & Signature

> Plan design, UI/UX et animations de la Phase 8. Ce document complète `DESIGN.md`, il ne le remplace pas. Aucune règle ici n'annule la discipline visuelle existante : zéro dégradé décoratif, zéro ombre, zéro emoji, une seule lumière.

| | |
|---|---|
| Statut | Plan validé. Audit (§21) exécuté. **Étape 1 (Aura Engine v1) livrée en partie — voir §22.** Données de gas assainies, voix du bandeau hors-ligne livrée en 15 langues. |
| Phase | 8 — Finition (phases 0 à 7 livrées) |
| S'appuie sur | `docs/DESIGN.md`, `ui/tokens.ts`, `ui/kit/`, `HANDOFF.md` |
| Contexte | Développeur solo. Le séquencement vise le plus petit prochain gain, pas un planning d'équipe. |

Convention : **« à vérifier »** signalait une hypothèse issue de l'analyse du repo. Toutes ont été tranchées à l'audit — voir §21.3.

> ⚠ **RÈGLE DE LIVRAISON.** `runtimeVersion` utilise la politique `fingerprint`, qui hache `app.config.ts`, `package.json` et le projet natif. **Toute modification de l'un d'eux coupe les mises à jour OTA vers les APK déjà installés**, silencieusement : la publication réussit, mais l'appareil ne voit plus rien qui le concerne. Ne jamais toucher ces fichiers entre deux OTA ; les regrouper et les livrer avec un build. C'est arrivé une fois, en ajoutant le drapeau 120 Hz — deux lots de correctifs sont restés inaccessibles jusqu'au retrait du drapeau.

---

## 0. Le pari

Rainbow porte sa personnalité par la couleur, Exodus par la couleur et l'illustration, Phantom par la vitesse perçue. Kalyx s'est interdit la couleur décorative. Il lui reste trois leviers : **le mouvement**, **la voix**, et **le soin des moments que personne ne soigne** (états vides, attente, erreurs, son).

L'objectif n'est pas d'avoir plus d'effets que les autres. C'est d'avoir une **grammaire** : une façon de bouger, de répondre et de parler si cohérente qu'on reconnaît Kalyx les yeux à moitié fermés.

**La lumière a un sens.** Rien ne brille, ne bouge ou ne vibre sans raconter un état réel du wallet.

---

## 1. Diagnostic

1. **Le kit ne couvre qu'une minorité d'écrans.** 29 écrans référencent encore l'API héritée (`gradients`, `shadow.card`, `colors.accent`). **Nuance capitale établie à l'audit : cette dette est de NOMMAGE, pas de rendu** (§21.3).
2. **Trop peu de moments vivants.** Le reste se limite à scale 0.96 + fondu : correct, mais froid.
3. **Skia n'est pas installé du tout** (et non « jamais rebuild ») : l'étape 7 est une adoption, pas une reconstruction.
4. **Les 5 états (§4) existent sur le papier**, mais seul l'état normal est vraiment soigné.
5. **La voix chaude** ne couvre qu'une poignée de textes, sur 15 langues.
6. **`assets/sounds` ne contient que 2 fichiers** (`send.mp3`, `success.mp3`) pour 4 familles visées.
6 bis. ~~`gasTrackerStore` renvoie du `Math.random()`~~ — **corrigé** : frais réels via `EvmChainAdapter.getFeeData()`, prix ETH réel via `getPrices()`, dans la devise de l'utilisateur. Seuils de niveau encore à calibrer.
7. **Welcome sur-explique** : case CGU + trois blocs de fonctionnalités, là où Phantom et Rainbow montrent sans raconter.
8. ~~Reliquats de verre dans l'onboarding~~ — **infirmé** (§21.3).
9. **Thème clair jamais vérifié sur device réel.** Un défaut majeur a été trouvé et corrigé depuis (halo et particules blancs sur fond blanc). Assets store non régénérés depuis le renommage Nova → Kalyx.
10. **Sheets avec clavier système** pas encore protégées contre le recouvrement du clavier.

**À préserver :** une doctrine de mouvement écrite, une sécurité expliquée (`SignSheet`, `explainRequest`, `detectPoisoning`, `approvals.tsx`), le glyphe d'adresse, le « Tu donnes / Tu reçois » du swap, l'activité humanisée (`humanizeTx`), un splash sans trou noir.

---

## 2. Principes directeurs

1. **La lumière a un sens.** Chaque rayon, pulsation ou vibration correspond à un état réel.
2. **Montrer plutôt que raconter.** Une fonctionnalité se prouve dans l'usage, pas dans un paragraphe.
3. **Une seule grammaire.** Un geste a un seul sens dans toute l'app. Confirmer une action sensible, c'est maintenir (`HoldButton`).
4. **Le vide est une scène.** Un écran sans données est composé, jamais un « 0 » nu.
5. **La chaleur vient des mots**, jamais de la ponctuation ni des emoji.
6. **Jamais de faux progrès.** Si la donnée n'existe pas, l'animation n'existe pas.
7. **Le geste commande.** Ce qui suit le doigt est interpolé sur la position, pas déclenché par un seuil.
8. **Tout est interruptible.** Une animation interrompue repart de ce qui est affiché, jamais de zéro.

---

## 3. Aura Engine

### 3.1 Rôle

Le halo devient **l'unique indicateur d'état de l'app** : un seul objet vivant qui dit, sans texte, si Kalyx se repose, travaille, attend, reçoit ou vient de réussir.

### 3.2 Deux couches

- **Ambiance** : continue.
- **Impulsion** : ponctuelle, jouée une fois par-dessus, puis retour.

**Ambiances**

| Ambiance | Déclencheur réel | Comportement | Réduire les animations | État |
|---|---|---|---|---|
| Repos · réseau fluide | aucune tâche | respiration lente et nette | intensité fixe | ✅ livré |
| Repos · réseau chargé | `gasTrackerStore.level` ∈ {high, surge} | respiration plus lente, plus lourde | intensité fixe, un cran plus basse | ⬜ **débloqué** (données réelles depuis la correction du store) — reste à câbler : les frais ne sont récupérés qu'à l'ouverture de l'assistant, pas sur l'accueil, et les seuils sont à calibrer |
| Synchronisation | refresh, transaction en attente | flux doux, plus rapide | intensité fixe + mention texte discrète |
| Veille | hors-ligne | presque éteint, immobile | identique |

**Impulsions**

| Impulsion | Déclencheur réel | Mouvement | Haptique | Son |
|---|---|---|---|---|
| Réception | solde entrant détecté | expansion lumineuse subtile | Success | Réception |
| Succès | transaction confirmée, swap terminé | une seule impulsion | Success | Succès |
| Erreur | échec d'une action | micro-contraction | Error | aucun |
| Ouverture | déverrouillage réussi | le halo s'ouvre depuis le centre | Soft | Ouverture |

### 3.3 Arbitrage

- Priorité : Erreur > Succès > Réception > Ouverture.
- **Coalescence** : trois réceptions simultanées = une expansion.
- Un écart minimal sépare deux impulsions. Valeur réglée sur device.
- Pas de mise en file si le halo n'est pas visible. Exception : la réception, rattrapée au retour sur l'accueil par les chiffres qui roulent (§8).
- Multi-chaîne : le halo reflète le réseau actif, ou celui de la transaction en attente.

### 3.4 Où il vit

- Welcome et onboarding (en continuité du splash)
- Unlock
- Accueil, derrière le solde ; au scroll il devient un point de lumière dans le header compact (§9)
- Pull-to-refresh (§10.4)

Nulle part ailleurs. Le niveau de risque d'une signature reste porté par la couleur existante.

### 3.5 Biométrie

Chorégraphie de timing : le halo est déjà présent derrière la demande système et, au moment où elle se referme en succès, l'impulsion Ouverture part du centre.

### 3.6 Thème clair

Une lumière ne brille pas sur du blanc. **Tranché depuis :** le halo clair passe en teinte OR (`halo.light`, `ui/tokens.ts`) — c'est le seul pigment qui se lit sur un fond presque blanc. Les particules du lancement s'inversent également (`splashParticles`).

### 3.7 Performance

- Animation sur le thread UI, jamais sur le thread JS.
- Pause quand l'écran n'a pas le focus ou que l'app passe en arrière-plan.
- Mode économie d'énergie : ambiance figée, impulsions conservées.

### 3.8 Interface proposée

```ts
type AuraAmbient = 'rest' | 'sync' | 'offline';
type AuraPulse = 'receive' | 'success' | 'error' | 'unlock';

aura.setAmbient(state);
aura.pulse(event);
```

Les écrans n'animent jamais le halo directement. Ils émettent des événements.

---

## 4. Physique du mouvement

### 4.1 Ressorts

| Ressort | Usage |
|---|---|
| Vif (20/400) | pression des boutons, touches, toggles, secousse d'erreur |
| Standard (22/220) | sheets, toasts, transitions d'écran, chiffres |
| Doux (26/120) | Aura, apparition des listes, fin du home morphing |

**Les durées en ms ne servent qu'aux fondus d'opacité et de couleur.**

### 4.2 Continuité

Toute animation part de la valeur affichée à l'instant où elle démarre, jamais de sa valeur logique.

### 4.3 Gestes

Au lâcher, la vitesse du doigt est transmise au ressort.

### 4.4 Réduire les animations

| Mouvement | Équivalent |
|---|---|
| Aura (ambiances) | niveaux d'intensité fixes |
| Aura (impulsions) | bref changement d'opacité, sans échelle |
| Chiffres qui roulent | fondu |
| Stagger des listes | aucun |
| Rebond des boutons | pression simple |
| Éclat à l'envoi | fondu de la coche |
| Secousse d'erreur | contour et texte uniquement |
| Home morphing | conservé, sans effets secondaires |

L'haptique est conservée. Les sons suivent leur propre réglage.

### 4.5 Budget

60 fps sur un Android milieu de gamme de référence. Aucune animation sur le thread JS. Un seul mouvement signature à l'écran à la fois.

---

## 5. Grammaire haptique

| Intention | Haptique | Exemples |
|---|---|---|
| Sélection | `selectionAsync` | touches du pavé, toggles, seuil du pull-to-refresh |
| Pression | impact `Light` | boutons standard |
| Ouverture | impact `Soft` | déverrouillage réussi |
| Validation lourde | impact `Rigid` | fin du maintien du `HoldButton` |
| Succès | notification `Success` | transaction confirmée, réception, sauvegarde |
| Attention | notification `Warning` | adresse suspecte, montant > solde |
| Erreur | notification `Error` | PIN faux, échec d'envoi |

Règles : une seule vibration par action ; jamais pendant un scroll ; respect des réglages système ; **module unique `lib/haptics.ts` — déjà en place et respecté partout (§21.3)** ; test sur Android milieu de gamme.

---

## 6. Boutons

### 6.1 Taxonomie

Primaire (un seul par écran), Secondaire, Discret, Danger, Maintien (`HoldButton`), Icône. Tous viennent de `ui/kit/`.

### 6.2 États

| État | Rendu |
|---|---|
| Repos | forme et contraste du kit |
| Pressé | scale 0.96, ressort Vif, haptique Light |
| Relâché | léger dépassement au-delà de 1 puis retour : une sensation de matière |
| Chargement | indicateur dans la même forme ; la largeur ne saute pas |
| Succès | l'indicateur se transforme en coche |
| Pas encore | contraste réduit, bouton tapable, micro-texte qui explique quand il sera disponible |
| Désactivé | aucune réaction à la pression |

### 6.3 HoldButton enrichi

| Phase | Visuel | Haptique |
|---|---|---|
| Début | le remplissage démarre | tick léger |
| Milieu | la compression s'accentue | ticks qui se rapprochent |
| Fin | compression maximale | ticks serrés |
| Accompli | relâchement, impulsion Succès | `Rigid`, le « clac » |
| Lâché trop tôt | redescente depuis la position réelle | aucune |

**Accessibilité** : prévoir une action d'accessibilité qui ouvre une confirmation explicite.

### 6.4 Zones de tap

44 pt iOS, 48 dp Android, même quand le visuel est plus petit (`hitSlop`).

---

## 7. Claviers

### 7.1 Pavé numérique

Haptique de sélection par touche, fond qui s'éclaire (Vif). Le chiffre entre par le bas. Taille du montant adaptée en continu. Maintien sur Effacer = effacement continu. Séparateur décimal selon la locale. Montant > solde : secousse, Warning, « C'est plus que ton solde (X disponibles). », bouton Max visible. Bascule token ↔ devise : les deux valeurs échangent leur place.

### 7.2 PIN

Points remplis un par un (Vif). Erreur : secousse, Error, vidage de droite à gauche, « Ce n'est pas le bon code. » Essais restants affichés seulement quand c'est critique. Succès : les points se fondent dans l'Aura, impulsion Ouverture. Jamais de clavier système pour un PIN.

### 7.3 Clavier système et sheets

Sheet qui suit le clavier avec la même courbe. Bouton principal visible au-dessus. Champ adresse : bouton Coller visible d'emblée, glyphe dès qu'une adresse valide est saisie. Bon type de clavier partout. Adresses et phrases : `autoCorrect`, `spellCheck`, `autoComplete` désactivés — c'est de la sécurité.

---

## 8. Chiffres vivants

Odomètre par chiffre, depuis la valeur affichée. Hausse vers le haut, baisse vers le bas. Une hausse par réception déclenche l'impulsion Réception ; **une baisse de marché ne déclenche rien**. Chiffres tabulaires. Changement de largeur (999 → 1 000) réajusté en Standard. Formats locaux — l'odomètre travaille sur la chaîne formatée. Marché : mises à jour regroupées, roulement seulement si la ligne est visible. Masquer le solde : fondu vers des points, jamais de flou.

---

## 9. Home morphing

Au repos : solde très grand, variation du jour, Aura derrière, actions principales. Au scroll, interpolé sur la position du doigt donc réversible : le solde rétrécit vers un header compact, l'Aura se resserre en point de lumière, les actions perdent leurs libellés. **Le solde ne disparaît jamais.** Lâché à mi-chemin, il termine vers l'état le plus proche (Doux + vitesse).

---

## 10. Listes, chargement, rafraîchissement

### 10.1 Premier chargement

Squelette à la forme exacte des vraies lignes. **Pas de shimmer** : c'est un dégradé qui balaie, donc interdit. À la place, une respiration d'opacité très lente.

### 10.2 Apparition

Stagger léger, première apparition seulement, plafonné aux lignes visibles. Jamais au re-rendu, jamais au filtrage.

### 10.3 Changements

Filtre, recherche, tri : layout animations. Nouvelle transaction : elle s'insère en haut, rien ne saute.

### 10.4 Pull-to-refresh

Pas de spinner : c'est l'Aura. Tirer étire le halo ; franchir le seuil donne une haptique de sélection ; lâcher passe en Synchronisation ; à la fin, les chiffres roulent si un solde a changé.

### 10.5 Rafraîchissement silencieux

Point de lumière qui passe de ligne en ligne au fur et à mesure que chaque solde est **réellement** confirmé. Sinon, c'est l'Aura. Jamais de faux progrès.

---

## 11. États vides, erreurs, hors-ligne

| Situation | Texte (FR) |
|---|---|
| Wallet neuf à 0 | « Ton wallet est prêt. Il attend son premier dépôt. » / tap sur Envoyer : « Disponible dès ton premier dépôt. » |
| Activité vide | « Rien pour l'instant. Tes transactions apparaîtront ici, expliquées en clair. » |
| Recherche sans résultat | « Aucun résultat pour “xyz”. Tu peux aussi coller l'adresse du contrat. » |
| Contacts vides | « Ajoute les adresses que tu utilises souvent. Kalyx les reconnaîtra pour toi. » |
| Aucune autorisation | « Aucune app ne peut dépenser tes tokens. C'est exactement ce qu'on veut. » |
| Hors-ligne | « Tu es hors ligne. Tes fonds sont là où tu les as laissés. » |
| RPC indisponible | « Le réseau ne répond pas pour l'instant. On réessaie tout seul. » |
| Échec avant diffusion | « Ça n'est pas passé, mais rien n'a bougé. On réessaie ? » |

---

## 12. Moments de joie

| Moment | Déclencheur réel | Mouvement | Haptique | Son | Texte |
|---|---|---|---|---|---|
| Premier lancement | ouverture | rayons du logo → halo → Welcome, sans coupure | — | aucun | — |
| Naissance du wallet | wallet créé | §12.1 | Success | Sécurité | « Voici ton wallet. » |
| Déverrouillage | PIN ou biométrie | impulsion Ouverture | Soft | Ouverture | — |
| Réception | solde entrant | impulsion + chiffres qui montent | Success | Réception | « 420 USDC viennent d'arriver. » |
| Envoi lancé | tx diffusée | éclat (700 ms, 40 particules) | Rigid | — | « C'est parti. Ton argent est en chemin. » |
| Envoi confirmé | confirmation on-chain | impulsion Succès | Success | Succès | « C'est arrivé. Marie a bien reçu 50 USDC. » |
| Swap terminé | confirmation | les deux montants se résolvent en un seul | Success | Succès | « Échange terminé. Tu as maintenant 0,42 ETH. » |
| Sauvegarde vérifiée | dernier mot correct | les mots se rangent, une coche se dessine | Success | Sécurité | « Ta phrase est vérifiée. Même si tu perds ce téléphone, tu ne perds pas ton wallet. » |
| Score 5/5 | dernier critère | les critères se cochent un par un | Success | Sécurité | « Bien joué. Ton wallet est protégé au maximum. » |
| Connexion dApp | acceptée | lien de lumière (§14.3) | Success | — | « Connecté à app.uniswap.org. Tu peux couper ce lien à tout moment. » |
| Geste découvert | premier usage | micro-texte, une seule fois | — | — | « Astuce : maintiens ton adresse pour la copier. » |

### 12.1 Naissance du wallet

1. Le glyphe de l'adresse (`src/domain/wallet/glyph.ts`) se dessine cellule par cellule.
2. L'Aura s'allume derrière.
3. « Voici ton wallet. Ce motif est son visage, tu le reconnaîtras partout. »

**Pourquoi c'est important :** ce moment transforme le glyphe d'outil anti-phishing en identité affective. La beauté sert directement la sécurité.

Variante import : « Content de te revoir. »

### 12.2 Toasts

Un seul à la fois. Entrée par le haut sous la safe area (Standard). Surface neutre, point de lumière accent à gauche. Durée proportionnelle au texte. Jamais pour une erreur qui demande une action. Toujours annoncé au lecteur d'écran. Pas de toast pour ce que l'écran montre déjà.

---

## 13. Transaction Theater

**Étendre, pas inventer.** **L'ordre, toujours :** intention → conséquence → détails techniques. Détails repliés par défaut.

À étendre à : `approvals`, demandes WalletConnect, SIWE, requêtes du navigateur, détail des transactions dans `token/[id]`.

| Situation | Texte d'intention |
|---|---|
| Autorisation limitée | « Cette app pourra dépenser jusqu'à 1 000 USDC de ton wallet. » |
| Autorisation illimitée | couleur d'alerte + « Sans limite. Tu peux fixer un plafond. » |
| Connexion par signature | « Cette app te demande de prouver que ce wallet est à toi. Ça ne coûte rien et ne déplace aucun fonds. » |
| Refus d'une demande risquée | « Bien vu. Rien n'a été signé. » |

---

## 14. Navigateur dApps

### 14.1 Accueil

Catégories vérifiées. Cartes au niveau des écrans migrés. Séparation par l'espace et le contraste. Aucune bannière sponsorisée.

### 14.2 Navigation

Domaine toujours visible, tronqué intelligemment (on garde le domaine, on sacrifie le chemin) — c'est de l'anti-phishing. Fil de lumière branché sur la vraie progression de la WebView. Domaine non vérifié : état neutre. Le rouge est réservé aux domaines malveillants connus.

### 14.3 La connexion est un lien visible

Glyphe du wallet et icône de la dApp face à face. À l'acceptation, un fil de lumière les relie (Doux) puis impulsion Succès. À la déconnexion, le fil se retire. **Ce qui est connecté se voit.**

### 14.4 Assistant IA

Retirer `FloatingAiAssistant` des onglets. Point d'entrée contextuel là où est la complexité : « Explique-moi ». Question ouverte : garder un accès global ?

---

## 15. Welcome et onboarding

### 15.1 Welcome

**On garde :** le halo ; le tagline actuel.

**On change :**

- **Halo vivant dès cet écran** (Aura au repos), en continuité directe du splash.
- **Trois blocs de fonctionnalités → un seul repère de confiance** d'une ligne (« Tes clés restent sur ton téléphone. »).
- **Case CGU retirée du premier écran.** Si le juridique l'autorise : mention passive sous les boutons. Sinon : acceptation déplacée à l'étape de création. **Décision juridique, pas de design.**
- **Deux boutons** : Créer un wallet (primaire), J'ai déjà un wallet (secondaire).

### 15.2 Onboarding

- **Création** : continuité sans coupure jusqu'à la naissance du wallet (§12.1).
- **Phrase** : révélation volontaire (maintien pour révéler). Capture détectée : « Évite les captures : elles partent souvent dans le cloud. »
- **Vérification** : mot juste qui se range (Vif, sélection) ; mot faux : secousse douce, **Warning plutôt qu'Error — on corrige, on ne punit pas**.
- **Import** : « Content de te revoir. » avec le glyphe du wallet retrouvé.

---

## 16. Voix

### 16.1 Principes

Zéro emoji, zéro point d'exclamation. Tutoiement en français. On dit ce qui se passe pour l'utilisateur, pas pour la blockchain. Une erreur dit trois choses : ce qui s'est passé, si l'argent a bougé, quoi faire. Interdits : « Oups », « Succès », « Erreur fatale », « ATTENTION », jargon non expliqué. **« Bien joué » est réservé à la sécurité** — on ne félicite jamais quelqu'un d'avoir dépensé de l'argent.

### 16.2 Avant / après

| Situation | Avant | Après |
|---|---|---|
| Envoi en cours | Transaction en attente | C'est parti. Ton argent est en chemin. |
| Envoi confirmé | Transaction confirmée | C'est arrivé. Marie a bien reçu 50 USDC. |
| Réception | Reçu : 420 USDC | 420 USDC viennent d'arriver. |
| Swap terminé | Swap réussi | Échange terminé. Tu as maintenant 0,42 ETH. |
| Échec | Error: execution reverted | Ça n'est pas passé, mais rien n'a bougé. On réessaie ? |
| Réseau chargé | Gas élevé | Le réseau est chargé. Attendre un peu te coûterait moins cher. |
| Adresse suspecte | Warning: address poisoning | Cette adresse ressemble à une que tu connais, mais ce n'est pas la même. Vérifie avant d'envoyer. |
| Refus | Rejected | Bien vu. Rien n'a été signé. |
| Hors-ligne ✅ | No connection | Hors ligne. Tes fonds sont là où tu les as laissés. |
| Sauvegarde | Backup completed | Ta phrase est vérifiée. Même si tu perds ce téléphone, tu ne perds pas ton wallet. |
| Wallet vide | 0,00 $ | Ton wallet est prêt. Il attend son premier dépôt. |

### 16.3 Quinze langues

On traduit une intention, pas une phrase : chaque texte reçoit une note de contexte. Tutoiement/vouvoiement décidé langue par langue. Mise en page testée avec la langue la plus longue et en RTL.

---

## 17. Son

**Quatre familles seulement** : Ouverture, Succès, Réception, Sécurité. **Pas de son** pour les taps, la navigation ni les erreurs — un son d'échec associé à de l'argent crée de l'anxiété. Matière : cristallin, léger, précieux. Durées réglées à l'oreille sur device. Respect du mode silencieux iOS, volume bas par défaut, jamais de son avant une première interaction. Réglage séparé de l'haptique. Recommandation : activés pour Réception et Succès.

---

## 18. Glassless

Interdits : flou décoratif, verre dépoli, ombres, bordures épaisses. Les sheets sont des surfaces pleines. Seule exception lumineuse : l'Aura.

---

## 19. Rejets explicites

| Rejeté | Raison |
|---|---|
| Bannières promo et promotion de token | contraire à « le wallet qui te protège » |
| Swipe-to-send | deuxième grammaire de confirmation |
| Pinch-to-peek sur l'activité | gadget, conflit avec l'accessibilité système |
| Graisse de police animée sur le solde | coût technique > bénéfice en RN |
| Une couleur par section | contraire à la règle d'un seul accent |
| Shimmer en dégradé sur les squelettes | c'est un dégradé décoratif |
| Confettis, emoji, illustrations 3D | hors identité |
| Faux progrès | indicateur non branché sur un état réel |
| Constantes de timing inventées | toute valeur se règle sur device |
| CGU acceptées par un glissement | non validé juridiquement |

---

## 20. Critères de réussite

### 20.1 Quatre tests

1. **Cinq secondes** : sans toucher l'écran, peut-on dire ce qu'on peut y faire ?
2. **Un regard** : une action financière se comprend en un coup d'œil.
3. **Un mouvement** : chaque interaction a une sensation identifiable.
4. **Signature** : cet écran pourrait-il être confondu avec un autre wallet ?

### 20.2 Checklist écran

- [ ] Sombre et clair, vérifiés sur device
- [ ] FR, EN, DE + la langue la plus longue + RTL
- [ ] Les 5 états mis en scène
- [ ] 100 % des boutons issus du kit
- [ ] Haptique conforme (§5)
- [ ] Chaque mouvement a son équivalent « réduire les animations »
- [ ] 60 fps sur le device étalon
- [ ] Lecteur d'écran : ordre, libellés, annonces
- [ ] Textes conformes à la voix (§16)
- [ ] Aura branchée si l'écran porte un état réel
- [ ] Aucun verre, flou ou ombre
- [ ] Test signature passé

---

## 21. Audit — EXÉCUTÉ

### 21.1 Repérage

```sh
grep -rlE "gradients|shadow\.card|colors\.accent" app/
grep -rnE "TouchableOpacity|<Pressable" app/ src/ components/ --include=*.tsx | grep -v "ui/kit"
grep -rnE "BlurView|shadowColor|elevation: *[1-9]" app/ src/ components/ ui/ --include=*.tsx
```

### 21.2 Résultats chiffrés

| Mesure | Attendu au plan | **Réel** |
|---|---|---|
| Écrans sur l'API héritée | ~28 | **29** |
| Boutons hors kit (app mobile) | non chiffré | **111 usages JSX sur 41 fichiers**. Le premier relevé annonçait 96 : il comptait les lignes d'`import` et les `Pressable` du kit importés sous ce nom. Chiffre corrigé en ne comptant que les identifiants réellement issus de `react-native`. |
| `BlurView` | « reliquats possibles » | **0** |
| Ombres réelles (`shadowColor`, `elevation ≥ 1`) | non chiffré | **4 fichiers** : `ui/ToastHost.tsx`, `ui/Splash.tsx`, `app/scan.tsx`, `ui/browser/Comet.tsx` |
| Appels directs à `expo-haptics` hors `lib/haptics` | « à vérifier » | **0** |
| Verre dans `backup.tsx` / `verify.tsx` | « reliquats possibles » | **0** |
| `@shopify/react-native-skia` | « jamais rebuild » | **absent de `package.json`** |
| Fichiers dans `assets/sounds` | 4 familles visées | **2** (`send.mp3`, `success.mp3`) |

### 21.3 Hypothèses tranchées

**1. La dette d'API héritée est de NOMMAGE, pas de rendu — et c'est le résultat le plus important de l'audit.**
Dans `ui/theme.ts` : `shadow.card` vaut `{}` (no-op), `colors.glass` vaut `surface1` (surface pleine), et tous les `gradients` passent par `flat()` donc rendent une couleur unie. **Les 29 écrans « non migrés » rendent DÉJÀ plat.** Les migrer ne changera quasiment rien à l'écran : c'est du renommage, pas de la correction visuelle. À déplacer en fin de séquence et à traiter comme de la dette technique, jamais comme un gain UX.

**2. Le §18 « Glassless » est déjà acquis.** Zéro `BlurView`, zéro verre. Les 4 ombres réelles restantes sont ciblées et se règlent en une passe.

**3. Le §1.8 est infirmé.** `backup.tsx` et `verify.tsx` ne contiennent ni verre, ni flou, ni dégradé. L'audit annoncé n'a pas lieu d'être.

**4. Le §5 « module unique à vérifier » est acquis.** `lib/haptics.ts` existe et aucun écran n'appelle `expo-haptics` directement.

**5. Skia n'est pas une reconstruction mais une adoption.** La dépendance n'a jamais été installée. L'étape 7 change de nature : ajout de dépendance + build EAS d'essai, avec le risque de compatibilité correspondant.

**6 bis. Faille trouvée à l'étape 2 : les phrases de récupération pouvaient être apprises par le clavier.** `spellCheck` n'était réglé NULLE PART dans le projet (0 occurrence), et `autoCorrect={false}` ne suffit pas — sur iOS, `spellCheck` est un drapeau distinct, et c'est lui qui alimente le dictionnaire des mots appris, lequel se synchronise dans le cloud du clavier. Les deux champs de phrase (`import.tsx`, `import-wallet.tsx`) sont `multiline` et non `secureTextEntry`, donc sans protection implicite. Corrigé par `SENSITIVE_INPUT_PROPS` (kit), qui réunit les six réglages pour qu'on ne puisse plus en oublier la moitié. Les champs de mot de passe (`cloud-backup.tsx`) étaient déjà corrects : `secureTextEntry` + `textContentType="newPassword"`.

**6. Le vrai gisement est ailleurs : 111 boutons hors kit.** C'est la dette qui a un effet sensible (pression, haptique, zones de tap incohérentes). Concentration : `ui/premium.tsx` (9), `token/[id]` (7), `AiChatModal` (6), `TokenPicker` / `EarnSheet` / `ConfirmUnlock` (5 chacun).

### 21.4 Scorecard

Priorité par fréquence d'usage réelle. Colonnes renseignées : ✅ conforme, ⬜ à faire, — sans objet.

| Priorité | Écran | API héritée | Boutons hors kit | 5 états | Haptique | Voix | Clair | RTL | A11y |
|---|---|---|---|---|---|---|---|---|---|
| P1 | unlock | ⬜ | ✅ 0 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ✅ |
| P1 | token/[id] | ⬜ | **8** | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P1 | market | ⬜ | 0 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P1 | wallets | ⬜ | ✅ 0 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ✅ |
| P1 | accounts | ⬜ | ✅ 0 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ✅ |
| P1 | networks | ⬜ | ✅ 0 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ✅ |
| P1 | settings | ⬜ | ✅ 0 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ✅ |
| P1 | welcome | ✅ | 4 (skip, justifié) | — | ✅ | ⬜ | ✅ | ⬜ | ⬜ |
| P2 | contacts | ⬜ | 4 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | approvals | ⬜ | 3 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | walletconnect | ⬜ | 0 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | import / import-wallet | ⬜ | 4 + 3 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | earn | ⬜ | 6 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | set-pin / change-pin | ⬜ | 2 + 3 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | receive | ⬜ | 5 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | scan | ⬜ | 5 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | browser | ✅ | 4 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P2 | AiChatModal | — | **7** | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P3 | support / support-history | ⬜ | 4 + 5 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P3 | developer | ⬜ | 5 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P3 | ai-settings | ⬜ | 5 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P3 | price-alerts | ⬜ | 3 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P3 | reveal-private-key | ⬜ | 2 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P3 | language / invite / tracking / notifications / extensions / feature-request | ⬜ | ≤2 | ⬜ | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |
| P3 | LegalScreen | — | 3 | — | ✅ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 22. Séquence d'exécution

**Révisée après l'audit.** La migration d'API passe de l'étape 9 à la toute fin (§21.3 n°1) ; les boutons hors kit remontent (§21.3 n°6).

| # | Étape | Terminé quand |
|---|---|---|
| 0 | ~~Audit~~ | **Fait (§21)** |
| 1 | Aura Engine v1, en repli SVG (§3) | **partiellement livré.** Faits : moteur (`lib/aura.ts`), dérivation de l'ambiance (`lib/auraBinding.ts`), état réseau en store (`lib/networkStore.ts`), détection de réception (`lib/portfolio/receive.ts`), halo branché sur l'accueil. Manquent : impulsion Succès (aucun suivi de confirmation on-chain n'existe), ambiance « réseau chargé » (données de gas fausses), Aura sur Unlock (pas de halo sur cet écran — étape 4) |
| 2 | Fondations transverses (§6, §7, §12.2) | **quasi fait.** Faits : grammaire haptique Light/Selection, dépassement au relâchement, chargement sans saut de largeur, états `success` et `notYet`, file d'attente des toasts + durée proportionnelle + annonce lecteur d'écran, ombre du toast retirée, pavé de montant (séparateur selon la langue, maintien pour effacer, touche au ressort), pavé PIN (dégradé décoratif et code mort retirés), `SENSITIVE_INPUT_PROPS` appliqué aux champs de phrase. Manquent : glisser pour fermer un toast (voir §23), sheets qui suivent le clavier (§7.3), écran pilote validé sur device |
| 3 | ~~Migration des 111 boutons hors kit~~ | **FAIT.** 111 → 2. Les deux restants (`ui/PinPad.tsx`) sont volontaires et documentés : `Key` implémente son propre enfoncement au ressort et sa propre haptique, comme AmountKeypad et HoldButton — passer par le kit superposerait un second scale. Les `Button` hérités de `ui/premium.tsx` et `ui/components.tsx` délèguent au kit, donc les écrans non migrés en héritent aussi. |
| 4 | ~~Unlock + Welcome~~ | **FAIT.** Aura montée sur Unlock — c'était le trou de l'étape 1 : l'impulsion d'Ouverture était bien émise mais aucun halo n'était visible, donc le moteur l'abandonnait. Welcome passe de trois blocs de fonctionnalités à UN repère de confiance (§15.1). Reste la case CGU, qui est une décision juridique (§23). |
| 5 | ~~États vides + chiffres vivants + réception~~ | **FAIT.** L'odomètre existait déjà (`AmountDisplay`) ; il lui manquait le SENS du §8 — une hausse roule vers le haut, une baisse vers le bas. Bande de trois cycles + recentrage silencieux après le ressort, pour que 9→0 continue vers le haut au lieu de revenir en arrière. La réception était branchée à l'étape 1 (`didReceive`), `EmptyState` existait déjà. |
| 6 | ~~HoldButton enrichi~~ | **FAIT.** Montée en tension : compression progressive jusqu'à 0,97 et ticks haptiques qui se resserrent de 180 à 55 ms. Alternative accessible : action d'accessibilité « Confirmer », VoiceOver et TalkBack capturant l'appui long. |
| 7 | ~~Naissance du wallet~~ | **FAIT.** `app/wallet-born.tsx` : le glyphe s'ouvre au ressort, le halo naît derrière, impulsion de Succès. Variante « Content de te revoir » pour un import (`?mode=import`), via `draftWasImported`. Restent les moments sauvegarde et score 5/5. |
| 8 | Adoption Skia | **BLOQUÉ PAR UNE DÉCISION, pas par la technique.** `@shopify/react-native-skia` est absent du projet. L'ajouter est une dépendance NATIVE : l'empreinte change, donc l'APK installé cesse immédiatement de recevoir les OTA, et il faut reconstruire puis réinstaller à la main. Le repli SVG fonctionne aujourd'hui (halo, logo, glyphe, particules) ; le gain est du rendu, pas de la fonctionnalité. Le §23 exigeait déjà « un build d'essai isolé » pour cette étape. À décider, pas à enchaîner. |
| 9 | ~~Home morphing + pull-to-refresh Aura~~ | **FAIT (sauf l'étirement du halo).** Le solde ne disparaît jamais : il change de forme. Tout est interpolé sur la position de défilement, donc réversible, sans seuil qui déclencherait une animation autonome. Le halo se resserre en un point de lumière, l'en-tête compact prend le relais exactement où le grand solde s'efface. **Correction d'une erreur d'analyse : ça ne demandait PAS `gesture-handler`** — `useAnimatedScrollHandler` donne la position sur le thread UI. Seul l'étirement du halo pendant qu'on tire (§10.4 point 1) l'exigerait, et lui seul reste à faire. |
| 10 | ~~Navigateur dApps, Transaction Theater, voix~~ | **FAIT pour l'essentiel.** §13 : `SignSheet` respectait déjà l'ordre intention → conséquence → technique ; `approvals` ne le respectait pas et dit maintenant ce que l'app PEUT FAIRE avant d'afficher « ∞ ». §14.2 : déjà en place (`splitHost` met le domaine racine en évidence, la progression est branchée sur la vraie `onLoadProgress`). §16 : plus aucune chaîne d'interface en français codé en dur hors `design-lab` (écran interne) et les prompts d'IA. Restent §14.3 (lien de lumière à la connexion) et §14.4 (retrait de l'assistant flottant, décision produit). |
| 11 | ~~Migration d'API héritée~~ | **FAIT.** 364 références d'alias remplacées dans 49 fichiers, mécaniquement : chaque alias hérité valait exactement un token (`bgDeep`→`bg`, `glassStrong`→`surface2`, `accent`→`primary`…), donc la substitution est neutre au rendu. `shadow.card` (qui valait `{}`) supprimé, et les `LinearGradient` de `gradients.screen` remplacés par des `View` — ils rendaient une couleur unie via `flat()`, soit une couche native inutile par écran. |
| 12 | Vérification finale | **partielle — ce qui est vérifiable en statique l'est.** Boutons hors kit : 3, tous documentés comme volontaires. `BlurView` : 0. Appels directs à `expo-haptics` : 0. Emoji d'interface : 0. Français codé en dur : 0 hors `design-lab` (écran interne) et prompts d'IA. Dégradés montés : uniquement la marque (logo, glyphe, halo, reflet du bouton principal). **NON vérifiable sans device** : thème clair réel, RTL, lecteur d'écran, Android bas de gamme, 60 fps, assets store. |

---

## 23. Risques et questions ouvertes

> ⚠ **L'EMPREINTE A CHANGÉ le 2026-09-25.** `app.config.ts` a été modifié (schémas `bitcoin:`/`solana:`,
> App Link `/pay`, drapeau 120 Hz), ce qui était l'objet même de ce rebuild. Conséquence mécanique :
> **les APK installés AVANT ce build ne reçoivent plus aucune OTA.** Le dernier lot qui les atteint est
> le commit `b19155c` (liens de paiement, scanner dans l'en-tête), publié juste avant. Tant que le
> nouveau build n'est pas installé, publier une OTA ne sert à rien — elle vise un runtime que personne
> n'a encore.

| Sujet | Question | Comment trancher |
|---|---|---|
| CGU | la case peut-elle quitter le premier écran ? | avis juridique |
| Thème clair | ~~quelle forme pour l'Aura sur fond blanc ?~~ | **tranché : halo or (§3.6)** |
| Skia | compatibilité du build EAS avec la version d'Expo | build d'essai isolé |
| Performance | tenue sur Android bas de gamme | device étalon |
| Son | licence des fichiers, activé par défaut ou non | audit de `assets/sounds` + test |
| Voix | tutoiement ou vouvoiement par langue | décision langue par langue |
| Home compact | où vont les actions au scroll ? | maquette |
| Assistant IA | garder un accès global ? | décision produit |
| Congestion | seuil de `gasTrackerStore`, comportement multi-chaîne | données réelles |
| Biométrie | timing exact entre fermeture système et impulsion | test sur device |
| **Reflet du bouton principal** | **`sheen` (`ui/kit/Button.tsx`) est un dégradé qui balaie — §19 rejette le principe. Le garde-t-on sur Welcome ?** | **décision produit — voir §21.5** |
| ~~Données de gas~~ | ~~`Math.random()` affiché à l'utilisateur~~ | **tranché : source réelle.** `getFeeData()` (ethers + bascule RPC) et `getPrices()` (cache + repli), dans la devise de l'utilisateur. Coût `null` quand le prix de l'ETH manque → l'affichage se tait. Branche `surge` réparée et testée. |
| Seuils de gas | `THRESHOLDS = { low: 10, normal: 30, high: 80 }` posés sur le papier, ce que le §19 rejette | à calibrer sur données réelles |
| **Confirmation on-chain** | aucun suivi n'existe : l'impulsion Succès (§3.2) n'a pas de source | à construire avant l'étape 5 |
| **Signature Bitcoin non testée** | `@scure/btc-signer` est un paquet ESM pur, que Jest ne transforme pas. Le code de production l'importe donc dynamiquement, et les tests de `BitcoinChainAdapter` ÉVITENT le chemin de signature : la construction BIP-137 comme BIP-322 n'est couverte par **aucun test**. Vérifié à la main depuis la spec (clé publique du témoin → adresse, sighash BIP-143 avec le `scriptCode` P2PKH, SIGHASH_ALL) : l'implémentation est conforme. Mais rien n'empêcherait une régression silencieuse. Rendre ce domaine testable demande un `transform` babel-jest sur `@scure`/`@noble` — tenté, non retenu pour l'instant. | à faire avant toute retouche de la signature |
| ~~120 Hz~~ | **FAIT (build du 2026-09-25).** `CADisableMinimumFrameDuration: true` est dans `ios.infoPlist`. Il n'a d'effet qu'au build, et il change l'empreinte : il a donc été ajouté au moment où l'on reconstruit, jamais entre deux OTA. Côté Android, React Native suit le taux de l'écran via Choreographer ; aucun réglage en workflow managé. À vérifier sur un appareil ProMotion une fois le build installé. |
| ~~Schémas `bitcoin:` et `solana:`~~ | **FAIT (build du 2026-09-25).** Déclarés dans `app.config.ts` : `ios.infoPlist.CFBundleURLTypes` et `android.intentFilters`. App Link `/pay` ajouté à côté de `/wc`, avec sa page de relais (`web/app/(root)/pay`) pour que la demande reste partageable sans l'app. **Reste un bloquant iOS :** `web/public/.well-known/apple-app-site-association` porte encore `TEAMID` en dur à la place du Team ID Apple réel — tant qu'il y est, AUCUN lien universel iOS ne fonctionne, ni `/wc` ni `/pay`. Android est couvert (`handle_all_urls` dans assetlinks.json). |
| **`react-native-gesture-handler`** | déclaré en dépendance mais importé NULLE PART, donc pas de `GestureHandlerRootView`. Bloque « glisser pour fermer » (§12.2) et le home morphing (§9) | adoption structurelle à décider — le §9 en aura besoin de toute façon |

### 21.5 Contradiction ouverte entre le plan et le code poussé

Trois éléments livrés récemment sur Welcome entrent en conflit avec ce document :

| Livré | Contredit | Arbitrage |
|---|---|---|
| `sheen` : reflet en dégradé qui traverse le bouton principal | §19 « shimmer en dégradé… c'est un dégradé décoratif », §18 « seule exception lumineuse : l'Aura » | à trancher |
| Trois blocs d'arguments + case CGU conservés | §15.1 « un seul repère de confiance », « case CGU retirée » | §15.1 s'applique, sous réserve juridique pour la CGU |
| Constantes `BEAT`, `IGNITE`, `SHEEN_CYCLE` fixées sur le papier | §19 « constantes de timing inventées » | à régler sur device |
