# Satu port per modul (nginx)

Node SisKA tetap **satu proses** di `127.0.0.1:3000` (bot WhatsApp ikut di
dalamnya). Yang dipisah hanya pintu masuknya: tiap modul punya port nginx
sendiri, dan tiap port hanya meneruskan **halaman dan API modul itu**.
Alamat modul lain dijawab 404, jadi data pegawai tidak bisa dibuka dari
port perjalanan dinas walaupun alamatnya diketik manual.

| Port | Modul | Halaman | API yang dibuka | Berkas |
|---|---|---|---|---|
| 8001 | Presensi non ASN | (aplikasi terpisah) | — | repo presensi |
| 8002 | Stok ATK | `/atk` (katalog), `/atk/kelola` | `/api/barang`, `/api/mutasi-barang` | `siska-8002-atk.conf` |
| 8003 | (dipakai aplikasi lain di VPS) | — | — | — |
| 8004 | Kendaraan Dinas | `/kendaraan`, `/kendaraan/pemeliharaan` | `/api/kendaraan`, `/api/servis-kendaraan` | `siska-8004-kendaraan.conf` |
| 8005 | SPBY & Kwitansi | `/perjalanan-dinas`, `/langganan-aplikasi`, `/fotokopi`, `/bbm-kepala-biro`, `/konsumsi` | `/api/kwitansi` | `siska-8005-perjalanan-dinas.conf` |
| 8006 | Master Data Pegawai | `/pegawai` | `/api/pegawai` | `siska-8006-pegawai.conf` |

`/` di tiap port langsung dialihkan ke halaman modulnya. Di :8002, `/`
tetap membuka katalog ATK, jadi tautan `LINK_WEB_KATALOG` yang sudah
terkirim ke WhatsApp tidak perlu diubah.

Alamat lama (dulu semua di :8002) dialihkan ke port barunya:
`:8002/admin` → `:8006/pegawai`, `:8002/admin/servis-kendaraan` →
`:8004/kendaraan/pemeliharaan`, `:8002/admin/kwitansi` →
`:8005/perjalanan-dinas`, `:8002/barang` → `:8002/atk/kelola`.

## Di lokal

Tidak perlu nginx. Jalankan Node SisKA, lalu buka modul lewat path-nya:

- http://localhost:3000/atk dan http://localhost:3000/atk/kelola
- http://localhost:3000/pegawai
- http://localhost:3000/kendaraan dan http://localhost:3000/kendaraan/pemeliharaan
- http://localhost:3000/perjalanan-dinas

Dengan `npm run dev` di `frontend/` (Vite), tiap `/api/...` diteruskan ke
port modulnya di VPS, atau ke satu server kalau diisi
`VITE_PROXY_TARGET=http://localhost:3000`.

## Memasang di VPS

Sekali saja, sesudah kode terbaru ditarik dan `npm run deploy` dijalankan:

```bash
cd ~/chatbot-whatsapp-siska   # sesuaikan dengan folder di VPS

# 1. Potongan bersama penerus ke Node
sudo cp deploy/nginx/siska-proxy.conf /etc/nginx/snippets/siska-proxy.conf

# 2. Satu berkas per port
for f in deploy/nginx/siska-800*.conf; do
  nama=$(basename "$f" .conf)
  sudo cp "$f" /etc/nginx/sites-available/$nama
  sudo ln -sf /etc/nginx/sites-available/$nama /etc/nginx/sites-enabled/$nama
done

# 3. Blok :8002 lama (siska-8002) diganti siska-8002-atk — buang yang lama
#    supaya dua blok tidak berebut port 8002.
sudo rm -f /etc/nginx/sites-enabled/siska-8002

# 4. WAJIB uji dulu, baru muat ulang
sudo nginx -t && sudo systemctl reload nginx

# 5. Kalau ufw aktif
sudo ufw allow 8006/tcp
sudo ufw allow 8004/tcp
sudo ufw allow 8005/tcp
```

Cek cepat sesudahnya (harus 200, lalu 404):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8006/api/pegawai
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8005/api/pegawai
```

## Menambah modul baru

1. Frontend: tambahkan path `/<modul>` di `frontend/src/App.jsx`.
2. Backend: beri API modul awalan sendiri, mis. `/api/<modul>`.
3. Salin salah satu berkas `siska-800x-*.conf` jadi port berikutnya
   yang masih kosong (8007, 8008, …; cek `sudo ss -tlnp | grep :80` —
   8003 dipakai aplikasi lain), ganti port, path halaman, dan pola API-nya.
4. Tambahkan awalan API itu ke `proxyApi()` di `frontend/vite.config.js`.
5. Pasang di VPS seperti langkah di atas, lalu `sudo ufw allow <port>/tcp`.
