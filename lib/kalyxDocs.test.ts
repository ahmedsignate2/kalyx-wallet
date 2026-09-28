jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'fr', languageTag: 'fr-FR', textDirection: 'ltr' }]) }));
jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { kalyxDocs, kalyxDocsPrompt, searchKalyxDocs } from './kalyxDocs';

describe('Documentation Kalyx de l’assistant', () => {
  it('rassemble la FAQ, le site et les textes juridiques, dans la langue', () => {
    const fr = kalyxDocs('fr' as never);
    const sources = new Set(fr.map((d) => d.source.split(' · ')[0]));
    expect(fr.length).toBeGreaterThan(40);
    expect([...sources].some((s) => s.startsWith('kalyxwallet.com'))).toBe(true);
    expect(fr.some((d) => /SIREN/.test(d.text))).toBe(true); // mentions légales
    expect(kalyxDocs('ko' as never).some((d) => /[가-힣]/.test(d.title))).toBe(true); // FAQ en coréen
  });

  it('trouve les frais de swap, la mention de l’éditeur, et répond en anglais', () => {
    expect(searchKalyxDocs('quels sont les frais sur un swap LI.FI ?', 'fr' as never).results[0].text).toMatch(/0,3 %/);
    expect(searchKalyxDocs('SIREN de l’éditeur', 'fr' as never).results.some((d) => /130 046 865/.test(d.text))).toBe(true);
    expect(searchKalyxDocs('who is the publisher and where is the site hosted', 'en' as never).results.some((d) => /Cloudflare/.test(d.text))).toBe(true);
  });

  it('question hors sujet : aucun extrait, et consigne de ne pas inventer', () => {
    const r = searchKalyxDocs('zzzqqq xxyyzz', 'fr' as never);
    expect(r.results).toEqual([]);
    expect(r.topics?.length).toBeGreaterThan(3);
    expect(kalyxDocsPrompt('zzzqqq xxyyzz', 'fr' as never)).toMatch(/ne devine pas/);
    expect(kalyxDocsPrompt('frais swap', 'fr' as never)).toMatch(/cite la rubrique/);
  });
});
