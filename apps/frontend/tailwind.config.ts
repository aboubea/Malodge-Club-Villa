import type { Config } from 'tailwindcss';

/**
 * Malodge design system.
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
        peach: token('peach'),
        primary: token('primary'),
        'primary-hover': token('primary-hover'),
        'on-primary': token('on-primary'),
        success: token('success'),
        danger: token('danger'),
        warning: token('warning'),
        info: token('info'),
        plum: token('plum'),
        copper: token('copper'),
        'chart-1': token('chart-1'),
        'chart-2': token('chart-2'),
      },
      fontFamily: {
        // Apple's typeface on Apple devices, Inter elsewhere.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', '"Segoe UI"', 'Roboto', 'sans-serif'],
        // The MALODGE wordmark keeps its own typeface.
        brand: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      // Airbnb roundness: cards 20 px, windows 28 px, controls 14 px, buttons in pills.
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
        '3xl': '28px',
      },
      fontSize: {
        body: ['14px', { lineHeight: '1.6', letterSpacing: '0.005em' }],
        'body-lg': ['15px', { lineHeight: '1.6', letterSpacing: '0.005em' }],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
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
