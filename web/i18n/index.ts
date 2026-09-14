import type { Locale } from './locales';
import type { Dict } from './dictionaries/fr';
import fr from './dictionaries/fr';
import en from './dictionaries/en';
import es from './dictionaries/es';
import pt from './dictionaries/pt';
import de from './dictionaries/de';
import it from './dictionaries/it';
import nl from './dictionaries/nl';
import pl from './dictionaries/pl';
import tr from './dictionaries/tr';
import ru from './dictionaries/ru';
import ar from './dictionaries/ar';
import hi from './dictionaries/hi';
import ja from './dictionaries/ja';
import ko from './dictionaries/ko';
import zh from './dictionaries/zh';

const dictionaries: Record<Locale, Dict> = { fr, en, es, pt, de, it, nl, pl, tr, ru, ar, hi, ja, ko, zh };

/** Dictionnaire d'une langue (import statique : seule la langue de la page est sérialisée vers le client). */
export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale];
}

export type { Dict };
export * from './locales';
