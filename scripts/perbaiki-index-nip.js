// =========================================================
// PERBAIKI INDEX UNIK nip PADA KOLEKSI pegawai
// =========================================================
//
// MASALAHNYA
//
// Koleksi pegawai punya index unik biasa pada `nip`, warisan
// dari `nip: { required: true, unique: true }` di model lama.
// Index seperti itu menganggap dua dokumen ber-nip kosong
// sebagai duplikat, sehingga pegawai PPNPN atau magang kedua
// gagal ditambahkan dengan error E11000 yang membingungkan.
//
// Mengubah model saja tidak cukup: index yang sudah terlanjur
// dibuat di MongoDB tidak ikut terhapus.
//
// SOLUSINYA
//
// Ganti dengan index unik PARSIAL yang hanya berlaku untuk nip
// yang benar-benar terisi. NIP tetap dijaga unik — itu penting
// karena dipakai sebagai kunci pencarian atasan dan penanda
// peminjam kendaraan — tapi yang kosong tidak lagi saling
// bertabrakan.
//
// PEMAKAIAN
//
//   node scripts/perbaiki-index-nip.js           (uji coba)
//   node scripts/perbaiki-index-nip.js --apply   (jalankan)
//
// Tanpa --apply tidak ada yang diubah.

require("dotenv").config();

const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

const NAMA_BARU = "nip_unik_jika_terisi";

async function main() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("❌ MONGO_URI belum diset di file .env");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const koleksi = mongoose.connection.db.collection("pegawai");

  console.log(`Mode: ${APPLY ? "JALANKAN (--apply)" : "UJI COBA"}\n`);

  // -------------------------------------------------------
  // 1. INDEX YANG ADA SEKARANG
  // -------------------------------------------------------

  const index = await koleksi.indexes();

  console.log("=== INDEX SAAT INI ===");

  for (const i of index) {
    const sifat = [
      i.unique ? "unik" : "",
      i.partialFilterExpression ? "parsial" : "",
    ]
      .filter(Boolean)
      .join(", ");

    console.log(
      `  ${i.name.padEnd(26)} ${JSON.stringify(i.key)}${sifat ? "  (" + sifat + ")" : ""}`,
    );
  }

  const lama = index.find(
    (i) =>
      i.name !== NAMA_BARU &&
      i.unique &&
      !i.partialFilterExpression &&
      JSON.stringify(i.key) === JSON.stringify({ nip: 1 }),
  );

  const sudahBenar = index.find((i) => i.name === NAMA_BARU);

  if (sudahBenar && !lama) {
    console.log("\n✅ Index sudah benar. Tidak ada yang perlu dikerjakan.");

    await mongoose.disconnect();
    return;
  }

  // -------------------------------------------------------
  // 2. PASTIKAN TIDAK ADA NIP KEMBAR
  // -------------------------------------------------------

  // Index unik parsial akan gagal dibuat kalau ada nilai nip
  // terisi yang kembar. Diperiksa dulu supaya kegagalannya
  // tidak muncul sebagai error mentah di tengah jalan.

  const kembar = await koleksi
    .aggregate([
      { $match: { nip: { $type: "string", $gt: "" } } },
      { $group: { _id: "$nip", jumlah: { $sum: 1 }, nama: { $push: "$nama" } } },
      { $match: { jumlah: { $gt: 1 } } },
    ])
    .toArray();

  if (kembar.length) {
    console.log(`\n❌ Ada ${kembar.length} nilai nip yang dipakai lebih dari satu orang:`);

    for (const k of kembar) {
      console.log(
        `   …${String(k._id).slice(-4)}  →  ${k.nama.join(", ")}`,
      );
    }

    console.log(
      "\nBetulkan dulu lewat Master Data Pegawai (http://192.168.221.44:8002/admin),\n" +
        "baru jalankan skrip ini lagi. Index unik tidak bisa dibuat selama masih kembar.",
    );

    await mongoose.disconnect();
    process.exit(1);
  }

  const kosong = await koleksi.countDocuments({
    $or: [{ nip: "" }, { nip: null }, { nip: { $exists: false } }],
  });

  console.log(`\nDokumen dengan nip kosong / tanpa nip: ${kosong}`);
  console.log("Nilai nip kembar: tidak ada");

  // -------------------------------------------------------
  // 3. RENCANA
  // -------------------------------------------------------

  console.log("\n=== RENCANA ===");

  if (lama) console.log(`  1. Hapus index lama: ${lama.name}`);

  console.log(
    `  ${lama ? "2" : "1"}. Buat index parsial: ${NAMA_BARU}` +
      " { nip: 1 } unik, hanya untuk nip terisi",
  );

  if (!APPLY) {
    console.log(
      "\nIni baru uji coba — tidak ada yang diubah.\n" +
        "Jalankan ulang dengan --apply untuk menerapkannya.",
    );

    await mongoose.disconnect();
    return;
  }

  // -------------------------------------------------------
  // 4. TERAPKAN
  // -------------------------------------------------------

  if (lama) {
    await koleksi.dropIndex(lama.name);
    console.log(`\n✅ Index lama dihapus: ${lama.name}`);
  }

  if (!sudahBenar) {
    await koleksi.createIndex(
      { nip: 1 },
      {
        unique: true,
        partialFilterExpression: { nip: { $gt: "" } },
        name: NAMA_BARU,
      },
    );

    console.log(`✅ Index parsial dibuat: ${NAMA_BARU}`);
  }

  console.log("\n=== INDEX SETELAH PERUBAHAN ===");

  for (const i of await koleksi.indexes()) {
    console.log(`  ${i.name.padEnd(26)} ${JSON.stringify(i.key)}`);
  }

  console.log(
    "\nSelesai. Pegawai tanpa NIP sekarang bisa ditambahkan lebih dari satu.",
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
