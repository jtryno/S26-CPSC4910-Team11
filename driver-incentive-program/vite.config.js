import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    
    // tells Vitest to look in the tests folder for files ending in .test.js or .spec.js
    include: ['tests/**/*.{test,spec}.{js,jsx}'],
    setupFiles: './tests/setup.js', 
  },
});