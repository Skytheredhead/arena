import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08111c',
        cyan: '#72f7ff',
        signal: '#ff7d57',
        steel: '#9ab0c9',
        mist: '#d6e5f4'
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['IBM Plex Sans', 'sans-serif']
      },
      boxShadow: {
        hud: '0 0 0 1px rgba(114,247,255,0.18), 0 12px 42px rgba(4,10,18,0.44)'
      },
      backgroundImage: {
        grid:
          'linear-gradient(rgba(114,247,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(114,247,255,0.05) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
} satisfies Config;
