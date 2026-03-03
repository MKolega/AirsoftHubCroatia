import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import assetsManifest from './src/assets.r2.json'

type AssetEntry = { key: string; url: string }
type AssetsManifest = Record<string, AssetEntry>

const assets = assetsManifest as AssetsManifest
const faviconUrl = assets['connection.png']?.url ?? '/vite.svg'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-favicon-from-assets-manifest',
      transformIndexHtml(html) {
        return html.replace(/%FAVICON_URL%/g, faviconUrl)
      },
    },
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
