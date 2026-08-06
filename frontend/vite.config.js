import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Express menyajikan folder ini (lihat index.js:163), jadi hasil build langsung
// mendarat di sini supaya tidak perlu salin manual dari dist/.
const OUT_DIR = path.resolve(__dirname, '../public')
const ASSET_DIR = path.join(OUT_DIR, 'assets')

// `emptyOutDir` sengaja dimatikan: public/ juga berisi aset yang bukan hasil build
// (logo-kemnaker.png dan puluhan PNG katalog barang di public/assets), dan itu akan
// terhapus kalau Vite mengosongkan outDir. Konsekuensinya bundle lama menumpuk tiap
// build, jadi kita sapu sendiri — HANYA file bernama pola index-<hash>.js/css.
function bersihkanBundleLama() {
  return {
    name: 'bersihkan-bundle-lama',
    apply: 'build',
    buildStart() {
      if (!fs.existsSync(ASSET_DIR)) return
      const polaBundle = /^index-[A-Za-z0-9_-]+\.(js|css)(\.map)?$/
      for (const nama of fs.readdirSync(ASSET_DIR)) {
        if (!polaBundle.test(nama)) continue
        fs.rmSync(path.join(ASSET_DIR, nama))
        console.log(`[build] Hapus bundle lama: assets/${nama}`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bersihkanBundleLama()],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: false,
  },
  server: {
    // URL API dibuat relatif (lihat services/ApiTU.js), jadi saat `npm run dev`
    // panggilan /api akan nyasar ke server Vite. Proxy ini meneruskannya ke
    // Express supaya mode pengembangan tetap jalan tanpa mengubah kode.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
