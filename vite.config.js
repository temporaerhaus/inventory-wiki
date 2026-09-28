// Plugins
import vue from '@vitejs/plugin-vue';

// Utilities
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

function handleAuthenticatedProxy(proxy) {
  proxy.on('proxyReq', (proxyReq, req) => {
    if (process.env['COOKIE']) {
      // browser cookies first, php uses the first cookie of a name: a session handed out
      // by dokuwiki wins over a stale one from the env, so that security tokens stay valid
      proxyReq.setHeader('Cookie', [req.headers.cookie, process.env['COOKIE']].filter(Boolean).join('; '));
    }
  });
  proxy.on('proxyRes', (proxyRes) => {
    proxyRes.headers['Access-Control-Allow-Methods'] = '*';
    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';

    if (proxyRes.headers['location']) {
      proxyRes.headers['location'] = proxyRes.headers['location'].replace('https://wiki.temporaerhaus.de', '');
    }
  });
}

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
    sourcemap: true,
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
      '/lib/exe/js.php': {
        target: 'https://wiki.temporaerhaus.de/',
        changeOrigin: true,
        selfHandleResponse : true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('Accept-Encoding', 'identity');
            proxyReq.setHeader('Cache-Control', 'no-store');
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            const body = [];
            proxyRes.on('data', (chunk) => body.push(chunk));
            proxyRes.on('end', () => res.end(
              Buffer.concat(body)
                .toString()
                .replaceAll(`e.src = 'https://temporaerhaus.github.io/inventory-wiki/inventory-wiki.iife.js';`, 'e.type="module";e.src="/src/main.js";')
              )
            );
          });
        },
      },
      '/lib': {
        target: 'https://wiki.temporaerhaus.de/',
        configure: handleAuthenticatedProxy,
        proxyTimeout: 10000,
        changeOrigin: true
      },
      '^\/(?!src|node_modules|@id|@vite|fonts\/).*': {
        target: 'https://wiki.temporaerhaus.de/',
        configure: handleAuthenticatedProxy,
        proxyTimeout: 10000,
        changeOrigin: true
      }
    }
  }
})
