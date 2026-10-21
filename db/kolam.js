// =========================================================
// KOLAM KONEKSI POSTGRESQL
// =========================================================
//
// Satu kolam untuk seluruh proses. Bukan satu koneksi per
// permintaan: membuka koneksi Postgres jauh lebih mahal daripada
// menjalankan kueri.
//
// Salinan dari presensi-non-asn/backend/db/kolam.js. Sengaja
// disalin, bukan dibagi: keduanya proses terpisah di folder
// terpisah, dan menjadikannya paket bersama berarti satu langkah
// pemasangan lagi di VPS untuk sesuatu yang jarang berubah.
//
// Mongoose dulu mengurus ini sendiri di balik layar — itu
// sebabnya kode rute tidak pernah menyebut koneksi sama sekali.
// Di sini pun begitu: rute memanggil kueri(), tidak pernah
// menyentuh kolam.

const { Pool, types } = require("pg");

// =========================================================
// bigint DIBACA SEBAGAI ANGKA, BUKAN STRING
// =========================================================
//
// pg mengembalikan bigint (int8) sebagai STRING, bukan number —
// bawaan yang benar secara umum, karena bigint bisa melebihi
// batas aman angka JavaScript (2^53).
//
// Tapi di sini itu sumber bug yang halus: kunci baris jadi "16"
// alih-alih 16, dan setiap perbandingan === dengan angka gagal
// tanpa error apa pun. Mongo dulu mengembalikan ObjectId yang
// selalu dibandingkan sebagai string, jadi masalah ini tidak
// pernah ada dan tidak ada kode yang berjaga-jaga terhadapnya.
//
// Tabel di sini tidak akan pernah mendekati 2^53 baris —
// absensi bertambah puluhan per hari — jadi membacanya sebagai
// angka aman, dan membuat perilakunya seragam di seluruh kode.
types.setTypeParser(types.builtins.INT8, (nilai) =>
  nilai === null ? null : Number(nilai),
);

if (!process.env.DATABASE_URL) {
  // Dilempar saat dimuat, bukan saat kueri pertama. Backend yang
  // menyala tanpa database lalu gagal di permintaan pertama jauh
  // lebih sulit ditelusuri daripada yang menolak menyala.
  throw new Error(
    "DATABASE_URL kosong. Isi di .env, contoh:\n" +
      "  DATABASE_URL=postgresql://postgres:sandi@127.0.0.1:5432/db_siska",
  );
}

const kolam = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Atlas dulu melayani puluhan koneksi; Postgres bawaan hanya
  // 100 untuk SELURUH server. Backend dan bot sama-sama
  // menyambung, jadi masing-masing dibatasi supaya tidak ada yang
  // bisa menghabiskan jatah yang lain.
  max: 10,

  // Koneksi menganggur ditutup, bukan dipegang selamanya. Kalau
  // Postgres di VPS direstart, koneksi lama tidak ikut mati
  // sendiri — yang terjadi hanya kueri yang menggantung.
  idleTimeoutMillis: 30000,

  // Lebih baik gagal cepat dengan pesan jelas daripada permintaan
  // HTTP yang menggantung tanpa batas.
  connectionTimeoutMillis: 10000,
});

// Error pada koneksi yang sedang menganggur tidak terikat pada
// kueri mana pun, jadi tidak ada yang menangkapnya — dan di Node
// itu berarti proses mati. Dicatat lalu dibiarkan; kolam membuat
// koneksi baru sendiri.
kolam.on("error", (err) => {
  console.error("❌ [POSTGRES] Error pada koneksi menganggur:", err.message);
});

async function kueri(sql, params = []) {
  return kolam.query(sql, params);
}

// Mengembalikan baris pertama atau null — bentuk yang paling
// sering dibutuhkan, dan menuliskannya berulang kali di setiap
// pemanggil hanya memperbesar peluang lupa memeriksa.
async function satuBaris(sql, params = []) {
  const { rows } = await kolam.query(sql, params);

  return rows[0] || null;
}

async function semuaBaris(sql, params = []) {
  const { rows } = await kolam.query(sql, params);

  return rows;
}

// Menjalankan beberapa kueri dalam satu transaksi, pada koneksi
// yang sama.
//
// Dibutuhkan karena absensi dan riwayat perubahannya kini di dua
// tabel: menyimpan perubahan jam berarti UPDATE absensi DAN
// INSERT riwayat. Kalau yang kedua gagal, yang pertama harus ikut
// dibatalkan — kalau tidak, jamnya berubah tanpa jejak, dan
// justru jejak itu alasan fiturnya ada.
//
// Di Mongo keduanya satu dokumen sehingga satu operasi; di sini
// transaksilah yang menggantikan jaminan itu.
async function dalamTransaksi(kerjakan) {
  const koneksi = await kolam.connect();

  try {
    await koneksi.query("BEGIN");

    const hasil = await kerjakan(koneksi);

    await koneksi.query("COMMIT");

    return hasil;
  } catch (err) {
    await koneksi.query("ROLLBACK").catch(() => {});

    throw err;
  } finally {
    // Wajib, bahkan saat gagal: koneksi yang tidak dilepas tidak
    // pernah kembali ke kolam, dan sepuluh kegagalan sudah cukup
    // membuat backend berhenti melayani apa pun.
    koneksi.release();
  }
}

// Dipanggil sekali saat start supaya kegagalan koneksi muncul di
// log start, bukan pada permintaan pertama seorang pegawai.
async function pastikanTersambung() {
  const baris = await satuBaris(
    "SELECT current_database() AS db, version() AS versi",
  );

  console.log(
    `🐘 Postgres tersambung: ${baris.db} (${String(baris.versi).split(",")[0]})`,
  );

  return baris;
}

async function tutup() {
  await kolam.end();
}

module.exports = {
  kolam,
  kueri,
  satuBaris,
  semuaBaris,
  dalamTransaksi,
  pastikanTersambung,
  tutup,
};
