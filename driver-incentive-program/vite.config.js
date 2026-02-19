import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    
    // tells Vitest to look in the tests folder for files ending in .test.js or .spec.js
    include: ['tests/**/*.{test,spec}.{js,jsx}'],
    setupFiles: './tests/setup.js', 
  },
});