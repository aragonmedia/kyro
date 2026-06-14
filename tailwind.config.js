/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        kyro: {
          50: '#f8f6ff',
          100: '#f0ebff',
          200: '#e6deff',
          300: '#d9ccff',
          400: '#c5b1ff',
          500: '#a888ff',
          600: '#8b5cf6',
          700: '#7c3aed',
          800: '#6d28d9',
          900: '#5b21b6',
        },
        accent: {
          50: '#fff0f9',
          100: '#ffe5f2',
          200: '#ffccf0',
          300: '#ff99e6',
          400: '#ff66d9',
          500: '#ff33cc',
          600: '#e91e8c',
          700: '#d91e6f',
          800: '#b81e5f',
          900: '#8b1547',
        },
      },
      backgroundImage: {
        'gradient-kyro': 'linear-gradient(135deg, #5b9bff 0%, #8b5cf6 50%, #ff33cc 100%)',
        'gradient-card': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
