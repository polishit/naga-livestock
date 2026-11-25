import animate from 'tailwindcss-animate';
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Navigation: light panel with forest-green text and a gold accent (same palette as the logo).
        sidebar: {
          DEFAULT: '#ffffff',
          ink: '#14532d',
          muted: '#64748b',
          hover: '#f1f7ee',
          active: '#14532d',
          activeBg: '#e3f1de',
          accent: '#f4c430',
        },
        // One green, used everywhere: the menu is the deepest shade, buttons and links the middle ones.
        nav: { DEFAULT: '#1f4a35', deep: '#173a29', text: '#ffffff', soft: '#e9f3ec', active: '#1f4a35' },
        // strong = buttons and active states (white text passes WCAG AA contrast)
        brand: {
          DEFAULT: '#3f8a5c',
          strong: '#2e6b47',
          dark: '#1f5236',
          mid: '#3f8a5c',
          light: '#ecf5ef',
          soft: '#d4e8da',
        },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.05)',
        pop: '0 12px 32px -8px rgba(16,24,40,.18), 0 4px 8px -4px rgba(16,24,40,.08)',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
