// =========================================================
// AKSES DATA REKAP SERVICE KENDARAAN DINAS
// =========================================================
//
// Satu baris = satu kejadian service. Baris dari WhatsApp
// (menu 4 → 4) membawa path PDF SPBY-nya; baris yang ditambah admin
// dari dashboard boleh tanpa PDF.

const fs = require("fs");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");
const dbKendaraan = require("./kendaraan");

const BERKAS_SKEMA = path.join(__dirname, "006-servis-kendaraan.sql");

const KOLOM = `
  id, kendaraan_id, nama_kendaraan, plat, jenis,
  to_char(tanggal_servis, 'YYYY-MM-DD') AS tanggal_servis,
  bengkel, biaya, keterangan, pelapor_nama, pelapor_nip, pelapor_wa,
  jumlah_foto_nota, jumlah_foto_dokumentasi, berkas_pdf, sumber,
  dibuat_pada, diubah_pada
`;

// Menjalankan migrasi 006 saat bot menyala. Gagal di sini TIDAK
// menghentikan bot: fitur lain tetap jalan, hanya rekap service yang
// tidak tersedia, dan lognya menyebut perintah psql untuk dijalankan
// tangan.
let siap = false;

async function pastikanSkema() {
  try {
    const sql = await fs.promises.readFile(BERKAS_SKEMA, "utf8");
    await kueri(sql);
    siap = true;
    dbKendaraan.aktifkanKolomRekap();
    console.log("[SERVIS] Tabel rekap service kendaraan siap.");
  } catch (err) {
    siap = false;
    console.error(
      "[SERVIS] Migrasi db/006-servis-kendaraan.sql gagal:",
      err?.message || err,
      "\n         Jalankan tangan: psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 -f db/006-servis-kendaraan.sql",
    );
  }
  return siap;
}

function sudahSiap() {
  return siap;
}

// =========================================================
// VALIDASI
// =========================================================

class GalatData extends Error {}

function tanggalSah(teks) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const MEDAN_TEKS = [
  "nama_kendaraan", "plat", "jenis", "bengkel", "keterangan",
  "pelapor_nama", "pelapor_nip", "pelapor_wa", "berkas_pdf", "sumber",
];

function saring(data, { baru }) {
  const d = {};

  for (const k of MEDAN_TEKS) {
    if (data[k] !== undefined) d[k] = String(data[k] ?? "").trim();
  }

  if (data.kendaraan_id !== undefined) {
    const n = Number(data.kendaraan_id);
    d.kendaraan_id = Number.isInteger(n) && n > 0 ? n : null;
  }

  if (data.tanggal_servis !== undefined) {
    if (!tanggalSah(data.tanggal_servis)) throw new GalatData("Tanggal service tidak sah (format YYYY-MM-DD).");
    d.tanggal_servis = data.tanggal_servis;
  }

  if (data.biaya !== undefined) {
    const b = Number(String(data.biaya).replace(/[^\d]/g, ""));
    if (!Number.isSafeInteger(b) || b < 0) throw new GalatData("Biaya tidak sah.");
    d.biaya = b;
  }

  for (const k of ["jumlah_foto_nota", "jumlah_foto_dokumentasi"]) {
    if (data[k] !== undefined) d[k] = Math.max(0, Math.floor(Number(data[k]) || 0));
  }

  if (d.jenis !== undefined && !["Mobil", "Motor"].includes(d.jenis)) {
    throw new GalatData("Jenis harus Mobil atau Motor.");
  }

  if (baru) {
    if (!d.nama_kendaraan) throw new GalatData("Nama kendaraan wajib diisi.");
    if (!d.tanggal_servis) throw new GalatData("Tanggal service wajib diisi.");
    if (d.biaya === undefined) throw new GalatData("Biaya wajib diisi.");
  } else if (d.nama_kendaraan !== undefined && !d.nama_kendaraan) {
    throw new GalatData("Nama kendaraan tidak boleh kosong.");
  }

  return d;
}

function idSah(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0;
}

// =========================================================
// KUERI
// =========================================================

async function semua({ tahun } = {}) {
  const t = Number(tahun);

  if (Number.isInteger(t) && t > 1900) {
    return semuaBaris(
      `SELECT ${KOLOM} FROM servis_kendaraan
        WHERE tanggal_servis >= make_date($1, 1, 1)
          AND tanggal_servis <  make_date($1 + 1, 1, 1)
        ORDER BY tanggal_servis DESC, id DESC`,
      [t],
    );
  }

  return semuaBaris(`SELECT ${KOLOM} FROM servis_kendaraan ORDER BY tanggal_servis DESC, id DESC`);
}

async function satu(id) {
  if (!idSah(id)) return null;
  return satuBaris(`SELECT ${KOLOM} FROM servis_kendaraan WHERE id = $1`, [Number(id)]);
}

async function daftarTahun() {
  const baris = await semuaBaris(
    `SELECT DISTINCT EXTRACT(YEAR FROM tanggal_servis)::int AS tahun
       FROM servis_kendaraan ORDER BY 1 DESC`,
  );
  return baris.map((b) => b.tahun);
}

async function buat(data) {
  const d = saring(data, { baru: true });
  const nama = Object.keys(d);

  return satuBaris(
    `INSERT INTO servis_kendaraan (${nama.join(", ")})
     VALUES (${nama.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING ${KOLOM}`,
    nama.map((n) => d[n]),
  );
}

async function perbarui(id, data) {
  if (!idSah(id)) return null;

  // PDF dan asal data hanya ditulis bot, tidak dari dashboard.
  const { berkas_pdf, sumber, ...boleh } = data || {};
  const d = saring(boleh, { baru: false });
  const nama = Object.keys(d);

  if (!nama.length) return satu(id);

  return satuBaris(
    `UPDATE servis_kendaraan
        SET ${nama.map((n, i) => `${n} = $${i + 2}`).join(", ")}, diubah_pada = now()
      WHERE id = $1
      RETURNING ${KOLOM}`,
    [Number(id), ...nama.map((n) => d[n])],
  );
}

async function hapus(id) {
  if (!idSah(id)) return null;
  return satuBaris(`DELETE FROM servis_kendaraan WHERE id = $1 RETURNING ${KOLOM}`, [Number(id)]);
}

module.exports = {
  GalatData,
  pastikanSkema,
  sudahSiap,
  semua,
  satu,
  daftarTahun,
  buat,
  perbarui,
  hapus,
};
