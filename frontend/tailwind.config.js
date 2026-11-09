/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          950: '#080d13',
          900: '#0c131c',
          850: '#101a25',
          800: '#142130',
          700: '#1d3043',
          600: '#29455e',
          500: '#436781',
          400: '#6c8ca3',
          300: '#a8bdcb',
          200: '#d0dee7',
          100: '#eaf2f6',
        },
        signal: {
          400: '#43e0b0',
          500: '#12c99a',
          600: '#0aa47f',
        },
        amber: {
          400: '#f5b942',
          500: '#e8a21e',
        },
        coral: {
          400: '#f4796b',
          500: '#e65a4a',
        },
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 50px -30px rgba(0,0,0,0.9)',
      },
    },
  },
  plugins: [],
}
