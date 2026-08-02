export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        white: 'rgb(var(--tw-color-white, 255 255 255) / <alpha-value>)',
        gray: {
          50: 'rgb(var(--tw-color-gray-50, 249 250 251) / <alpha-value>)',
          100: 'rgb(var(--tw-color-gray-100, 243 244 246) / <alpha-value>)',
          200: 'rgb(var(--tw-color-gray-200, 229 231 235) / <alpha-value>)',
          300: 'rgb(var(--tw-color-gray-300, 209 213 219) / <alpha-value>)',
          400: 'rgb(var(--tw-color-gray-400, 156 163 175) / <alpha-value>)',
          500: 'rgb(var(--tw-color-gray-500, 107 114 128) / <alpha-value>)',
          600: 'rgb(var(--tw-color-gray-600, 75 85 99) / <alpha-value>)',
          700: 'rgb(var(--tw-color-gray-700, 55 65 81) / <alpha-value>)',
          800: 'rgb(var(--tw-color-gray-800, 31 41 55) / <alpha-value>)',
          900: 'rgb(var(--tw-color-gray-900, 17 24 39) / <alpha-value>)',
        }
      }
    },
  },
  plugins: [],
}
