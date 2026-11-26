// =========================================================
// AKSES DATA BBM KEPALA BIRO
// =========================================================
//
// Satu baris = satu pengajuan SPBY & kwitansi pembelian bahan bakar
// kendaraan dinas Kepala Biro. Lihat db/010-bbm-kepala-biro.sql.
// Isian form disimpan utuh di `isian`; kolom ringkasan diisi dari
// hitungBbm() saat simpan.
// Tidak ada cadangan: galat Postgres dilempar ke pemanggil.

const fs = require("fs");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");

const BERKAS_SKEMA = path.join(__dirname, "010-bbm-kepala-biro.sql");

const KOLOM_RINGKAS = `
  id, bidang, status, jenis_bbm, penyedia, kendaraan, keperluan,
  to_char(tanggal_mulai, 'YYYY-MM-DD') AS tanggal_mulai,
  to_char(tanggal_selesai, 'YYYY-MM-DD') AS tanggal_selesai,
  to_char(tanggal_bayar, 'YYYY-MM-DD') AS tanggal_bayar,
  jumlah_liter, penerima_nama, penerima_nip, total, alasan_batal,
  to_char(tanggal_batal, 'YYYY-MM-DD') AS tanggal_batal,
  dibatalkan_oleh, dibuat_oleh, diubah_oleh, dibuat_pada, diubah_pada
`;

let siap = false;

async function pastikanSkema() {
  try {
    await kueri(await fs.promises.readFile(BERKAS_SKEMA, "utf8"));
    siap = true;
    console.log("[BBM KABIRO] Tabel BBM Kepala Biro siap.");
  } catch (err) {
    siap = false;
    console.error(
      "[BBM KABIRO] Migrasi db/010-bbm-kepala-biro.sql gagal:",
      err?.message || err,
      "\n           Jalankan tangan: psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 -f db/010-bbm-kepala-biro.sql",
    );
  }
  return siap;
}

function ringkasan(hitungan) {
  return {
    jenis_bbm: hitungan.jenisBbm,
    penyedia: hitungan.penyedia,
    kendaraan: hitungan.kendaraan,
    keperluan: hitungan.keperluan,
    tanggal_mulai: hitungan.tanggalMulai,
    tanggal_selesai: hitungan.tanggalSelesai,
    tanggal_bayar: hitungan.tanggalBayar,
    jumlah_liter: hitungan.jumlahLiter,
    penerima_nama: hitungan.penerima.nama,
    penerima_nip: hitungan.penerima.nip,
    total: hitungan.total,
  };
}

const jejak = (oleh, aksi, catatan = "") =>
  JSON.stringify([{ waktu: new Date().toISOString(), oleh, aksi, catatan }]);

// bidang null = semua bidang (admin / bendahara).
async function daftar({ bidang = null, tahun = null } = {}) {
  const syarat = [];
  const nilai = [];
  if (bidang) {
    nilai.push(bidang);
    syarat.push(`bidang = $${nilai.length}`);
  }
  if (tahun) {
    nilai.push(Number(tahun));
    syarat.push(`EXTRACT(YEAR FROM tanggal_bayar) = $${nilai.length}`);
  }
  return semuaBaris(
    `SELECT ${KOLOM_RINGKAS} FROM bbm_kepala_biro
      ${syarat.length ? "WHERE " + syarat.join(" AND ") : ""}
      ORDER BY tanggal_bayar DESC, id DESC`,
    nilai,
  );
}

async function satu(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return satuBaris(
    `SELECT ${KOLOM_RINGKAS}, isian, riwayat FROM bbm_kepala_biro WHERE id = $1`,
    [n],
  );
}

async function buat({ bidang, isian, hitungan, oleh }) {
  const r = ringkasan(hitungan);
  return satuBaris(
    `INSERT INTO bbm_kepala_biro
       (bidang, jenis_bbm, penyedia, kendaraan, keperluan,
        tanggal_mulai, tanggal_selesai, tanggal_bayar, jumlah_liter,
        penerima_nama, penerima_nip, total, isian, dibuat_oleh, diubah_oleh, riwayat)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15)
     RETURNING ${KOLOM_RINGKAS}`,
    [
      bidang,
      r.jenis_bbm,
      r.penyedia,
      r.kendaraan,
      r.keperluan,
      r.tanggal_mulai,
      r.tanggal_selesai,
      r.tanggal_bayar,
      r.jumlah_liter,
      r.penerima_nama,
      r.penerima_nip,
      r.total,
      JSON.stringify(isian),
      oleh,
      jejak(oleh, "dibuat"),
    ],
  );
}

async function ubah(id, { isian, hitungan, oleh }) {
  const r = ringkasan(hitungan);
  return satuBaris(
    `UPDATE bbm_kepala_biro SET
       jenis_bbm = $2, penyedia = $3, kendaraan = $4, keperluan = $5,
       tanggal_mulai = $6, tanggal_selesai = $7, tanggal_bayar = $8, jumlah_liter = $9,
       penerima_nama = $10, penerima_nip = $11, total = $12, isian = $13, diubah_oleh = $14,
       riwayat = riwayat || $15::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [
      Number(id),
      r.jenis_bbm,
      r.penyedia,
      r.kendaraan,
      r.keperluan,
      r.tanggal_mulai,
      r.tanggal_selesai,
      r.tanggal_bayar,
      r.jumlah_liter,
      r.penerima_nama,
      r.penerima_nip,
      r.total,
      JSON.stringify(isian),
      oleh,
      jejak(oleh, "diubah"),
    ],
  );
}

async function batalkan(id, { alasan, tanggal, oleh }) {
  return satuBaris(
    `UPDATE bbm_kepala_biro SET
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
    `UPDATE bbm_kepala_biro SET
       status = 'aktif', alasan_batal = '', tanggal_batal = NULL, dibatalkan_oleh = '',
       diubah_oleh = $2, riwayat = riwayat || $3::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [Number(id), oleh, jejak(oleh, "dipulihkan")],
  );
}

async function hapus(id) {
  const { rowCount } = await kueri("DELETE FROM bbm_kepala_biro WHERE id = $1", [Number(id)]);
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
