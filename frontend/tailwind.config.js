/** @type {import('tailwindcss').Config} */
export default {
   darkMode: "class", 
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'fill-gold', 'from-sage/20', 'from-azure/20', 'from-gold/20',
    'bg-sage-dim', 'bg-crimson-dim', 'bg-azure-dim', 'text-sage', 'text-crimson', 'text-azure',
  ],
  theme: {
    extend: {
      colors: {
        noir: {
          950: '#060608',
          900: '#0a0a0c',
          800: '#111115',
          700: '#16161c',
          600: '#1c1c24',
          500: '#252530',
          400: '#2a2a38',
          300: '#33334a',
        },
        gold: {
          DEFAULT: '#c9a84c',
          light: '#e8c97a',
          dim: 'rgba(201,168,76,0.15)',
          border: 'rgba(201,168,76,0.3)',
        },
        sage: {
          DEFAULT: '#4caf82',
          dim: 'rgba(76,175,130,0.12)',
        },
        crimson: {
          DEFAULT: '#e05c5c',
          dim: 'rgba(224,92,92,0.12)',
        },
        azure: {
          DEFAULT: '#5c8fe0',
          dim: 'rgba(92,143,224,0.12)',
        },
        ink: {
          primary: '#f0ede8',
          secondary: '#9896a4',
          muted: '#5a5868',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        'card': '0 4px 24px rgba(0,0,0,0.4)',
        'lg': '0 8px 48px rgba(0,0,0,0.6)',
        'gold': '0 0 0 1px rgba(201,168,76,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-in': 'slideIn 0.35s ease forwards',
        'shimmer': 'shimmer 1.5s infinite',
        'spin-slow': 'spin 0.8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          'from': { opacity: '0', transform: 'translateY(8px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          'from': { opacity: '0', transform: 'translateX(-12px)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
    },
  },
  plugins: [],
}
