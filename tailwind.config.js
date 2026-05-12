/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#c1272d', dark: '#8d1b20', light: '#f2c8ca' },
        ink:   { DEFAULT: '#1a1a1a', soft: '#4a4a4a' },
      },
      fontFamily: {
        sans:  ['"Inter"', 'system-ui', 'sans-serif'],
        hanzi: ['"Noto Sans SC"', '"PingFang SC"', 'serif'],
        thai:  ['"Noto Sans Thai"', 'system-ui', 'sans-serif'],
      },
      // Touch-friendly minimum sizes for iPad
      minHeight: { 'touch': '56px' },
      minWidth:  { 'touch': '56px' },
    },
  },
  plugins: [],
};
