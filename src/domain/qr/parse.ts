/**
 * Parseur de contenu QR (pur, testable). Classe une chaîne scannée en une
 * intention typée SANS jamais l'exécuter — c'est l'UI qui décide ensuite,
 * après confirmation. Couvre : adresses nues (EVM / Solana / Bitcoin), URIs de
 * paiement (EIP-681 ethereum:, BIP-21 bitcoin:, Solana Pay solana:),
 * WalletConnect (wc:) et URLs web. Tout le reste = invalide.
 */
import { isValidEvmAddress, normalizeEvmAddress } from '../validation/address';
import { isValidBtcAddress, normalizeBtcAddress } from '../validation/btcAddress';
import { isValidSolanaAddress } from '../../crypto/solana';
import { formatAmount } from '../validation/amount';
import { extractPayLink } from './deeplink';

export type QrResult =
  | { kind: 'evm-address'; address: string }
  | { kind: 'solana-address'; address: string }
  | { kind: 'bitcoin-address'; address: string }
  | {
      kind: 'ethereum-uri';
      address: string;
      /** Montant en unités UTILISATEUR (décimal), quand il est connu ici. */
      amount?: string;
      chainId?: number;
      /** Contrat ERC-20 pour un `…/transfer` (absent = pièce native). */
      contract?: string;
      /** Montant en unités de BASE du jeton : les décimales sont inconnues ici. */
      amountRaw?: string;
    }
  | {
      kind: 'bitcoin-uri';
      address: string;
      amount?: string;
      /** `label` BIP-21 : le bénéficiaire, tel qu'il s'annonce. */
      label?: string;
      /** `message` BIP-21 : motif du paiement. */
      message?: string;
    }
  | {
      kind: 'solana-uri';
      address: string;
      amount?: string;
      splToken?: string;
      /**
       * Repères `reference` de Solana Pay.
       *
       * Des clés publiques à ajouter à la transaction en comptes NON
       * SIGNATAIRES et en lecture seule. C'est le seul moyen pour le marchand
       * de retrouver CETTE transaction parmi toutes celles qui arrivent sur son
       * adresse : sans elles, un terminal de paiement ne saura jamais que le
       * client a payé, et restera sur « en attente » alors que les fonds sont
       * partis.
       */
      reference?: string[];
      /** `label` : le bénéficiaire, tel qu'il s'annonce. Affichage seul. */
      label?: string;
      /** `message` : motif du paiement. Affichage seul. */
      message?: string;
      /** `memo` : texte à inscrire ON-CHAIN via le programme SPL Memo. */
      memo?: string;
    }
  /**
   * Requête de TRANSACTION Solana Pay : `solana:https://…`.
   *
   * L'autre moitié de la spec. Le portefeuille interroge l'URL pour obtenir le
   * nom du marchand, puis lui envoie son adresse et reçoit une transaction
   * DÉJÀ CONSTRUITE à signer. Rien à voir avec un transfert : ce qu'on signe
   * vient d'un serveur, et doit donc être décodé et montré avant signature.
   */
  | { kind: 'solana-tx-request'; url: string }
  /**
   * QR unifié qui ne propose QUE Lightning.
   *
   * L'ABNF de BIP-21 autorise une adresse VIDE (`*base58`), et c'est ce que
   * produisent les portefeuilles Lightning : `bitcoin:?lightning=lnbc…`. Il n'y
   * a alors rien à payer en chaîne. Sans ce cas, l'utilisateur recevait « QR non
   * reconnu » sur un QR parfaitement valide — et en concluait que le scanner
   * était cassé, au lieu d'apprendre que Kalyx ne gère pas Lightning.
   */
  | { kind: 'lightning-only' }
  | { kind: 'walletconnect'; uri: string }
  /**
   * Lien WalletConnect Pay : une DEMANDE côté marchand, pas une adresse.
   * Distingué des URI de paiement de chaîne, qui désignent un destinataire.
   */
  | { kind: 'wc-pay'; link: string }
  | { kind: 'url'; url: string }
  | { kind: 'invalid'; raw: string };

/** Découpe la query string `a=1&b=2` d'une URI en dictionnaire décodé. */
function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!q) return out;
  for (const pair of q.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = decodeURIComponent(pair.slice(0, eq));
    const v = decodeURIComponent(pair.slice(eq + 1));
    if (k) out[k] = v;
  }
  return out;
}

/**
 * Toutes les valeurs d'une clé répétée.
 *
 * `parseQuery` écrase les doublons — dernier gagnant — ce qui convient partout
 * SAUF pour `reference` de Solana Pay, que la spec autorise à apparaître
 * plusieurs fois. Les écraser ferait perdre les repères qui permettent au
 * marchand de retrouver le paiement.
 */
function parseQueryList(q: string, key: string): string[] {
  if (!q) return [];
  const out: string[] = [];
  for (const pair of q.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    try {
      if (decodeURIComponent(pair.slice(0, eq)) !== key) continue;
      const v = decodeURIComponent(pair.slice(eq + 1)).trim();
      if (v) out.push(v);
    } catch {
      /* paire illisible : ignorée */
    }
  }
  return out;
}

/** Sépare une URI `scheme:body` en corps + query (après le premier '?'). */
function splitUri(body: string): { path: string; query: Record<string, string>; raw: string } {
  const qi = body.indexOf('?');
  if (qi < 0) return { path: body, query: {}, raw: '' };
  const raw = body.slice(qi + 1);
  return { path: body.slice(0, qi), query: parseQuery(raw), raw };
}

/**
 * Montant décimal valide et strictement positif ?
 *
 * L'ABNF de BIP-21 est `*digit [ "." *digit ]`, où `*` signifie ZÉRO ou plus :
 * `.5` et `5.` sont donc des montants grammaticalement valides. L'expression
 * précédente exigeait un chiffre de part et d'autre du point et les rejetait en
 * silence — le montant disparaissait du lien et l'utilisateur le retapait à la
 * main, sans savoir qu'il en manquait un.
 *
 * Le point seul (`.`) reste refusé : ce n'est pas un nombre.
 */
function cleanAmount(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? t : undefined;
}

/**
 * Nombre au format EIP-681 → entier en unités de base.
 *
 * La spec autorise la notation scientifique (`value=2.014e18`), et c'est la
 * forme que produisent plusieurs générateurs de liens de paiement. Un parseur
 * limité à `\d+` les rejetait en silence : le montant disparaissait du lien et
 * l'utilisateur tapait un chiffre à la main, sans savoir qu'il en manquait un.
 *
 * On calcule en entier, jamais en flottant : `Number('2.014e18')` perd des
 * unités de base, et sur un montant en wei cette perte est de l'argent.
 */
export function parseEip681Number(v: string | undefined): bigint | undefined {
  if (!v) return undefined;
  const m = /^(\d+)(?:\.(\d+))?(?:[eE]\+?(\d+))?$/.exec(v.trim());
  if (!m) return undefined;
  const [, int, frac = '', expRaw] = m;
  const exp = expRaw ? Number(expRaw) : 0;
  if (exp > 80) return undefined; // au-delà, ce n'est plus un montant plausible
  // On décale la virgule de `exp` rangs ; s'il reste une fraction, le nombre
  // n'est pas un entier d'unités de base et on refuse plutôt que d'arrondir.
  if (frac.length > exp) return undefined;
  const digits = int + frac + '0'.repeat(exp - frac.length);
  try {
    return BigInt(digits);
  } catch {
    return undefined;
  }
}

function parseEthereumUri(body: string): QrResult {
  const { path, query } = splitUri(body);
  // path = [pay-]<address>[@chainId][/function]
  const [targetRaw, fn] = path.split('/');
  // Préfixe `pay-` : facultatif dans EIP-681, mais présent chez plusieurs
  // émetteurs de factures. Non retiré, l'adresse devenait « invalide ».
  const target = targetRaw.replace(/^pay-/i, '');
  const [addrRaw, chainRaw] = target.split('@');
  const chainId = chainRaw && /^\d+$/.test(chainRaw) ? Number(chainRaw) : undefined;

  /*
   * Transfert de token ERC-20 : `ethereum:<contrat>@<chainId>/transfer?address=<dest>&uint256=<montant>`.
   *
   * Le destinataire est dans `?address=`, et l'adresse en tête du lien est le
   * CONTRAT. L'ancienne version jetait ce contrat : on gardait le bon
   * destinataire et on perdait le jeton, donc une facture en USDC amenait sur
   * l'écran d'envoi de la pièce native. `uint256` était ignoré de même.
   *
   * `uint256` est en unités de BASE du jeton, dont les décimales ne sont pas
   * dans le lien : on le transmet brut (`amountRaw`) et la conversion se fait
   * là où les décimales sont connues. Convertir ici avec 18 par défaut
   * donnerait un montant faux d'un facteur 10^12 sur un USDC.
   */
  if (fn === 'transfer' && query.address && isValidEvmAddress(query.address)) {
    if (!isValidEvmAddress(addrRaw)) return { kind: 'invalid', raw: `ethereum:${body}` };
    const raw = parseEip681Number(query.uint256);
    return {
      kind: 'ethereum-uri',
      address: normalizeEvmAddress(query.address),
      contract: normalizeEvmAddress(addrRaw),
      amountRaw: raw !== undefined && raw > 0n ? raw.toString() : undefined,
      chainId,
    };
  }
  if (!isValidEvmAddress(addrRaw)) return { kind: 'invalid', raw: `ethereum:${body}` };

  // value = wei (EIP-681). Conversion en pièce native décimale.
  const wei = parseEip681Number(query.value);
  const amount = wei !== undefined ? cleanAmount(formatAmount(wei, 18)) : undefined;
  return { kind: 'ethereum-uri', address: normalizeEvmAddress(addrRaw), amount, chainId };
}

/** Paramètres `req-` de BIP-21 que l'on sait honorer (aucun pour l'instant). */
const KNOWN_BIP21_REQ = new Set<string>();

function parseBitcoinUri(body: string): QrResult {
  const { path, query } = splitUri(body);

  /*
   * Adresse vide : la spec l'autorise, et c'est la forme d'un QR unifié dont
   * seule l'offre Lightning est renseignée. On le DIT, au lieu de répondre
   * « non reconnu » à un QR valide.
   */
  if (path.trim() === '' && (query.lightning || query.lno)) return { kind: 'lightning-only' };

  if (!isValidBtcAddress(path)) return { kind: 'invalid', raw: `bitcoin:${body}` };

  /*
   * Paramètre `req-` inconnu → URI INVALIDE, c'est la règle de BIP-21 et elle
   * existe pour une raison : `req-` signale une exigence sans laquelle le
   * paiement n'est pas celui qui a été demandé. Ignorer un `req-` inconnu, ce
   * que font la plupart des portefeuilles, revient à payer autre chose que ce
   * que le bénéficiaire a formulé — sans le dire à personne.
   */
  /*
   * Comparaison SENSIBLE À LA CASSE. La spec est explicite : « le reste de
   * l'URI est sensible à la casse, y compris les clés de requête », et l'ABNF
   * fixe le préfixe littéral `req-`. Mettre la clé en minuscules faisait donc
   * traiter `REQ-truc` comme une exigence inconnue et REJETER une URI que la
   * spec dit valide — un paiement refusé pour rien.
   */
  const unknownReq = Object.keys(query).find((k) => k.startsWith('req-') && !KNOWN_BIP21_REQ.has(k));
  if (unknownReq) return { kind: 'invalid', raw: `bitcoin:${body}` };

  /*
   * Normalisation. Le bech32 est insensible à la casse et les générateurs de QR
   * encodent en MAJUSCULES — c'est la forme recommandée, elle tient dans un QR
   * plus petit, et le signeur attend la forme minuscule.
   *
   * Mais `normalizeBtcAddress` et pas `toLowerCase()` : le base58 d'une adresse
   * `1…` ou `3…` est SENSIBLE À LA CASSE, et la mettre en minuscules la détruit.
   * C'est le bug qu'introduisait la version précédente de cette ligne, invisible
   * tant que les adresses héritées étaient refusées en amont.
   */
  return {
    kind: 'bitcoin-uri',
    address: normalizeBtcAddress(path),
    amount: cleanAmount(query.amount),
    label: query.label || undefined,
    message: query.message || undefined,
  };
}

function parseSolanaUri(body: string): QrResult {
  /*
   * REQUÊTE DE TRANSACTION : le corps est une URL https, pas une adresse. La
   * tester d'abord, sinon `isValidSolanaAddress` échoue et l'utilisateur reçoit
   * « QR non reconnu » sur la moitié de la spec Solana Pay.
   */
  const link = txRequestLink(body);
  if (link !== null) {
    return isSafeTxRequestUrl(link)
      ? { kind: 'solana-tx-request', url: link }
      : { kind: 'invalid', raw: `solana:${body}` };
  }

  const { path, query, raw } = splitUri(body);
  if (!isValidSolanaAddress(path)) return { kind: 'invalid', raw: `solana:${body}` };
  const splToken = query['spl-token'];

  // Répétable par la spec : on prend TOUTES les occurrences, et on ne garde que
  // les clés publiques valides — une valeur fautive ne doit pas devenir un compte.
  const reference = parseQueryList(raw, 'reference').filter((r) => isValidSolanaAddress(r));

  return {
    kind: 'solana-uri',
    address: path,
    amount: cleanAmount(query.amount),
    splToken: splToken && isValidSolanaAddress(splToken) ? splToken : undefined,
    reference: reference.length > 0 ? reference : undefined,
    label: query.label || undefined,
    message: query.message || undefined,
    memo: query.memo || undefined,
  };
}

/**
 * Lien d'une requête de transaction, décodé si besoin ; `null` si le corps n'en
 * est pas une.
 *
 * LA SPEC LE DIT : le lien est « conditionnellement encodé en URL ». Quand il
 * porte ses propres paramètres — et c'est le cas de tout terminal, qui passe
 * `recipient`, `amount`, `spl-token`, `reference` à son propre point d'entrée —
 * il DOIT être encodé, sans quoi ses `&` se confondraient avec ceux de Solana
 * Pay. Un QR de caisse ressemble donc à
 * `solana:https%3A%2F%2Fexemple.com%2Fapi%3Frecipient%3D…`.
 *
 * On ne testait que la forme nue, et toute caisse réelle recevait « QR non
 * reconnu » : nous n'acceptions en pratique que le cas que la spec décrit comme
 * l'exception.
 *
 * Le décodage ne s'applique QU'À CE LIEN, et une seule fois. L'appliquer au
 * corps entier avant de le découper — ce qui paraît plus simple — casserait les
 * requêtes de transfert : un `%26` à l'intérieur d'une valeur deviendrait un
 * vrai `&` et couperait un paramètre en deux. `parseQuery` décode déjà chaque
 * valeur séparément, ce qui est la seule façon correcte de le faire.
 */
function txRequestLink(body: string): string | null {
  // Lien nu : la spec prévoit cette forme quand il n'a pas de paramètres.
  if (/^https:\/\//i.test(body)) return body;
  // Forme encodée. `i` couvre aussi les chiffres hexadécimaux (%3a, %2F…).
  if (!/^https%3a%2f%2f/i.test(body)) return null;
  try {
    const decoded = decodeURIComponent(body);
    /*
     * On ne décode qu'une fois. Un corps doublement encodé sort d'ici en `null`
     * plutôt que de nous faire boucler sur des décodages successifs, dont on ne
     * saurait plus dire ce qu'ils produisent.
     */
    return /^https:\/\//i.test(decoded) ? decoded : null;
  } catch {
    // Séquence de pourcentage invalide : ce n'est pas un lien exploitable.
    return null;
  }
}

/**
 * L'URL d'une requête de transaction est-elle acceptable ?
 *
 * `https` seulement, hôte qualifié, et pas de cible locale. On s'apprête à
 * envoyer l'adresse de l'utilisateur à ce serveur puis à signer ce qu'il
 * renvoie : une URL en clair exposerait l'adresse en chemin, et une cible
 * locale pointerait vers le réseau de l'appareil lui-même.
 */
function isSafeTxRequestUrl(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  const host = url.slice('https://'.length).split(/[/?#]/)[0].toLowerCase();
  if (!host || !host.includes('.') || host.endsWith('.')) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  // Adresses IP littérales : une requête de paiement légitime porte un nom.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return false;
  return true;
}

/** Analyse une chaîne scannée en intention typée. Jamais d'exécution ici. */
export function parseQr(raw: string): QrResult {
  const s = (raw ?? '').trim();
  if (!s) return { kind: 'invalid', raw: '' };

  const lower = s.toLowerCase();

  // WalletConnect (case-sensitive : on garde la chaîne d'origine).
  if (lower.startsWith('wc:')) return { kind: 'walletconnect', uri: s };

  /*
   * Lien de paiement marchand. Testé AVANT la branche « URL web » : sans cela
   * il finirait dans le navigateur dApps, où il ne servirait à rien.
   */
  const payLink = extractPayLink(s);
  if (payLink) return { kind: 'wc-pay', link: payLink };

  // URIs de paiement par schéma.
  if (lower.startsWith('ethereum:')) return parseEthereumUri(s.slice('ethereum:'.length));
  if (lower.startsWith('bitcoin:')) return parseBitcoinUri(s.slice('bitcoin:'.length));
  if (lower.startsWith('solana:')) return parseSolanaUri(s.slice('solana:'.length));

  // Adresses nues (ordre : EVM sans ambiguïté, puis Bitcoin, puis Solana).
  if (isValidEvmAddress(s)) return { kind: 'evm-address', address: normalizeEvmAddress(s) };
  // Cf. parseBitcoinUri : minuscules pour le bech32 seulement, le base58 est
  // sensible à la casse.
  if (isValidBtcAddress(s)) return { kind: 'bitcoin-address', address: normalizeBtcAddress(s) };
  if (isValidSolanaAddress(s)) return { kind: 'solana-address', address: s };

  // URL web (à confirmer avant ouverture dans le navigateur dApps).
  if (/^https?:\/\/\S+$/i.test(s)) return { kind: 'url', url: s };

  return { kind: 'invalid', raw: s };
}
