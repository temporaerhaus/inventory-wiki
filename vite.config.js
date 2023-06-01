// Plugins
import vue from '@vitejs/plugin-vue';

// Utilities
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    vue({
    }),
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./index.html', import.meta.url)),
      name: 'inventoryWiki',
      fileName: 'inventory-wiki',
      formats: ['iife']
    },
  },
  define: {
    'process.env': {}
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 3000,
    proxy: {
      '/lib': 'https://wiki.temporaerhaus.de/',
      '/inventar': 'https://wiki.temporaerhaus.de/',
    }
  }
})
