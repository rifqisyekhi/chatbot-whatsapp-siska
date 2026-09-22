// =========================================================
// TAMBALAN whatsapp-web.js — EVENT "READY" YANG TIDAK PERNAH DATANG
// =========================================================
//
// Gejalanya: bot AUTHENTICATED, loading sampai 99%, lalu diam
// selamanya. Tidak ada error, tidak ada state yang berubah. Hanya
// muncul saat sesi dipulihkan dari profil yang sudah ada — start
// pertama sesudah scan QR selalu mulus. Itu sebabnya obat yang
// "berhasil" selama ini adalah menghapus .wwebjs_auth: bukan karena
// sesinya rusak, tapi karena menghapusnya memaksa jalur QR yang
// memang tidak kena bug ini.
//
// Dilaporkan ramai-ramai di wwebjs/whatsapp-web.js#5685 dan
// diperbaiki di PR #5755 — tetapi PR itu DITUTUP TANPA DI-MERGE.
// Versi 1.34.7 (rilis 8 Juli 2026) masih memuat kedua bug di bawah.
//
// DUA TAMBALAN
//
// 1. Client.js — pemeriksaan "apakah sudah disuntik?" hanya melihat
//    window.WWebJS. Pada pemulihan sesi, WWebJS bisa sudah ada
//    sementara window.Store belum. Pustaka menyimpulkan penyuntikan
//    selesai, melewatinya, lalu tersandung pada Store yang tidak ada
//    — di dalam callback binding, tempat error tidak muncul ke mana
//    pun. READY tidak pernah dipancarkan.
//
// 2. util/Puppeteer.js — exposeFunction dilempar apa adanya. Setelah
//    halaman bernavigasi, konteks halaman bersih tetapi binding CDP
//    masih ada, sehingga muncul "window['...'] already exists!" dan
//    penyuntikan berhenti di tengah jalan.
//
// SIFAT SKRIP INI
//
//   - Idempoten: dijalankan berkali-kali tidak menumpuk.
//   - Menolak menambal kalau teks aslinya tidak ditemukan — artinya
//     pustaka sudah berubah (mungkin sudah diperbaiki sendiri), dan
//     menambal secara buta justru berbahaya.
//   - Tidak pernah menggagalkan `npm install`. Kalau gagal, ia
//     berisik di log dan selesai dengan status 0.
//   - Hilang setiap kali node_modules dipasang ulang — karena itu
//     dipasang sebagai "postinstall" di package.json.

const fs = require("fs");
const path = require("path");

const AKAR = path.join(__dirname, "..", "node_modules", "whatsapp-web.js", "src");

// =========================================================
// TAMBALAN YANG DIBATALKAN
// =========================================================
//
// 18–21 September 2026 saya menduga kegagalan pengiriman media berasal
// dari mediaEntry.mmsUrl yang kosong, lalu memasang pemilih URL di
// Injected/Utils.js. Dugaan itu KELIRU — penyebab sebenarnya adalah
// tabrakan properti id (lihat tambalan "id pesan" di bawah).
//
// Tambalan itu harus dicabut, bukan sekadar ditinggalkan: begitu bug
// aslinya sembuh, pemilih URL itu bisa mengisi clientUrl dengan alamat
// yang salah — berkasnya terkirim tapi gagal dibuka penerimanya.
//
// Dicabut otomatis karena mesin yang sudah terlanjur memasangnya tidak
// akan tersentuh tambalan baru: skrip ini melewati berkas yang
// penandanya sudah ada.
const PEMBATALAN = [
  {
    nama: "Injected/Utils.js — cabut pemilih URL unggah (dugaan yang keliru)",
    berkas: path.join(AKAR, "util", "Injected", "Utils.js"),
    penanda: "__wwebjsMediaEntryKeys",
    awal: "            // TAMBALAN — SELURUH PENGIRIMAN MEDIA GAGAL.",
    akhir: "            })(),",
    ganti: "            clientUrl: mediaEntry.mmsUrl,",
  },
];

// CATATAN PENTING — tambalan yang SENGAJA TIDAK dipakai.
//
// PR #5755 juga menambahkan `window.Store` ke pemeriksaan penyuntikan
// di Client.js. Jangan disalin ke sini: PR itu ditulis Januari untuk
// arsitektur lama, sedangkan 1.34.7 SUDAH TIDAK MEMBUAT window.Store
// sama sekali — seluruh src hanya memakai window.require(...) langsung
// dan window.WWebJS. Menambahkannya membuat pemeriksaan selalu gagal,
// sehingga pustaka menyuntik ulang di setiap autentikasi — persis
// pemicu error "binding already exists" yang dikeluhkan di utas itu.
const TAMBALAN = [
  {
    nama: "Client.js — pendengar halaman tidak lagi menumpuk tiap sinkronisasi",
    berkas: path.join(AKAR, "Client.js"),
    cari: "    async attachEventListeners() {",
    ganti: [
      "    async attachEventListeners() {",
      "        // Dipanggil ulang setiap sinkronisasi selesai (lihat",
      "        // pemanggilnya), tanpa mencabut pendengar lama — sehingga satu",
      "        // pesan masuk dipancarkan sebanyak jumlah pemanggilan. Gejalanya:",
      "        // user mengetik sekali, bot membalas berkali-kali.",
      "        //",
      "        // Penandanya sengaja ditaruh DI HALAMAN, bukan di Node: kalau",
      "        // halaman benar-benar dimuat ulang, pendengarnya memang ikut",
      "        // hilang dan penandanya ikut hilang juga, jadi pemasangan ulang",
      "        // tetap terjadi saat memang dibutuhkan.",
      "        const sudahTerpasang = await this.pupPage",
      "            .evaluate(() => {",
      "                if (window.__wwebjsListenersAttached) return true;",
      "                window.__wwebjsListenersAttached = true;",
      "                return false;",
      "            })",
      "            .catch(() => false);",
      "",
      "        if (sudahTerpasang) return;",
    ].join("\n"),
    penanda: "__wwebjsListenersAttached",
  },
  {
    nama: "util/Puppeteer.js — binding CDP yang sudah ada tidak lagi fatal",
    berkas: path.join(AKAR, "util", "Puppeteer.js"),
    cari: "    await page.exposeFunction(name, fn);",
    ganti: [
      "    try {",
      "        await page.exposeFunction(name, fn);",
      "    } catch (err) {",
      "        // Binding CDP-nya masih ada dari konteks halaman sebelumnya.",
      "        // Dipasang ulang; kalau pencabutan gagal, binding lama tetap",
      "        // dipakai dan itu sudah cukup.",
      "        if (!String(err?.message || '').includes('already exists')) throw err;",
      "        try {",
      "            await page.removeExposedFunction(name);",
      "            await page.exposeFunction(name, fn);",
      "        } catch {}",
      "    }",
    ].join("\n"),
    penanda: "already exists",
  },
  {
    nama: "Injected/Utils.js — id pesan media tidak lagi ditimpa model MobX",
    berkas: path.join(AKAR, "util", "Injected", "Utils.js"),
    cari: [
      "            ...extraOptions,",
      "        };",
      "",
      "        // Bot's won't reply if canonicalUrl is set (linking)",
    ].join("\n"),
    ganti: [
      "            ...extraOptions,",
      "        };",
      "",
      "        // TAMBALAN — SEMUA PENGIRIMAN MEDIA GAGAL SEJAK 18 SEPTEMBER 2026.",
      "        //",
      "        // mediaOptions adalah model MobX (MediaData). Menyebarnya ke dalam",
      "        // objek message ikut membawa properti internalnya — __x_id, dan",
      "        // pada build WhatsApp yang baru juga id — sehingga message.id yang",
      "        // seharusnya berisi newMsgKey (sebuah MsgKey) tertimpa id milik",
      "        // model media.",
      "        //",
      "        // Akibatnya getValidatedSender() gagal saat Msg diinisialisasi, dan",
      "        // yang muncul ke permukaan hanya pesan yang tidak menjelaskan apa",
      "        // pun: 'Data passed to getter must include an id property",
      "        // (it's how we memoize) but got undefined'.",
      "        //",
      "        // Hanya pesan bermedia yang kena — foto absensi, PDF laporan WFH,",
      "        // PDF serah terima barang. Pesan teks tidak menyebar mediaOptions",
      "        // sama sekali, itu sebabnya balasan bot tetap normal.",
      "        //",
      "        // Sumber: wwebjs/whatsapp-web.js#201922, PR #201923 dan #201924.",
      "        // Keduanya masih TERBUKA — belum ada rilis npm yang memuatnya,",
      "        // jadi tambalan ini masih dibutuhkan. Hapus begitu versi barunya",
      "        // rilis.",
      "        delete message.__x_id;",
      "        message.id = newMsgKey;",
      "",
      "        // Bot's won't reply if canonicalUrl is set (linking)",
    ].join("\n"),
    penanda: "delete message.__x_id;",
  },
];

// Mencabut tambalan yang terbukti salah. Dijalankan lebih dulu supaya
// berkas pustaka kembali ke bentuk yang dikenali tambalan berikutnya.
function jalankanPembatalan() {
  for (const p of PEMBATALAN) {
    if (!fs.existsSync(p.berkas)) continue;

    const isi = fs.readFileSync(p.berkas, "utf8");

    if (!isi.includes(p.penanda)) continue;

    const mulai = isi.indexOf(p.awal);
    const habis = mulai === -1 ? -1 : isi.indexOf(p.akhir, mulai);

    if (mulai === -1 || habis === -1) {
      console.warn(
        `[TAMBAL] DILEWATI pembatalan: ${p.nama}\n` +
          "         Penandanya ada tapi bloknya tidak utuh. Periksa manual.",
      );
      continue;
    }

    fs.writeFileSync(
      p.berkas,
      isi.slice(0, mulai) + p.ganti + isi.slice(habis + p.akhir.length),
    );

    console.log(`[TAMBAL] Dibatalkan: ${p.nama}`);
  }
}

function main() {
  if (!fs.existsSync(AKAR)) {
    console.warn("[TAMBAL] whatsapp-web.js belum terpasang, dilewati.");
    return;
  }

  jalankanPembatalan();

  for (const t of TAMBALAN) {
    if (!fs.existsSync(t.berkas)) {
      console.warn(`[TAMBAL] Tidak ada ${path.basename(t.berkas)}, dilewati.`);
      continue;
    }

    const isi = fs.readFileSync(t.berkas, "utf8");

    if (isi.includes(t.penanda)) {
      console.log(`[TAMBAL] Sudah tertambal: ${t.nama}`);
      continue;
    }

    const jumlah = isi.split(t.cari).length - 1;

    if (jumlah !== 1) {
      console.warn(
        `[TAMBAL] DILEWATI: ${t.nama}\n` +
          `         Teks aslinya ditemukan ${jumlah} kali (diharapkan tepat 1).\n` +
          "         Pustakanya kemungkinan sudah berubah versi. Periksa manual.",
      );
      continue;
    }

    fs.writeFileSync(t.berkas, isi.replace(t.cari, t.ganti));
    console.log(`[TAMBAL] Diterapkan: ${t.nama}`);
  }
}

try {
  main();
} catch (err) {
  console.error("[TAMBAL] Gagal, dilewati:", err?.message || err);
}
