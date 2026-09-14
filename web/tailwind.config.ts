import type { Config } from 'tailwindcss';

/**
 * Identité éditoriale Kalyx : encre profonde, papier chaud, un seul accent (sauge).
 * Les valeurs sont aussi exposées en variables CSS dans app/globals.css.
 */
const config: Config = {
  content: ['./components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#080a09', 2: '#101413', 3: '#171c19' },
        paper: '#f3efe6',
        sage: '#8fad9a',
        mist: '#9aa097',
        bone: '#e8e2d4',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
      },
      maxWidth: {
        page: '76rem',
      },
      boxShadow: {
        phone: '0 28px 80px -24px rgba(0, 0, 0, 0.7)',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
