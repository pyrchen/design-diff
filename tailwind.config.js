/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: {
          950: '#0a0a0f',
          900: '#121218',
          800: '#1a1a23',
          700: '#26262f',
          600: '#33333f',
        },
      },
    },
  },
  plugins: [],
};
