// =========================================================
// AKSES DATA FITUR FOTOKOPI (ADMINISTRASI ROKEU)
// =========================================================

const fs = require("fs");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");

const BERKAS_SKEMA = path.join(__dirname, "010-fotokopi.sql");

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

// Data awal contoh resmi sesuai acuan tampilan
const DATA_CONTOH_AWAL = [
  {
    id: "sample-1",
    nama_kegiatan: "Penggandaan dan penjilidan dokumen Laporan Keuangan Kementerian Ketenagakerjaan (LKKL) Audited TA 2025/2026",
    tanggal_kegiatan: "2026-11-17",
    lokasi_provinsi: "D.K.I. Jakarta",
    lokasi_detail: "Biro Keuangan dan BMN, Gedung Kemnaker",
    nomor_spby: "029/SPBY-ROKEU/XI/2026",
    bidang: "AKLAP",
    penyedia: "CV. Mitra Grafika Percetakan",
    nama_penerima: "CV. Mitra Grafika Percetakan",
    jumlah_volume: 2520,
    total: 1450000,
    pajak_pph: 0,
    netto: 1450000,
    status: "aktif",
    jumlah_jenis_item: 2,
    isian: {
      dalam_rangka: "Penggandaan dan penjilidan dokumen Laporan Keuangan Kementerian Ketenagakerjaan (LKKL) Audited TA 2025/2026",
      nama_kegiatan: "Penggandaan dan penjilidan dokumen Laporan Keuangan Kementerian Ketenagakerjaan (LKKL) Audited TA 2025/2026",
      tanggal_kegiatan: "2026-11-17",
      lokasi_provinsi: "D.K.I. Jakarta",
      tempat_kegiatan: "Biro Keuangan dan BMN, Gedung Kemnaker",
      lokasi_detail: "Biro Keuangan dan BMN, Gedung Kemnaker",
      nomor_spby: "029/SPBY-ROKEU/XI/2026",
      bidang: "AKLAP",
      penyedia: "CV. Mitra Grafika Percetakan",
      nama_penerima: "CV. Mitra Grafika Percetakan",
      akun: "026.01.WA.2158.EBA.994.002.A.521111 — Belanja Keperluan Perkantoran (Fotokopi & Penggandaan)",
      status_pajak: "UMKM / Fotokopi Eceran Tanpa Potongan Pajak",
      persen_pph: 0,
      total: 1450000,
      pajak_pph: 0,
      netto: 1450000,
      items: [
        {
          jenis: "Fotokopi Hitam Putih",
          uraianMenu: "Fotokopi Dokumen LKKL Audited HVS A4 70gr",
          namaItem: "Fotokopi Dokumen LKKL Audited HVS A4 70gr",
          volume: 2500,
          porsi: 2500,
          satuan: "Lembar",
          hargaSatuan: 500,
          subtotal: 1250000,
        },
        {
          jenis: "Penjilidan Spiral Kawat",
          uraianMenu: "Jilid Spiral Kawat + Cover Mika Biru Kemnaker",
          namaItem: "Jilid Spiral Kawat + Cover Mika Biru Kemnaker",
          volume: 20,
          porsi: 20,
          satuan: "Buku",
          hargaSatuan: 10000,
          subtotal: 200000,
        },
      ],
      ppk: { nama: "Drs. Hendra Wijaya, M.M.", nip: "197508121998032001" },
      bendahara: { nama: "Siti Rahmawati, S.E.", nip: "198304152006041002" },
      ttd_penerima_nama: "",
      ttd_penerima_nip: "",
    },
  },
  {
    id: "sample-2",
    nama_kegiatan: "Penggandaan Bahan Rapat Pembahasan Revisi DIPA dan RKA-K/L TA 2027 Lintas Unit Eselon I",
    tanggal_kegiatan: "2026-11-21",
    lokasi_provinsi: "D.K.I. Jakarta",
    lokasi_detail: "Biro Keuangan dan BMN, Gedung Kemnaker",
    nomor_spby: "036/SPBY-ROKEU/XI/2026",
    bidang: "PA",
    penyedia: "Fotokopi & Penjilidan Abadi Jaya",
    nama_penerima: "Fotokopi & Penjilidan Abadi Jaya",
    jumlah_volume: 3240,
    total: 1440000,
    pajak_pph: 21600,
    netto: 1418400,
    status: "aktif",
    jumlah_jenis_item: 2,
    isian: {
      dalam_rangka: "Penggandaan Bahan Rapat Pembahasan Revisi DIPA dan RKA-K/L TA 2027 Lintas Unit Eselon I",
      nama_kegiatan: "Penggandaan Bahan Rapat Pembahasan Revisi DIPA dan RKA-K/L TA 2027 Lintas Unit Eselon I",
      tanggal_kegiatan: "2026-11-21",
      lokasi_provinsi: "D.K.I. Jakarta",
      tempat_kegiatan: "Biro Keuangan dan BMN, Gedung Kemnaker",
      lokasi_detail: "Biro Keuangan dan BMN, Gedung Kemnaker",
      nomor_spby: "036/SPBY-ROKEU/XI/2026",
      bidang: "PA",
      penyedia: "Fotokopi & Penjilidan Abadi Jaya",
      nama_penerima: "Fotokopi & Penjilidan Abadi Jaya",
      akun: "026.01.WA.2158.EBA.994.002.A.521211 — Belanja Bahan (Penggandaan Rapat & Bahan Sidang)",
      status_pajak: "PPh Pasal 22 Belanja Barang Pemerintah (1.5%)",
      persen_pph: 1.5,
      total: 1440000,
      pajak_pph: 21600,
      netto: 1418400,
      items: [
        {
          jenis: "Fotokopi Hitam Putih",
          uraianMenu: "Fotokopi Bahan Paparan Revisi DIPA RKA-K/L",
          namaItem: "Fotokopi Bahan Paparan Revisi DIPA RKA-K/L",
          volume: 3200,
          porsi: 3200,
          satuan: "Lembar",
          hargaSatuan: 400,
          subtotal: 1280000,
        },
        {
          jenis: "Penjilidan Lakban / Mika Biasa",
          uraianMenu: "Jilid Mika Transparan + Lakban Hitam",
          namaItem: "Jilid Mika Transparan + Lakban Hitam",
          volume: 40,
          porsi: 40,
          satuan: "Buku",
          hargaSatuan: 4000,
          subtotal: 160000,
        },
      ],
      ppk: { nama: "Drs. Hendra Wijaya, M.M.", nip: "197508121998032001" },
      bendahara: { nama: "Siti Rahmawati, S.E.", nip: "198304152006041002" },
      ttd_penerima_nama: "",
      ttd_penerima_nip: "",
    },
  },
];

let penyimpananLokal = [...DATA_CONTOH_AWAL];
let siap = false;

async function pastikanSkema() {
  try {
    const skema = await fs.promises.readFile(BERKAS_SKEMA, "utf8");
    await kueri(skema);
    siap = true;
    console.log("[FOTOKOPI] Tabel fotokopi siap.");
  } catch (err) {
    siap = false;
    console.warn("[FOTOKOPI] Database PostgreSQL offline, menggunakan penyimpanan lokal:", err?.message || err);
  }
  return siap;
}

function ringkasan(isian) {
  const items = Array.isArray(isian.items) ? isian.items : [];
  const jumlahVolume = items.reduce(
    (acc, it) => acc + (Number(it.volume || it.porsi) || 0),
    0,
  );
  const totalBiaya = items.reduce(
    (acc, it) => acc + (Number(it.volume || it.porsi) || 0) * (Number(it.hargaSatuan || it.harga_satuan) || 0),
    0,
  );
  const persenPajak = Number(isian.persen_pph ?? isian.persen_pph23 ?? 0);
  const pph = Math.round((totalBiaya * persenPajak) / 100);
  const netto = totalBiaya - pph;

  return {
    nama_kegiatan: String(isian.dalam_rangka || isian.nama_kegiatan || "Penggandaan Dokumen").trim().slice(0, 300),
    tanggal_kegiatan: isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10),
    lokasi_provinsi: String(isian.lokasi_provinsi || "D.K.I. Jakarta").trim().slice(0, 100),
    lokasi_detail: String(isian.tempat_kegiatan || isian.lokasi_detail || "").trim().slice(0, 200),
    nomor_spby: String(isian.nomor_spby || "").trim().slice(0, 100),
    penyedia: String(isian.penyedia || "").trim().slice(0, 200),
    nama_penerima: String(isian.nama_penerima || isian.penyedia || "").trim().slice(0, 200),
    jumlah_volume: jumlahVolume,
    total: totalBiaya,
    pajak_pph: pph,
    netto: netto,
  };
}

const jejak = (oleh, aksi, catatan = "") =>
  JSON.stringify([{ waktu: new Date().toISOString(), oleh, aksi, catatan }]);

async function daftar({ bidang = null, tahun = null, status = null } = {}) {
  if (siap) {
    try {
      const syarat = [];
      const nilai = [];
      let i = 1;

      if (bidang) {
        syarat.push(`bidang = $${i++}`);
        nilai.push(bidang);
      }
      if (tahun) {
        syarat.push(`EXTRACT(YEAR FROM tanggal_kegiatan) = $${i++}`);
        nilai.push(parseInt(tahun, 10));
      }
      if (status) {
        syarat.push(`status = $${i++}`);
        nilai.push(status);
      }

      const where = syarat.length ? `WHERE ${syarat.join(" AND ")}` : "";
      return await semuaBaris(
        `SELECT ${KOLOM_RINGKAS}
         FROM fotokopi
         ${where}
         ORDER BY tanggal_kegiatan DESC, id DESC`,
        nilai,
      );
    } catch (e) {
      console.warn("[FOTOKOPI] Kueri daftar database gagal, fallback lokal:", e.message);
    }
  }

  // Fallback memori lokal
  return penyimpananLokal.filter((d) => {
    if (bidang && d.bidang !== bidang) return false;
    if (status && d.status !== status) return false;
    if (tahun && d.tanggal_kegiatan && !d.tanggal_kegiatan.startsWith(String(tahun))) return false;
    return true;
  });
}

async function satu(id) {
  if (siap) {
    try {
      const baris = await satuBaris(
        `SELECT id, bidang, status, nama_kegiatan,
                to_char(tanggal_kegiatan, 'YYYY-MM-DD') AS tanggal_kegiatan,
                lokasi_provinsi, lokasi_detail, nomor_spby,
                penyedia, nama_penerima, jumlah_volume, total, pajak_pph, netto,
                isian, alasan_batal,
                to_char(tanggal_batal, 'YYYY-MM-DD') AS tanggal_batal,
                dibatalkan_oleh, dibuat_oleh, diubah_oleh, riwayat, dibuat_pada, diubah_pada
         FROM fotokopi
         WHERE id = $1`,
        [id],
      );
      if (baris) return baris;
    } catch (e) {
      console.warn("[FOTOKOPI] Kueri satu database gagal, fallback lokal:", e.message);
    }
  }

  return penyimpananLokal.find((d) => String(d.id) === String(id)) || null;
}

async function buat({ bidang, isian, oleh }) {
  const meta = ringkasan(isian);

  if (siap) {
    try {
      return await satuBaris(
        `INSERT INTO fotokopi (
           bidang, nama_kegiatan, tanggal_kegiatan, lokasi_provinsi, lokasi_detail,
           nomor_spby, penyedia, nama_penerima, jumlah_volume, total, pajak_pph, netto,
           isian, dibuat_oleh, diubah_oleh, riwayat
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10, $11, $12,
           $13, $14, $14, $15::jsonb
         ) RETURNING ${KOLOM_RINGKAS}`,
        [
          bidang,
          meta.nama_kegiatan,
          meta.tanggal_kegiatan,
          meta.lokasi_provinsi,
          meta.lokasi_detail,
          meta.nomor_spby,
          meta.penyedia,
          meta.nama_penerima,
          meta.jumlah_volume,
          meta.total,
          meta.pajak_pph,
          meta.netto,
          JSON.stringify(isian),
          oleh,
          jejak(oleh, "buat", `Pengajuan fotokopi dibuat oleh ${oleh}`),
        ],
      );
    } catch (e) {
      console.warn("[FOTOKOPI] Buat data database gagal, fallback lokal:", e.message);
    }
  }

  const baru = {
    id: `local-${Date.now()}`,
    bidang,
    status: "aktif",
    ...meta,
    isian,
    dibuat_oleh: oleh,
    diubah_oleh: oleh,
    dibuat_pada: new Date().toISOString(),
    diubah_pada: new Date().toISOString(),
  };
  penyimpananLokal.unshift(baru);
  return baru;
}

async function ubah(id, { isian, oleh }) {
  const meta = ringkasan(isian);

  if (siap) {
    try {
      return await satuBaris(
        `UPDATE fotokopi SET
           nama_kegiatan = $2,
           tanggal_kegiatan = $3,
           lokasi_provinsi = $4,
           lokasi_detail = $5,
           nomor_spby = $6,
           penyedia = $7,
           nama_penerima = $8,
           jumlah_volume = $9,
           total = $10,
           pajak_pph = $11,
           netto = $12,
           isian = $13,
           diubah_oleh = $14,
           diubah_pada = now(),
           riwayat = riwayat || $15::jsonb
         WHERE id = $1 AND status != 'dibatalkan'
         RETURNING ${KOLOM_RINGKAS}`,
        [
          id,
          meta.nama_kegiatan,
          meta.tanggal_kegiatan,
          meta.lokasi_provinsi,
          meta.lokasi_detail,
          meta.nomor_spby,
          meta.penyedia,
          meta.nama_penerima,
          meta.jumlah_volume,
          meta.total,
          meta.pajak_pph,
          meta.netto,
          JSON.stringify(isian),
          oleh,
          jejak(oleh, "ubah", `Diubah oleh ${oleh}`),
        ],
      );
    } catch (e) {
      console.warn("[FOTOKOPI] Ubah data database gagal, fallback lokal:", e.message);
    }
  }

  const idx = penyimpananLokal.findIndex((d) => String(d.id) === String(id));
  if (idx !== -1) {
    penyimpananLokal[idx] = {
      ...penyimpananLokal[idx],
      ...meta,
      isian,
      diubah_oleh: oleh,
      diubah_pada: new Date().toISOString(),
    };
    return penyimpananLokal[idx];
  }
  return null;
}

async function batalkan(id, { alasan, oleh }) {
  if (siap) {
    try {
      return await satuBaris(
        `UPDATE fotokopi SET
           status = 'dibatalkan',
           alasan_batal = $2,
           tanggal_batal = CURRENT_DATE,
           dibatalkan_oleh = $3,
           diubah_oleh = $3,
           diubah_pada = now(),
           riwayat = riwayat || $4::jsonb
         WHERE id = $1 AND status = 'aktif'
         RETURNING ${KOLOM_RINGKAS}`,
        [id, alasan, oleh, jejak(oleh, "batal", alasan)],
      );
    } catch (e) {
      console.warn("[FOTOKOPI] Batalkan data database gagal, fallback lokal:", e.message);
    }
  }

  const item = penyimpananLokal.find((d) => String(d.id) === String(id));
  if (item) {
    item.status = "dibatalkan";
    item.alasan_batal = alasan;
    item.dibatalkan_oleh = oleh;
    item.tanggal_batal = new Date().toISOString().slice(0, 10);
    return item;
  }
  return null;
}

async function pulihkan(id, { oleh }) {
  if (siap) {
    try {
      return await satuBaris(
        `UPDATE fotokopi SET
           status = 'aktif',
           alasan_batal = '',
           tanggal_batal = NULL,
           dibatalkan_oleh = '',
           diubah_oleh = $2,
           diubah_pada = now(),
           riwayat = riwayat || $3::jsonb
         WHERE id = $1 AND status = 'dibatalkan'
         RETURNING ${KOLOM_RINGKAS}`,
        [id, oleh, jejak(oleh, "pulihkan", `Dipulihkan oleh ${oleh}`)],
      );
    } catch (e) {
      console.warn("[FOTOKOPI] Pulihkan data database gagal, fallback lokal:", e.message);
    }
  }

  const item = penyimpananLokal.find((d) => String(d.id) === String(id));
  if (item) {
    item.status = "aktif";
    item.alasan_batal = "";
    item.dibatalkan_oleh = "";
    item.tanggal_batal = null;
    return item;
  }
  return null;
}

async function hapus(id) {
  if (siap) {
    try {
      const res = await kueri("DELETE FROM fotokopi WHERE id = $1", [id]);
      return res.rowCount > 0;
    } catch (e) {
      console.warn("[FOTOKOPI] Hapus data database gagal, fallback lokal:", e.message);
    }
  }

  const sebelum = penyimpananLokal.length;
  penyimpananLokal = penyimpananLokal.filter((d) => String(d.id) !== String(id));
  return penyimpananLokal.length < sebelum;
}

function sudahSiap() {
  return siap;
}

module.exports = {
  pastikanSkema,
  sudahSiap,
  daftar,
  satu,
  buat,
  ubah,
  batalkan,
  pulihkan,
  hapus,
  ringkasan,
  DATA_CONTOH_AWAL,
};
