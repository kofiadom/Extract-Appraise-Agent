/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1B2A4A',
          50: '#E8ECF3',
          100: '#C5CFE0',
          200: '#9AAFC9',
          300: '#6E8EB2',
          400: '#4D739F',
          500: '#2C578C',
          600: '#1B2A4A',
          700: '#152038',
          800: '#0E1626',
          900: '#070C14',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-lg': '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
