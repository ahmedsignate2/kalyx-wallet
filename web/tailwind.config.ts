import type { Config } from 'tailwindcss';

/**
 * KALYX — tokens du site, dérivés de `ui/tokens.ts` (source de vérité, thème sombre).
 * Noms de la bible design (docs/DESIGN.md §2). Si une valeur n'est pas ici, on
 * l'ajoute ici avant de l'utiliser dans un composant : aucun hex en dur.
 *
 * Règles : une seule chose brille (le halo) · aucun dégradé décoratif · pas de
 * violet, bleu roi, orange, vert acide · aucun label en majuscules.
 * Ombre : tolérée UNIQUEMENT pour mettre en scène le mockup (objet physique),
 * teintée Encre + halo — jamais un `shadow-xl` gris par défaut.
 */
const config: Config = {
  content: ['./components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        encre: '#06070D', // fond
        nuit: '#0E1019', // conteneurs
        orbite: '#161926', // cartes, inputs
        crepuscule: '#1F2333', // hover, pressé
        trait: 'rgba(255, 255, 255, 0.07)', // bordures
        lueur: '#F2F4FA', // texte principal
        brume: '#9499AB', // texte secondaire
        cendre: '#5D6275', // texte tertiaire
        lumiere: '#F4F6FF', // bouton principal
        up: '#3CD98A',
        down: '#FF6363',
        warning: '#FFB547',
        danger: '#FF4D5E',
      },
      fontFamily: {
        sans: ['var(--font-general-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        chip: '8px',
        input: '12px',
        button: '18px',
        container: '22px',
        sheet: '28px',
      },
      maxWidth: {
        page: '72rem',
      },
      boxShadow: {
        // Ombre du mockup : Encre profonde + lueur froide du halo (§ ombres ci-dessus).
        mockup: '0 40px 90px -30px rgba(3, 6, 20, 0.75), 0 0 80px -24px rgba(207, 227, 255, 0.14)',
      },
      transitionTimingFunction: {
        // Équivalent CSS du ressort « Doux » (26/120) : sortie longue, sans rebond.
        doux: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        // Respiration du halo (durations.haloBreath = 6 s).
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
      },
      animation: {
        breathe: 'breathe 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
