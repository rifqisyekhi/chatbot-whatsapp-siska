// =========================================================
// LIHAT DETAIL PEGAWAI BER-NIP KEMBAR
// =========================================================
//
// scripts/perbaiki-index-nip.js hanya memberi tahu BAHWA ada
// NIP kembar. Skrip ini menampilkan kedua datanya utuh
// berdampingan supaya bisa diputuskan mana yang keliru, dan
// seberapa luas dampaknya.
//
// PEMAKAIAN
//
//   node scripts/lihat-nip-kembar.js
//
// Skrip ini HANYA MEMBACA.
//
// PERHATIAN: keluarannya memuat NIP dan nomor WhatsApp secara
// utuh — memang itu gunanya. Jangan ditempel ke grup chat atau
// tempat umum.

require("dotenv").config();

const mongoose = require("mongoose");

const KOLOM = [
  "nama",
  "nip",
  "no_wa",
  "jabatan",
  "sub_unit",
  "kategori_pegawai",
  "atasan_nip",
  "email",
];

async function main() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("❌ MONGO_URI belum diset di file .env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const koleksi = mongoose.connection.db.collection("pegawai");

  const kembar = await koleksi
    .aggregate([
      { $match: { nip: { $type: "string", $gt: "" } } },
      { $group: { _id: "$nip", jumlah: { $sum: 1 } } },
      { $match: { jumlah: { $gt: 1 } } },
    ])
    .toArray();

  if (!kembar.length) {
    console.log("✅ Tidak ada NIP kembar.");

    await mongoose.disconnect();
    return;
  }

  console.log(`Ditemukan ${kembar.length} NIP yang dipakai lebih dari satu orang.\n`);

  for (const k of kembar) {
    const orang = await koleksi.find({ nip: k._id }).toArray();

    console.log("=".repeat(60));
    console.log(`NIP ${k._id} — dipakai ${orang.length} orang`);
    console.log("=".repeat(60));

    for (const [i, o] of orang.entries()) {
      console.log(`\n  [${i + 1}] _id: ${o._id}`);

      for (const kolom of KOLOM) {
        const nilai = o[kolom];

        console.log(
          `      ${kolom.padEnd(18)}: ${
            nilai === undefined
              ? "(field tidak ada)"
              : String(nilai).trim() || "(kosong)"
          }`,
        );
      }

      // Field di luar daftar tetap ditampilkan, supaya tidak
      // ada keterangan yang luput saat memutuskan.
      const lain = Object.keys(o).filter(
        (x) => !KOLOM.includes(x) && x !== "_id",
      );

      if (lain.length) {
        console.log(
          `      (field lain)      : ${lain
            .map((x) => `${x}=${o[x]}`)
            .join(", ")}`,
        );
      }
    }

    // -----------------------------------------------------
    // SEBERAPA LUAS DAMPAKNYA
    // -----------------------------------------------------

    const bawahan = await koleksi
      .find({ atasan_nip: k._id })
      .project({ nama: 1, no_wa: 1 })
      .toArray();

    console.log(
      `\n  Pegawai yang menjadikan NIP ini sebagai atasan: ${bawahan.length}`,
    );

    for (const b of bawahan) {
      console.log(`    - ${b.nama || "(tanpa nama)"}`);
    }

    if (bawahan.length) {
      console.log(
        "\n    ⚠️  Pengajuan lembur/cuti mereka dikirim ke salah satu dari dua\n" +
          "        orang di atas — yang mana, tidak bisa dipastikan.",
      );
    }

    // Kendaraan memakai NIP sebagai penanda peminjam.
    try {
      const kendaraan = mongoose.connection.db.collection("kendaraans");

      const dipinjam = await kendaraan
        .find({ peminjam_saat_ini: k._id })
        .project({ nama: 1, plat: 1 })
        .toArray();

      if (dipinjam.length) {
        console.log(
          `\n  ⚠️  Kendaraan yang tercatat dipinjam dengan NIP ini: ${dipinjam.length}`,
        );

        for (const d of dipinjam) {
          console.log(`    - ${d.nama || "-"} (${d.plat || "-"})`);
        }

        console.log(
          "        Keduanya sama-sama bisa mengembalikannya.",
        );
      }
    } catch (e) {
      // Nama koleksi kendaraan bisa berbeda; bukan alasan
      // menggagalkan seluruh laporan.
      console.log(`\n  (Koleksi kendaraan tidak terbaca: ${e.message})`);
    }

    console.log("");
  }

  console.log(
    "Betulkan lewat http://192.168.221.44:8002/admin, lalu jalankan:\n" +
      "  node scripts/perbaiki-index-nip.js --apply",
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ Gagal:", err);

  try {
    await mongoose.disconnect();
  } catch {}

  process.exit(1);
});
