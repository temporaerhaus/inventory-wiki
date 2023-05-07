// Plugins
import vue from '@vitejs/plugin-vue';

// Utilities
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { copyFile, readdir } from 'node:fs/promises';

export default defineConfig({
  plugins: [
    vue({
    }),
    {
      name: 'copy-dokuwiki',
      async closeBundle() {
        const files = await readdir('dist'); 
        if (files.includes('inventory-wiki.iife.js')) {
          await copyFile('dist/inventory-wiki.iife.js', 'dokuwiki_data/conf/userscript.js');
        }
        if (files.includes('style.css')) {
          await copyFile('dist/style.css', 'dokuwiki_data/conf/userstyle.css');
        }
      }
    }
  ],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/main.js', import.meta.url)),
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
  }
})
