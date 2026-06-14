import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0B',
        surface: '#111113',
        surface2: '#1A1A1D',
        border: '#242428',
        gold: '#C9A96E',
        'gold-light': '#E8C98A',
        white: '#F5F0EB',
        muted: '#6B6B6F',
        success: '#2D7A4F',
        danger: '#7A2D2D',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        body: ['14px', { lineHeight: '1.6', letterSpacing: '0.01em' }],
        'body-lg': ['15px', { lineHeight: '1.6', letterSpacing: '0.01em' }],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
