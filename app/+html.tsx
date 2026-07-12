/**
 * Shell HTML de la version Web (expo-router).
 * Rôle : fond sombre dès le premier paint (pas de flash blanc), reset scroll RN,
 * et racine en flex pour que l'app remplisse la hauteur. Le CENTRAGE horizontal
 * de la colonne se fait dans app/_layout.tsx (cadre max-width sur web).
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const css = `
html, body, #root { height: 100%; }
body { margin: 0; background-color: #07090F; overscroll-behavior: none;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
#root { display: flex; }
/* Curseur pointeur sur les éléments interactifs (react-native-web ne le met pas partout). */
[role="button"], [role="link"], a, button, [tabindex] { cursor: pointer; }
/* Barre de défilement discrète, cohérente avec le thème sombre. */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: #2A2F3A; border-radius: 8px; }
::-webkit-scrollbar-thumb:hover { background: #3A4152; }
::-webkit-scrollbar-track { background: transparent; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
