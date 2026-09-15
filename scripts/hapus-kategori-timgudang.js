// =========================================================
// HAPUS KATEGORI "TimGudang"
// =========================================================
//
// "Tim Gudang" adalah PERAN, bukan kategori pegawai. Petugasnya
// PPNPN biasa. Karena satu orang hanya bisa punya satu
// kategori, peran itu dulu dicatat dengan MENGGANDAKAN orangnya:
// satu dokumen PPNPN, satu dokumen TimGudang, nomor WA sama.
//
// Akibatnya pencarian pegawai berdasarkan nomor WA — yang
// dipakai bot maupun aplikasi presensi — bisa jatuh ke salinan
// yang mana saja. Salinan TimGudang tidak punya atasan dan tidak
// punya NIK, jadi yang kebetulan terambil bisa ditolak mengajukan
// lembur, atau tercetak tanpa nomor identitas di laporan.
//
// Sejak bot mencari petugas gudang lewat jabatan "Petugas
// Kebersihan" (JABATAN_TIM_GUDANG di index.js), dokumen
// TimGudang tidak dibaca apa pun lagi. Skrip ini menghapusnya.
//
// PEMAKAIAN
//
//   node scripts/hapus-kategori-timgudang.js           # lihat saja
//   node scripts/hapus-kategori-timgudang.js --apply   # hapus
//
// URUTAN PENTING: jalankan --apply HANYA SETELAH bot versi baru
// (yang memakai JABATAN_TIM_GUDANG) sudah jalan di server. Bot
// versi lama membaca daftar petugas gudang dari dokumen-dokumen
// ini; menghapusnya lebih dulu membuat notifikasi order
// persediaan tidak terkirim ke siapa pun sampai bot diperbarui.
//
// Sebelum menghapus, seluruh dokumen yang akan dihapus ditulis
// utuh ke berkas cadangan JSON di folder kerja, sehingga bisa
// dikembalikan.

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const TERAPKAN = process.argv.includes("--apply");

function normalisasiWa(nilai) {
  let s = String(nilai || "").replace(/\D/g, "");
  if (s.startsWith("08")) s = "62" + s.slice(1);
  return s;
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI tidak ada di .env");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const col = mongoose.connection.db.collection("pegawai");

  const gudang = await col.find({ kategori_pegawai: "TimGudang" }).toArray();

  if (gudang.length === 0) {
    console.log("Tidak ada dokumen TimGudang. Tidak ada yang perlu dilakukan.");
    return;
  }

  const lainnya = await col
    .find({ kategori_pegawai: { $ne: "TimGudang" } })
    .toArray();

  const kembaranPerWa = new Map();
  for (const p of lainnya) {
    const wa = normalisasiWa(p.no_wa);
    if (wa) kembaranPerWa.set(wa, p);
  }

  console.log(`Dokumen TimGudang: ${gudang.length}\n`);

  let tanpaKembaran = 0;

  for (const p of gudang) {
    const wa = normalisasiWa(p.no_wa);
    const kembaran = kembaranPerWa.get(wa);

    console.log(`  ${p.nama || "(tanpa nama)"}  wa ${wa || "-"}  _id ${p._id}`);

    if (kembaran) {
      console.log(
        `    -> salinan. Data aslinya tetap ada: ${kembaran.nama} ` +
          `(${kembaran.kategori_pegawai}, _id ${kembaran._id})`,
      );
    } else {
      tanpaKembaran++;
      console.log(
        "    -> TIDAK punya kembaran. Orang ini hilang dari data " +
          "pegawai sepenuhnya kalau dihapus.",
      );
    }
  }

  if (tanpaKembaran > 0) {
    console.log(
      `\nPERHATIKAN: ${tanpaKembaran} dokumen di atas bukan salinan. ` +
        "Pastikan memang data uji sebelum --apply.",
    );
  }

  if (!TERAPKAN) {
    console.log("\nMode lihat saja. Tambahkan --apply untuk menghapus.");
    return;
  }

  const berkasCadangan = path.resolve(
    `cadangan-timgudang-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );

  fs.writeFileSync(berkasCadangan, JSON.stringify(gudang, null, 2));
  console.log(`\nCadangan ditulis: ${berkasCadangan}`);

  const hasil = await col.deleteMany({
    _id: { $in: gudang.map((p) => p._id) },
    kategori_pegawai: "TimGudang",
  });

  console.log(`Dihapus: ${hasil.deletedCount} dokumen.`);
  console.log(
    "Restart bot supaya daftar pegawai di memorinya ikut segar: " +
      "pm2 restart bot-siska",
  );
}

main()
  .catch((err) => {
    console.error("GAGAL:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
