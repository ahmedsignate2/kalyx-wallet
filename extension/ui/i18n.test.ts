/**
 * Les 15 langues : aucune phrase manquante, aucun {nom} perdu ou inventé, et
 * les phrases reprises de l'app (explication, activité) présentes partout.
 */
import { describe, expect, it } from 'vitest';
import { DICTS, LANGS, LANG_NAMES, defaultFiat, explainTFor, langOf, setLang, t } from './i18n';
import * as i18n from './i18n';
import { APP_TEXT } from './appText';
import { EXTRA } from './explainText';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('traductions', () => {
  const en = DICTS.en as Record<string, string>;
  for (const lang of LANGS) {
    it(`${lang} : toutes les phrases, mêmes {variables}`, () => {
      const d = DICTS[lang] as Record<string, string>;
      expect(Object.keys(d).filter((k) => !(k in en))).toEqual([]);
      expect(Object.keys(en).filter((k) => !(k in d))).toEqual([]);
      for (const k of Object.keys(en)) {
        expect(typeof d[k] === 'string' && d[k].trim().length > 0, `${lang}.${k} vide`).toBe(true);
        expect(vars(d[k]), `${lang}.${k}`).toBe(vars(en[k]));
      }
    });
    it(`${lang} : phrases de l'app et de la fenêtre de signature`, () => {
      const app = { ...APP_TEXT[lang], ...EXTRA[lang] };
      for (const k of Object.keys({ ...APP_TEXT.en, ...EXTRA.en })) {
        expect(typeof app[k], `${lang}.${k}`).toBe('string');
        expect(vars(app[k]), `${lang}.${k}`).toBe(vars(APP_TEXT.en[k] ?? EXTRA.en[k]));
      }
    });
  }

  it('langue et repli', () => {
    expect(langOf('pt-BR')).toBe('pt');
    expect(langOf('zh_CN')).toBe('zh');
    expect(langOf('sv-SE')).toBe('en');
    expect(langOf(undefined)).toBe('en');
    expect(explainTFor('ja-JP')('exManyTxs', { n: '3' })).toContain('3');
    expect(explainTFor('xx')('exManyTxs', { n: '2' })).toMatch(/^2 transactions requested/);
    expect(explainTFor('fr')('cle-inconnue')).toBe('cle-inconnue');
  });

  it('devise par défaut', () => {
    expect(defaultFiat('fr-FR')).toBe('eur');
    expect(defaultFiat('fr-CA')).toBe('usd');
    expect(defaultFiat('de')).toBe('eur');
    expect(defaultFiat('en-US')).toBe('usd');
    expect(defaultFiat('pt-BR')).toBe('usd');
    expect(defaultFiat(undefined)).toBe('usd');
  });

  it('choisir une langue : tout suit (phrases, formats, sens) ; inconnue = celle du navigateur', () => {
    const before = i18n.LANG;
    setLang('ar');
    expect(i18n.LANG).toBe('ar');
    expect(i18n.CHOSEN).toBe('ar');
    expect(i18n.IS_RTL).toBe(true);
    expect(t('faq')).toBe((DICTS.ar as Record<string, string>).faq);
    setLang('de');
    expect(i18n.LOCALE.startsWith('de')).toBe(true);
    expect(t('rsWord')).toBe('LÖSCHEN');
    setLang('klingon');
    expect(i18n.CHOSEN).toBeNull();
    expect(i18n.LANG).toBe(before);
    expect(Object.keys(LANG_NAMES).sort()).toEqual([...LANGS].sort());
  });

});
