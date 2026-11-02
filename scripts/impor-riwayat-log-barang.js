// =========================================================
// IMPOR RIWAYAT ORDER BARANG DARI LOG BOT KE REKAP MUTASI
// =========================================================
//
// Rekap mutasi barang (db/005-mutasi-barang.sql) baru ada sejak
// 2 November 2026. Order WhatsApp sebelum itu hanya meninggalkan
// jejak di logs/<nomor>.log — skrip ini membaca jejak itu dan
// memasukkannya ke rekap sebagai riwayat.
//
// YANG DIBACA
//
//   📦 *ORDER PERSEDIAAN DISETUJUI*      dikirim ke tim gudang saat
//                                       atasan menyetujui. Saat
//                                       itulah stok dikurangi, jadi
//                                       ini dicatat sebagai `keluar`.
//   ❌ Notifikasi barang kosong telah    dikirim ke staf gudang yang
//      dikirim ke <nama>                 menandai fisik kosong. Stok
//                                       dulu dikembalikan, jadi ini
//                                       dicatat sebagai `koreksi` +.
//
// Notifikasi order dikirim ke SETIAP staf gudang (dulu tiga, kini
// dua), jadi satu order muncul di beberapa berkas log. Salinan
// dengan pemohon dan isi pesanan yang sama dalam selang 10 menit
// dianggap satu order.
//
// STOK TIDAK DIUBAH
//
// Stok sekarang sudah mencerminkan order-order ini — bot dulu
// mengurangi stoknya langsung. Mencatatnya lewat db/mutasiBarang.js
// akan mengurangi stok untuk kedua kalinya. Karena itu baris
// ditulis langsung ke tabel, dengan stok_sesudah kosong (tidak
// diketahui), dan setiap barisnya tetap dicatat di log audit.
//
// BATAS WAKTU
//
// Order sesudah rekap aktif sudah tercatat sendiri oleh bot.
// Skrip hanya mengambil log SEBELUM mutasi WA pertama yang dicatat
// bot (atau sebelum --sampai bila diberikan), supaya tidak ada
// yang tercatat dua kali.
//
// BISA DIJALANKAN BERULANG
//
// Baris yang sudah ada di rekap (barang, pemohon, jenis, dan jumlah
// sama, terpaut paling lama 15 menit) dilewati — termasuk yang
// sudah masuk dari impor ekspor chat (impor-riwayat-chat-barang.js).
//
// PEMAKAIAN
//
//   node scripts/impor-riwayat-log-barang.js                 (uji coba)
//   node scripts/impor-riwayat-log-barang.js --apply         (simpan)
//   node scripts/impor-riwayat-log-barang.js --sampai=2026-11-02T04:39:00Z
//   node scripts/impor-riwayat-log-barang.js --log=/jalur/ke/logs  (uji)
//
// Tanpa --apply tidak ada yang diubah — hanya pratinjau.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { semuaBaris, tutup } = require("../db/kolam");
const { tglWib, batasWaktu, saringSudahAda, simpan } = require("./lib/riwayatBarang");

const argumen = process.argv.slice(2);

// --log=<folder> hanya untuk menguji dengan log tiruan; di VPS
// cukup folder logs/ milik bot.
const argLog = argumen.find((a) => a.startsWith("--log="));
const DIR_LOG = argLog ? path.resolve(argLog.split("=")[1]) : path.join(__dirname, "..", "logs");
const PENANDA = "Direkonstruksi dari log bot";
const OLEH = "Impor riwayat log";

const SIMPAN = argumen.includes("--apply");

// Satu entri log: "[2026-08-19T03:12:45.123Z] [KELUAR] isi pesan",
// dan isi pesan boleh berlanjut ke baris-baris berikutnya sampai
// entri berikutnya dimulai.
const AWAL_ENTRI = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] \[([A-Z_]+)\] ?/;

function bacaEntri(berkas) {
  const entri = [];
  let kini = null;

  for (const baris of fs.readFileSync(berkas, "utf8").split(/\r?\n/)) {
    const m = baris.match(AWAL_ENTRI);

    if (m) {
      if (kini) entri.push(kini);
      kini = { waktu: new Date(m[1]), jenis: m[2], teks: baris.slice(m[0].length), berkas };
    } else if (kini) {
      kini.teks += `\n${baris}`;
    }
  }

  if (kini) entri.push(kini);

  return entri;
}

// Sama persis dengan pengurai di index.js (alur !ORDER_BARANG):
// "[ATK-003] Kertas A4 Bola Dunia 80gsm (2 Rim)".
const POLA_BARANG = /\[(.*?)\] (.*?) \((\d+) (.*?)\)/g;

function uraiOrder(e) {
  if (!e.teks.includes("ORDER PERSEDIAAN DISETUJUI")) return null;

  const pemohon = (e.teks.match(/\*Pemohon:\*\s*(.+)/) || [])[1]?.trim() || "";
  const unit = (e.teks.match(/\*Unit:\*\s*(.+)/) || [])[1]?.trim() || "";
  const bagian = e.teks.split(/\*Detail Pesanan:\*/)[1] || "";
  const pesanan = bagian.split(/\n_Mohon|\n\*Balas/)[0].trim();

  const barang = [];
  let m;
  POLA_BARANG.lastIndex = 0;

  while ((m = POLA_BARANG.exec(pesanan)) !== null) {
    barang.push({ id: m[1].trim(), nama: m[2].trim(), jumlah: parseInt(m[3], 10), satuan: m[4].trim() });
  }

  return { waktu: e.waktu, pemohon, unit: unit === "-" ? "" : unit, pesanan, barang, berkas: e.berkas };
}

function uraiBatal(e) {
  const m = e.teks.match(/Notifikasi barang kosong telah dikirim ke (.+?)\. Stok di sistem/);

  return m ? { waktu: e.waktu, pemohon: m[1].trim(), berkas: e.berkas } : null;
}

// Satu order tercatat di log setiap staf gudang. Salinannya
// digabung: pemohon dan isi pesanan sama, terpaut paling lama 10
// menit (bot memberi jeda 1 detik antarpenerima).
function gabungSalinan(daftar, kunci) {
  const urut = [...daftar].sort((a, b) => a.waktu - b.waktu);
  const hasil = [];

  for (const o of urut) {
    const kembar = hasil.find(
      (h) => kunci(h) === kunci(o) && Math.abs(o.waktu - h.waktu) <= 10 * 60 * 1000,
    );

    if (kembar) kembar.salinan += 1;
    else hasil.push({ ...o, salinan: 1 });
  }

  return hasil;
}

(async () => {
  if (!fs.existsSync(DIR_LOG)) throw new Error(`Folder log tidak ada: ${DIR_LOG}`);

  const sampai = await batasWaktu(argumen);

  // --- BACA LOG ---
  const semua = fs
    .readdirSync(DIR_LOG)
    .filter((n) => n.endsWith(".log"))
    .flatMap((n) => bacaEntri(path.join(DIR_LOG, n)))
    .filter((e) => e.jenis === "KELUAR" && e.waktu < sampai);

  const order = gabungSalinan(
    semua.map(uraiOrder).filter(Boolean),
    (o) => `${o.pemohon}|${o.pesanan}`,
  );
  const batal = gabungSalinan(semua.map(uraiBatal).filter(Boolean), (b) => b.pemohon);

  // Pembatalan dipasangkan dengan order terakhir pemohon yang sama
  // sebelum waktu pembatalan, yang belum punya pasangan.
  for (const b of batal) {
    const calon = order
      .filter((o) => o.pemohon === b.pemohon && o.waktu <= b.waktu && !o.batal)
      .sort((x, y) => y.waktu - x.waktu)[0];

    if (calon) calon.batal = b;
    else b.tanpaOrder = true;
  }

  // --- SUSUN BARIS MUTASI ---
  const katalog = new Map(
    (await semuaBaris(`SELECT id_barang, nama, satuan FROM barang`)).map((b) => [b.id_barang, b]),
  );

  const baris = [];
  const peringatan = [];

  for (const o of order) {
    if (!o.barang.length) {
      peringatan.push(`${tglWib(o.waktu)} ${o.pemohon}: daftar barang tidak terbaca — dilewati`);
      continue;
    }

    for (const b of o.barang) {
      const k = katalog.get(b.id);

      if (!k) peringatan.push(`${tglWib(o.waktu)} ${b.id} tidak ada lagi di katalog — tetap dicatat dengan nama dari log`);

      const dasar = {
        id_barang: b.id,
        nama_barang: k?.nama || b.nama,
        satuan: k?.satuan || b.satuan,
        pihak: o.pemohon,
        unit: o.unit,
      };

      baris.push({
        ...dasar,
        tanggal: o.waktu,
        jenis: "keluar",
        jumlah: b.jumlah,
        keterangan: `Order WA disetujui atasan. ${PENANDA}.`,
      });

      if (o.batal) {
        baris.push({
          ...dasar,
          tanggal: o.batal.waktu,
          jenis: "koreksi",
          jumlah: b.jumlah,
          keterangan: `Order WA dibatalkan, fisik kosong/kendala. ${PENANDA}.`,
        });
      }
    }
  }

  for (const b of batal.filter((x) => x.tanpaOrder)) {
    peringatan.push(`${tglWib(b.waktu)} pembatalan untuk ${b.pemohon} tanpa order yang cocok di log — dilewati`);
  }

  const baru = await saringSudahAda(baris);

  // --- PRATINJAU ---
  const awal = order.length ? tglWib(order[0].waktu) : "-";
  const akhir = order.length ? tglWib(order[order.length - 1].waktu) : "-";

  console.log(`\nLog dibaca sampai : ${tglWib(sampai)} WIB`);
  console.log(`Rentang order     : ${awal} s.d. ${akhir} WIB`);
  console.log(`Order ditemukan   : ${order.length} (dari ${order.reduce((n, o) => n + o.salinan, 0)} salinan notifikasi)`);
  console.log(`Order dibatalkan  : ${order.filter((o) => o.batal).length}`);
  console.log(`Baris mutasi      : ${baris.length} (baru: ${baru.length}, sudah ada: ${baris.length - baru.length})\n`);

  // Ringkasan per bulan, untuk dicocokkan dengan jumlah PDF serah
  // terima di reports/.
  const perBulan = {};
  for (const o of order) {
    const bln = tglWib(o.waktu).slice(0, 7);
    perBulan[bln] = (perBulan[bln] || 0) + 1;
  }
  console.log("Order per bulan:", perBulan, "\n");

  for (const o of order) {
    console.log(
      `${tglWib(o.waktu)}  ${o.pemohon}${o.unit ? ` (${o.unit})` : ""}${o.batal ? "  [DIBATALKAN]" : ""}`,
    );
    for (const b of o.barang) console.log(`      - [${b.id}] ${b.nama} × ${b.jumlah} ${b.satuan}`);
  }

  if (peringatan.length) {
    console.log("\nPERINGATAN:");
    for (const p of peringatan) console.log(`  ! ${p}`);
  }

  if (!SIMPAN) {
    console.log("\nUji coba saja — tidak ada yang disimpan. Tambahkan --apply untuk menyimpan.\n");
    return;
  }

  if (!baru.length) {
    console.log("\nTidak ada baris baru untuk disimpan.\n");
    return;
  }

  await simpan(baru, OLEH);

  console.log(`\n${baru.length} baris riwayat disimpan. Stok barang tidak diubah.\n`);
})()
  .catch((err) => {
    console.error("\nGAGAL:", err.message);
    process.exitCode = 1;
  })
  .finally(() => tutup());
