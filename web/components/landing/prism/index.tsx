'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Crystal3D } from '../crystal';

/*
 * Choisit le décor 3D selon la machine :
 *  - WebGL 2 disponible → le prisme three.js (scene.tsx), chargé APRÈS la page : le
 *    texte s'affiche tout de suite, la 3D arrive en fondu ;
 *  - sinon (vieux navigateur, WebGL bridé) → le cristal en raymarching, WebGL 1, sans
 *    bibliothèque ;
 *  - économiseur de données → aucun téléchargement de 3D, le cristal léger suffit.
 */
const PrismScene = dynamic(() => import('./scene'), { ssr: false, loading: () => null });

/**
 * WebGL 2 ACCÉLÉRÉ seulement : un rendu logiciel (machine virtuelle, accélération
 * désactivée) ferait tourner le verre sur le processeur — le cristal léger s'en charge.
 * Le contexte d'essai est rendu aussitôt (les navigateurs en limitent le nombre).
 */
function supportsWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    // `?prism=force` : essai sur une machine sans carte graphique (captures, vérifications).
    const force = new URLSearchParams(window.location.search).get('prism') === 'force';
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: !force });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Garde-fou : une erreur de la scène (contexte refusé, morceau de code introuvable après
 * une mise en ligne…) remontait jusqu'à la page et remplaçait TOUTE l'accueil par
 * « Application error ». Ici, elle bascule simplement sur le cristal léger.
 */
class SceneBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    delete document.documentElement.dataset.prism; // le titre de la page redevient visible
    console.warn('[prism] repli sur le cristal léger', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Prism({ title }: { title: string }) {
  const [mode, setMode] = useState<'pending' | 'prism' | 'crystal'>('pending');
  useEffect(() => {
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    setMode(!saveData && supportsWebGL2() ? 'prism' : 'crystal');
  }, []);
  if (mode === 'prism') {
    return (
      <SceneBoundary fallback={<Crystal3D />}>
        <PrismScene title={title} />
      </SceneBoundary>
    );
  }
  if (mode === 'crystal') return <Crystal3D />;
  return null;
}
