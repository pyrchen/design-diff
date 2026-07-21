/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,ts,jsx,tsx}'],
  // useTheme.ts mirrors the `data-theme` attribute switch onto a `.dark`
  // class on <html> specifically so the plain 'class' strategy here stays
  // valid Tailwind syntax and in sync with the theme toggle.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        canvasbg: 'var(--canvasbg)',
        surface: 'var(--surface)',
        'surface-solid': 'var(--surface-solid)',
        elevated: 'var(--elevated)',
        hover: 'var(--hover)',
        border: {
          DEFAULT: 'var(--border)',
          2: 'var(--border2)',
        },
        hair: 'var(--hair)',
        text: {
          DEFAULT: 'var(--text)',
          2: 'var(--text2)',
          3: 'var(--text3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          on: 'var(--onaccent)',
        },
        scan: 'var(--scan)',
        green: {
          DEFAULT: 'var(--green)',
          soft: 'var(--green-soft)',
        },
        red: {
          DEFAULT: 'var(--red)',
          soft: 'var(--red-soft)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          soft: 'var(--amber-soft)',
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
        },
        'scan-soft': 'var(--scan-soft)',
        track: 'var(--track)',
      },
      backgroundImage: {
        'accent-grad': 'var(--accent-grad)',
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        board: 'var(--r-board)',
      },
      boxShadow: {
        sh1: 'var(--sh1)',
        sh2: 'var(--sh2)',
        board: 'var(--board-sh)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '220ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        dd: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
