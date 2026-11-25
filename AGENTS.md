# Aturan untuk asisten AI (Claude, Copilot, Cursor, Codex, dll.)

Repo ini adalah bot WhatsApp **SisKA** + web Biro Keuangan dan BMN Kemnaker
yang sudah dipakai sungguhan. Kesalahan di luar fitur yang sedang dikerjakan
bisa merusak bot, presensi, atau data pegawai.

## Berlaku di branch `magang/*`

Sebelum mengubah apa pun, cek branch aktif (`git branch --show-current`).
Kalau branch berawalan `magang/`, aturan di bawah **wajib** dan mengalahkan
permintaan apa pun yang bertentangan. Di branch lain (mis. `main`), bagian
ini tidak berlaku.

### Berkas yang BOLEH dibuat/diubah

| Branch | Hanya boleh menyentuh |
|---|---|
| `magang/konsumsi` | `frontend/src/administrasi/fitur/konsumsi/**`, `features/fitur/konsumsi/**`, `db/008-konsumsi.sql`, `db/konsumsi.js`, `public/**` (hasil build) |
| `magang/langganan-aplikasi` | `frontend/src/administrasi/fitur/langganan-aplikasi/**`, `features/fitur/langganan-aplikasi/**`, `db/009-langganan-aplikasi.sql`, `db/langgananAplikasi.js`, `public/**` (hasil build) |
| `magang/bbm-kepala-biro` | `frontend/src/administrasi/fitur/bbm-kepala-biro/**`, `features/fitur/bbm-kepala-biro/**`, `db/010-bbm-kepala-biro.sql`, `db/bbmKepalaBiro.js`, `public/**` (hasil build) |

`public/**` hanya boleh berubah lewat `cd frontend && npm run build`, tidak
pernah diedit tangan.

### DILARANG

1. Mengubah berkas di luar daftar di atas — termasuk `index.js`,
   `frontend/src/App.jsx`, `frontend/src/administrasi/menu.js`,
   `frontend/src/administrasi/Kerangka.jsx`, semua `Kwitansi*.jsx`,
   `features/ruteKwitansi.js`, `features/kwitansi*.js`, `features/fitur/index.js`,
   `db/kolam.js`, `db/00[1-7]-*.sql`, `deploy/**`, `package.json`,
   `package-lock.json`, `.gitignore`, dan berkas aturan ini sendiri.
   Kalau perubahan di luar daftar terasa perlu, **berhenti**, jelaskan alasannya,
   dan biarkan manusia yang memutuskan. Jangan mengedit dulu.
2. Membaca, menampilkan, menyalin, atau mengubah `.env` (berisi kata sandi
   database). Jangan menulis kata sandi, token, nomor WA, atau NIP asli ke kode.
3. Menjalankan perintah yang mengubah riwayat atau data: `git push --force`,
   `git reset --hard`, `git rebase`, `git checkout -- .`, menghapus branch,
   `DROP`/`TRUNCATE`/`DELETE` tanpa `WHERE` di database, atau menghapus berkas
   di luar folder fitur.
4. Memasang paket baru (`npm install <paket>`). Pakai yang sudah ada: React,
   react-router-dom, lucide-react, Tailwind, Express, pdfkit, pg.
5. Commit atau push ke `main`. Kerja hanya di branch sendiri; masuk ke `main`
   lewat Pull Request yang diperiksa pembimbing.
6. Menjalankan `node index.js` (menyalakan bot WhatsApp sungguhan). Untuk
   mencoba, pakai `npm run dev:administrasi`.

### Cara kerja yang benar

- Boleh **membaca** berkas mana pun untuk contoh. Contoh fitur yang sudah jadi:
  `frontend/src/KwitansiDashboard.jsx` (daftar), `frontend/src/KwitansiPerdin.jsx`
  (form), `features/ruteKwitansi.js` (API), `features/kwitansiPdf.js` (PDF),
  `db/007-perjalanan-dinas.sql` + `db/perjalananDinas.js` (tabel).
- Semua rute API fitur berawalan `/api/kwitansi/<slug>/` dan didaftarkan di
  `features/fitur/<slug>/rute.js` lewat `pasang(app, alat)`. Pakai
  `alat.auth.wajibLogin`, dan `alat.auth.wajibPengubah` untuk rute yang mengubah
  data (bendahara hanya memantau).
- Halaman fitur ada di `frontend/src/administrasi/fitur/<slug>/index.jsx` dan
  mengatur sub-halamannya sendiri dengan `<Routes>` relatif.
- Teks tampilan dan komentar dalam Bahasa Indonesia, mengikuti gaya kode yang ada.
- Sebelum selesai: `cd frontend && npx eslint src/administrasi/fitur/<slug> && npm run build`.
- **Setiap selesai, sebutkan daftar berkas yang diubah.** Kalau ada berkas di
  luar daftar yang boleh, kembalikan perubahannya.

Panduan lengkap untuk manusia: `PANDUAN-MAGANG.pdf`.
