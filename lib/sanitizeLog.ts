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
 */
function maskBip39Runs(input: string): string {
  const parts = input.split(/([^a-zA-Z]+)/); // garde les séparateurs
  let run: number[] = [];
  const flush = (out: string[]) => {
    if (run.length >= MIN_BIP39_RUN) {
      for (const i of run) out[i] = '';
      out[run[0]] = '[PHRASE_RÉCUPÉRATION_MASQUÉE]';
      // Les séparateurs internes sont neutralisés pour ne pas laisser « , , , ».
      for (let k = run[0] + 1; k < run[run.length - 1]; k++) out[k] = '';
    }
    run = [];
  };
  const out = [...parts];
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (!w) continue;
    if (/^[a-zA-Z]+$/.test(w)) {
      if (BIP39_SET.has(w.toLowerCase())) run.push(i);
      else flush(out);
    }
    // Un séparateur ne rompt pas la suite : espaces, virgules, sauts de ligne
    // et guillemets font tous partie des formes d'une seed recopiée.
  }
  flush(out);
  return out.join('');
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
  clean = clean.replace(
    /(?:password|passphrase|secret|private[_-]?key|mnemonic|seed|phrase|words|recovery|backup|pin|api[_-]?key|authorization|bearer)["']?\s*[:=]\s*["']?[^"',\s}\]]+/gi,
    (match) => `${match.split(/["']?\s*[:=]/)[0].replace(/["']$/, '')}=[MASQUÉ]`,
  );

  // 7. Adresses EVM complètes : raccourcies, pas masquées — une adresse est
  //    publique, et son début/fin reste utile au diagnostic.
  clean = clean.replace(/\b(0x[a-fA-F0-9]{40})\b/g, (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`);

  // 8. Adresses Solana / Base58 (32 à 44 chars)
  clean = clean.replace(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g, (addr) => `${addr.slice(0, 4)}...${addr.slice(-4)}`);

  // 9. Adresses Bitcoin (bech32 et hérité)
  clean = clean.replace(/\b((?:bc1|tb1)[a-z0-9]{20,60})\b/g, (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`);

  return clean;
};
