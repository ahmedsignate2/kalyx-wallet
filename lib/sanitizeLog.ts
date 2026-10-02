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

/**
 * Masque toute suite d'au moins `MIN_BIP39_RUN` mots appartenant à la wordlist
 * BIP-39. On découpe sur les séparateurs plutôt qu'avec une expression
 * régulière : une seed peut être séparée par des espaces, des virgules, des
 * retours à la ligne ou des guillemets JSON, et un seul motif ne les couvre pas.
 *
 * Un mot HORS liste isolé (faute de frappe, mot oublié) ne coupe pas la suite :
 * sinon deux moitiés de moins de 8 mots passaient, soit la phrase moins un mot
 * — trivial à retrouver. Deux mots hors liste d'affilée la coupent, et la suite
 * doit rester à 80 % de mots BIP-39 : une phrase anglaise ordinaire, qui en
 * alterne quelques-uns avec d'autres mots, n'est pas masquée.
 */
export function maskBip39Runs(input: string): string {
  const parts = input.split(/([^a-zA-Z]+)/); // garde les séparateurs
  const words: { i: number; bip: boolean }[] = [];
  parts.forEach((w, i) => {
    if (w && /^[a-zA-Z]+$/.test(w)) words.push({ i, bip: BIP39_SET.has(w.toLowerCase()) });
  });
  const out = [...parts];
  const mask = (seg: { i: number; bip: boolean }[]) => {
    // Bords hors liste retirés : on ne masque que de la phrase.
    while (seg.length && !seg[0].bip) seg.shift();
    while (seg.length && !seg[seg.length - 1].bip) seg.pop();
    const bip = seg.filter((w) => w.bip).length;
    if (bip < MIN_BIP39_RUN || bip / seg.length < 0.8) return;
    const first = seg[0].i;
    const last = seg[seg.length - 1].i;
    for (let k = first; k <= last; k++) out[k] = '';
    out[first] = '[PHRASE_RÉCUPÉRATION_MASQUÉE]';
  };
  let seg: { i: number; bip: boolean }[] = [];
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (!w.bip && seg.length && !seg[seg.length - 1].bip) {
      // Deux hors liste d'affilée : la suite s'arrête là.
      mask(seg);
      seg = [];
    }
    seg.push(w);
  }
  mask(seg);
  return out.join('');
}

/** Noms de champs dont la VALEUR est secrète. */
const SENSITIVE_KEYS = 'password|passphrase|secret|private[_-]?key|mnemonic|seed|phrase|words|recovery|backup|pin|api[_-]?key|authorization|bearer|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token';

/**
 * Valeur d'un champ sensible masquée EN ENTIER, forme d'origine gardée :
 * `"pin":"1234"` → `"pin":"[MASQUÉ]"` (le JSON reste lisible),
 * `Authorization: Bearer sk-…` → `Authorization: [MASQUÉ]`. Seul le premier
 * mot était masqué auparavant : « Bearer » disparaissait, le jeton restait.
 */
export function maskSensitiveFields(input: string): string {
  const re = new RegExp(
    `((?:${SENSITIVE_KEYS})["']?\\s*[:=]\\s*)(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)'|((?:bearer\\s+)?[^"',\\s}\\]]+))`,
    'gi',
  );
  return input
    .replace(re, (_m, pre: string, dq?: string, sq?: string) =>
      dq !== undefined ? `${pre}"[MASQUÉ]"` : sq !== undefined ? `${pre}'[MASQUÉ]'` : `${pre}[MASQUÉ]`,
    )
    .replace(/\bbearer\s+(?!\[MASQUÉ\])[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [MASQUÉ]');
}

/** URL : paramètres et fragment retirés (codes OAuth, jetons d'accès, sessions). */
export function stripUrlSecrets(input: string): string {
  return input.replace(/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1?[…]');
}

export const sanitizeLog = (raw: string): string => {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw;

  // 1. Phrase de récupération : d'abord, c'est le secret le plus grave.
  clean = maskBip39Runs(clean);

  // 2. Clés privées hexadécimales (64 chars hexadécimaux avec ou sans 0x)
  clean = clean.replace(/\b(0x)?[a-fA-F0-9]{64}\b/g, '[CLÉ_PRIVÉE_MASQUÉE]');

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
