// =========================================================
// PULIHKAN SESI WHATSAPP TANPA SCAN QR ULANG
// =========================================================
//
// Untuk bot yang mentok di antara AUTHENTICATED dan READY dan tidak
// pernah selesai memuat, berapa lama pun ditunggu.
//
// Selama ini obatnya menghapus seluruh `.wwebjs_auth`, dan itu memang
// menyembuhkan — tetapi folder itu adalah profil Chromium yang SEKALIGUS
// menyimpan sesi WhatsApp, sehingga QR harus diulang.
//
// Yang benar-benar rusak hampir selalu cache dan service worker-nya.
// Skrip ini membuang itu saja. Sesinya tidak disentuh.
//
// PEMAKAIAN
//
//   pm2 stop bot-siska
//   node scripts/pulihkan-sesi-wa.js           # lihat saja
//   node scripts/pulihkan-sesi-wa.js --apply   # bersihkan
//   pm2 start bot-siska
//
// WAJIB dihentikan dulu: menghapus berkas profil sementara Chromium
// masih memakainya justru membuat kerusakan baru.

const profilWA = require("../features/profilWA");

const TERAPKAN = process.argv.includes("--apply");

async function main() {
  const sesi = profilWA.folderSesi();

  console.log(`Profil sesi: ${sesi}\n`);

  const kunci = TERAPKAN ? await profilWA.hapusKunci(sesi) : [];
  const cache = await profilWA.hapusCache(sesi, { hanyaLihat: !TERAPKAN });

  if (cache.length === 0) {
    console.log("Tidak ada cache yang perlu dibuang.");
  } else {
    console.log(TERAPKAN ? "Dibuang:" : "Akan dibuang:");
    for (const nama of cache) console.log(`  - ${nama}`);
  }

  if (kunci.length) {
    console.log(`\nSisa kunci proses dibuang: ${kunci.join(", ")}`);
  }

  console.log("\nTIDAK disentuh (di sinilah sesi WhatsApp Anda):");
  for (const nama of profilWA.JANGAN_DISENTUH) console.log(`  - ${nama}`);

  if (!TERAPKAN) {
    console.log("\nMode lihat saja. Tambahkan --apply untuk membersihkan.");
    return;
  }

  await profilWA.tulisGagal(0, sesi);

  console.log("\nSelesai. Jalankan lagi: pm2 start bot-siska");
  console.log("Kalau setelah ini masih mentok di AUTHENTICATED, berarti");
  console.log("penyebabnya bukan cache — kirimkan log dari `pm2 logs bot-siska`,");
  console.log("terutama baris [WA] Perubahan state.");
}

main().catch((err) => {
  console.error("GAGAL:", err?.message || err);
  process.exitCode = 1;
});
