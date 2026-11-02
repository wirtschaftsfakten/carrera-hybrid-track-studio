/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07080b', 900: '#0d0f14', 850: '#12151c', 800: '#181c25', 700: '#232835', 600: '#323949' },
        carrera: { red: '#e3061b', blue: '#1e6bff', amber: '#ffb020' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
