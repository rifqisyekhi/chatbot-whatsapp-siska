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
// build, jadi kita sapu sendiri — HANYA file bundle hasil Vite (lihat polaBundle).
function bersihkanBundleLama() {
  return {
    name: 'bersihkan-bundle-lama',
    apply: 'build',
    buildStart() {
      if (!fs.existsSync(ASSET_DIR)) return
      // exceljs.min-<hash>.js: potongan ExcelJS yang dimuat dinamis oleh tab
      // Rekap barang (services/excelRekap.js).
      const polaBundle = /^(index|exceljs\.min)-[A-Za-z0-9_-]+\.(js|css)(\.map)?$/
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
    // panggilan /api diteruskan ke server lain sehingga data real langsung
    // tampil tanpa perlu menyalakan bot di laptop.
    //
    // Di VPS tiap modul punya port sendiri yang hanya membuka API modul itu
    // (deploy/nginx/), jadi bawaannya tiap API diteruskan ke port modulnya.
    // VITE_PROXY_TARGET=http://localhost:3000 meneruskan semuanya ke satu
    // server (mis. Node SisKA yang jalan di laptop).
    proxy: proxyApi(),
  },
})

function proxyApi() {
  const satu = process.env.VITE_PROXY_TARGET
  const vps = 'http://192.168.221.44'
  const peta = {
    '/api/barang': 8002,
    '/api/mutasi-barang': 8002,
    '/api/pegawai': 8006,
    '/api/kendaraan': 8004,
    '/api/servis-kendaraan': 8004,
    '/api/kwitansi': 8005,
  }
  return Object.fromEntries(
    Object.entries(peta).map(([awalan, port]) => [
      awalan,
      { target: satu || `${vps}:${port}`, changeOrigin: true },
    ]),
  )
}
