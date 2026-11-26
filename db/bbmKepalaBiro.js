// =========================================================
// AKSES DATA BBM KEPALA BIRO
// =========================================================
//
// Satu baris = satu pengajuan SPBY & kwitansi pembelian bahan bakar
// kendaraan Kepala Biro. Lihat db/010-bbm-kepala-biro.sql.
// Bila PostgreSQL lokal belum tersambung saat pengembangan, modul ini
// otomatis memakai penyimpanan cadangan di folder sementara OS.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");

const BERKAS_SKEMA = path.join(__dirname, "010-bbm-kepala-biro.sql");
const BERKAS_CADANGAN = path.join(os.tmpdir(), "siska-bbm-kepala-biro-cadangan.json");

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
      "[BBM KABIRO] Migrasi db/010-bbm-kepala-biro.sql gagal (memakai penyimpanan cadangan lokal):",
      err?.message || err,
    );
  }
  return siap;
}

function bacaCadangan() {
  try {
    if (!fs.existsSync(BERKAS_CADANGAN)) return [];
    const data = JSON.parse(fs.readFileSync(BERKAS_CADANGAN, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function tulisCadangan(daftar) {
  try {
    fs.writeFileSync(BERKAS_CADANGAN, JSON.stringify(daftar, null, 2), "utf8");
  } catch {
    // abaikan bila gagal menulis ke tmpdir
  }
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

const jejak = (oleh, aksi, catatan = "") => [
  { waktu: new Date().toISOString(), oleh, aksi, catatan },
];

async function daftar({ bidang = null, tahun = null } = {}) {
  if (!siap) await pastikanSkema();
  if (siap) {
    try {
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
      return await semuaBaris(
        `SELECT ${KOLOM_RINGKAS} FROM bbm_kepala_biro
          ${syarat.length ? "WHERE " + syarat.join(" AND ") : ""}
          ORDER BY tanggal_bayar DESC, id DESC`,
        nilai,
      );
    } catch {
      siap = false;
    }
  }

  return bacaCadangan()
    .filter((d) => (!bidang || d.bidang === bidang) && (!tahun || String(d.tanggal_bayar).startsWith(String(tahun))))
    .sort((a, b) => String(b.tanggal_bayar).localeCompare(String(a.tanggal_bayar)) || b.id - a.id);
}

async function satu(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  if (!siap) await pastikanSkema();
  if (siap) {
    try {
      return await satuBaris(
        `SELECT ${KOLOM_RINGKAS}, isian, riwayat FROM bbm_kepala_biro WHERE id = $1`,
        [n],
      );
    } catch {
      siap = false;
    }
  }
  return bacaCadangan().find((d) => Number(d.id) === n) || null;
}

async function buat({ bidang, isian, hitungan, oleh }) {
  const r = ringkasan(hitungan);
  if (!siap) await pastikanSkema();
  if (siap) {
    try {
      return await satuBaris(
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
          JSON.stringify(jejak(oleh, "dibuat")),
        ],
      );
    } catch {
      siap = false;
    }
  }

  const semua = bacaCadangan();
  const idBaru = semua.reduce((maks, d) => Math.max(maks, Number(d.id) || 0), 0) + 1;
  const sekarang = new Date().toISOString();
  const barisBaru = {
    id: idBaru,
    bidang,
    status: "aktif",
    ...r,
    isian,
    alasan_batal: "",
    tanggal_batal: null,
    dibatalkan_oleh: "",
    dibuat_oleh: oleh,
    diubah_oleh: oleh,
    riwayat: jejak(oleh, "dibuat"),
    dibuat_pada: sekarang,
    diubah_pada: sekarang,
  };
  semua.push(barisBaru);
  tulisCadangan(semua);
  return barisBaru;
}

async function ubah(id, { isian, hitungan, oleh }) {
  const r = ringkasan(hitungan);
  if (!siap) await pastikanSkema();
  if (siap) {
    try {
      return await satuBaris(
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
          JSON.stringify(jejak(oleh, "diubah")),
        ],
      );
    } catch {
      siap = false;
    }
  }

  const semua = bacaCadangan();
  const idx = semua.findIndex((d) => Number(d.id) === Number(id));
  if (idx < 0) return null;
  semua[idx] = {
    ...semua[idx],
    ...r,
    isian,
    diubah_oleh: oleh,
    riwayat: [...(semua[idx].riwayat || []), ...jejak(oleh, "diubah")],
    diubah_pada: new Date().toISOString(),
  };
  tulisCadangan(semua);
  return semua[idx];
}

async function batalkan(id, { alasan, tanggal, oleh }) {
  if (!siap) await pastikanSkema();
  if (siap) {
    try {
      return await satuBaris(
        `UPDATE bbm_kepala_biro SET
           status = 'dibatalkan', alasan_batal = $2, tanggal_batal = $3,
           dibatalkan_oleh = $4, diubah_oleh = $4,
           riwayat = riwayat || $5::jsonb, diubah_pada = now()
         WHERE id = $1
         RETURNING ${KOLOM_RINGKAS}`,
        [Number(id), alasan, tanggal, oleh, JSON.stringify(jejak(oleh, "dibatalkan", alasan))],
      );
    } catch {
      siap = false;
    }
  }

  const semua = bacaCadangan();
  const idx = semua.findIndex((d) => Number(d.id) === Number(id));
  if (idx < 0) return null;
  semua[idx] = {
    ...semua[idx],
    status: "dibatalkan",
    alasan_batal: alasan,
    tanggal_batal: tanggal,
    dibatalkan_oleh: oleh,
    diubah_oleh: oleh,
    riwayat: [...(semua[idx].riwayat || []), ...jejak(oleh, "dibatalkan", alasan)],
    diubah_pada: new Date().toISOString(),
  };
  tulisCadangan(semua);
  return semua[idx];
}

async function pulihkan(id, { oleh }) {
  if (!siap) await pastikanSkema();
  if (siap) {
    try {
      return await satuBaris(
        `UPDATE bbm_kepala_biro SET
           status = 'aktif', alasan_batal = '', tanggal_batal = NULL, dibatalkan_oleh = '',
           diubah_oleh = $2, riwayat = riwayat || $3::jsonb, diubah_pada = now()
         WHERE id = $1
         RETURNING ${KOLOM_RINGKAS}`,
        [Number(id), oleh, JSON.stringify(jejak(oleh, "dipulihkan"))],
      );
    } catch {
      siap = false;
    }
  }

  const semua = bacaCadangan();
  const idx = semua.findIndex((d) => Number(d.id) === Number(id));
  if (idx < 0) return null;
  semua[idx] = {
    ...semua[idx],
    status: "aktif",
    alasan_batal: "",
    tanggal_batal: null,
    dibatalkan_oleh: "",
    diubah_oleh: oleh,
    riwayat: [...(semua[idx].riwayat || []), ...jejak(oleh, "dipulihkan")],
    diubah_pada: new Date().toISOString(),
  };
  tulisCadangan(semua);
  return semua[idx];
}

async function hapus(id) {
  if (!siap) await pastikanSkema();
  if (siap) {
    try {
      const { rowCount } = await kueri("DELETE FROM bbm_kepala_biro WHERE id = $1", [Number(id)]);
      return rowCount > 0;
    } catch {
      siap = false;
    }
  }

  const semua = bacaCadangan();
  const baru = semua.filter((d) => Number(d.id) !== Number(id));
  tulisCadangan(baru);
  return baru.length < semua.length;
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
