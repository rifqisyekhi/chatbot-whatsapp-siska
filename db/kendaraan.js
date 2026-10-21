// =========================================================
// AKSES DATA KENDARAAN
// =========================================================
//
// Menggantikan models/Kendaraan.js (Mongoose).
//
// DUA JENIS "ID", DAN KEDUANYA DIPAKAI
//
// Di Mongo, kendaraan punya medan `id` berupa String — kode yang
// diketik pegawai saat memilih kendaraan di WhatsApp — DI SAMPING
// `_id` ObjectId bawaan. Kode bot memakai keduanya:
//
//   m.id === flow.kendaraanId        kode, dari pesan pegawai
//   Kendaraan.findByIdAndUpdate(_id) ObjectId, dari Master Data TU
//
// Di Postgres kodenya jadi kolom `kode_kendaraan` dan primary
// key-nya `id` bigint. Supaya kode lama tetap bekerja, bentuk
// yang dikembalikan memetakan keduanya seperti dulu:
//
//   .id   -> kode_kendaraan   (kode yang diketik pegawai)
//   ._id  -> id               (kunci baris, untuk Master Data)
//
// Kalau keduanya tertukar, pegawai bisa meminjam kendaraan yang
// salah — jadi pemetaan ini yang paling penting dijaga di modul
// ini.

const { satuBaris, semuaBaris } = require("./kolam");

const KOLOM = `
  id, kode_kendaraan, nama, plat, jenis, status,
  peminjam_saat_ini, waktu_pinjam, tujuan_aktif
`;

function keBentukLama(b) {
  if (!b) return null;

  return {
    _id: b.id,
    id: b.kode_kendaraan,

    nama: b.nama,
    plat: b.plat,
    jenis: b.jenis,
    status: b.status,
    peminjam_saat_ini: b.peminjam_saat_ini,
    waktu_pinjam: b.waktu_pinjam,
    tujuan_aktif: b.tujuan_aktif,
  };
}

function idSah(id) {
  const n = Number(id);

  return Number.isInteger(n) && n > 0;
}

async function semua() {
  const baris = await semuaBaris(
    `SELECT ${KOLOM} FROM kendaraan ORDER BY nama`,
  );

  return baris.map(keBentukLama);
}

const KOLOM_BOLEH_DIUBAH = [
  "nama",
  "plat",
  "jenis",
  "status",
  "peminjam_saat_ini",
  "waktu_pinjam",
  "tujuan_aktif",
];

function saring(data) {
  const keluar = {};

  for (const k of KOLOM_BOLEH_DIUBAH) {
    // null DIPERTAHANKAN, tidak dianggap "tidak diisi": alur
    // pengembalian kendaraan justru mengosongkan ketiga medan
    // peminjam dengan null, dan itu yang menandai kendaraannya
    // tersedia lagi.
    if (data[k] !== undefined) keluar[k] = data[k];
  }

  // Kode kendaraan boleh diubah dari Master Data, tapi namanya
  // berbeda di tabel.
  if (data.id !== undefined) keluar.kode_kendaraan = data.id;
  if (data.kode_kendaraan !== undefined) {
    keluar.kode_kendaraan = data.kode_kendaraan;
  }

  return keluar;
}

// Pengganti Kendaraan.findOneAndUpdate({ id: kode }, { ... }).
//
// Dipakai alur peminjaman dan pengembalian — kodenya yang
// dipegang alur, bukan kunci barisnya.
async function perbaruiPerKode(kode, data) {
  const k = String(kode || "").trim();

  if (!k) return null;

  const kolom = saring(data);

  const nama = Object.keys(kolom);

  if (!nama.length) {
    return keBentukLama(
      await satuBaris(
        `SELECT ${KOLOM} FROM kendaraan WHERE kode_kendaraan = $1`,
        [k],
      ),
    );
  }

  return keBentukLama(
    await satuBaris(
      `UPDATE kendaraan SET ${nama.map((n, i) => `${n} = $${i + 2}`).join(", ")}
        WHERE kode_kendaraan = $1 RETURNING ${KOLOM}`,
      [k, ...nama.map((n) => kolom[n])],
    ),
  );
}

async function buat(data) {
  const kolom = saring(data);

  const nama = Object.keys(kolom);

  if (!nama.length) throw new Error("Tidak ada data kendaraan yang bisa disimpan.");

  return keBentukLama(
    await satuBaris(
      `INSERT INTO kendaraan (${nama.join(", ")})
       VALUES (${nama.map((_, i) => `$${i + 1}`).join(", ")})
       RETURNING ${KOLOM}`,
      nama.map((n) => kolom[n]),
    ),
  );
}

// Pengganti findByIdAndUpdate — dipakai Master Data TU, yang
// memegang kunci baris.
async function perbaruiPerId(id, data) {
  if (!idSah(id)) return null;

  const kolom = saring(data);

  const nama = Object.keys(kolom);

  if (!nama.length) {
    return keBentukLama(
      await satuBaris(`SELECT ${KOLOM} FROM kendaraan WHERE id = $1`, [
        Number(id),
      ]),
    );
  }

  return keBentukLama(
    await satuBaris(
      `UPDATE kendaraan SET ${nama.map((n, i) => `${n} = $${i + 2}`).join(", ")}
        WHERE id = $1 RETURNING ${KOLOM}`,
      [Number(id), ...nama.map((n) => kolom[n])],
    ),
  );
}

async function hapusPerId(id) {
  if (!idSah(id)) return null;

  return keBentukLama(
    await satuBaris(`DELETE FROM kendaraan WHERE id = $1 RETURNING ${KOLOM}`, [
      Number(id),
    ]),
  );
}

module.exports = {
  idSah,
  semua,
  perbaruiPerKode,
  buat,
  perbaruiPerId,
  hapusPerId,
  keBentukLama,
};
