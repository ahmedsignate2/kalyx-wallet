import type { Config } from 'tailwindcss';

/**
 * Identité de l'APP (thème Crème) : fond crème, encre brune, or du logo, et les
 * teintes des gestes. Les noms historiques sont gardés pour que TOUTES les pages
 * (légal, relais, accueil) suivent : `ink` = le fond, `paper` = l'encre.
 * Valeurs reprises de ui/tokens.ts (light, tints, BRAND_GOLD).
 */
const config: Config = {
  content: ['./components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#F4EEE5', 2: '#FFFBF5', 3: '#EFE7DB' },
        paper: '#1D1A16',
        sage: '#B8863A',
        mist: '#6B6358',
        bone: '#463018',
        cream: { DEFAULT: '#F4EEE5', card: '#FFFBF5', deep: '#EFE7DB', line: 'rgba(70,48,24,0.09)' },
        gold: { light: '#DDB565', DEFAULT: '#B8863A' },
        night: '#1E1C2A',
        tint: {
          send: '#FBE2D2', sendInk: '#C4552A',
          receive: '#D9EEE3', receiveInk: '#257F5A',
          swap: '#E6E0F6', swapInk: '#6450BE',
          earn: '#F5E7C8', earnInk: '#9A6C12',
          buy: '#DCE7F6', buyInk: '#2F64B0',
        },
      },
      fontFamily: {
        // General Sans, la police de l'app — une seule famille, titres compris.
        sans: ['"General Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"General Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        page: '76rem',
      },
      boxShadow: {
        phone: '0 30px 80px -30px rgba(90, 58, 24, 0.45)',
        card: '0 8px 18px -6px rgba(90, 58, 24, 0.10)',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
