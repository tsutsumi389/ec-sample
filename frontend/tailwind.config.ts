import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F7F6',
          100: '#DCECEA',
          200: '#B9D9D5',
          300: '#8FC0BA',
          400: '#5FA19A',
          500: '#3D837B',
          600: '#2A6B63',
          700: '#22574F',
          800: '#1D463F',
          900: '#193A34',
        },
      },
    },
  },
  plugins: [],
};

export default config;
