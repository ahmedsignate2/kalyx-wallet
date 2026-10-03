/**
 * DOCUMENTATION KALYX pour l'assistant : les textes OFFICIELS, intégrés à l'app.
 *
 * Trois sources, toutes déjà affichées ailleurs (aucune copie de plus) :
 *  - la FAQ de l'app (15 langues, `lib/faqContent.ts` + `lib/i18n.ts`) ;
 *  - les pages du site kalyxwallet.com (15 langues, `web/i18n/dictionaries`) :
 *    frais, réseaux, fonctionnement, perte et vol, assistant IA, téléchargement ;
 *  - les textes juridiques (`web/content` : confidentialité, conditions,
 *    mentions légales ; français qui fait foi, anglais pour les autres langues).
 *
 * POURQUOI INTÉGRÉ ET NON LU SUR LE SITE : une page web lue par un modèle peut
 * porter des instructions cachées ; ces textes-ci passent par le dépôt et les
 * mises à jour signées de l'app. Ils décrivent aussi la version INSTALLÉE, pas
 * la dernière du site, et marchent hors ligne, sans appel facturé.
 */
import { translate, type Lang } from './i18n';
import { FAQ_SECTIONS } from './faqContent';
import { legalFor } from './legalText';
import { getDictionary, LOCALES, type Locale } from '../web/i18n';

export interface KalyxDoc {
  /** Rubrique d'origine (« FAQ », « Site : frais », « Confidentialité »…), à citer. */
  source: string;
  title: string;
  text: string;
}

/** Pages du site utiles pour répondre (le reste est de la mise en page). */
const SITE_SECTIONS = ['networks', 'how', 'lose', 'stolen', 'ai', 'fees', 'vision', 'download'] as const;
/** Clés d'interface, pas de contenu : libellés d'accessibilité, consignes de geste… */
const UI_ONLY = /aria|^hold$|^release$|cardExample|cardLabel|^cta|href|url$/i;

function flatten(v: unknown, key = ''): string[] {
  if (typeof v === 'string') return UI_ONLY.test(key) ? [] : [v];
  if (Array.isArray(v)) return v.flatMap((x) => flatten(x, key));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => flatten(x, k));
  return [];
}

const cache = new Map<string, KalyxDoc[]>();

/** Tous les documents, dans la langue de l'utilisateur. */
export function kalyxDocs(lang: Lang): KalyxDoc[] {
  const hit = cache.get(lang);
  if (hit) return hit;
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const docs: KalyxDoc[] = [];

  for (const sec of FAQ_SECTIONS) {
    for (const it of sec.items) docs.push({ source: `${t('faq')} · ${t(sec.title)}`, title: t(it.q), text: t(it.a) });
  }

  const locale: Locale = (LOCALES as readonly string[]).includes(lang) ? (lang as Locale) : 'en';
  const dict = getDictionary(locale) as unknown as Record<string, Record<string, unknown>>;
  for (const name of SITE_SECTIONS) {
    const sec = dict[name];
    if (!sec) continue;
    const title = [sec.title, sec.titleEm].filter((x) => typeof x === 'string').join(' ') || String(sec.label ?? sec.kicker ?? name);
    docs.push({ source: `kalyxwallet.com · ${String(sec.kicker ?? sec.label ?? name)}`, title, text: flatten(sec).join('\n') });
  }

  const legal = legalFor(lang);
  const legalDocs: [string, typeof legal.privacy][] = [
    [t('legalPrivacyPolicy'), legal.privacy],
    [t('legalTermsOfService'), legal.terms],
    [lang === 'fr' ? 'Mentions légales' : 'Legal notice', legal.mentions],
  ];
  for (const [source, sections] of legalDocs) for (const s of sections) docs.push({ source, title: s.title, text: s.body });

  cache.set(lang, docs);
  return docs;
}

/*
 * Sans accents ni casse. `normalize` peut manquer sur certains moteurs
 * (Hermes selon la version) : sans lui, on compare simplement en minuscules.
 */
const norm = (s: string) => {
  const lower = s.toLowerCase();
  try {
    return lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return lower;
  }
};

/** Mots trop courants pour départager (français, anglais). */
const STOP = new Set(
  'les des une sur pour par avec dans que qui quoi quel quels quelle quelles est sont mon mes ton tes son ses vos nos votre notre comment pourquoi faire fait peut peux the and for with what how why are can you your this that from'.split(' '),
);

/**
 * Mots de la question, sans les mots vides trop courts. Séparateurs explicites
 * plutôt que `\p{L}` (propriétés Unicode : support inégal selon les moteurs) ;
 * un mot non latin (chinois, japonais…) est gardé quelle que soit sa longueur.
 */
function terms(q: string): string[] {
  const parts = norm(q).split(/[\s.,;:!?'"«»“”()[\]{}…\-–—/\\|<>*+=~`^%$#@&]+/);
  return [...new Set(parts.filter((w) => !STOP.has(w) && (w.length >= 3 || /[^\x00-\x7f]/.test(w))))];
}

/**
 * Les documents les plus pertinents pour une question (titre compté triple).
 * Aucun résultat : la liste des sujets couverts, pour que l'assistant dise ce
 * que la documentation contient au lieu d'inventer.
 */
export function searchKalyxDocs(query: string, lang: Lang, max = 3): { results: KalyxDoc[]; topics?: string[] } {
  const docs = kalyxDocs(lang);
  const words = terms(query);
  const scored = docs
    .map((d) => {
      // Le titre ET la rubrique pèsent triple : la page « frais » du site s'intitule « Comment Kalyx gagne sa vie ».
      const title = norm(`${d.source} ${d.title}`);
      const body = norm(d.text);
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 3;
        if (body.includes(w)) score += 1;
      }
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ d }) => ({ ...d, text: d.text.length > 1800 ? `${d.text.slice(0, 1800)}…` : d.text }));
  if (scored.length) return { results: scored };
  return { results: [], topics: [...new Set(docs.map((d) => d.source))] };
}

/**
 * Bloc à joindre aux consignes du modèle, pour une question donnée : les
 * extraits pertinents et les règles d'usage (citer, ne pas inventer, renvoyer
 * au support). Utilisé par les deux assistants (fenêtre IA et Copilot).
 */
export function kalyxDocsPrompt(question: string, lang: Lang): string {
  const found = question.trim() ? searchKalyxDocs(question, lang) : { results: [] as KalyxDoc[] };
  if (!found.results.length) {
    return "\n\nDOCUMENTATION KALYX : aucun extrait ne correspond à cette question. Si elle porte sur Kalyx (fonctionnement, frais, sécurité, confidentialité, conditions), ne devine pas : dis que tu n'as pas l'information et oriente vers la FAQ de l'app ou le support (Telegram @kalyxntw, support@kalyxwallet.com).";
  }
  const extracts = found.results.map((d, i) => `[${i + 1}] ${d.source} — ${d.title}\n${d.text}`).join('\n\n');
  return (
    "\n\nDOCUMENTATION KALYX OFFICIELLE (extraits pertinents, à utiliser en PRIORITÉ pour toute question sur l'app, ses frais, sa sécurité, la confidentialité, les conditions ou l'éditeur) :\n" +
    extracts +
    "\n\nRÈGLES : pour une question sur Kalyx, réponds d'après ces extraits et cite la rubrique entre crochets (ex. « [FAQ · Sécurité] »). Si les extraits ne répondent pas, dis-le clairement et propose le support (Telegram @kalyxntw, support@kalyxwallet.com) — n'invente jamais une fonctionnalité, un frais ou une règle. La recherche web ne sert qu'à l'actualité et aux protocoles externes, jamais à décrire Kalyx."
  );
}
