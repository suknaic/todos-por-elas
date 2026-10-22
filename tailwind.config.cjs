/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand)',
        'brand-deep': 'var(--brand-deep)',
        magenta: 'var(--magenta)',
        ink: 'var(--text)',
        'ink-soft': 'var(--text-soft)',
        surface: 'var(--surface)',
        border: 'var(--border)'
      },
      borderRadius: {
        xl: 'var(--radius-lg)'
      }
    }
  },
  plugins: []
};