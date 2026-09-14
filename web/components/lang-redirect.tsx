'use client';

import { useEffect } from 'react';
import { isLocale, pickLocale, STORAGE_KEY } from '../i18n';

/** Choix mémorisé (sélecteur de langue) > langues du navigateur > français. */
/** `path` : suite du chemin après la langue (ex. 'privacy/'). */
export function LangRedirect({ path = '' }: { path?: string }) {
  useEffect(() => {
    let target: string | null = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && isLocale(saved)) target = saved;
    } catch {}
    if (!target) target = pickLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
    window.location.replace(`/${target}/${path}${window.location.hash}`);
  }, [path]);
  return null;
}
