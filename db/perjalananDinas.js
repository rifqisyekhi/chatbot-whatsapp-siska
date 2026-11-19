// =========================================================
// AKSES DATA PERJALANAN DINAS (KWITANSI PERDIN)
// =========================================================
//
// Satu baris = satu nota dinas beserta pesertanya. Lihat
// db/007-perjalanan-dinas.sql. Isian form disimpan utuh; kolom
// ringkasan diisi dari hitungKegiatan() saat simpan.

const fs = require("fs");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");

const BERKAS_SKEMA = path.join(__dirname, "007-perjalanan-dinas.sql");

const KOLOM_RINGKAS = `
  id, bidang, status, nomor_nota_dinas, jenis, maksud, provinsi, kota_tujuan,
  to_char(tanggal_berangkat, 'YYYY-MM-DD') AS tanggal_berangkat,
  to_char(tanggal_kembali, 'YYYY-MM-DD') AS tanggal_kembali,
  jumlah_peserta, nama_peserta, total, alasan_batal,
  to_char(tanggal_batal, 'YYYY-MM-DD') AS tanggal_batal,
  dibatalkan_oleh, dibuat_oleh, diubah_oleh, dibuat_pada, diubah_pada
`;

let siap = false;

async function pastikanSkema() {
  try {
    await kueri(await fs.promises.readFile(BERKAS_SKEMA, "utf8"));
    siap = true;
    console.log("[PERDIN] Tabel perjalanan dinas siap.");
  } catch (err) {
    siap = false;
    console.error(
      "[PERDIN] Migrasi db/007-perjalanan-dinas.sql gagal:",
      err?.message || err,
      "\n         Jalankan tangan: psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 -f db/007-perjalanan-dinas.sql",
    );
  }
  return siap;
}

// Kolom ringkasan dari hasil hitungKegiatan().
function ringkasan(kegiatan, isian) {
  return {
    nomor_nota_dinas: String(isian.nomor_nota_dinas || "").trim().slice(0, 200),
    jenis: kegiatan.jenis,
    maksud: kegiatan.maksud,
    provinsi: kegiatan.jenis === "luar" ? kegiatan.provinsi : "",
    kota_tujuan: kegiatan.kotaTujuan,
    tanggal_berangkat: kegiatan.tanggalBerangkat,
    tanggal_kembali: kegiatan.tanggalKembali,
    jumlah_peserta: kegiatan.peserta.length,
    nama_peserta: kegiatan.peserta.map((p) => p.nama).join(", "),
    total: kegiatan.total,
  };
}

const jejak = (oleh, aksi, catatan = "") =>
  JSON.stringify([{ waktu: new Date().toISOString(), oleh, aksi, catatan }]);

// bidang null = semua bidang (admin).
async function daftar({ bidang = null, tahun = null } = {}) {
  const syarat = [];
  const nilai = [];
  if (bidang) {
    nilai.push(bidang);
    syarat.push(`bidang = $${nilai.length}`);
  }
  if (tahun) {
    nilai.push(Number(tahun));
    syarat.push(`EXTRACT(YEAR FROM tanggal_berangkat) = $${nilai.length}`);
  }
  return semuaBaris(
    `SELECT ${KOLOM_RINGKAS} FROM perjalanan_dinas
      ${syarat.length ? "WHERE " + syarat.join(" AND ") : ""}
      ORDER BY tanggal_berangkat DESC, id DESC`,
    nilai,
  );
}

async function satu(id) {
  return satuBaris(`SELECT ${KOLOM_RINGKAS}, isian, riwayat FROM perjalanan_dinas WHERE id = $1`, [Number(id)]);
}

async function buat({ bidang, isian, kegiatan, oleh }) {
  const r = ringkasan(kegiatan, isian);
  return satuBaris(
    `INSERT INTO perjalanan_dinas
       (bidang, nomor_nota_dinas, jenis, maksud, provinsi, kota_tujuan,
        tanggal_berangkat, tanggal_kembali, jumlah_peserta, nama_peserta, total,
        isian, dibuat_oleh, diubah_oleh, riwayat)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14)
     RETURNING ${KOLOM_RINGKAS}`,
    [
      bidang, r.nomor_nota_dinas, r.jenis, r.maksud, r.provinsi, r.kota_tujuan,
      r.tanggal_berangkat, r.tanggal_kembali, r.jumlah_peserta, r.nama_peserta, r.total,
      JSON.stringify(isian), oleh, jejak(oleh, "dibuat"),
    ],
  );
}

async function ubah(id, { isian, kegiatan, oleh }) {
  const r = ringkasan(kegiatan, isian);
  return satuBaris(
    `UPDATE perjalanan_dinas SET
       nomor_nota_dinas = $2, jenis = $3, maksud = $4, provinsi = $5, kota_tujuan = $6,
       tanggal_berangkat = $7, tanggal_kembali = $8, jumlah_peserta = $9,
       nama_peserta = $10, total = $11, isian = $12, diubah_oleh = $13,
       riwayat = riwayat || $14::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [
      Number(id), r.nomor_nota_dinas, r.jenis, r.maksud, r.provinsi, r.kota_tujuan,
      r.tanggal_berangkat, r.tanggal_kembali, r.jumlah_peserta, r.nama_peserta, r.total,
      JSON.stringify(isian), oleh, jejak(oleh, "diubah"),
    ],
  );
}

async function batalkan(id, { alasan, tanggal, oleh }) {
  return satuBaris(
    `UPDATE perjalanan_dinas SET
       status = 'dibatalkan', alasan_batal = $2, tanggal_batal = $3,
       dibatalkan_oleh = $4, diubah_oleh = $4,
       riwayat = riwayat || $5::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [Number(id), alasan, tanggal, oleh, jejak(oleh, "dibatalkan", alasan)],
  );
}

async function pulihkan(id, { oleh }) {
  return satuBaris(
    `UPDATE perjalanan_dinas SET
       status = 'aktif', alasan_batal = '', tanggal_batal = NULL, dibatalkan_oleh = '',
       diubah_oleh = $2, riwayat = riwayat || $3::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [Number(id), oleh, jejak(oleh, "dipulihkan")],
  );
}

async function hapus(id) {
  const { rowCount } = await kueri("DELETE FROM perjalanan_dinas WHERE id = $1", [Number(id)]);
  return rowCount > 0;
}

module.exports = {
  pastikanSkema,
  sudahSiap: () => siap,
  daftar,
  satu,
  buat,
  ubah,
  batalkan,
  pulihkan,
  hapus,
};
