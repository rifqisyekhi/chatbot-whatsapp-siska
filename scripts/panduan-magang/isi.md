# Panduan Magang — Fitur Administrasi Rokeu

Administrasi Rokeu (`/administrasi`, di VPS port **8005**) berisi
fitur pembuatan SPJ: SPBY, kwitansi, dan dokumen pendukungnya. Satu fitur =
satu menu di sidebar.

| Fitur | Branch | Pemegang |
|---|---|---|
| Perjalanan Dinas | (sudah jadi, `main`) | — |
| Konsumsi | `magang/konsumsi` | anak magang 1 |
| Langganan Aplikasi | `magang/langganan-aplikasi` | anak magang 2 |
| Fotokopi, BBM Kepala Biro | (belum dibagi) | — |

## 1. Aturan main

1. **Kerjakan hanya folder fiturmu:**
   - tampilan: `frontend/src/administrasi/fitur/<slug>/`
   - API: `features/fitur/<slug>/`
   - tabel: `db/<nomor>-<slug>.sql` + modul `db/<namaFitur>.js`
     (nomor dipesan: **008 konsumsi**, **009 langganan-aplikasi**)
2. Menu sidebar, alamat, dan sambungan API **sudah dibuat** — tidak perlu
   mengubah `App.jsx`, `index.js`, `administrasi/menu.js`, atau nginx.
   Kalau benar-benar perlu mengubah berkas di luar foldermu, tanyakan dulu.
3. Kerja di branch masing-masing, commit sering, lalu buat **Pull Request
   ke `main`**. Jangan push langsung ke `main`.
4. Jangan commit `.env`, kata sandi, token, atau data pegawai asli.

## 2. Menyiapkan laptop

```bash
git clone https://github.com/rifqisyekhi/chatbot-whatsapp-siska.git
cd chatbot-whatsapp-siska
git checkout magang/konsumsi          # atau magang/langganan-aplikasi
npm install
cd frontend && npm install && cd ..
```

Minta isi `.env` (minimal `DATABASE_URL`) ke pembimbing — jangan dibagikan.

## 3. Menjalankan di lokal

Bot asli (`index.js`) ikut menyalakan WhatsApp, jadi untuk fitur ini pakai
server pengembangan:

```bash
npm run dev:administrasi
```

Buka http://localhost:3999/administrasi, login dengan nomor WA operator
(username = password = nomor WA di Master Data).

Supaya perubahan tampilan langsung terlihat tanpa build ulang, jalankan
juga Vite di terminal kedua:

```bash
cd frontend
VITE_PROXY_TARGET=http://localhost:3999 npm run dev
```

lalu buka alamat yang dicetak Vite (biasanya http://localhost:5173/administrasi).

Sebelum commit: `cd frontend && npx eslint src/administrasi && npm run build`.
Hasil build (`public/`) ikut di-commit.

## 4. Kerangka yang sudah ada

**Tampilan** — `frontend/src/administrasi/fitur/<slug>/index.jsx`

- Menerima `sesi` → `sesi.operator` (`nama`, `nip`, `peran`, `bidang`).
  `peran`: `operator` (hanya bidangnya), `bendahara` (lihat semua, **tidak
  boleh mengubah** — sembunyikan tombol ubah/hapus), `admin`.
- Sub-halaman memakai `<Routes>` relatif: `index` (daftar), `baru`, `:id`.
- Panggil API dengan `apiKwitansi({ url, method, body })` dari
  `services/sesiKwitansi` (token terkirim otomatis); buka PDF dengan
  `bukaPdf({ url })`.
- Gaya: Tailwind dengan warna `navy`, `brand`, `paper`, `mist`.
  Contoh lengkap: `frontend/src/KwitansiDashboard.jsx` (daftar) dan
  `frontend/src/KwitansiPerdin.jsx` (form).

**API** — `features/fitur/<slug>/rute.js`

- Fungsi `pasang(app, alat)`; semua rute berawalan `/api/kwitansi/<slug>/`.
- Rute contoh `GET /api/kwitansi/<slug>/status` sudah jalan — dipakai untuk
  memastikan login dan sambungan benar, lalu boleh dihapus.
- `alat` berisi (lihat `features/fitur/index.js`):
  - `auth.wajibLogin`, `auth.wajibPengubah` (tolak bendahara),
    `auth.bolehBidang(op, bidang)`, `auth.lihatSemua(op)`
  - `GalatKwitansi` + `balasGalat(res, err, pesan)` untuk pesan error
  - `pejabat` (PPK & bendahara bawaan), `halamanSpby` + `pasangFontSpby`
    (SPBY yang sama dengan servis kendaraan), `terbilangRupiah`, `tanggalPanjang`
- Contoh lengkap: `features/ruteKwitansi.js`, PDF di `features/kwitansiPdf.js`
  (fungsi `halamanSpbyPerdin`).

**Tabel** — contoh `db/007-perjalanan-dinas.sql` (dibuat otomatis saat
server menyala, aman dijalankan berulang, `IF NOT EXISTS`) dan
`db/perjalananDinas.js` (fungsi daftar/satu/buat/ubah/hapus).

## 5. Alur kerja fitur (saran)

1. Pelajari contoh dokumen (SPBY, kwitansi, lampiran) dari Tata Usaha.
2. Tentukan isian form dan kolom tabel.
3. Buat tabel + modul `db/`, lalu rute daftar/simpan/ubah/hapus.
4. Buat halaman daftar dan form.
5. Buat PDF: SPBY (pakai `halamanSpby`) + kwitansi sesuai contoh.
6. Uji sebagai operator dan bendahara, lalu buat Pull Request.

## 6. Kalau memakai AI (Claude, Copilot, ChatGPT, dll.)

Repo ini sudah punya berkas aturan untuk AI: `AGENTS.md` (dibaca otomatis
oleh Claude Code, Copilot, Cursor, Codex). Isinya membatasi AI hanya
mengubah folder fiturmu. Untuk AI di browser (ChatGPT, Gemini, dll.) yang
tidak membaca berkas itu, **tempel prompt di bawah di awal setiap
percakapan baru**, lalu baru tulis permintaanmu.

Prompt awal untuk `magang/konsumsi`:

```
Kamu membantu saya mengerjakan fitur KONSUMSI di repo SisKA
(branch magang/konsumsi). Aturan WAJIB, tidak boleh dilanggar:

1. Hanya boleh membuat/mengubah berkas di:
   - frontend/src/administrasi/fitur/konsumsi/
   - features/fitur/konsumsi/
   - db/008-konsumsi.sql dan db/konsumsi.js
2. JANGAN mengubah berkas lain (App.jsx, index.js, menu.js,
   Kerangka.jsx, Kwitansi*.jsx, ruteKwitansi.js, package.json,
   deploy/, .gitignore). Kalau menurutmu perlu, BERHENTI dan
   jelaskan dulu alasannya, jangan langsung diubah.
3. Jangan membaca atau menulis .env, kata sandi, token, NIP,
   atau nomor WA asli.
4. Jangan menyarankan git push --force, git reset --hard,
   menghapus berkas lain, atau npm install paket baru.
5. Semua rute API berawalan /api/kwitansi/konsumsi/ dan dibuat
   di features/fitur/konsumsi/rute.js lewat pasang(app, alat).
6. Ikuti gaya kode yang sudah ada; teks dan komentar Bahasa
   Indonesia.
7. Di akhir setiap jawaban, sebutkan berkas apa saja yang diubah.
```

Untuk `magang/langganan-aplikasi`, pakai prompt yang sama dengan mengganti:
`KONSUMSI` jadi `LANGGANAN APLIKASI`, `magang/konsumsi` jadi
`magang/langganan-aplikasi`, folder `konsumsi` jadi `langganan-aplikasi`,
`db/008-konsumsi.sql dan db/konsumsi.js` jadi
`db/009-langganan-aplikasi.sql dan db/langgananAplikasi.js`, dan
`/api/kwitansi/konsumsi/` jadi `/api/kwitansi/langganan-aplikasi/`.

Tetap periksa hasil AI sebelum commit: `git status` harus hanya
menunjukkan berkas di folder fiturmu (dan `public/` hasil build).
