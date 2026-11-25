// =========================================================
// AKSES DATA LANGGANAN APLIKASI / LAYANAN DARING
// =========================================================
//
// Satu baris = satu pengajuan SPBY & kwitansi pembayaran langganan
// aplikasi/layanan daring. Lihat db/009-langganan-aplikasi.sql.
// Isian form disimpan utuh di `isian`; kolom ringkasan diisi dari
// hitungLangganan() saat simpan.
// Tidak ada cadangan: galat Postgres dilempar ke pemanggil.

const fs = require("fs");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");

const BERKAS_SKEMA = path.join(__dirname, "009-langganan-aplikasi.sql");

const KOLOM_RINGKAS = `
  id, bidang, status, nama_aplikasi, penyedia, paket, periode, keperluan,
  to_char(tanggal_mulai, 'YYYY-MM-DD') AS tanggal_mulai,
  to_char(tanggal_selesai, 'YYYY-MM-DD') AS tanggal_selesai,
  to_char(tanggal_bayar, 'YYYY-MM-DD') AS tanggal_bayar,
  jumlah_lisensi, penerima_nama, penerima_nip, total, alasan_batal,
  to_char(tanggal_batal, 'YYYY-MM-DD') AS tanggal_batal,
  dibatalkan_oleh, dibuat_oleh, diubah_oleh, dibuat_pada, diubah_pada
`;

let siap = false;

async function pastikanSkema() {
  try {
    await kueri(await fs.promises.readFile(BERKAS_SKEMA, "utf8"));
    siap = true;
    console.log("[LANGGANAN] Tabel langganan aplikasi siap.");
  } catch (err) {
    siap = false;
    console.error(
      "[LANGGANAN] Migrasi db/009-langganan-aplikasi.sql gagal:",
      err?.message || err,
      "\n           Jalankan tangan: psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 -f db/009-langganan-aplikasi.sql",
    );
  }
  return siap;
}

function ringkasan(hitungan) {
  return {
    nama_aplikasi: hitungan.namaAplikasi,
    penyedia: hitungan.penyedia,
    paket: hitungan.paket,
    periode: hitungan.periode,
    keperluan: hitungan.keperluan,
    tanggal_mulai: hitungan.tanggalMulai,
    tanggal_selesai: hitungan.tanggalSelesai,
    tanggal_bayar: hitungan.tanggalBayar,
    jumlah_lisensi: hitungan.jumlahLisensi,
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
    `SELECT ${KOLOM_RINGKAS} FROM langganan_aplikasi
      ${syarat.length ? "WHERE " + syarat.join(" AND ") : ""}
      ORDER BY tanggal_bayar DESC, id DESC`,
    nilai,
  );
}

async function satu(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return satuBaris(
    `SELECT ${KOLOM_RINGKAS}, isian, riwayat FROM langganan_aplikasi WHERE id = $1`,
    [n],
  );
}

async function buat({ bidang, isian, hitungan, oleh }) {
  const r = ringkasan(hitungan);
  return satuBaris(
    `INSERT INTO langganan_aplikasi
       (bidang, nama_aplikasi, penyedia, paket, periode, keperluan,
        tanggal_mulai, tanggal_selesai, tanggal_bayar, jumlah_lisensi,
        penerima_nama, penerima_nip, total, isian, dibuat_oleh, diubah_oleh, riwayat)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16)
     RETURNING ${KOLOM_RINGKAS}`,
    [
      bidang,
      r.nama_aplikasi,
      r.penyedia,
      r.paket,
      r.periode,
      r.keperluan,
      r.tanggal_mulai,
      r.tanggal_selesai,
      r.tanggal_bayar,
      r.jumlah_lisensi,
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
    `UPDATE langganan_aplikasi SET
       nama_aplikasi = $2, penyedia = $3, paket = $4, periode = $5, keperluan = $6,
       tanggal_mulai = $7, tanggal_selesai = $8, tanggal_bayar = $9, jumlah_lisensi = $10,
       penerima_nama = $11, penerima_nip = $12, total = $13, isian = $14, diubah_oleh = $15,
       riwayat = riwayat || $16::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [
      Number(id),
      r.nama_aplikasi,
      r.penyedia,
      r.paket,
      r.periode,
      r.keperluan,
      r.tanggal_mulai,
      r.tanggal_selesai,
      r.tanggal_bayar,
      r.jumlah_lisensi,
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
    `UPDATE langganan_aplikasi SET
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
    `UPDATE langganan_aplikasi SET
       status = 'aktif', alasan_batal = '', tanggal_batal = NULL, dibatalkan_oleh = '',
       diubah_oleh = $2, riwayat = riwayat || $3::jsonb, diubah_pada = now()
     WHERE id = $1
     RETURNING ${KOLOM_RINGKAS}`,
    [Number(id), oleh, jejak(oleh, "dipulihkan")],
  );
}

async function hapus(id) {
  const { rowCount } = await kueri("DELETE FROM langganan_aplikasi WHERE id = $1", [Number(id)]);
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
