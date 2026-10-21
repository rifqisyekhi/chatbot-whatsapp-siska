// =========================================================
// AKSES DATA PEGAWAI (BOT)
// =========================================================
//
// Menggantikan models/Pegawai.js (Mongoose).
//
// Tabel `pegawai` dipakai bersama dengan aplikasi presensi.
// Kolomnya gabungan dari dua skema Mongo yang dulu berbeda —
// termasuk `foto_profil` yang hanya dikenal backend dan
// `atasan_nip` yang hanya dikenal bot.
//
// SATU CATATAN TENTANG MEDAN YANG TIDAK PERNAH ADA
//
// Kode bot punya beberapa pembelaan untuk bentuk data lain:
// `$or: [{nip}, {NIP}]` dan `p["Unit Kerja"]`. Saya periksa
// seluruh 58 dokumen di Atlas: TIDAK SATU PUN punya medan `NIP`
// huruf besar atau `Unit Kerja`. Pembelaan itu menjaga bentuk
// data yang tidak pernah ada.
//
// Jadi di sini hanya `nip` dan `sub_unit` yang dikueri. Kalau
// suatu hari ada sumber data yang memakai nama lain, tempat
// membetulkannya satu: di sini.

const { satuBaris, semuaBaris, kueri } = require("./kolam");

const KOLOM = `
  id, no_wa, nip, nama, jabatan, sub_unit, email,
  kategori_pegawai, foto_profil, atasan_nip
`;

function keBentukLama(b) {
  if (!b) return null;

  return { ...b, _id: b.id };
}

function idSah(id) {
  const n = Number(id);

  return Number.isInteger(n) && n > 0;
}

// =========================================================
// BACA
// =========================================================

// Pengganti Pegawai.find({}) — dipakai refreshDataPegawai() yang
// menyalin seluruh daftar pegawai ke memori saat bot start, dan
// endpoint Master Data TU.
async function semua() {
  const baris = await semuaBaris(`SELECT ${KOLOM} FROM pegawai ORDER BY nama`);

  return baris.map(keBentukLama);
}

// Pengganti cariPegawaiByWa().
//
// Mongo: $or: [{ no_wa: digits }, { no_wa: "0" + digits.slice(2) }]
//
// Cocok PERSIS dengan salah satu dari dua bentuk — nomor 62… dan
// bentuk lokalnya 0…. Bukan pencocokan sebagian: nomor yang beda
// satu digit di ujung adalah orang yang berbeda, dan salah orang
// di sini berarti absensi atau persetujuan lembur menempel ke
// pegawai yang salah.
async function satuPerWaAtauNol(digits) {
  const d = String(digits || "");

  if (!d) return null;

  const varian = [d];

  if (d.startsWith("62")) varian.push(`0${d.slice(2)}`);

  return keBentukLama(
    await satuBaris(
      `SELECT ${KOLOM} FROM pegawai WHERE no_wa = ANY($1::text[]) LIMIT 1`,
      [varian],
    ),
  );
}

async function satuPerNip(nip) {
  const n = String(nip || "").trim();

  if (!n) return null;

  return keBentukLama(
    await satuBaris(`SELECT ${KOLOM} FROM pegawai WHERE nip = $1 LIMIT 1`, [n]),
  );
}

// Pengganti Pegawai.findOne({ jabatan: "Kepala Biro Keuangan dan BMN" }).
// Cocok persis, sama seperti dulu.
async function satuPerJabatan(jabatan) {
  const j = String(jabatan || "").trim();

  if (!j) return null;

  return keBentukLama(
    await satuBaris(`SELECT ${KOLOM} FROM pegawai WHERE jabatan = $1 LIMIT 1`, [
      j,
    ]),
  );
}

// Pengganti Pegawai.findOne({ sub_unit: su, jabatan: /kepala|ketua|madya|muda/i }).
//
// Regex Mongo jadi operator ~* di Postgres — pencocokan pola
// tanpa membedakan huruf besar-kecil. Polanya disalin apa adanya,
// termasuk bahwa ia mencari di mana saja di dalam teks jabatan.
async function pimpinanSubUnit(subUnit) {
  const su = String(subUnit || "").trim();

  if (!su) return null;

  return keBentukLama(
    await satuBaris(
      `SELECT ${KOLOM} FROM pegawai
        WHERE sub_unit = $1 AND jabatan ~* 'kepala|ketua|madya|muda'
        LIMIT 1`,
      [su],
    ),
  );
}

// =========================================================
// TULIS — Master Data TU
// =========================================================

const KOLOM_BOLEH_DIUBAH = [
  "no_wa",
  "nip",
  "nama",
  "jabatan",
  "sub_unit",
  "email",
  "kategori_pegawai",
  "foto_profil",
  "atasan_nip",
];

// Hanya kolom yang dikenal yang diteruskan. Payload dari Master
// Data TU datang dari browser, jadi medan asing di dalamnya tidak
// boleh ikut menjadi nama kolom.
function saring(data) {
  const keluar = {};

  for (const k of KOLOM_BOLEH_DIUBAH) {
    if (data[k] !== undefined) keluar[k] = data[k] === "" ? null : data[k];
  }

  return keluar;
}

async function buat(data) {
  const kolom = saring(data);

  const nama = Object.keys(kolom);

  if (!nama.length) throw new Error("Tidak ada data pegawai yang bisa disimpan.");

  const b = await satuBaris(
    `INSERT INTO pegawai (${nama.join(", ")})
     VALUES (${nama.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING ${KOLOM}`,
    nama.map((n) => kolom[n]),
  );

  return keBentukLama(b);
}

// Pengganti Pegawai.findByIdAndUpdate(id, data, { new: true }).
// Mengembalikan baris SESUDAH diubah, sama seperti { new: true }.
async function perbaruiPerId(id, data) {
  if (!idSah(id)) return null;

  const kolom = saring(data);

  const nama = Object.keys(kolom);

  if (!nama.length) {
    return keBentukLama(
      await satuBaris(`SELECT ${KOLOM} FROM pegawai WHERE id = $1`, [
        Number(id),
      ]),
    );
  }

  return keBentukLama(
    await satuBaris(
      `UPDATE pegawai SET ${nama.map((n, i) => `${n} = $${i + 2}`).join(", ")}
        WHERE id = $1 RETURNING ${KOLOM}`,
      [Number(id), ...nama.map((n) => kolom[n])],
    ),
  );
}

// Pengganti Pegawai.findByIdAndDelete(id) — mengembalikan baris
// yang dihapus, atau null kalau tidak ada.
async function hapusPerId(id) {
  if (!idSah(id)) return null;

  return keBentukLama(
    await satuBaris(`DELETE FROM pegawai WHERE id = $1 RETURNING ${KOLOM}`, [
      Number(id),
    ]),
  );
}

// Dipakai fitur reset data pengujian.
async function hapusPerNama(nama) {
  const n = String(nama || "").trim();

  if (!n) return 0;

  const { rowCount } = await kueri("DELETE FROM pegawai WHERE nama = $1", [n]);

  return rowCount;
}

module.exports = {
  idSah,
  semua,
  satuPerWaAtauNol,
  satuPerNip,
  satuPerJabatan,
  pimpinanSubUnit,
  buat,
  perbaruiPerId,
  hapusPerId,
  hapusPerNama,
  keBentukLama,
};
