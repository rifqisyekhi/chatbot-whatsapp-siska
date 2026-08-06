#!/usr/bin/env bash
# Reset sesi WhatsApp Web ketika bot mentok di "Authenticated!" dan tidak
# pernah mencapai READY.
#
# Folder DIPINDAHKAN, bukan dihapus, supaya masih bisa dikembalikan kalau
# ternyata reset bukan jawabannya.
#
# Pakai: npm run reset-wa   (atau: bash scripts/reset-sesi-wa.sh)

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STEMPEL="$(date +%Y%m%d-%H%M%S)"
NAMA_PM2="${PM2_APP_NAME:-bot-siska}"

cd "$DIR"
echo "Direktori proyek: $DIR"

# 1. Matikan bot dulu supaya tidak ada yang memegang berkas sesi.
if command -v pm2 >/dev/null 2>&1; then
  echo "==> Menghentikan $NAMA_PM2"
  pm2 stop "$NAMA_PM2" || echo "    (tidak berjalan di PM2, dilewati)"
fi

# 2. Pastikan tidak ada Chrome yatim yang masih memegang profil.
if pgrep -f "wwebjs_auth" >/dev/null 2>&1; then
  echo "==> Menutup sisa proses Chrome yang memegang profil"
  pkill -f "wwebjs_auth" || true
  sleep 2
fi

# 3. Pindahkan folder sesi dan cache.
DIPINDAH=0
for FOLDER in .wwebjs_auth .wwebjs_cache; do
  if [ -e "$FOLDER" ]; then
    mv "$FOLDER" "${FOLDER}.bak-${STEMPEL}"
    echo "==> $FOLDER  ->  ${FOLDER}.bak-${STEMPEL}"
    DIPINDAH=1
  fi
done

if [ "$DIPINDAH" -eq 0 ]; then
  echo "==> Tidak ada folder sesi/cache yang perlu dipindahkan."
fi

cat <<'PESAN'

Sesi lama sudah diamankan. Langkah berikutnya HARUS manual, karena QR perlu
dipindai dan QR di dalam berkas log PM2 biasanya rusak tak terbaca kamera:

  node index.js

Pindai QR dari WhatsApp di HP. Setelah muncul "[READY] Bot SisKA siap!",
tekan Ctrl+C, lalu kembalikan ke PM2:

  pm2 start bot-siska

Folder cadangan (.bak-*) aman dihapus setelah bot terbukti normal beberapa
hari. Kalau justru makin bermasalah, kembalikan dengan mv terbalik.
PESAN
