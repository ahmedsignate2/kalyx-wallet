import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B2B26',
        surface: '#123B34',
        'surface-card': '#17483E',
        'surface-hover': '#1C5548',
        border: 'rgba(255, 255, 255, 0.08)',
        'border-strong': 'rgba(255, 255, 255, 0.16)',
        primary: { DEFAULT: '#8B5CF6', hover: '#7C3AED', light: '#C4B5FD' },
        cyan: {
          DEFAULT: '#06B6D4',
          glow: '#22D3EE',
        },
        emerald: {
          DEFAULT: '#10B981',
          glow: '#34D399',
        },
      },
      backgroundImage: {
        'hero-gradient':
          'radial-gradient(ellipse 80% 55% at 50% -18%, rgba(139, 92, 246, 0.22), rgba(251, 127, 110, 0.08), transparent 72%)',
        'card-glow':
          'radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.12), transparent 70%)',
        'glass-gradient':
          'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01))',
      },
      animation: {
        'float-slow': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-12px) rotate(0.5deg)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
