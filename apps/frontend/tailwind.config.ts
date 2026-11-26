import type { Config } from 'tailwindcss';

/**
 * Malodge "Riviera" design system.
 * Every color is a semantic token backed by a CSS variable (see src/index.css),
 * so the whole UI switches between the light and dark themes from one place.
 */
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        line: token('line'),
        'line-strong': token('line-strong'),
        ink: token('ink'),
        'ink-soft': token('ink-soft'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-hover': token('accent-hover'),
        'on-accent': token('on-accent'),
        gold: token('gold'),
        primary: token('primary'),
        'primary-hover': token('primary-hover'),
        'on-primary': token('on-primary'),
        success: token('success'),
        danger: token('danger'),
        warning: token('warning'),
        info: token('info'),
        plum: token('plum'),
        copper: token('copper'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      fontSize: {
        body: ['14px', { lineHeight: '1.6', letterSpacing: '0.005em' }],
        'body-lg': ['15px', { lineHeight: '1.6', letterSpacing: '0.005em' }],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
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
