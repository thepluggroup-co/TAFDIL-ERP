/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1a3a5c',
        accent:  '#e8740c',
      },
    },
  },
  plugins: [],
};
