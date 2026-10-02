/**
 * Filtre d'assainissement automatique (Zéro secret).
 *
 * Nettoie toute chaîne avant écriture dans le tampon de logs techniques. Ces
 * logs partent dans l'assistant IA et dans les tickets envoyés au support : ce
 * fichier est la dernière barrière avant qu'un secret quitte l'appareil.
 *
 * FAILLE CORRIGÉE — une phrase de récupération BRUTE traversait ce filtre
 * intégralement en clair. Les mots d'une seed ne ressemblent à rien de
 * suspect : ce sont douze mots anglais ordinaires. Aucune des règles
 * précédentes ne les voyait, ni en texte libre (« Erreur de dérivation :
 * abandon ability able… ») ni en JSON, la clé `phrase` n'étant pas dans la
 * liste surveillée — seuls `mnemonic` et `seed` l'étaient.
 *
 * L'ordre des règles compte : on masque les SECRETS avant de raccourcir les
 * adresses, sinon un raccourcissement pourrait casser un motif de secret et le
 * laisser passer.
 */
import { wordlist } from '@scure/bip39/wordlists/english';

const BIP39_SET = new Set(wordlist);

/**
 * Nombre de mots BIP-39 consécutifs à partir duquel on masque.
 *
 * Huit et non douze : une seed peut être tronquée, coupée par un retour à la
 * ligne ou entourée de ponctuation, et il vaut mieux masquer huit mots anodins
 * par excès que laisser passer la moitié d'une phrase. « able about above » (3)
 * arrive par hasard dans une phrase anglaise ; huit d'affilée, jamais.
 */
const MIN_BIP39_RUN = 8;

/** Mot à une faute près d'un mot BIP-39 (lettre en trop, en moins ou changée). */
function nearBip39(w: string): boolean {
  const x = w.toLowerCase();
  // 4 lettres au moins : « to », « the », « and »… sont à une lettre d'un mot BIP-39 sans en être une faute.
  if (x.length < 4 || x.length > 9) return false;
  for (const b of BIP39_SET) {
    if (Math.abs(b.length - x.length) > 1) continue;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < b.length && j < x.length && edits <= 1) {
      if (b[i] === x[j]) { i++; j++; continue; }
      edits++;
      if (b.length > x.length) i++;
      else if (b.length < x.length) j++;
      else { i++; j++; }
    }
    edits += b.length - i + (x.length - j);
    if (edits <= 1) return true;
  }
  return false;
}

/**
 * Masque toute suite d'au moins `MIN_BIP39_RUN` mots appartenant à la wordlist
 * BIP-39. On découpe sur les séparateurs plutôt qu'avec une expression
 * régulière : une seed peut être séparée par des espaces, des virgules, des
 * retours à la ligne ou des guillemets JSON, et un seul motif ne les couvre pas.
 *
 * Tolérances et limites :
 *  - un mot hors liste À UNE FAUTE PRÈS d'un mot BIP-39 (« absnt », 4 lettres
 *    au moins) ne coupe pas la suite — sinon la phrase passait moins un mot,
 *    trivial à retrouver ; la suite reste à 85 % de mots de la liste ;
 *  - tout autre mot hors liste la coupe, et un séparateur porteur de « : » ou
 *    « = » aussi (frontière clé/valeur : une seed n'en contient jamais) — le
 *    contexte voisin et les clés JSON ne sont pas avalés.
 */
export function maskBip39Runs(input: string): string {
  const parts = input.split(/([^a-zA-Z]+)/); // garde les séparateurs
  const out = [...parts];
  let seg: { i: number; bip: boolean }[] = [];
  const mask = () => {
    const run = seg;
    seg = [];
    while (run.length && !run[0].bip) run.shift();
    while (run.length && !run[run.length - 1].bip) run.pop();
    const bip = run.filter((w) => w.bip).length;
    if (bip < MIN_BIP39_RUN || bip / run.length < 0.85) return;
    const first = run[0].i;
    const last = run[run.length - 1].i;
    for (let k = first; k <= last; k++) out[k] = '';
    out[first] = '[PHRASE_RÉCUPÉRATION_MASQUÉE]';
  };
  for (let k = 0; k < parts.length; k++) {
    const w = parts[k];
    if (!w) continue;
    if (!/^[a-zA-Z]+$/.test(w)) {
      if (/[:=]/.test(w)) mask();
      continue;
    }
    if (BIP39_SET.has(w.toLowerCase())) seg.push({ i: k, bip: true });
    else if (seg.length && seg[seg.length - 1].bip && nearBip39(w)) seg.push({ i: k, bip: false });
    else mask();
  }
  mask();
  return out.join('');
}

/** Noms de champs dont la VALEUR est secrète (aussi au sein d'un nom : `secretKey`, `pinCode`). */
const SENSITIVE_KEYS = 'password|passphrase|secret|private[_-]?key|mnemonic|seed|phrase|words|recovery|backup|pin|api[_-]?key|authorization|bearer|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token';

/**
 * Valeur d'un champ sensible masquée EN ENTIER, forme d'origine gardée :
 * `"pin":"1234"` → `"pin":"[MASQUÉ]"` (le JSON reste lisible), JSON échappé
 * compris ; `Authorization: Basic …`, `password: correct horse battery` →
 * jusqu'à la fin de la valeur ; `"seed":[12,34]` et `{…}` → en bloc.
 * Idempotent : relancé sur son propre résultat, il ne change plus rien.
 */
export function maskSensitiveFields(input: string): string {
  const key = `[A-Za-z_-]*(?:${SENSITIVE_KEYS})[A-Za-z_-]*`;
  const re = new RegExp(
    `(${key}\\\\?["']?\\s*[:=]\\s*)(?:(\\\\?)"(.*?)\\2"|'([^'\\n]*)'|(\\[[^\\]\\n]*\\]|\\{[^}\\n]*\\}|[^"'\\n,;}\\]]+))`,
    'gi',
  );
  return input
    .replace(re, (_m, pre: string, bs: string | undefined, dq?: string, sq?: string, bare?: string) => {
      if (dq !== undefined) return `${pre}${bs ?? ''}"[MASQUÉ]${bs ?? ''}"`;
      if (sq !== undefined) return `${pre}'[MASQUÉ]'`;
      // Tableau ou objet sous une clé JSON (`"seed":[12,…]`) : chaîne, pour que le JSON reste valide.
      if (bare && /^[[{]/.test(bare) && bare !== '[MASQUÉ]' && pre.includes('"')) return `${pre}"[MASQUÉ]"`;
      return `${pre}[MASQUÉ]`;
    })
    .replace(/\bbearer\s+(?!\[MASQUÉ\])[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [MASQUÉ]');
}

/**
 * URL : ce qui peut porter un secret est retiré — identifiants (`user:mot@`),
 * paramètres, fragment, et tout segment de chemin long et opaque (clé d'API
 * d'un RPC : `/v2/AbCd…`). L'hôte et le début du chemin restent pour le diagnostic.
 */
export function stripUrlSecrets(input: string): string {
  return input.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (url) => {
    let u = url.replace(/^(https?:\/\/)[^/@\s]*@/i, '$1[…]@');
    u = u.replace(/[?#].*$/, (m) => (m.length > 1 ? '?[…]' : m));
    return u.replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$|\?)/g, '/[…]');
  });
}

/** Secrets HEXADÉCIMAUX : clé 32 octets (64) et clé/graine 64 octets (128). */
export const HEX_SECRET_RE = /\b(?:0x)?(?:[a-fA-F0-9]{128}|[a-fA-F0-9]{64})\b/g;

export const sanitizeLog = (raw: string): string => {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw;

  // 1. Phrase de récupération : d'abord, c'est le secret le plus grave.
  clean = maskBip39Runs(clean);

  // 2. Clés privées hexadécimales (64 chars hexadécimaux avec ou sans 0x)
  clean = clean.replace(HEX_SECRET_RE, '[CLÉ_PRIVÉE_MASQUÉE]');

  // 3. Clés étendues BIP-32 (xprv/yprv/zprv) : elles dérivent TOUT le wallet.
  clean = clean.replace(/\b[xyz]prv[1-9A-HJ-NP-Za-km-z]{50,120}\b/g, '[CLÉ_ÉTENDUE_MASQUÉE]');

  // 4. Clés privées au format WIF (base58, 51-52 car., préfixe 5/K/L ou c en test).
  clean = clean.replace(/\b[5KLc][1-9A-HJ-NP-Za-km-z]{50,51}\b/g, '[CLÉ_WIF_MASQUÉE]');

  // 5. Clés privées Solana base58 (environ 80 à 90 caractères Base58)
  clean = clean.replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, '[CLÉ_SOL_MASQUÉE]');

  /*
   * 6. Paramètres sensibles par leur NOM.
   *
   * Deux corrections ici. `phrase`, `words`, `recovery`, `backup`, `pin` et
   * `passphrase` ont été ajoutés : seuls `mnemonic` et `seed` étaient
   * surveillés, alors que le code du projet nomme couramment ce champ `phrase`
   * (cf. revealPhrase, draftMnemonic).
   *
   * Et surtout, la règle acceptait `pin: 123` mais PAS `"pin":"123"` : elle
   * n'autorisait aucun guillemet entre le nom de la clé et le deux-points. Or
   * les logs sont massivement du JSON stringifié. Même `"mnemonic":"…"` passait
   * donc à travers cette règle — il n'était masqué que par hasard, quand le
   * détecteur de phrase BIP-39 le rattrapait.
   */
  clean = maskSensitiveFields(clean);

  // 6 bis. URL : la requête et le fragment peuvent porter un jeton (OAuth, session).
  clean = stripUrlSecrets(clean);

  // 7. Adresses EVM complètes : raccourcies, pas masquées — une adresse est
  //    publique, et son début/fin reste utile au diagnostic.
  clean = clean.replace(/\b(0x[a-fA-F0-9]{40})\b/g, (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`);

  // 8. Adresses Solana / Base58 (32 à 44 chars)
  clean = clean.replace(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g, (addr) => `${addr.slice(0, 4)}...${addr.slice(-4)}`);

  // 9. Adresses Bitcoin (bech32 et hérité)
  clean = clean.replace(/\b((?:bc1|tb1)[a-z0-9]{20,60})\b/g, (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`);

  return clean;
};
