/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#E30613',
        accent:  '#E30613',
        dark:    '#111111',
      },
    },
  },
  plugins: [],
};
