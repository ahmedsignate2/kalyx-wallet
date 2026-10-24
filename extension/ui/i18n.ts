/**
 * Textes de l'extension, dans les 15 langues de l'app (termes web3 et marques
 * gardés tels quels : token, swap, gwei…). Français et anglais ici ; les 13
 * autres dans ui/locales/. Les phrases d'explication et d'activité sont celles
 * de l'app, mot pour mot (ui/appText.ts, généré). Repli : anglais.
 */
import { APP_TEXT } from './appText';
import { EXTRA } from './explainText';
import es from './locales/es';
import pt from './locales/pt';
import de from './locales/de';
import it from './locales/it';
import nl from './locales/nl';
import pl from './locales/pl';
import tr from './locales/tr';
import ru from './locales/ru';
import ar from './locales/ar';
import hi from './locales/hi';
import zh from './locales/zh';
import ja from './locales/ja';
import ko from './locales/ko';

const fr = {
  back: 'Retour',
  continue: 'Continuer',
  welcomeTitle: 'Bienvenue dans Kalyx',
  welcomeSub: 'Tes clés restent sur cet ordinateur, chiffrées. Personne d’autre, pas même Kalyx, n’y a accès.',
  create: 'Créer un portefeuille',
  haveOne: 'J’ai déjà un portefeuille',
  pwTitle: 'Choisis un mot de passe',
  pwSub: 'Il protège ton portefeuille sur cet ordinateur. Kalyx ne peut pas le récupérer : seule ta phrase de récupération le peut.',
  pwPlaceholder: 'Mot de passe (8 caractères min.)',
  pwConfirm: 'Confirme le mot de passe',
  pwMismatch: 'Les deux mots de passe ne correspondent pas.',
  pwWeak: 'Trop simple : allonge-le, mélange des mots, des chiffres et des signes.',
  strength0: 'Trop faible',
  strength1: 'Faible',
  strength2: 'Correct',
  strength3: 'Fort',
  unlockTitle: 'Déverrouille Kalyx',
  unlockSub: 'Ton mot de passe, pour ajouter un portefeuille.',
  unlock: 'Déverrouiller',
  wrongPassword: 'Mot de passe incorrect.',
  throttled: 'Trop d’essais. Réessaie dans {s} s.',
  phraseTitle: 'Ta phrase de récupération',
  phraseSub: '12 mots, dans l’ordre. C’est la seule façon de retrouver ton portefeuille si tu perds cet ordinateur. Note-la sur papier.',
  phraseWarn1: 'Pas de capture d’écran.',
  phraseWarn2: 'Ni cloud, ni e-mail, ni messagerie.',
  phraseWarn3: 'Kalyx ne te la demandera jamais.',
  phraseReveal: 'Afficher la phrase',
  phraseNoted: 'J’ai noté ma phrase',
  verifyTitle: 'Vérifions ta phrase',
  verifyWord: 'Quel est le mot n° {n} ?',
  verifyWrong: 'Ce n’est pas le bon mot. Reprends ta phrase notée.',
  later: 'Plus tard',
  laterNote: 'Un rappel restera affiché tant que ta phrase n’est pas vérifiée.',
  importTitle: 'Importer un portefeuille',
  importPhrase: 'Phrase de récupération',
  importPhraseSub: '12 à 24 mots',
  importBackup: 'Sauvegarde Kalyx',
  importBackupSub: 'Le fichier chiffré de l’app mobile',
  importKey: 'Clé privée',
  importKeySub: 'Ethereum et réseaux EVM, ou Solana',
  phrasePlaceholder: 'Saisis ou colle tes mots, séparés par des espaces',
  words: '{n} mots',
  unknownWords: 'Mots inconnus : {w}',
  import: 'Importer',
  searching: 'Recherche de tes comptes… (compte {n})',
  foundAccounts: '{n} compte(s) déjà utilisé(s) retrouvé(s).',
  uncertainAccounts: 'Certains comptes n’ont pas pu être vérifiés (réseau). Tu pourras les ajouter plus tard.',
  backupFile: 'Choisir le fichier',
  backupPassword: 'Mot de passe de la sauvegarde',
  open: 'Ouvrir',
  added: '{n} portefeuille(s) ajouté(s).',
  skipped: 'Non repris : {list}.',
  keyEvm: 'Ethereum et réseaux EVM',
  keySolana: 'Solana',
  keyPlaceholder: 'Colle ta clé privée',
  keyNote: 'Une clé privée ne sert qu’un réseau et n’a pas de phrase : garde-la en lieu sûr.',
  doneTitle: 'Ton portefeuille est prêt',
  donePin: 'Épingle Kalyx : clique sur l’icône des extensions (la pièce de puzzle), puis sur l’épingle à côté de Kalyx.',
  autoLock: 'Verrouillage automatique après',
  minutes: '{n} min',
  done: 'Terminé',
  backupBanner: 'Ta phrase n’est pas encore vérifiée.',
  verifyNow: 'Vérifier',
  e_WEAK_PASSWORD: 'Trop simple : allonge-le, mélange des mots, des chiffres et des signes.',
  e_INVALID_PHRASE: 'Phrase invalide : vérifie l’orthographe et l’ordre des mots.',
  e_UNSUPPORTED_PHRASE: 'Phrase TON : pas encore prise en charge par l’extension.',
  e_DUPLICATE: 'Ce portefeuille est déjà dans Kalyx.',
  e_INVALID_KEY: 'Clé non reconnue.',
  e_WRONG_FAMILY: 'Cette clé ne correspond pas à ce réseau.',
  e_BACKUP_WRONG_PASSWORD: 'Mot de passe de la sauvegarde incorrect.',
  e_BACKUP_UNREADABLE: 'Ce fichier n’est pas une sauvegarde Kalyx.',
  e_BACKUP_NOT_A_BACKUP: 'Ce fichier n’est pas une sauvegarde Kalyx.',
  e_BACKUP_CORRUPTED: 'Sauvegarde endommagée : elle ne peut pas être ouverte.',
  e_BACKUP_TOO_RECENT: 'Sauvegarde créée par une version plus récente : mets l’extension à jour.',
  e_TOO_MANY_WALLETS: 'Nombre maximal de portefeuilles atteint.',
  e_INTERNAL: 'Une erreur est survenue. Réessaie.',
  r_UNSUPPORTED_FAMILY: 'Bitcoin (bientôt)',
  r_UNSUPPORTED_PHRASE: 'TON (bientôt)',
  r_DUPLICATE: 'déjà présent',
  popupNoVault: 'Ton portefeuille pour le web, sur cet ordinateur.',
  getStarted: 'Commencer',
  popupUnlockSub: 'Entre ton mot de passe.',
  addWallet: 'Ajouter un portefeuille',
  lock: 'Verrouiller',
  unavailable: 'Kalyx ne répond pas. Rouvre la fenêtre.',
  tabTokens: 'Tokens',
  tabActivity: 'Activité',
  total: 'Valeur totale',
  totalUnknown: 'Valeur inconnue',
  updated: 'Mis à jour {t}',
  justNow: 'à l’instant',
  refreshing: 'Actualisation…',
  networksDown: 'Sans réponse : {list}. Leurs soldes viennent de la dernière lecture.',
  andMore: '{list} et {n} autres',
  networksDownNoData: 'Sans réponse : {list}. Soldes inconnus pour l’instant.',
  networksDownActivity: 'Sans réponse : {list}. Leur historique n’a pas pu être lu.',
  erc20Partial: 'Liste réduite aux tokens principaux (USDC, USDT…) pour l’instant : le service des tokens est saturé.',
  smallBalances: 'Petits soldes ({n})',
  hiddenTokens: 'Masqués, non vérifiés ({n})',
  noTokens: 'Aucun solde pour l’instant.',
  noActivity: 'Aucune activité récente.',
  hiddenActivity: '{n} ligne(s) masquée(s) : spam probable.',
  pending: 'En attente',
  failedTx: 'Échouée',
  viewExplorer: 'Voir sur l’explorateur',
  account: 'Compte {n}',
  settings: 'Réglages',
  currency: 'Devise',
  openSidePanel: 'Ouvrir dans le panneau latéral',
  copied: 'Adresse copiée',
  copy: 'Copier l’adresse',
  firstLoad: 'Lecture des soldes sur tous les réseaux…',
  loadFailed: 'Lecture impossible pour l’instant. Réessaie.',
  retry: 'Réessayer',
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  send: 'Envoyer',
  receive: 'Recevoir',
  asset: 'Actif',
  recipient: 'Destinataire',
  recipientPh: 'Adresse ou nom ENS',
  recipientPhSol: 'Adresse Solana',
  amount: 'Montant',
  max: 'Max',
  balanceIs: 'Solde : {b}',
  balanceUnknown: 'Solde inconnu (réseau muet)',
  fee: 'Frais réseau',
  feeSlow: 'Lent',
  feeNormal: 'Normal',
  feeFast: 'Rapide',
  feeManual: 'Manuel',
  maxFee: 'Frais max (gwei)',
  priorityFee: 'Pourboire (gwei)',
  feeLoading: 'Calcul des frais…',
  feeUnavailable: 'Frais indisponibles pour l’instant (réseau muet).',
  review: 'Vérifier',
  reviewTitle: 'Vérifie avant d’envoyer',
  from: 'De',
  to: 'À',
  network: 'Réseau',
  totalCost: 'Total débité',
  confirmSend: 'Confirmer et envoyer',
  sending: 'Envoi…',
  sentTitle: 'Transaction envoyée',
  statusPending: 'En attente de confirmation…',
  statusConfirmed: 'Confirmée.',
  statusFailed: 'Échouée : les frais ont été payés, le montant n’a pas bougé.',
  statusExpired: 'Expirée : jamais incluse, rien n’a bougé.',
  statusUnknown: 'Statut inconnu pour l’instant : vérifie sur l’explorateur.',
  newRecipient: 'Première fois que tu envoies à cette adresse : vérifie-la.',
  poisonTitle: 'Adresse sosie !',
  poisonBody: 'Elle ressemble à {addr}, à qui tu as déjà envoyé, mais ce n’est pas la même. Des escrocs créent ces sosies pour piéger un copier-coller.',
  poisonAck: 'J’ai vérifié l’adresse caractère par caractère',
  w_DESTINATION_NOT_WALLET: 'Cette adresse est un contrat, pas un portefeuille : les fonds pourraient y rester bloqués.',
  w_ACTIVATES_DESTINATION: 'Cet envoi crée le compte du destinataire (petit coût en plus).',
  w_TOKEN_TRANSFER_FEE: 'Ce token prélève des frais : le destinataire recevra moins.',
  e_INVALID_ADDRESS: 'Adresse invalide pour ce réseau.',
  e_ENS_NOT_FOUND: 'Nom ENS introuvable.',
  e_INVALID_AMOUNT: 'Montant invalide.',
  e_AMOUNT_TOO_SMALL: 'Montant trop petit.',
  e_INSUFFICIENT_FUNDS: 'Solde insuffisant (frais compris).',
  e_INSUFFICIENT_GAS: 'Pas assez de monnaie du réseau pour payer les frais.',
  e_NOT_WHITELISTED: 'Destinataire absent de ta liste blanche.',
  e_WHITELIST_PENDING: 'Adresse encore dans son délai de sûreté ({hours} h).',
  e_RPC_UNAVAILABLE: 'Réseau injoignable. Réessaie.',
  e_BROADCAST_FAILED: 'Le réseau a refusé la transaction.',
  e_REQUEST_EXPIRED: 'Vérification expirée : recommence.',
  e_RISK_NOT_ACCEPTED: 'Confirme d’abord avoir vérifié l’adresse.',
  e_WRONG_ACCOUNT: 'Le compte a changé : recommence.',
  e_MANUAL_FEE_TOO_HIGH: 'Frais manuels plus de 5 fois au-dessus du palier Rapide : vérifie la saisie.',
  e_MANUAL_FEE_INVALID: 'Frais manuels invalides (le pourboire ne peut pas dépasser le maximum).',
  e_MEMO_REQUIRED: 'Ce destinataire exige un commentaire (souvent une plateforme d’échange) : ajoute celui qu’elle t’a donné.',
  e_NOT_SUPPORTED: 'Opération non prise en charge.',
  e_LOCKED: 'Kalyx est verrouillé.',
  e_TX_FAILED: 'La transaction a échoué.',
  e_CALL_EXCEPTION: 'Le contrat a refusé l’opération.',
  e_UNKNOWN_ACCOUNT: 'Compte introuvable.',
  e_TX_UNCONFIRMED: 'Transaction inconnue.',
  e_SOL_RENT_RECIPIENT: 'Montant trop petit pour créer le compte du destinataire sur Solana.',
  e_SOL_RENT_SENDER: 'Il doit te rester un minimum de SOL sur le compte.',
  receiveTitle: 'Recevoir',
  receiveEvmNote: 'Même adresse sur tous les réseaux EVM (Ethereum, Base, Arbitrum, Polygon…). N’envoie ici que des actifs de ces réseaux.',
  receiveSolNote: 'Uniquement des actifs du réseau Solana (SOL et tokens SPL).',
  copyAddress: 'Copier l’adresse',
  warnReceiveTitle: 'Ta phrase n’est pas vérifiée',
  warnReceiveBody: 'Avant de recevoir des fonds, vérifie que tu as bien noté ta phrase de récupération. Sans elle, ce que tu reçois serait perdu avec cet ordinateur.',
  verifyNowBtn: 'Vérifier maintenant',
  continueAnyway: 'Continuer quand même',
  wlTitle: 'Liste blanche',
  wlIntro: 'Activée, Kalyx n’envoie qu’aux adresses de cette liste et à tes propres portefeuilles. Ajouter une adresse ou désactiver la protection ne prend effet qu’après 24 h : même avec ton mot de passe, un voleur ne pourrait pas vider ton portefeuille sur-le-champ.',
  wlOff: 'Désactivée',
  wlOn: 'Activée',
  wlEnable: 'Activer',
  wlAdd: 'Ajouter',
  wlAddress: 'Adresse',
  wlLabel: 'Nom (facultatif)',
  wlActive: 'Utilisable',
  wlIn: 'Utilisable dans {h} h',
  wlRemove: 'Retirer',
  wlRequestDisable: 'Désactiver (effectif dans 24 h)',
  wlDisableAt: 'Désactivation dans {h} h',
  wlCancelDisable: 'Annuler la désactivation',
  wlNoTime: 'Heure du réseau indisponible : impossible d’ajouter une adresse protégée pour l’instant.',
  wlEmpty: 'Aucune adresse.',
  verifyLaterTitle: 'Vérifier ta phrase',
  verifyLaterSub: 'Ton mot de passe, pour afficher ta phrase.',
  fiatApprox: '≈ {v}',
  apTitle: 'Connexion à un site',
  apFamilyEvm: 'Ethereum et réseaux EVM',
  apFamilySol: 'Solana',
  apAccount: 'Compte partagé avec ce site',
  apBody: 'Ce site pourra voir l’adresse et le solde de ce compte, et te proposer des transactions. Il ne pourra rien signer sans ton accord, demandé à chaque fois.',
  apRefuse: 'Refuser',
  apConnect: 'Connecter',
  apIdn: 'Nom de domaine avec des caractères spéciaux : vérifie que c’est bien le site attendu.',
  apLocal: 'Site local (développement).',
  apGone: 'Cette demande n’est plus valable : elle a expiré ou le site a été fermé.',
  close: 'Fermer',
  compOption: 'Relier mon téléphone', compOptionSub: 'Mode compagnon : les clés restent dans l’app Kalyx de ton téléphone ; tu valides chaque signature là-bas.', compTitle: 'Relier ton téléphone', compSteps: 'Ouvre Kalyx sur ton téléphone, touche Scanner et vise ce QR. Choisis le compte à partager, puis confirme. Pour en relier un autre, recommence avec un autre compte.', compLinkMore: 'Relier un compte du téléphone', compWaiting: 'En attente de ton téléphone…', compDone: 'Téléphone relié', compUnavailable: 'Le mode compagnon n’est pas disponible dans cette version de l’extension.', phoneBadge: 'Téléphone', onPhoneHint: 'Valide sur ton téléphone : ouvre Kalyx, la demande t’y attend.', sendToPhone: 'Envoyer au téléphone', e_COMPANION_REJECTED: 'Refusé sur le téléphone.', e_COMPANION_TIMEOUT: 'Pas de réponse du téléphone. Ouvre Kalyx et réessaie.', e_COMPANION_LOST: 'Le lien avec le téléphone est coupé : relie-le à nouveau.', e_COMPANION_OFFLINE: 'Le service de liaison (WalletConnect) est injoignable. Vérifie ta connexion et réessaie.', e_COMPANION_UNAVAILABLE: 'Le mode compagnon n’est pas disponible dans cette version de l’extension.', e_COMPANION_WRONG_SIGNER: 'Le téléphone a signé avec un autre compte : refusé, rien n’a été transmis au site.', e_COMPANION_BAD_RESULT: 'Réponse illisible du téléphone : rien n’a été transmis au site.', e_COMPANION_CHAIN: 'Ce réseau n’est pas partagé par ton téléphone.', e_COMPANION_NO_EVM: 'Ton téléphone n’a partagé aucun compte Ethereum.', e_COMPANION_NO_ACCOUNT: 'Ton téléphone n’a partagé aucun compte.', e_COMPANION_PAIRING_TIMEOUT: 'Le QR a expiré. Recommence.', e_COMPANION_TX_CHANGED: 'Le téléphone a rendu une transaction différente : refusée.', buy: 'Acheter', buyTitle: 'Acheter de la crypto', buyNote: 'Paiement par carte, banque ou Link sur la page sécurisée de Stripe, qui vérifie ton identité. Livraison sur ce compte. Kalyx n’ajoute aucun frais.', e_NO_ACCOUNT: 'Aucun compte compatible : ajoute un compte Ethereum ou Solana.', e_BUY_UNAVAILABLE: 'Achat indisponible pour le moment. Réessaie plus tard.', apSiteChecking: 'Vérification du site…', apSitePhishing: 'Ce site est signalé comme frauduleux (GoPlus). Ne te connecte pas : il cherche à vider ton portefeuille.', apSiteLookalike: 'Ce domaine ressemble à {brand} mais ce n’est pas {brand}. Les faux sites copient le nom à une lettre près.', apSiteKnown: 'Déjà connecté auparavant', apSiteNew: 'Première connexion à ce site', apSiteClean: 'aucun signalement connu', apSiteUnchecked: 'vérification anti-hameçonnage indisponible', apRiskAck: 'Je comprends le risque et je veux quand même me connecter', compConfirmTitle: 'C’est bien ton téléphone ?', compConfirmBody: 'Compare ces adresses avec celles de ton compte dans l’app Kalyx. Si ce n’est pas toi qui viens de scanner, coupe la liaison.', compConfirmYes: 'Oui, c’est mon téléphone', compConfirmNo: 'Non, couper la liaison', compDevice: 'Appareil', notifConfirmed: 'Transaction confirmée', notifFailed: 'Transaction échouée', wlScope: 'Elle bloque aussi les transactions et signatures demandées par les sites, l’affichage de la phrase de récupération et des clés privées, et l’export de sauvegarde.', e_WHITELIST_LOCKED: 'Liste blanche active : action bloquée tant qu’elle est en vigueur.', apprTitle: 'Autorisations de tokens', apprIntro: 'Ces contrats peuvent dépenser tes tokens sans nouvelle signature. Révoque celles dont tu ne te sers plus.', apprEmpty: 'Aucune autorisation active sur ce réseau.', apprCanSpend: 'Peut dépenser {amount}', apprRisky: 'Contrat signalé', apprRevoke: 'Révoquer', apprConfirm: 'Révoquer l’autorisation de {spender} sur {symbol} ({chain}) ? C’est une transaction : des frais réseau s’appliquent. Aucun fonds ne bouge.', apprSent: 'Révocation envoyée', apprPartial: 'Liste peut-être incomplète : le service d’analyse ne répond pas.', compUnlink: 'Délier ce téléphone', compUnlinkConfirm: 'Le téléphone ne pourra plus signer pour cette extension, et les sites connectés à ce compte le perdront. Tes fonds ne bougent pas : ils restent dans l’app.', showPhrase: 'Voir la phrase de récupération',
  tdBalance: 'Solde', tdPrice: 'Prix', tdNetwork: 'Réseau', tdUnverified: 'Non vérifié : ni prix ni valeur comptés dans ton total. Méfie-toi d’un token reçu sans l’avoir demandé.',
  chooseAccount: 'Choisir un compte', myAddresses: 'Mes adresses', setGeneral: 'Général', setSecurity: 'Sécurité', setHelp: 'Aide', sitesShort: 'Sites', networksShort: '{n} réseaux ne répondent pas',
  sitesTitle: 'Sites connectés',
  sitesEmpty: 'Aucun site connecté.',
  disconnect: 'Déconnecter',
  defaultTitle: 'Kalyx par défaut',
  defaultBody: 'Kalyx prend aussi window.ethereum : utile pour les dApps qui ne cherchent que MetaMask. Désactivé, Kalyx reste proposé à côté des autres portefeuilles (EIP-6963). S’applique aux pages ouvertes ensuite.',
  on: 'Activé',
  off: 'Désactivé',
  networkLabel: 'Réseau : {n}',
  apAnalyzing: 'Analyse de la demande…',
  apLose: 'Tu perds',
  apReceive: 'Tu reçois',
  apDetails: 'Détails techniques',
  apMessage: 'Message à signer',
  apReduce: 'Limiter l’autorisation à',
  apReduceHint: 'Montant maximum que ce contrat pourra dépenser, en {s}.',
  apSign: 'Signer',
  apConfirm: 'Confirmer',
  apHold: 'Maintenir pour signer',
  apHoldHint: 'Demande à risque : garde le bouton enfoncé 2 secondes pour signer.',
  apPassword: 'Ton mot de passe (demandé à chaque signature)',
  apFailed: 'Échec : {m}',
  apRisk_warning: 'À vérifier',
  apRisk_danger: 'Danger',
  apNetwork: 'Réseau : {n}',
  askPwTitle: 'Redemander le mot de passe pour signer',
  askPwBody: 'Activé, chaque signature demandée par un site exige ton mot de passe, même déverrouillé.',
  e_PASSWORD_REQUIRED: 'Saisis ton mot de passe pour signer.',
  e_WRONG_PASSWORD: 'Mot de passe incorrect.',
  e_THROTTLED: 'Trop d’essais : patiente un instant.',
  e_ACTION_FAILED: 'L’opération a échoué : {message}',
  beta: 'Bêta',
  version: 'Version {v}',
  reportIssue: 'Signaler un problème',
  reportNote: 'Ouvre ton application d’e-mail. N’envoie jamais ta phrase de récupération ni ta clé privée, même au support de Kalyx.',
  reportMailSubject: 'Retour bêta — extension Kalyx {v}',
  reportMailBody: 'Que s’est-il passé ? Qu’attendais-tu ?',
  manageWallet: 'Gérer ce portefeuille', mgName: 'Nom', mgRename: 'Renommer', mgSave: 'Enregistrer', mgAccounts: 'Comptes', mgAddAccount: 'Ajouter un compte', mgKindSeed: 'Phrase de récupération', mgKindKey: 'Clé privée importée', mgShowKey: 'Exporter la clé privée', mgKeyWarn: 'Quiconque a cette clé contrôle ce compte et peut vider ses fonds. Ne la saisis jamais sur un site et ne la donne à personne, pas même au support.', mgCopyKey: 'Copier la clé', mgKeyCopied: 'Clé copiée', mgRemove: 'Supprimer ce portefeuille', mgRemoveWarn: 'Il disparaît de cette extension avec tous ses comptes. Tes fonds restent sur la blockchain, mais seule ta phrase de récupération (ou ta clé) permettra de le retrouver.', mgRemoveAck: 'J’ai noté ma phrase de récupération (ou ma clé) en lieu sûr', mgPassword: 'Mot de passe de l’extension', pwChange: 'Changer le mot de passe', pwCurrent: 'Mot de passe actuel', pwNew: 'Nouveau mot de passe (8 caractères min.)', pwChanged: 'Mot de passe changé', bkExport: 'Exporter une sauvegarde chiffrée', bkNote: 'Un fichier chiffré avec tes portefeuilles (sauf ceux du téléphone), que l’app Kalyx et l’extension savent restaurer. Choisis un mot de passe différent de celui de l’extension et note-le : sans lui, le fichier est illisible.', bkPassword: 'Mot de passe de la sauvegarde', bkConfirm: 'Confirme le mot de passe de la sauvegarde', bkDone: 'Sauvegarde téléchargée : {n} portefeuille(s).', e_WEAK_BACKUP_PASSWORD: 'Mot de passe de sauvegarde trop faible, ou identique à celui de l’extension.', e_BAD_LABEL: 'Donne un nom.', e_NOTHING_TO_BACKUP: 'Rien à sauvegarder ici : les comptes du téléphone se sauvegardent dans l’app.', e_TOO_MANY_ACCOUNTS: 'Limite de 100 comptes atteinte pour ce portefeuille.',
  netTitle: 'Réseaux affichés', netIntro: 'Un réseau masqué disparaît des soldes, de l’activité et des NFT. Il reste utilisable par les sites : rien n’est désactivé.', atTitle: 'Ajouter un token', atIntro: 'Colle l’adresse du contrat. Kalyx lit le token directement sur le réseau.', atContract: 'Adresse du contrat', atCheck: 'Vérifier', atSymbol: 'Symbole', atName: 'Nom', atDecimals: 'Décimales', atWarn: 'Ce token n’est pas vérifié par Kalyx et n’a pas de prix affiché. N’importe qui peut créer un token qui porte le nom d’un autre : vérifie l’adresse du contrat à sa source officielle.', atAdd: 'Ajouter {symbol}', tkAdded: 'Ajouté', tkAddedWarn: 'Ajouté par toi : non vérifié par Kalyx, aucun prix affiché.', tkAddedGroup: 'Ajoutés par toi', tkHide: 'Masquer ce token', tkHideNote: 'Il sort de la liste et du total. Il reste envoyable.', tkShow: 'Afficher ce token', tkShowNote: 'Il revient dans la liste et dans le total.', tkRemove: 'Retirer ce token', tkMuted: 'Masqués par toi ({n})', tabNfts: 'NFT', nftCollection: 'Collection', nftId: 'Identifiant', nftFloor: 'Prix plancher', nftReadOnly: 'Lecture seule : Kalyx affiche tes NFT mais ne les envoie pas.', nftDown: 'Sans réponse : {list}. Les NFT déjà connus restent affichés.', nftEmpty: 'Aucun NFT sur ce compte.', nftNote: 'Les NFT signalés comme spam ne sont pas affichés.', e_LAST_NETWORK: 'Garde au moins un réseau affiché.', e_BAD_CONTRACT: 'Adresse de contrat invalide pour ce réseau.', e_TOKEN_UNREADABLE: 'Le réseau ne répond pas, ou ce contrat n’est pas un token. Réessaie.', e_NOT_A_TOKEN: 'Ce contrat n’est pas un token lisible.', e_SUSPICIOUS_TOKEN: 'Nom de token suspect (lien, « claim », « airdrop »…) : ajout refusé.', e_TOKEN_EXISTS: 'Ce token est déjà ajouté.', e_TOO_MANY_TOKENS: 'Limite de 30 tokens ajoutés atteinte.',
  ctTitle: 'Carnet d’adresses', ctIntro: 'Un nom sur une adresse, chiffré avec ton coffre. Un contact ne remplace pas la liste blanche : vérifie toujours l’adresse avant d’envoyer.', ctAdd: 'Ajouter un contact', ctEdit: 'Modifier le contact', ctName: 'Nom', ctNamePh: 'Ex. : Léa', ctAddress: 'Adresse', ctAddressPh: 'Adresse EVM (0x…) ou Solana', ctEmpty: 'Aucun contact pour l’instant.', ctNone: 'Aucun contact EVM. Ajoute-en depuis Réglages, Carnet d’adresses.', ctNoneSol: 'Aucun contact Solana. Ajoute-en depuis Réglages, Carnet d’adresses.', ctRemove: 'Supprimer ce contact', ctPrevious: 'Ancienne adresse :', ctChangedOn: 'Adresse modifiée le {d}', ctChangeWarn: 'Tu changes l’adresse de {name}. Un escroc qui obtient l’accès à ton ordinateur ferait exactement ça. Vérifie la nouvelle adresse avec la personne, par un autre moyen.', ctChangeAck: 'J’ai vérifié la nouvelle adresse avec la personne', ctLookalikeWarn: 'Cette adresse ressemble à celle de {name} (même début, même fin) mais ce n’est pas la même. Les escrocs fabriquent ces sosies pour se glisser dans ton historique.', ctLookalikeAck: 'Je sais que ce n’est pas l’adresse de {name} et je veux l’enregistrer', ctAckNeeded: 'Coche la case pour confirmer.', txConfirmed: 'Confirmée', txDate: 'Date', txHash: 'Hash', e_CONTACT_EXISTS: 'Cette adresse est déjà enregistrée ({name}).', e_CONTACT_ADDRESS_CHANGE: 'Changer l’adresse d’un contact demande une confirmation.', e_TOO_MANY_CONTACTS: 'Limite de 200 contacts atteinte.', e_UNKNOWN_CONTACT: 'Ce contact n’existe plus.', e_CONTACTS_UNREADABLE: 'Carnet d’adresses illisible : il n’a pas été modifié.', e_CONTACT_LOOKALIKE: 'Cette adresse ressemble à celle de {name}.',
  swShort: 'Swap', swTitle: 'Swap', swIntro: 'Un token contre un autre, ou d’un réseau à l’autre. Kalyx compare LI.FI, Jupiter et Relay et contrôle chaque devis avant de le signer : l’arrivée est toujours ton compte.', swFrom: 'De', swTo: 'Vers', swGetQuote: 'Obtenir un devis', swQuoting: 'Recherche du meilleur devis…', swYouGet: 'Tu reçois', swMin: 'Au moins {v} garantis', swPay: 'Tu paies', swRoute: 'Route', swServiceFee: 'Frais de service', swKalyxFee: 'Frais Kalyx', swNoFee: 'Aucun', swSlippage: 'Tolérance de prix', swImpact: 'Écart de prix', swDuration: 'Durée estimée', swApprovalNote: 'Une autorisation de {symbol}, au montant exact de l’échange, sera signée d’abord.', swImpactWarn: 'L’écart entre ce que tu paies et ce que tu reçois est élevé ({pct}). La liquidité est faible ou le prix bouge.', swImpactAck: 'J’ai compris l’écart et je veux échanger quand même', swSwapNow: 'Swap', swBridgeNow: 'Bridge', swStApproving: 'Autorisation en cours…', swStApprovalWait: 'Attente de la confirmation de l’autorisation…', swStSwapping: 'Échange en cours…', swSent: 'Échange envoyé', swSentNote: 'Tu recevras une notification à la confirmation. Les soldes se mettent à jour ensuite.', swNoSource: 'Aucun actif à échanger sur ce compte pour l’instant.', e_SWAP_TOKENS_UNAVAILABLE: 'Liste des tokens indisponible pour ce réseau. Réessaie.', e_SWAP_NO_SOURCE: 'Cet actif n’est plus disponible sur ce compte.', e_SWAP_BAD_TARGET: 'Token d’arrivée inconnu : choisis-le dans la liste.', e_SWAP_SAME_TOKEN: 'Choisis deux tokens différents.', e_SWAP_NO_ADDRESS: 'Ce compte n’a pas d’adresse sur {chain}.', e_SWAP_KEEP_GAS: 'Garde au moins {amount} pour les frais réseau.', e_SWAP_NEED_GAS: 'Il faut au moins {amount} pour payer les frais réseau.', e_SWAP_NO_ROUTE: 'Aucune route trouvée pour cet échange.', e_SWAP_REFUSED: 'Devis refusé par le contrôle de sécurité : rien n’a été signé.', e_SWAP_QUOTE_GONE: 'Ce devis a expiré : demandes-en un nouveau.', e_SWAP_ACK_NEEDED: 'Confirme l’écart de prix pour continuer.', e_SWAP_QUOTE_WORSE: 'Le prix a baissé depuis le devis (minimum maintenant {min}) : rien n’a été signé. Redemande un devis.', e_SWAP_APPROVAL_NOT_SEEN: 'L’autorisation est confirmée mais pas encore visible sur le réseau. Réessaie dans quelques secondes.', e_SWAP_AMOUNT_BELOW_MINIMUM: 'Montant trop petit pour cette route.', e_SWAP_AMOUNT_ABOVE_MAXIMUM: 'Montant trop élevé pour cette route.', e_SWAP_NO_LIQUIDITY: 'Pas assez de liquidité pour ce montant.', e_SWAP_INVALID_TOKEN: 'Token non pris en charge par les fournisseurs.', e_SWAP_INVALID_ADDRESS: 'Adresse de réception invalide.', e_SWAP_SLIPPAGE_TOO_HIGH: 'Tolérance de prix trop faible pour ce marché : augmente-la.', e_SWAP_INSUFFICIENT_GAS: 'Pas assez de token natif pour payer les frais réseau.', e_SWAP_INSUFFICIENT_FUNDS: 'Solde insuffisant.', e_SWAP_RATE_LIMITED: 'Trop de demandes : réessaie dans un instant.', e_SWAP_NETWORK: 'Service d’échange injoignable. Vérifie ta connexion.', e_SWAP_QUOTE_EXPIRED: 'Ce devis a expiré : demandes-en un nouveau.', e_SWAP_PROVIDER_UNAVAILABLE: 'Fournisseurs d’échange indisponibles pour le moment.',
  e_SWAP_TX_FAILED: 'La transaction n’est pas passée : {reason}',
  language: 'Langue', langAuto: 'Auto ({name})', faq: 'Questions fréquentes', about: 'À propos', privacy: 'Politique de confidentialité', terms: 'Conditions d’utilisation', legalNotice: 'Mentions légales', supportTelegram: 'Support sur Telegram', supportEmail: 'Écrire au support', aboutBody: 'Kalyx Wallet est un portefeuille non-custodial : tes clés restent chiffrées sur cet ordinateur. Kalyx n’y a jamais accès et ne peut ni bloquer, ni déplacer, ni récupérer tes fonds.', aboutNoTracking: 'Aucune publicité, aucune télémétrie, aucun traceur.', aboutEditor: 'Éditeur', forgotPw: 'Mot de passe oublié ?', rsTitle: 'Réinitialiser l’extension', rsBody: 'Personne ne peut retrouver ton mot de passe, pas même Kalyx. Pour reprendre la main, efface l’extension, puis restaure tes portefeuilles avec leur phrase de récupération ou une sauvegarde chiffrée.', rsWarn: 'Tout est effacé de cet ordinateur : portefeuilles, carnet d’adresses, sites connectés, réglages et liens avec le téléphone (ses comptes restent dans l’app). Sans phrase de récupération ni sauvegarde, les fonds de ces portefeuilles seront perdus pour toujours.', rsAck: 'J’ai la phrase de récupération (ou une sauvegarde) de chaque portefeuille', rsType: 'Pour confirmer, écris {word}', rsWord: 'EFFACER', rsGo: 'Tout effacer', faqQ1: 'Où sont mes clés ?', faqA1: 'Sur cet ordinateur, dans un coffre chiffré avec ton mot de passe (scrypt, puis AES-256-GCM). Elles ne sont jamais envoyées à Kalyx ni à aucun serveur. Les comptes reliés au téléphone (mode compagnon) gardent leurs clés dans l’app Kalyx.', faqQ2: 'J’ai oublié mon mot de passe', faqA2: 'Personne ne peut le retrouver, pas même Kalyx. Sur l’écran de verrouillage, touche « {forgot} » : l’extension est effacée, puis tu restaures tes portefeuilles avec leur phrase de récupération ou une sauvegarde chiffrée.', faqQ3: 'Comment sauvegarder mon portefeuille ?', faqA3: 'Note ta phrase de récupération sur papier et garde-la hors ligne ({phrase}). Tu peux aussi exporter une sauvegarde chiffrée ({backup}), que l’app et l’extension savent restaurer.', faqQ4: 'On me demande ma phrase de récupération', faqA4: 'C’est une arnaque. Ni Kalyx, ni son support, ni aucun site ne te la demandera. Ne la saisis que dans l’accueil de Kalyx, pour restaurer un portefeuille.', faqQ5: 'Que peut faire un site connecté ?', faqA5: 'Voir l’adresse que tu as accepté de partager. Chaque transaction ou signature s’ouvre dans une fenêtre Kalyx qui explique ce qu’elle fait : rien n’est signé sans ton accord. Pour déconnecter un site : {sites}.', faqQ6: 'Qu’est-ce qu’une autorisation de token ?', faqA6: 'Une permission donnée à un contrat de dépenser tes tokens sans nouvelle signature. Révoque celles dont tu ne te sers plus : {approvals}.', faqQ7: 'Pourquoi l’extension se verrouille-t-elle ?', faqA7: 'Après le délai d’inactivité choisi ({lock}), quand l’ordinateur se verrouille et quand le navigateur se ferme. Ton mot de passe est alors redemandé.', faqQ8: 'Quels réseaux sont pris en charge ?', faqA8: 'Les réseaux compatibles Ethereum (EVM) et Solana. Bitcoin et TON sont dans l’app Kalyx sur téléphone. Pour afficher ou masquer un réseau : {networks}.',
  paranoTitle: 'Mode parano', paranoBody: 'Verrouille dès que Chrome passe en arrière-plan, après 1 min d’inactivité de l’ordinateur, et quand Chrome met Kalyx en pause (environ 30 s sans l’utiliser).', siteModeTitle: 'Sites autorisés seulement', siteModeBody: 'Ailleurs, Kalyx est invisible : les sites ne savent même pas qu’il est installé. Active-le site par site depuis le popup.', allowedSites: 'Sites autorisés ({n})', allowedSitesTitle: 'Sites autorisés', allowedNone: 'Aucun site autorisé. Ouvre un site, puis le popup Kalyx : « Activer sur ce site ».', siteOff: 'Kalyx est désactivé sur {site}.', siteOn: 'Activer sur ce site', siteEnabled: 'Activé sur {site} : la page se recharge.', siteRemove: 'Retirer', e_BAD_ORIGIN: 'Ce n’est pas un site web (http ou https).', e_TOO_MANY_SITES: 'Limite de 300 sites autorisés atteinte.',
  pkTitle: 'Passkey (second facteur)', pkOn: 'Activée', pkOff: 'Désactivée', pkIntro: 'En plus du mot de passe, ta passkey (Touch ID, Windows Hello, clé de sécurité) sera demandée pour déverrouiller. Les deux ensemble ouvrent le coffre : l’un sans l’autre ne sert à rien.', pkWarn: 'Si tu perds cette passkey, tu ne pourras plus déverrouiller : il faudra tout effacer et restaurer avec ta phrase de récupération.', pkAck: 'Ma phrase de récupération est notée en lieu sûr', pkEnable: 'Activer la passkey', pkDisable: 'Désactiver la passkey', pkEnabled: 'Passkey activée : elle sera demandée à chaque déverrouillage.', pkDisabled: 'Passkey désactivée : le mot de passe suffit de nouveau.', pkUnlock: 'Déverrouiller avec la passkey', pkPopupNote: 'Ce coffre demande aussi ta passkey : le déverrouillage s’ouvre dans un onglet.', pkActiveNote: 'Ton mot de passe, puis ta passkey.', pkUnsupported: 'Ce navigateur ne prend pas en charge les passkeys.', pkDoneClose: 'Déverrouillé. Cet onglet se ferme.', drTitle: 'Code de contrainte', drOn: 'Activé', drOff: 'Désactivé', drIntro: 'Sous la menace, tape ce code à la place de ton mot de passe : Kalyx s’ouvre sur un portefeuille leurre, séparé du vrai. Rien n’y révèle tes vrais portefeuilles.', drHow: 'Ensuite : verrouille, déverrouille avec ce code, puis crée ou importe le portefeuille leurre. Mets-y un vrai petit montant : un leurre vide ne convainc personne.', drCode: 'Code de contrainte (8 caractères min.)', drConfirm: 'Confirme le code', drSave: 'Enregistrer le code', drRemove: 'Retirer le code', drRemoveWarn: 'Le portefeuille leurre et toutes ses données seront effacés de cette extension.', drSaved: 'Code enregistré.', drRemoved: 'Code retiré.', drMismatch: 'Les deux codes ne sont pas identiques.', e_PASSKEY_REQUIRED: 'Ta passkey est requise pour déverrouiller.', e_WRONG_PASSKEY: 'Cette passkey n’est pas celle du coffre.', e_PASSKEY_CANCELLED: 'Passkey annulée.', e_PASSKEY_NO_PRF: 'Cette passkey ne permet pas le chiffrement (extension PRF absente). Essaie Touch ID, Windows Hello, le gestionnaire de mots de passe de Google ou une clé de sécurité récente.', e_PASSKEY_FAILED: 'La passkey n’a pas répondu. Réessaie.', e_PASSKEY_EXISTS: 'Une passkey est déjà active.', e_NO_PASSKEY: 'Aucune passkey active.', e_BAD_PASSKEY: 'Réponse de la passkey illisible.', e_DURESS_SAME: 'Le code doit être différent de ton mot de passe.',
  rkTitle: 'Risque', rkLow: 'faible', rkMedium: 'moyen', rkHigh: 'élevé', rkScore: '{score}/100', rkNone: 'Aucun signal de risque relevé.', rkMore: '{n} autre(s) raison(s)', rkLocal: 'Calculé sur ton ordinateur, sans IA ni serveur.', rk_phishingSite: 'Site signalé comme frauduleux.', rk_lookalike: 'Ce domaine imite {brand}.', rk_contractDanger: 'Le contrat visé est signalé comme malveillant.', rk_pageTampered: 'Page altérée : un autre script se fait passer pour Kalyx ou intercepte ses échanges.', rk_domainMismatch: 'Message prévu pour un autre site ({domain}).', rk_approveAll: 'Accès à TOUS tes NFT de cette collection.', rk_unlimitedApproval: 'Autorisation illimitée : le contrat pourra tout dépenser, sans nouvelle signature.', rk_lossOnly: 'Tu perds des fonds et ne reçois rien en échange.', rk_nftOrder: 'Ordre de marché : la signature suffit à céder tes NFT ou tokens.', rk_permitNoExpiry: 'Autorisation sans date d’expiration.', rk_noSimulation: 'Résultat non simulé : l’effet exact n’a pas pu être vérifié.', rk_manyTxs: '{n} transactions d’un coup : seule la première est décrite.', rk_insecureSite: 'Site non chiffré (http).', rk_firstVisit: 'Site connecté depuis moins de 24 h.', poTitle: 'Téléphone seul', poBody: 'Aucune clé dans cette extension : elle affiche tes comptes et transmet chaque signature à l’app Kalyx de ton téléphone. Créer ou importer une clé ici est refusé.', poOffTitle: 'Désactiver « Téléphone seul »', poOffBody: 'Ton mot de passe est requis : l’extension pourra de nouveau contenir des clés.', poOffGo: 'Désactiver', e_PHONE_ONLY: 'Mode « Téléphone seul » : aucune clé ne peut être créée ni importée ici. Relie plutôt un compte de ton téléphone.', e_HAS_LOCAL_KEYS: 'Des portefeuilles de cette extension ont encore leurs clés ici. Supprime-les d’abord (phrase de récupération notée) : seuls les comptes du téléphone peuvent rester.',
  grNotifTitle: '{n} autorisation(s) à révoquer', grNotifBody: 'Échéance passée : {list}. Révoque-les en un clic.', capNote: 'Au-delà de ton plafond journalier (il reste {remaining} aujourd’hui, dans ta devise) : confirme avec ton mot de passe.', e_CAP_PASSWORD: 'Plafond journalier dépassé (reste {remaining}) : mot de passe requis.', grRemind: 'Rappel pour révoquer', grNever: 'Jamais', grIn1h: 'Dans 1 h', grIn24h: 'Dans 24 h', grIn7d: 'Dans 7 jours', grTitle: 'Rappels d’autorisations', grLeftMin: 'Encore {n} min', grLeftH: 'Encore {n} h', grLeftD: 'Encore {n} j', grExpired: 'Échue : à révoquer', grDismiss: 'Retirer ce rappel', grRevokeAll: 'Tout révoquer ({n})', grRevoking: 'Révocations en cours…', grRevoked: '{n} révocation(s) envoyée(s).', grFailed: 'Échec : {list}.', capTitle: 'Plafond journalier', capOff: 'Aucun', capRaise: 'Relever le plafond', capRaiseBody: 'Relever ou retirer le plafond journalier demande ton mot de passe.',
  lookTitle: 'Apparence', themeTitle: 'Thème', themeBody: 'Nuit par défaut. Système suit ton ordinateur.', themeDark: 'Nuit', themeLight: 'Crème', themeSystem: 'Système', modeTitle: 'Mode', modeBeginner: 'Débutant', modeExpert: 'Expert', modeBeginnerBody: 'L’essentiel d’abord : les détails techniques restent repliés, les réglages pointus sont rangés.', modeExpertBody: 'Tout à plat : détails techniques ouverts, points du score, réglages avancés visibles.', soundTitle: 'Sons discrets', soundBody: 'Une note douce quand une signature ou un envoi part. Coupé par défaut.', advTitle: 'Réglages avancés', advBody: 'Mode parano, présence sur les sites, téléphone seul, code de contrainte, liste blanche, réseaux.', rkHelp: 'Plus le score est haut, plus cette demande peut te coûter. Au moindre doute, refuse : refuser ne coûte rien.', apDoneSent: 'Envoyé', apDoneSigned: 'Signé', apMethod: 'Méthode', obLookTitle: 'À ton goût',
  receiveBtcNote: 'Uniquement des bitcoins, sur le réseau Bitcoin. Une adresse bc1 n’accepte rien d’autre.',
  recipientPhBtc: 'Adresse Bitcoin (bc1…)', ctNoneBtc: 'Aucun contact Bitcoin. Ajoute-en depuis Réglages, Carnet d’adresses.', ctAddressPhAll: 'Adresse EVM (0x…), Solana, Bitcoin ou TON', e_BTC_DUST: 'Trop petit pour cette adresse Bitcoin : au moins {min} {symbol}, sinon le réseau refuse la transaction.', e_BTC_TOO_MANY_INPUTS: 'Trop de petites pièces à rassembler en une seule transaction. Envoie un montant plus faible.',
  apFamilyBtc: 'Bitcoin', e_COMPANION_NO_BTC_SITES: 'Les sites Bitcoin ne sont pas encore servis pour un compte du téléphone : utilise un compte de cette extension.',
  receiveTonNote: 'Uniquement des actifs du réseau TON (TON et jettons). Aucun commentaire n’est nécessaire pour recevoir ici.',
  ctNoneTon: 'Aucun contact TON. Ajoute-en depuis Réglages, Carnet d’adresses.', recipientPhTon: 'Adresse TON (UQ… ou EQ…)', memoLabel: 'Commentaire (facultatif)', memoPh: 'Exigé par certaines plateformes d’échange', feeTon: 'Frais calculés à l’étape suivante, avant toute signature.',
  vdLow: 'Rien d’inquiétant repéré', vdMedium: 'Prudence : lis ces points avant de signer', vdHigh: 'Danger : refuse, sauf si tu es absolument sûr', pvUnavailableTitle: 'Aperçu indisponible', pvUnavailableBody: 'Kalyx n’a pas pu prévoir le résultat exact : ça arrive avec certains réseaux et contrats. Rien ne part tant que tu ne confirmes pas. Si tu ne connais pas ce site, refuse.', pvFailedTitle: 'Cette transaction risque d’échouer', pvFailedBody: 'D’après l’aperçu, le réseau la refuserait, et des frais seraient quand même prélevés. Le plus sûr : refuser, puis réessayer depuis le site en vérifiant le montant et ton solde.', pvErrorLabel: 'Raison technique', holdKeep: 'Continue d’appuyer…', vdWhy: 'Pourquoi',
  stTitle: 'Ton portefeuille est prêt', stBody: 'Ajoute des fonds pour commencer : par carte, ou depuis un autre portefeuille ou une plateforme d’échange.',
  modeNowBeginner: 'Mode Débutant : l’essentiel, sans détails techniques.', modeNowExpert: 'Mode Expert : tout est visible et réglable.',
  obV1: 'Chaque signature expliquée et notée avant que tu acceptes', obV2: 'EVM, Solana, Bitcoin et TON au même endroit', obV3: 'Tes clés restent ici, chiffrées : personne d’autre n’y a accès', obLockLater: 'Verrouillage automatique : 15 min, modifiable dans Réglages.',
  esNftBody: 'Ceux que ce compte reçoit apparaîtront ici, rangés par collection.', esActBody: 'Tes envois, réceptions et échanges s’afficheront ici, jour par jour.', esCtBody: 'Enregistre les adresses que tu utilises souvent : Kalyx te prévient si une adresse saisie ressemble à l’une d’elles.', esSitesBody: 'Quand tu connectes Kalyx à un site, il apparaît ici et tu peux le déconnecter d’un geste.', esApprBody: 'Aucun contrat ne peut dépenser tes tokens ici : rien à révoquer.', esWlBody: 'Ajoute les adresses que tu autorises : tout autre destinataire sera bloqué.',
  pvPartialTitle: 'Aperçu partiel', pvPartialBody: 'Vérifié sur le réseau : la transaction passerait. Kalyx n’a pas pu lire les montants exacts ; si tu ne connais pas ce site, refuse.', rvLabel: 'Raison probable', rv_balance: 'Solde insuffisant pour cette opération (frais compris).', rv_allowance: 'Autorisation de dépense insuffisante : le site doit d’abord te la demander.', rv_slippage: 'Le prix a bougé : le minimum promis ne serait pas atteint. Relance depuis le site.', rv_deadline: 'Délai dépassé : la demande a expiré. Relance-la depuis le site.', rv_gas: 'Pas assez de gaz prévu pour exécuter la transaction.', rv_denied: 'Le contrat refuse cette opération pour ton compte (accès limité ou contrat en pause).',
};

type Dict = typeof fr;

const en: Dict = {
  back: 'Back',
  continue: 'Continue',
  welcomeTitle: 'Welcome to Kalyx',
  welcomeSub: 'Your keys stay on this computer, encrypted. Nobody else, not even Kalyx, can access them.',
  create: 'Create a wallet',
  haveOne: 'I already have a wallet',
  pwTitle: 'Choose a password',
  pwSub: 'It protects your wallet on this computer. Kalyx can’t recover it: only your recovery phrase can.',
  pwPlaceholder: 'Password (8+ characters)',
  pwConfirm: 'Confirm the password',
  pwMismatch: 'The two passwords don’t match.',
  pwWeak: 'Too simple: make it longer, mix words, numbers and symbols.',
  strength0: 'Too weak',
  strength1: 'Weak',
  strength2: 'Good',
  strength3: 'Strong',
  unlockTitle: 'Unlock Kalyx',
  unlockSub: 'Your password, to add a wallet.',
  unlock: 'Unlock',
  wrongPassword: 'Wrong password.',
  throttled: 'Too many attempts. Try again in {s} s.',
  phraseTitle: 'Your recovery phrase',
  phraseSub: '12 words, in order. It’s the only way to get your wallet back if you lose this computer. Write it on paper.',
  phraseWarn1: 'No screenshots.',
  phraseWarn2: 'No cloud, email or messaging app.',
  phraseWarn3: 'Kalyx will never ask you for it.',
  phraseReveal: 'Show the phrase',
  phraseNoted: 'I wrote it down',
  verifyTitle: 'Let’s check your phrase',
  verifyWord: 'Which is word #{n}?',
  verifyWrong: 'That’s not the right word. Check your written phrase.',
  later: 'Later',
  laterNote: 'A reminder will stay visible until your phrase is checked.',
  importTitle: 'Import a wallet',
  importPhrase: 'Recovery phrase',
  importPhraseSub: '12 to 24 words',
  importBackup: 'Kalyx backup',
  importBackupSub: 'The encrypted file from the mobile app',
  importKey: 'Private key',
  importKeySub: 'Ethereum and EVM networks, or Solana',
  phrasePlaceholder: 'Type or paste your words, separated by spaces',
  words: '{n} words',
  unknownWords: 'Unknown words: {w}',
  import: 'Import',
  searching: 'Looking for your accounts… (account {n})',
  foundAccounts: '{n} previously used account(s) found.',
  uncertainAccounts: 'Some accounts couldn’t be checked (network). You can add them later.',
  backupFile: 'Choose the file',
  backupPassword: 'Backup password',
  open: 'Open',
  added: '{n} wallet(s) added.',
  skipped: 'Not imported: {list}.',
  keyEvm: 'Ethereum and EVM networks',
  keySolana: 'Solana',
  keyPlaceholder: 'Paste your private key',
  keyNote: 'A private key serves one network and has no phrase: keep it somewhere safe.',
  doneTitle: 'Your wallet is ready',
  donePin: 'Pin Kalyx: click the extensions icon (the puzzle piece), then the pin next to Kalyx.',
  autoLock: 'Lock automatically after',
  minutes: '{n} min',
  done: 'Done',
  backupBanner: 'Your phrase isn’t checked yet.',
  verifyNow: 'Check',
  e_WEAK_PASSWORD: 'Too simple: make it longer, mix words, numbers and symbols.',
  e_INVALID_PHRASE: 'Invalid phrase: check the spelling and the word order.',
  e_UNSUPPORTED_PHRASE: 'TON phrase: not supported by the extension yet.',
  e_DUPLICATE: 'This wallet is already in Kalyx.',
  e_INVALID_KEY: 'Key not recognised.',
  e_WRONG_FAMILY: 'This key doesn’t match this network.',
  e_BACKUP_WRONG_PASSWORD: 'Wrong backup password.',
  e_BACKUP_UNREADABLE: 'This file isn’t a Kalyx backup.',
  e_BACKUP_NOT_A_BACKUP: 'This file isn’t a Kalyx backup.',
  e_BACKUP_CORRUPTED: 'Damaged backup: it can’t be opened.',
  e_BACKUP_TOO_RECENT: 'Backup made by a newer version: update the extension.',
  e_TOO_MANY_WALLETS: 'Maximum number of wallets reached.',
  e_INTERNAL: 'Something went wrong. Try again.',
  r_UNSUPPORTED_FAMILY: 'Bitcoin (coming soon)',
  r_UNSUPPORTED_PHRASE: 'TON (coming soon)',
  r_DUPLICATE: 'already there',
  popupNoVault: 'Your wallet for the web, on this computer.',
  getStarted: 'Get started',
  popupUnlockSub: 'Enter your password.',
  addWallet: 'Add a wallet',
  lock: 'Lock',
  unavailable: 'Kalyx isn’t responding. Reopen the window.',
  tabTokens: 'Tokens',
  tabActivity: 'Activity',
  total: 'Total value',
  totalUnknown: 'Value unknown',
  updated: 'Updated {t}',
  justNow: 'just now',
  refreshing: 'Refreshing…',
  networksDown: 'Not responding: {list}. Their balances come from the last reading.',
  andMore: '{list} and {n} more',
  networksDownNoData: 'Not responding: {list}. Balances unknown for now.',
  networksDownActivity: 'Not responding: {list}. Their history couldn’t be read.',
  erc20Partial: 'List limited to the main tokens (USDC, USDT…) for now: the token service is busy.',
  smallBalances: 'Small balances ({n})',
  hiddenTokens: 'Hidden, unverified ({n})',
  noTokens: 'No balance yet.',
  noActivity: 'No recent activity.',
  hiddenActivity: '{n} row(s) hidden: likely spam.',
  pending: 'Pending',
  failedTx: 'Failed',
  viewExplorer: 'View on explorer',
  account: 'Account {n}',
  settings: 'Settings',
  currency: 'Currency',
  openSidePanel: 'Open in side panel',
  copied: 'Address copied',
  copy: 'Copy address',
  firstLoad: 'Reading balances on every network…',
  loadFailed: 'Can’t read balances right now. Try again.',
  retry: 'Retry',
  today: 'Today',
  yesterday: 'Yesterday',
  send: 'Send',
  receive: 'Receive',
  asset: 'Asset',
  recipient: 'Recipient',
  recipientPh: 'Address or ENS name',
  recipientPhSol: 'Solana address',
  amount: 'Amount',
  max: 'Max',
  balanceIs: 'Balance: {b}',
  balanceUnknown: 'Balance unknown (network not responding)',
  fee: 'Network fee',
  feeSlow: 'Slow',
  feeNormal: 'Normal',
  feeFast: 'Fast',
  feeManual: 'Manual',
  maxFee: 'Max fee (gwei)',
  priorityFee: 'Priority tip (gwei)',
  feeLoading: 'Estimating fees…',
  feeUnavailable: 'Fees unavailable right now (network not responding).',
  review: 'Review',
  reviewTitle: 'Check before sending',
  from: 'From',
  to: 'To',
  network: 'Network',
  totalCost: 'Total debited',
  confirmSend: 'Confirm and send',
  sending: 'Sending…',
  sentTitle: 'Transaction sent',
  statusPending: 'Waiting for confirmation…',
  statusConfirmed: 'Confirmed.',
  statusFailed: 'Failed: the fee was paid, the amount didn’t move.',
  statusExpired: 'Expired: never included, nothing moved.',
  statusUnknown: 'Status unknown for now: check the explorer.',
  newRecipient: 'First time sending to this address: double-check it.',
  poisonTitle: 'Look-alike address!',
  poisonBody: 'It looks like {addr}, which you’ve paid before, but it isn’t the same. Scammers create look-alikes to trap a copy-paste.',
  poisonAck: 'I checked the address character by character',
  w_DESTINATION_NOT_WALLET: 'This address is a contract, not a wallet: funds could get stuck there.',
  w_ACTIVATES_DESTINATION: 'This transfer creates the recipient’s account (small extra cost).',
  w_TOKEN_TRANSFER_FEE: 'This token takes a fee: the recipient will get less.',
  e_INVALID_ADDRESS: 'Invalid address for this network.',
  e_ENS_NOT_FOUND: 'ENS name not found.',
  e_INVALID_AMOUNT: 'Invalid amount.',
  e_AMOUNT_TOO_SMALL: 'Amount too small.',
  e_INSUFFICIENT_FUNDS: 'Insufficient balance (fees included).',
  e_INSUFFICIENT_GAS: 'Not enough of the network coin to pay the fee.',
  e_NOT_WHITELISTED: 'Recipient isn’t on your whitelist.',
  e_WHITELIST_PENDING: 'Address still in its safety delay ({hours} h).',
  e_RPC_UNAVAILABLE: 'Network unreachable. Try again.',
  e_BROADCAST_FAILED: 'The network rejected the transaction.',
  e_REQUEST_EXPIRED: 'Review expired: start again.',
  e_RISK_NOT_ACCEPTED: 'First confirm you checked the address.',
  e_WRONG_ACCOUNT: 'The account changed: start again.',
  e_MANUAL_FEE_TOO_HIGH: 'Manual fee is more than 5× the Fast tier: check what you typed.',
  e_MANUAL_FEE_INVALID: 'Invalid manual fee (the tip can’t exceed the max fee).',
  e_MEMO_REQUIRED: 'This recipient requires a comment (often an exchange): add the one it gave you.',
  e_NOT_SUPPORTED: 'Operation not supported.',
  e_LOCKED: 'Kalyx is locked.',
  e_TX_FAILED: 'The transaction failed.',
  e_CALL_EXCEPTION: 'The contract rejected the operation.',
  e_UNKNOWN_ACCOUNT: 'Account not found.',
  e_TX_UNCONFIRMED: 'Unknown transaction.',
  e_SOL_RENT_RECIPIENT: 'Amount too small to create the recipient’s Solana account.',
  e_SOL_RENT_SENDER: 'A minimum of SOL must stay in the account.',
  receiveTitle: 'Receive',
  receiveEvmNote: 'Same address on every EVM network (Ethereum, Base, Arbitrum, Polygon…). Only send assets from these networks here.',
  receiveSolNote: 'Only assets on the Solana network (SOL and SPL tokens).',
  copyAddress: 'Copy address',
  warnReceiveTitle: 'Your phrase isn’t checked',
  warnReceiveBody: 'Before receiving funds, make sure you wrote down your recovery phrase. Without it, what you receive would be lost with this computer.',
  verifyNowBtn: 'Check now',
  continueAnyway: 'Continue anyway',
  wlTitle: 'Whitelist',
  wlIntro: 'When on, Kalyx only sends to addresses on this list and to your own wallets. Adding an address or turning protection off only takes effect after 24 h: even with your password, a thief couldn’t empty your wallet on the spot.',
  wlOff: 'Off',
  wlOn: 'On',
  wlEnable: 'Turn on',
  wlAdd: 'Add',
  wlAddress: 'Address',
  wlLabel: 'Name (optional)',
  wlActive: 'Usable',
  wlIn: 'Usable in {h} h',
  wlRemove: 'Remove',
  wlRequestDisable: 'Turn off (effective in 24 h)',
  wlDisableAt: 'Turning off in {h} h',
  wlCancelDisable: 'Cancel turning off',
  wlNoTime: 'Network time unavailable: can’t add a protected address right now.',
  wlEmpty: 'No addresses.',
  verifyLaterTitle: 'Check your phrase',
  verifyLaterSub: 'Your password, to show your phrase.',
  fiatApprox: '≈ {v}',
  apTitle: 'Site connection',
  apFamilyEvm: 'Ethereum and EVM networks',
  apFamilySol: 'Solana',
  apAccount: 'Account shared with this site',
  apBody: 'This site will see this account’s address and balance, and can propose transactions. It can’t sign anything without your approval, asked every time.',
  apRefuse: 'Refuse',
  apConnect: 'Connect',
  apIdn: 'Domain name with special characters: make sure it’s the site you expect.',
  apLocal: 'Local site (development).',
  apGone: 'This request is no longer valid: it expired or the site was closed.',
  close: 'Close',
  compOption: 'Link my phone', compOptionSub: 'Companion mode: the keys stay in the Kalyx app on your phone; you approve every signature there.', compTitle: 'Link your phone', compSteps: 'Open Kalyx on your phone, tap Scan and point it at this QR code. Choose the account to share, then confirm. To link another one, start again with another account.', compLinkMore: 'Link a phone account', compWaiting: 'Waiting for your phone…', compDone: 'Phone linked', compUnavailable: 'Companion mode isn’t available in this version of the extension.', phoneBadge: 'Phone', onPhoneHint: 'Approve on your phone: open Kalyx, the request is waiting for you.', sendToPhone: 'Send to phone', e_COMPANION_REJECTED: 'Rejected on the phone.', e_COMPANION_TIMEOUT: 'No answer from the phone. Open Kalyx and try again.', e_COMPANION_LOST: 'The link with your phone is broken: link it again.', e_COMPANION_OFFLINE: 'The linking service (WalletConnect) can’t be reached. Check your connection and try again.', e_COMPANION_UNAVAILABLE: 'Companion mode isn’t available in this version of the extension.', e_COMPANION_WRONG_SIGNER: 'The phone signed with another account: rejected, nothing was passed to the site.', e_COMPANION_BAD_RESULT: 'Unreadable answer from the phone: nothing was passed to the site.', e_COMPANION_CHAIN: 'This network isn’t shared by your phone.', e_COMPANION_NO_EVM: 'Your phone didn’t share any Ethereum account.', e_COMPANION_NO_ACCOUNT: 'Your phone didn’t share any account.', e_COMPANION_PAIRING_TIMEOUT: 'The QR code expired. Start again.', e_COMPANION_TX_CHANGED: 'The phone returned a different transaction: rejected.', buy: 'Buy', buyTitle: 'Buy crypto', buyNote: 'Pay by card, bank or Link on Stripe’s secure page, which verifies your identity. Delivered to this account. Kalyx adds no fees.', e_NO_ACCOUNT: 'No compatible account: add an Ethereum or Solana account.', e_BUY_UNAVAILABLE: 'Buying is unavailable right now. Try again later.', apSiteChecking: 'Checking the site…', apSitePhishing: 'This site is reported as fraudulent (GoPlus). Don’t connect: it’s trying to drain your wallet.', apSiteLookalike: 'This domain looks like {brand} but it isn’t {brand}. Fake sites copy the name to within a letter.', apSiteKnown: 'Connected before', apSiteNew: 'First connection to this site', apSiteClean: 'no known reports', apSiteUnchecked: 'phishing check unavailable', apRiskAck: 'I understand the risk and still want to connect', compConfirmTitle: 'Is this your phone?', compConfirmBody: 'Compare these addresses with your account in the Kalyx app. If you didn’t just scan the code, cut the link.', compConfirmYes: 'Yes, it’s my phone', compConfirmNo: 'No, cut the link', compDevice: 'Device', notifConfirmed: 'Transaction confirmed', notifFailed: 'Transaction failed', wlScope: 'It also blocks transactions and signatures requested by sites, showing the recovery phrase and private keys, and exporting a backup.', e_WHITELIST_LOCKED: 'Whitelist on: action blocked while it’s in force.', apprTitle: 'Token approvals', apprIntro: 'These contracts can spend your tokens without a new signature. Revoke the ones you no longer use.', apprEmpty: 'No active approvals on this network.', apprCanSpend: 'Can spend {amount}', apprRisky: 'Flagged contract', apprRevoke: 'Revoke', apprConfirm: 'Revoke {spender}’s approval on {symbol} ({chain})? It’s a transaction: network fees apply. No funds move.', apprSent: 'Revocation sent', apprPartial: 'The list may be incomplete: the analysis service isn’t answering.', compUnlink: 'Unlink this phone', compUnlinkConfirm: 'The phone will no longer sign for this extension, and sites connected to this account will lose it. Your funds don’t move: they stay in the app.', showPhrase: 'Show recovery phrase',
  tdBalance: 'Balance', tdPrice: 'Price', tdNetwork: 'Network', tdUnverified: 'Unverified: no price or value counted in your total. Be wary of tokens you didn’t ask for.',
  chooseAccount: 'Choose an account', myAddresses: 'My addresses', setGeneral: 'General', setSecurity: 'Security', setHelp: 'Help', sitesShort: 'Sites', networksShort: '{n} networks not responding',
  sitesTitle: 'Connected sites',
  sitesEmpty: 'No connected site.',
  disconnect: 'Disconnect',
  defaultTitle: 'Kalyx as default',
  defaultBody: 'Kalyx also takes window.ethereum: useful for dApps that only look for MetaMask. When off, Kalyx is still offered next to other wallets (EIP-6963). Applies to pages opened afterwards.',
  on: 'On',
  off: 'Off',
  networkLabel: 'Network: {n}',
  apAnalyzing: 'Analysing the request…',
  apLose: 'You lose',
  apReceive: 'You receive',
  apDetails: 'Technical details',
  apMessage: 'Message to sign',
  apReduce: 'Limit the approval to',
  apReduceHint: 'Maximum this contract will be able to spend, in {s}.',
  apSign: 'Sign',
  apConfirm: 'Confirm',
  apHold: 'Hold to sign',
  apHoldHint: 'Risky request: keep the button pressed for 2 seconds to sign.',
  apPassword: 'Your password (asked for every signature)',
  apFailed: 'Failed: {m}',
  apRisk_warning: 'Check this',
  apRisk_danger: 'Danger',
  apNetwork: 'Network: {n}',
  askPwTitle: 'Ask for the password to sign',
  askPwBody: 'When on, every signature requested by a site requires your password, even when unlocked.',
  e_PASSWORD_REQUIRED: 'Enter your password to sign.',
  e_WRONG_PASSWORD: 'Wrong password.',
  e_THROTTLED: 'Too many attempts: wait a moment.',
  e_ACTION_FAILED: 'The operation failed: {message}',
  beta: 'Beta',
  version: 'Version {v}',
  reportIssue: 'Report a problem',
  reportNote: 'Opens your email app. Never send your recovery phrase or private key, not even to Kalyx support.',
  reportMailSubject: 'Beta feedback — Kalyx extension {v}',
  reportMailBody: 'What happened? What did you expect?',
  manageWallet: 'Manage this wallet', mgName: 'Name', mgRename: 'Rename', mgSave: 'Save', mgAccounts: 'Accounts', mgAddAccount: 'Add an account', mgKindSeed: 'Recovery phrase', mgKindKey: 'Imported private key', mgShowKey: 'Export private key', mgKeyWarn: 'Anyone with this key controls this account and can drain its funds. Never type it on a website or give it to anyone, not even support.', mgCopyKey: 'Copy key', mgKeyCopied: 'Key copied', mgRemove: 'Remove this wallet', mgRemoveWarn: 'It disappears from this extension with all its accounts. Your funds stay on the blockchain, but only your recovery phrase (or key) will bring it back.', mgRemoveAck: 'I’ve written down my recovery phrase (or key) somewhere safe', mgPassword: 'Extension password', pwChange: 'Change password', pwCurrent: 'Current password', pwNew: 'New password (8 characters min.)', pwChanged: 'Password changed', bkExport: 'Export an encrypted backup', bkNote: 'An encrypted file with your wallets (except the phone’s), which the Kalyx app and the extension can restore. Choose a password different from the extension’s and write it down: without it, the file can’t be read.', bkPassword: 'Backup password', bkConfirm: 'Confirm the backup password', bkDone: 'Backup downloaded: {n} wallet(s).', e_WEAK_BACKUP_PASSWORD: 'Backup password too weak, or the same as the extension’s.', e_BAD_LABEL: 'Enter a name.', e_NOTHING_TO_BACKUP: 'Nothing to back up here: phone accounts are backed up in the app.', e_TOO_MANY_ACCOUNTS: 'Limit of 100 accounts reached for this wallet.',
  netTitle: 'Displayed networks', netIntro: 'A hidden network disappears from balances, activity and NFTs. Sites can still use it: nothing is disabled.', atTitle: 'Add a token', atIntro: 'Paste the contract address. Kalyx reads the token directly on the network.', atContract: 'Contract address', atCheck: 'Check', atSymbol: 'Symbol', atName: 'Name', atDecimals: 'Decimals', atWarn: 'This token isn’t verified by Kalyx and has no price shown. Anyone can create a token with another token’s name: check the contract address at its official source.', atAdd: 'Add {symbol}', tkAdded: 'Added', tkAddedWarn: 'Added by you: not verified by Kalyx, no price shown.', tkAddedGroup: 'Added by you', tkHide: 'Hide this token', tkHideNote: 'It leaves the list and the total. It can still be sent.', tkShow: 'Show this token', tkShowNote: 'It comes back to the list and the total.', tkRemove: 'Remove this token', tkMuted: 'Hidden by you ({n})', tabNfts: 'NFTs', nftCollection: 'Collection', nftId: 'ID', nftFloor: 'Floor price', nftReadOnly: 'Read only: Kalyx shows your NFTs but doesn’t send them.', nftDown: 'No answer: {list}. NFTs already known stay displayed.', nftEmpty: 'No NFTs on this account.', nftNote: 'NFTs flagged as spam aren’t shown.', e_LAST_NETWORK: 'Keep at least one network displayed.', e_BAD_CONTRACT: 'Invalid contract address for this network.', e_TOKEN_UNREADABLE: 'The network isn’t answering, or this contract isn’t a token. Try again.', e_NOT_A_TOKEN: 'This contract isn’t a readable token.', e_SUSPICIOUS_TOKEN: 'Suspicious token name (link, “claim”, “airdrop”…): not added.', e_TOKEN_EXISTS: 'This token is already added.', e_TOO_MANY_TOKENS: 'Limit of 30 added tokens reached.',
  ctTitle: 'Address book', ctIntro: 'A name for an address, encrypted with your vault. A contact doesn’t replace the whitelist: always check the address before sending.', ctAdd: 'Add a contact', ctEdit: 'Edit contact', ctName: 'Name', ctNamePh: 'e.g. Lea', ctAddress: 'Address', ctAddressPh: 'EVM (0x…) or Solana address', ctEmpty: 'No contacts yet.', ctNone: 'No EVM contacts. Add some from Settings, Address book.', ctNoneSol: 'No Solana contacts. Add some from Settings, Address book.', ctRemove: 'Delete this contact', ctPrevious: 'Previous address:', ctChangedOn: 'Address changed on {d}', ctChangeWarn: 'You’re changing {name}’s address. A scammer with access to your computer would do exactly this. Check the new address with the person, another way.', ctChangeAck: 'I checked the new address with the person', ctLookalikeWarn: 'This address looks like {name}’s (same start, same end) but it isn’t the same. Scammers make these lookalikes to slip into your history.', ctLookalikeAck: 'I know this isn’t {name}’s address and I want to save it', ctAckNeeded: 'Tick the box to confirm.', txConfirmed: 'Confirmed', txDate: 'Date', txHash: 'Hash', e_CONTACT_EXISTS: 'This address is already saved ({name}).', e_CONTACT_ADDRESS_CHANGE: 'Changing a contact’s address needs a confirmation.', e_TOO_MANY_CONTACTS: 'Limit of 200 contacts reached.', e_UNKNOWN_CONTACT: 'This contact no longer exists.', e_CONTACTS_UNREADABLE: 'Address book unreadable: it wasn’t changed.', e_CONTACT_LOOKALIKE: 'This address looks like {name}’s.',
  swShort: 'Swap', swTitle: 'Swap', swIntro: 'One token for another, or from one network to another. Kalyx compares LI.FI, Jupiter and Relay and checks every quote before signing: it always arrives in your account.', swFrom: 'From', swTo: 'To', swGetQuote: 'Get a quote', swQuoting: 'Finding the best quote…', swYouGet: 'You receive', swMin: 'At least {v} guaranteed', swPay: 'You pay', swRoute: 'Route', swServiceFee: 'Service fee', swKalyxFee: 'Kalyx fee', swNoFee: 'None', swSlippage: 'Price tolerance', swImpact: 'Price gap', swDuration: 'Estimated time', swApprovalNote: 'An approval of {symbol}, for the exact swap amount, will be signed first.', swImpactWarn: 'The gap between what you pay and what you receive is high ({pct}). Liquidity is low or the price is moving.', swImpactAck: 'I understand the gap and want to swap anyway', swSwapNow: 'Swap', swBridgeNow: 'Bridge', swStApproving: 'Approving…', swStApprovalWait: 'Waiting for the approval to confirm…', swStSwapping: 'Swapping…', swSent: 'Swap sent', swSentNote: 'You’ll get a notification when it confirms. Balances update after that.', swNoSource: 'No assets to swap on this account yet.', e_SWAP_TOKENS_UNAVAILABLE: 'Token list unavailable for this network. Try again.', e_SWAP_NO_SOURCE: 'This asset is no longer available on this account.', e_SWAP_BAD_TARGET: 'Unknown destination token: pick it from the list.', e_SWAP_SAME_TOKEN: 'Pick two different tokens.', e_SWAP_NO_ADDRESS: 'This account has no address on {chain}.', e_SWAP_KEEP_GAS: 'Keep at least {amount} for network fees.', e_SWAP_NEED_GAS: 'You need at least {amount} to pay network fees.', e_SWAP_NO_ROUTE: 'No route found for this swap.', e_SWAP_REFUSED: 'Quote refused by the safety check: nothing was signed.', e_SWAP_QUOTE_GONE: 'This quote has expired: request a new one.', e_SWAP_ACK_NEEDED: 'Confirm the price gap to continue.', e_SWAP_QUOTE_WORSE: 'The price dropped since the quote (minimum now {min}): nothing was signed. Request a new quote.', e_SWAP_APPROVAL_NOT_SEEN: 'The approval is confirmed but not yet visible on the network. Try again in a few seconds.', e_SWAP_AMOUNT_BELOW_MINIMUM: 'Amount too small for this route.', e_SWAP_AMOUNT_ABOVE_MAXIMUM: 'Amount too large for this route.', e_SWAP_NO_LIQUIDITY: 'Not enough liquidity for this amount.', e_SWAP_INVALID_TOKEN: 'Token not supported by the providers.', e_SWAP_INVALID_ADDRESS: 'Invalid receiving address.', e_SWAP_SLIPPAGE_TOO_HIGH: 'Price tolerance too low for this market: raise it.', e_SWAP_INSUFFICIENT_GAS: 'Not enough native token to pay network fees.', e_SWAP_INSUFFICIENT_FUNDS: 'Insufficient balance.', e_SWAP_RATE_LIMITED: 'Too many requests: try again in a moment.', e_SWAP_NETWORK: 'Swap service unreachable. Check your connection.', e_SWAP_QUOTE_EXPIRED: 'This quote has expired: request a new one.', e_SWAP_PROVIDER_UNAVAILABLE: 'Swap providers unavailable right now.',
  e_SWAP_TX_FAILED: 'The transaction didn’t go through: {reason}',
  language: 'Language', langAuto: 'Auto ({name})', faq: 'FAQ', about: 'About', privacy: 'Privacy policy', terms: 'Terms of use', legalNotice: 'Legal notice', supportTelegram: 'Support on Telegram', supportEmail: 'Email support', aboutBody: 'Kalyx Wallet is a non-custodial wallet: your keys stay encrypted on this computer. Kalyx never has access to them and can’t freeze, move or recover your funds.', aboutNoTracking: 'No ads, no telemetry, no trackers.', aboutEditor: 'Publisher', forgotPw: 'Forgot password?', rsTitle: 'Reset the extension', rsBody: 'Nobody can recover your password, not even Kalyx. To get back in, erase the extension, then restore your wallets with their recovery phrase or an encrypted backup.', rsWarn: 'Everything is erased from this computer: wallets, address book, connected sites, settings and links with your phone (its accounts stay in the app). Without a recovery phrase or backup, the funds in these wallets will be lost forever.', rsAck: 'I have the recovery phrase (or a backup) of every wallet', rsType: 'To confirm, type {word}', rsWord: 'ERASE', rsGo: 'Erase everything', faqQ1: 'Where are my keys?', faqA1: 'On this computer, in a vault encrypted with your password (scrypt, then AES-256-GCM). They’re never sent to Kalyx or to any server. Accounts linked to your phone (companion mode) keep their keys in the Kalyx app.', faqQ2: 'I forgot my password', faqA2: 'Nobody can recover it, not even Kalyx. On the lock screen, tap “{forgot}”: the extension is erased, then you restore your wallets with their recovery phrase or an encrypted backup.', faqQ3: 'How do I back up my wallet?', faqA3: 'Write your recovery phrase on paper and keep it offline ({phrase}). You can also export an encrypted backup ({backup}), which the app and the extension can restore.', faqQ4: 'Someone is asking for my recovery phrase', faqA4: 'It’s a scam. Kalyx, its support and websites will never ask for it. Only type it in Kalyx’s welcome screen, to restore a wallet.', faqQ5: 'What can a connected site do?', faqA5: 'See the address you agreed to share. Every transaction or signature opens in a Kalyx window that explains what it does: nothing is signed without your approval. To disconnect a site: {sites}.', faqQ6: 'What is a token approval?', faqA6: 'Permission for a contract to spend your tokens without a new signature. Revoke the ones you no longer use: {approvals}.', faqQ7: 'Why does the extension lock?', faqA7: 'After the inactivity delay you chose ({lock}), when your computer locks and when the browser closes. Your password is then asked again.', faqQ8: 'Which networks are supported?', faqA8: 'Ethereum-compatible (EVM) networks and Solana. Bitcoin and TON are in the Kalyx app on your phone. To show or hide a network: {networks}.',
  paranoTitle: 'Paranoid mode', paranoBody: 'Locks as soon as Chrome goes to the background, after 1 min of computer inactivity, and when Chrome pauses Kalyx (about 30 s without using it).', siteModeTitle: 'Allowed sites only', siteModeBody: 'Elsewhere, Kalyx is invisible: sites don’t even know it’s installed. Turn it on site by site from the popup.', allowedSites: 'Allowed sites ({n})', allowedSitesTitle: 'Allowed sites', allowedNone: 'No allowed sites. Open a site, then the Kalyx popup: “Turn on for this site”.', siteOff: 'Kalyx is off on {site}.', siteOn: 'Turn on for this site', siteEnabled: 'On for {site}: the page is reloading.', siteRemove: 'Remove', e_BAD_ORIGIN: 'This isn’t a website (http or https).', e_TOO_MANY_SITES: 'Limit of 300 allowed sites reached.',
  pkTitle: 'Passkey (second factor)', pkOn: 'On', pkOff: 'Off', pkIntro: 'On top of your password, your passkey (Touch ID, Windows Hello, security key) will be asked to unlock. Together they open the vault: one without the other is useless.', pkWarn: 'If you lose this passkey, you won’t be able to unlock: you’ll have to erase everything and restore with your recovery phrase.', pkAck: 'My recovery phrase is written down somewhere safe', pkEnable: 'Turn on passkey', pkDisable: 'Turn off passkey', pkEnabled: 'Passkey on: it will be asked at every unlock.', pkDisabled: 'Passkey off: your password is enough again.', pkUnlock: 'Unlock with passkey', pkPopupNote: 'This vault also needs your passkey: unlocking opens in a tab.', pkActiveNote: 'Your password, then your passkey.', pkUnsupported: 'This browser doesn’t support passkeys.', pkDoneClose: 'Unlocked. This tab is closing.', drTitle: 'Duress code', drOn: 'On', drOff: 'Off', drIntro: 'Under threat, type this code instead of your password: Kalyx opens on a decoy wallet, separate from the real one. Nothing there reveals your real wallets.', drHow: 'Next: lock, unlock with this code, then create or import the decoy wallet. Put a real small amount in it: an empty decoy convinces no one.', drCode: 'Duress code (8 characters min.)', drConfirm: 'Confirm the code', drSave: 'Save the code', drRemove: 'Remove the code', drRemoveWarn: 'The decoy wallet and all its data will be erased from this extension.', drSaved: 'Code saved.', drRemoved: 'Code removed.', drMismatch: 'The two codes don’t match.', e_PASSKEY_REQUIRED: 'Your passkey is required to unlock.', e_WRONG_PASSKEY: 'This passkey isn’t the vault’s.', e_PASSKEY_CANCELLED: 'Passkey cancelled.', e_PASSKEY_NO_PRF: 'This passkey can’t encrypt (no PRF extension). Try Touch ID, Windows Hello, Google Password Manager or a recent security key.', e_PASSKEY_FAILED: 'The passkey didn’t answer. Try again.', e_PASSKEY_EXISTS: 'A passkey is already on.', e_NO_PASSKEY: 'No passkey is on.', e_BAD_PASSKEY: 'Unreadable passkey response.', e_DURESS_SAME: 'The code must be different from your password.',
  rkTitle: 'Risk', rkLow: 'low', rkMedium: 'medium', rkHigh: 'high', rkScore: '{score}/100', rkNone: 'No risk signal found.', rkMore: '{n} more reason(s)', rkLocal: 'Computed on your computer, with no AI or server.', rk_phishingSite: 'Site reported as fraudulent.', rk_lookalike: 'This domain imitates {brand}.', rk_contractDanger: 'The target contract is reported as malicious.', rk_pageTampered: 'Tampered page: another script is posing as Kalyx or intercepting its messages.', rk_domainMismatch: 'Message meant for another site ({domain}).', rk_approveAll: 'Access to ALL your NFTs in this collection.', rk_unlimitedApproval: 'Unlimited approval: the contract will be able to spend everything, with no new signature.', rk_lossOnly: 'You lose funds and receive nothing in return.', rk_nftOrder: 'Marketplace order: the signature alone is enough to give away your NFTs or tokens.', rk_permitNoExpiry: 'Approval with no expiry date.', rk_noSimulation: 'Result not simulated: the exact effect couldn’t be checked.', rk_manyTxs: '{n} transactions at once: only the first one is described.', rk_insecureSite: 'Unencrypted site (http).', rk_firstVisit: 'Site connected less than 24 h ago.', poTitle: 'Phone only', poBody: 'No keys in this extension: it shows your accounts and sends every signature to the Kalyx app on your phone. Creating or importing a key here is refused.', poOffTitle: 'Turn off “Phone only”', poOffBody: 'Your password is required: the extension will be able to hold keys again.', poOffGo: 'Turn off', e_PHONE_ONLY: '“Phone only” mode: no key can be created or imported here. Link an account from your phone instead.', e_HAS_LOCAL_KEYS: 'Some wallets in this extension still have their keys here. Remove them first (recovery phrase written down): only phone accounts can stay.',
  grNotifTitle: '{n} approval(s) to revoke', grNotifBody: 'Past due: {list}. Revoke them in one click.', capNote: 'Above your daily limit ({remaining} left today, in your currency): confirm with your password.', e_CAP_PASSWORD: 'Daily limit exceeded ({remaining} left): password required.', grRemind: 'Reminder to revoke', grNever: 'Never', grIn1h: 'In 1 h', grIn24h: 'In 24 h', grIn7d: 'In 7 days', grTitle: 'Approval reminders', grLeftMin: '{n} min left', grLeftH: '{n} h left', grLeftD: '{n} d left', grExpired: 'Due: revoke it', grDismiss: 'Remove this reminder', grRevokeAll: 'Revoke all ({n})', grRevoking: 'Revoking…', grRevoked: '{n} revocation(s) sent.', grFailed: 'Failed: {list}.', capTitle: 'Daily limit', capOff: 'None', capRaise: 'Raise the limit', capRaiseBody: 'Raising or removing the daily limit requires your password.',
  lookTitle: 'Appearance', themeTitle: 'Theme', themeBody: 'Night by default. System follows your computer.', themeDark: 'Night', themeLight: 'Cream', themeSystem: 'System', modeTitle: 'Mode', modeBeginner: 'Beginner', modeExpert: 'Expert', modeBeginnerBody: 'Essentials first: technical details stay folded, advanced settings are tucked away.', modeExpertBody: 'Everything laid out: technical details open, score points, advanced settings visible.', soundTitle: 'Subtle sounds', soundBody: 'A soft note when a signature or a transfer goes out. Off by default.', advTitle: 'Advanced settings', advBody: 'Paranoid mode, presence on sites, phone only, duress code, allowlist, networks.', rkHelp: 'The higher the score, the more this request can cost you. If in doubt, refuse: refusing costs nothing.', apDoneSent: 'Sent', apDoneSigned: 'Signed', apMethod: 'Method', obLookTitle: 'Make it yours',
  receiveBtcNote: 'Only bitcoin, on the Bitcoin network. A bc1 address accepts nothing else.',
  recipientPhBtc: 'Bitcoin address (bc1…)', ctNoneBtc: 'No Bitcoin contacts. Add some from Settings, Address book.', ctAddressPhAll: 'EVM (0x…), Solana, Bitcoin or TON address', e_BTC_DUST: 'Too small for this Bitcoin address: at least {min} {symbol}, or the network rejects the transaction.', e_BTC_TOO_MANY_INPUTS: 'Too many small coins to gather in a single transaction. Send a smaller amount.',
  apFamilyBtc: 'Bitcoin', e_COMPANION_NO_BTC_SITES: 'Bitcoin sites aren’t served yet for a phone account: use an account from this extension.',
  receiveTonNote: 'Only assets on the TON network (TON and jettons). No comment is needed to receive here.',
  ctNoneTon: 'No TON contacts. Add some from Settings, Address book.', recipientPhTon: 'TON address (UQ… or EQ…)', memoLabel: 'Comment (optional)', memoPh: 'Required by some exchanges', feeTon: 'Fees are calculated in the next step, before anything is signed.',
  vdLow: 'Nothing worrying found', vdMedium: 'Careful: read these points before signing', vdHigh: 'Danger: refuse unless you are absolutely sure', pvUnavailableTitle: 'Preview unavailable', pvUnavailableBody: 'Kalyx couldn’t predict the exact result: this happens with some networks and contracts. Nothing leaves until you confirm. If you don’t know this site, refuse.', pvFailedTitle: 'This transaction will probably fail', pvFailedBody: 'According to the preview, the network would reject it and fees would still be charged. Safest: refuse, then try again from the site after checking the amount and your balance.', pvErrorLabel: 'Technical reason', holdKeep: 'Keep holding…', vdWhy: 'Why',
  stTitle: 'Your wallet is ready', stBody: 'Add funds to get started: by card, or from another wallet or an exchange.',
  modeNowBeginner: 'Beginner mode: the essentials, no technical details.', modeNowExpert: 'Expert mode: everything visible and adjustable.',
  obV1: 'Every signature explained and scored before you accept', obV2: 'EVM, Solana, Bitcoin and TON in one place', obV3: 'Your keys stay here, encrypted: nobody else can reach them', obLockLater: 'Auto-lock: 15 min, adjustable in Settings.',
  esNftBody: 'The ones this account receives will show up here, grouped by collection.', esActBody: 'Your transfers, receipts and swaps will show up here, day by day.', esCtBody: 'Save the addresses you use often: Kalyx warns you when an address you type looks like one of them.', esSitesBody: 'When you connect Kalyx to a site, it shows up here and you can disconnect it in one tap.', esApprBody: 'No contract can spend your tokens here: nothing to revoke.', esWlBody: 'Add the addresses you allow: any other recipient will be blocked.',
  pvPartialTitle: 'Partial preview', pvPartialBody: 'Checked on the network: the transaction would go through. Kalyx couldn’t read the exact amounts; if you don’t know this site, refuse.', rvLabel: 'Likely reason', rv_balance: 'Insufficient balance for this operation (fees included).', rv_allowance: 'Spending approval too low: the site must ask you for it first.', rv_slippage: 'The price moved: the promised minimum wouldn’t be met. Try again from the site.', rv_deadline: 'Deadline passed: the request expired. Start it again from the site.', rv_gas: 'Not enough gas set to run the transaction.', rv_denied: 'The contract refuses this operation for your account (restricted access or paused contract).',
};

export type Key = keyof Dict;

export const LANGS = ['fr', 'en', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'tr', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko'] as const;
export type Lang = (typeof LANGS)[number];
export const DICTS: Record<Lang, Partial<Dict>> = { fr, en, es, pt, de, it, nl, pl, tr, ru, ar, hi, zh, ja, ko };

/** Langue d'une étiquette BCP 47 (« pt-BR » → pt), anglais si elle n'est pas prise en charge. */
export function langOf(tag: string | undefined): Lang {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return (LANGS as readonly string[]).includes(base) ? (base as Lang) : 'en';
}

const NAV = typeof navigator !== 'undefined' ? navigator.language : undefined;

/** Clé du choix de langue : dans storage.local (source, lue par le service worker) et recopiée ici pour une lecture immédiate. */
export const LANG_KEY = 'kalyx.lang';
/** Langue choisie dans les réglages (pages de l'extension seulement : le service worker n'a pas de localStorage). */
function savedLang(): Lang | null {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null;
    return v && (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

/** Formats (nombres, dates) : ceux du navigateur s'il parle la langue affichée, sinon ceux de la langue. */
function localeFor(lang: Lang): string {
  if (NAV && langOf(NAV) === lang && (lang !== 'en' || NAV.toLowerCase().startsWith('en'))) return NAV;
  return lang === 'en' ? 'en-US' : lang;
}

/** Langue affichée : celle choisie, sinon celle du navigateur. */
export let LANG: Lang = savedLang() ?? langOf(NAV);
/** Langue choisie à la main (null : celle du navigateur). */
export let CHOSEN: Lang | null = savedLang();
export let IS_FR = LANG === 'fr';
export let LOCALE = localeFor(LANG);
export let IS_RTL = LANG === 'ar';
let dict: Dict = { ...en, ...DICTS[LANG] };

/** Change de langue (service worker : au démarrage et quand le réglage change). Une valeur inconnue rend celle du navigateur. */
export function setLang(choice: string | null | undefined): void {
  CHOSEN = choice && (LANGS as readonly string[]).includes(choice) ? (choice as Lang) : null;
  LANG = CHOSEN ?? langOf(NAV);
  IS_FR = LANG === 'fr';
  LOCALE = localeFor(LANG);
  IS_RTL = LANG === 'ar';
  dict = { ...en, ...DICTS[LANG] };
}

/** Nom de chaque langue dans sa propre langue (le sélecteur reste lisible quelle que soit la langue affichée). */
export const LANG_NAMES: Record<Lang, string> = { fr: 'Français', en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', it: 'Italiano', nl: 'Nederlands', pl: 'Polski', tr: 'Türkçe', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी', zh: '中文', ja: '日本語', ko: '한국어' };

/** Devise par défaut : l'euro dans la zone euro, le dollar ailleurs. */
const EUROZONE = new Set(['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']);
export function defaultFiat(tag: string | undefined = NAV): 'eur' | 'usd' {
  const [base, region] = (tag ?? '').split(/[-_]/);
  if (region) return EUROZONE.has(region.toUpperCase()) ? 'eur' : 'usd';
  return ['fr', 'de', 'it', 'nl'].includes((base ?? '').toLowerCase()) ? 'eur' : 'usd';
}

/** Pose la langue et le sens d'écriture sur la page (l'arabe s'écrit de droite à gauche). */
export function applyLang(doc: Document = document, live = true): void {
  doc.documentElement.lang = LANG;
  doc.documentElement.dir = IS_RTL ? 'rtl' : 'ltr';
  followLang(live);
}

/**
 * La langue enregistrée (storage.local, écrite par le service worker) est
 * recopiée dans le localStorage de la page, lu sans attendre au chargement ;
 * si elle diffère de celle affichée, la page se recharge dans la bonne langue.
 * Jamais de boucle : sans localStorage utilisable, rien ne se recharge.
 */
function followLang(live: boolean): void {
  try {
    void browser.storage.local.get(LANG_KEY).then((r) => useLang(r[LANG_KEY]), () => {});
    // « live » : la page suit un changement fait ailleurs (sauf un parcours qu'un rechargement casserait : onboarding).
    if (live)
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && LANG_KEY in changes) useLang(changes[LANG_KEY].newValue);
      });
  } catch {
    /* hors extension (tests) */
  }
}

/** Affiche la page dans cette langue (null : celle du navigateur), en la rechargeant si elle change. */
export function useLang(v: unknown): void {
  const want = typeof v === 'string' && (LANGS as readonly string[]).includes(v) ? v : null;
  if (want === CHOSEN) return;
  try {
    if (want) localStorage.setItem(LANG_KEY, want);
    else localStorage.removeItem(LANG_KEY);
  } catch {
    return;
  }
  if (savedLang() === want) location.reload();
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return fill(dict[key], vars);
}

/** Message d'une erreur renvoyée par le service worker (code), avec repli générique. */
export function errorText(code: string | undefined, params: Record<string, string> = {}): string {
  // « WRONG_FAMILY:evm » → e_WRONG_FAMILY : la famille ne change pas la phrase.
  const k = `e_${(code ?? '').split(':')[0]}` as Key;
  return k in dict ? t(k, params) : dict.e_INTERNAL;
}

/** Le code d'erreur a-t-il une phrase (dans toutes les langues, grâce au repli) ? */
export function hasErrorText(code: string | undefined): boolean {
  return !!code && `e_${code.split(':')[0]}` in dict;
}

/** Raison pour laquelle un portefeuille d'une sauvegarde n'a pas été repris. */
export function reasonText(code: string): string {
  const k = `r_${code}` as Key;
  return k in dict ? dict[k] : errorText(code);
}

/** Phrases de l'app (et propres à l'extension) dans une langue, anglais en repli. */
function appDict(lang: Lang): Record<string, string> {
  return { ...APP_TEXT.en, ...EXTRA.en, ...APP_TEXT[lang], ...EXTRA[lang] };
}
const appDicts = new Map<Lang, Record<string, string>>();
const appFor = (lang: Lang) => appDicts.get(lang) ?? (appDicts.set(lang, appDict(lang)), appDicts.get(lang)!);

/** Traducteur de la fenêtre de signature (src/domain/wc/explain) : phrases reprises de l'app. */
export function explainT(key: string, params: Record<string, string> = {}): string {
  return explainTFor(LANG)(key, params);
}

/** Même traducteur, pour une langue donnée (celle de la fenêtre qui affiche l'explication). */
export const explainTFor = (lang: string | undefined) => (key: string, params: Record<string, string> = {}): string => {
  const s = appFor(langOf(lang))[key];
  return s === undefined ? key : fill(s, params);
};

/** Traducteur des phrases d'activité (src/domain/tx/humanize). */
export function activityT(key: string, params: Record<string, string> = {}): string {
  const s = appFor(LANG)[key];
  return s === undefined ? key : fill(s, params);
}
