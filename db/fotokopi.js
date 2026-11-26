// =========================================================
// AKSES DATA FITUR FOTOKOPI (ADMINISTRASI ROKEU)
// =========================================================
//
// Satu baris = satu pengajuan fotokopi/penjilidan. Lihat db/011-fotokopi.sql.
// Isian form (sudah diperiksa) disimpan utuh; kolom ringkasan diisi dari
// hitungFotokopi() (features/fitur/fotokopi/hitung.js) saat simpan.
// Tidak ada cadangan: galat Postgres dilempar ke pemanggil.

const fs = require("fs");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");

const BERKAS_SKEMA = path.join(__dirname, "011-fotokopi.sql");

const KOLOM_RINGKAS = `
  id, bidang, status, nama_kegiatan,
  to_char(tanggal_kegiatan, 'YYYY-MM-DD') AS tanggal_kegiatan,
  lokasi_provinsi, lokasi_detail, nomor_spby,
  penyedia, nama_penerima, jumlah_volume, total, pajak_pph, netto,
  alasan_batal,
  to_char(tanggal_batal, 'YYYY-MM-DD') AS tanggal_batal,
  dibatalkan_oleh, dibuat_oleh, diubah_oleh, dibuat_pada, diubah_pada,
  COALESCE(jsonb_array_length(isian->'items'), 0)::int AS jumlah_jenis_item
`;

let siap = false;

async function pastikanSkema() {
  try {
    await kueri(await fs.promises.readFile(BERKAS_SKEMA, "utf8"));
    siap = true;
    console.log("[FOTOKOPI] Tabel fotokopi siap.");
  } catch (err) {
    siap = false;
    console.error(
      "[FOTOKOPI] Migrasi db/011-fotokopi.sql gagal:",
      err?.message || err,
      "\n         Jalankan tangan: psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 -f db/011-fotokopi.sql",
    );
  }
  return siap;
}

// Kolom ringkasan dari isian yang sudah diperiksa dan hasil hitungFotokopi().
function ringkasan(isian, hitungan) {
  return {
    nama_kegiatan: String(isian.dalam_rangka || "").slice(0, 300),
    tanggal_kegiatan: isian.tanggal_kegiatan,
    lokasi_provinsi: String(isian.lokasi_provinsi || "").slice(0, 100),
    lokasi_detail: String(isian.tempat_kegiatan || "").slice(0, 200),
    nomor_spby: String(isian.nomor_spby || "").slice(0, 100),
    penyedia: String(isian.penyedia || "").slice(0, 200),
    nama_penerima: String(isian.ttd_penerima_nama || isian.penyedia || "").slice(0, 200),
    jumlah_volume: hitungan.jumlahVolume,
    total: hitungan.total,
    pajak_pph: hitungan.pph,
    netto: hitungan.netto,
  };
}

const jejak = (oleh, aksi, catatan = "") =>
  JSON.stringify([{ waktu: new Date().toISOString(), oleh, aksi, catatan }]);

// bidang null = semua bidang (admin/bendahara).
async function daftar({ bidang = null, tahun = null, status = null } = {}) {
  const syarat = [];
  const nilai = [];
  if (bidang) {
    nilai.push(bidang);
    syarat.push(`bidang = $${nilai.length}`);
  }
  if (tahun) {
    nilai.push(Number(tahun));
    syarat.push(`EXTRACT(YEAR FROM tanggal_kegiatan) = $${nilai.length}`);
  }
  if (status) {
    nilai.push(status);
    syarat.push(`status = $${nilai.length}`);
  }
  return semuaBaris(
    `SELECT ${KOLOM_RINGKAS}, isian FROM fotokopi
      ${syarat.length ? "WHERE " + syarat.join(" AND ") : ""}
      ORDER BY tanggal_kegiatan DESC, id DESC`,
    nilai,
  );
}

async function satu(id) {
  return satuBaris(`SELECT ${KOLOM_RINGKAS}, isian, riwayat FROM fotokopi WHERE id = $1`, [Number(id)]);
}

async function buat({ bidang, isian, hitungan, oleh }) {
  const r = ringkasan(isian, hitungan);
  return satuBaris(
    `INSERT INTO fotokopi
       (bidang, nama_kegiatan, tanggal_kegiatan, lokasi_provinsi, lokasi_detail,
        nomor_spby, penyedia, nama_penerima, jumlah_volume,
        total, pajak_pph, netto, isian, dibuat_oleh, diubah_oleh, riwayat)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15)
     RETURNING ${KOLOM_RINGKAS}`,
    [
      bidang, r.nama_kegiatan, r.tanggal_kegiatan, r.lokasi_provinsi, r.lokasi_detail,
      r.nomor_spby, r.penyedia, r.nama_penerima, r.jumlah_volume,
      r.total, r.pajak_pph, r.netto, JSON.stringify(isian), oleh, jejak(oleh, "dibuat"),
    ],
  );
}

async function ubah(id, { isian, hitungan, oleh }) {
  const r = ringkasan(isian, hitungan);
  return satuBaris(
    `UPDATE fotokopi SET
       nama_kegiatan = $2, tanggal_kegiatan = $3, lokasi_provinsi = $4,
       lokasi_detail = $5, nomor_spby = $6, penyedia = $7, nama_penerima = $8,
       jumlah_volume = $9, total = $10, pajak_pph = $11, netto = $12,
       isian = $13, diubah_oleh = $14,
       riwayat = riwayat || $15::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [
      Number(id), r.nama_kegiatan, r.tanggal_kegiatan, r.lokasi_provinsi,
      r.lokasi_detail, r.nomor_spby, r.penyedia, r.nama_penerima,
      r.jumlah_volume, r.total, r.pajak_pph, r.netto,
      JSON.stringify(isian), oleh, jejak(oleh, "diubah"),
    ],
  );
}

async function batalkan(id, { alasan, oleh }) {
  return satuBaris(
    `UPDATE fotokopi SET
       status = 'dibatalkan', alasan_batal = $2,
       tanggal_batal = (now() AT TIME ZONE 'Asia/Jakarta')::date,
       dibatalkan_oleh = $3, diubah_oleh = $3,
       riwayat = riwayat || $4::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [Number(id), alasan, oleh, jejak(oleh, "dibatalkan", alasan)],
  );
}

// alasan_batal dan dibatalkan_oleh NOT NULL: dikosongkan dengan ''.
async function pulihkan(id, { oleh }) {
  return satuBaris(
    `UPDATE fotokopi SET
       status = 'aktif', alasan_batal = '', tanggal_batal = NULL,
       dibatalkan_oleh = '', diubah_oleh = $2,
       riwayat = riwayat || $3::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [Number(id), oleh, jejak(oleh, "dipulihkan")],
  );
}

async function hapus(id) {
  const { rowCount } = await kueri("DELETE FROM fotokopi WHERE id = $1", [Number(id)]);
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
