/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./src/renderer/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: {
          900: '#111827',
          800: '#1f2937', 
          700: '#374151',
          600: '#4b5563',
          500: '#6b7280',
          400: '#9ca3af',
          300: '#d1d5db',
        },
        primary: {
          DEFAULT: '#3b82f6',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#6b7280',
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#f3f4f6',
          foreground: '#1f2937',
        },
        background: '#ffffff',
        foreground: '#1f2937',
        border: '#e5e7eb',
        input: '#e5e7eb',
        ring: '#3b82f6',
        'muted-foreground': '#6b7280',
        popover: '#ffffff',
        'popover-foreground': '#1f2937',
      },
      animation: {
        'bounce': 'bounce 1s infinite',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}