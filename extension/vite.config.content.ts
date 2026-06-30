import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite Configuration for the Chrome Extension Content Script.
 * Compiles content.tsx as a standalone immediately-invoked function expression (IIFE)
 * with all dependencies (React, Lucide, CSS) bundled inline to comply with Chrome security restrictions.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true, // Clean the dist folder before starting build cycle
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content.tsx')
      },
      output: {
        entryFileNames: 'content.js',
        format: 'iife' // Build content.js as a self-contained IIFE script
      }
    }
  }
});
