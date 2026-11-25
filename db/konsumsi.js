// =========================================================
// AKSES DATA FITUR KONSUMSI (ADMINISTRASI ROKEU)
// =========================================================

const fs = require("fs");
const path = require("path");
const { kueri, satuBaris, semuaBaris } = require("./kolam");

const BERKAS_SKEMA = path.join(__dirname, "008-konsumsi.sql");

const KOLOM_RINGKAS = `
  id, bidang, status, nama_kegiatan,
  to_char(tanggal_kegiatan, 'YYYY-MM-DD') AS tanggal_kegiatan,
  lokasi_provinsi, lokasi_detail, nomor_spby, sbm_kategori,
  penyedia, nama_penerima, jumlah_porsi, total, pajak_pph23, netto,
  alasan_batal,
  to_char(tanggal_batal, 'YYYY-MM-DD') AS tanggal_batal,
  dibatalkan_oleh, dibuat_oleh, diubah_oleh, dibuat_pada, diubah_pada,
  COALESCE(jsonb_array_length(isian->'items'), 0)::int AS jumlah_jenis_item
`;

// Data awal contoh resmi
const DATA_CONTOH_AWAL = [
  {
    id: "sample-1",
    nama_kegiatan: "Rapat Koordinasi Penyusunan RKA-K/L Pagu Alokasi Anggaran TA 2027 Lintas Eselon I",
    tanggal_kegiatan: "2026-11-18",
    lokasi_provinsi: "D.K.I. Jakarta",
    lokasi_detail: "Ruang Rapat Utama Biro Keuangan Gd. Kemnaker Lt. 4",
    nomor_spby: "038/SPBY-ROKEU/XI/2026",
    bidang: "PA",
    sbm_kategori: "SBM PMK 32/2025",
    penyedia: "RM. Sederhana Masakan Padang",
    nama_penerima: "H. Syamsul Bahri",
    jumlah_porsi: 60,
    total: 2430000,
    pajak_pph23: 48600,
    netto: 2381400,
    status: "aktif",
    jumlah_jenis_item: 2,
    isian: {
      dalam_rangka: "Rapat Koordinasi Penyusunan RKA-K/L Pagu Alokasi Anggaran TA 2027 Lintas Eselon I",
      nama_kegiatan: "Rapat Koordinasi Penyusunan RKA-K/L Pagu Alokasi Anggaran TA 2027 Lintas Eselon I",
      tanggal_kegiatan: "2026-11-18",
      lokasi_provinsi: "D.K.I. Jakarta",
      lokasi_detail: "Ruang Rapat Utama Biro Keuangan Gd. Kemnaker Lt. 4",
      nomor_spby: "038/SPBY-ROKEU/XI/2026",
      bidang: "PA",
      sbm_kategori: "SBM PMK 32/2025",
      penyedia: "RM. Sederhana Masakan Padang",
      nama_penerima: "H. Syamsul Bahri",
      akun: "026.01.WA.2158.EBA.994.002.A.521211",
      items: [
        { namaItem: "Snack Box Rapat Koordinasi", porsi: 60, satuan: "Kotak", hargaSatuan: 16500, subtotal: 990000 },
        { namaItem: "Makan Siang Prasmanan Nasi Padang", porsi: 60, satuan: "Porsi", hargaSatuan: 24000, subtotal: 1440000 },
      ],
      ppk: { nama: "Dra. Hj. Nurul Hidayati, M.Si.", nip: "197508121998032001" },
      bendahara: { nama: "Rahmat Hidayat, S.E.", nip: "198304152006041002" },
    },
  },
  {
    id: "sample-2",
    nama_kegiatan: "Rapat Evaluasi Serapan Anggaran Semester II Biro Keuangan",
    tanggal_kegiatan: "2026-11-21",
    lokasi_provinsi: "D.K.I. Jakarta",
    lokasi_detail: "Ruang Rapat BMN Gedung Kemnaker Lt. 2",
    nomor_spby: "041/SPBY-ROKEU/XI/2026",
    bidang: "TU",
    sbm_kategori: "SBM PMK 32/2025",
    penyedia: "Dapur Nusantara Catering",
    nama_penerima: "Siti Rahmawati",
    jumlah_porsi: 50,
    total: 2247750,
    pajak_pph23: 40500,
    netto: 2207250,
    status: "aktif",
    jumlah_jenis_item: 2,
    isian: {
      dalam_rangka: "Rapat Evaluasi Serapan Anggaran Semester II Biro Keuangan",
      nama_kegiatan: "Rapat Evaluasi Serapan Anggaran Semester II Biro Keuangan",
      tanggal_kegiatan: "2026-11-21",
      lokasi_provinsi: "D.K.I. Jakarta",
      lokasi_detail: "Ruang Rapat BMN Gedung Kemnaker Lt. 2",
      nomor_spby: "041/SPBY-ROKEU/XI/2026",
      bidang: "TU",
      sbm_kategori: "SBM PMK 32/2025",
      penyedia: "Dapur Nusantara Catering",
      nama_penerima: "Siti Rahmawati",
      akun: "026.01.WA.2158.EBA.994.002.A.521211",
      items: [
        { namaItem: "Kue Tradisional + Kopi/Teh", porsi: 50, satuan: "Porsi", hargaSatuan: 14955, subtotal: 747750 },
        { namaItem: "Nasi Box Nusantara Komplit", porsi: 50, satuan: "Kotak", hargaSatuan: 30000, subtotal: 1500000 },
      ],
      ppk: { nama: "Dra. Hj. Nurul Hidayati, M.Si.", nip: "197508121998032001" },
      bendahara: { nama: "Rahmat Hidayat, S.E.", nip: "198304152006041002" },
    },
  },
  {
    id: "sample-3",
    nama_kegiatan: "Konsinyering Penyusunan Petunjuk Teknis Pengelolaan Keuangan TA 2026",
    tanggal_kegiatan: "2026-11-25",
    lokasi_provinsi: "D.K.I. Jakarta",
    lokasi_detail: "Ruang Rapat Integritas Gedung Kemnaker Lt. 5",
    nomor_spby: "045/SPBY-ROKEU/XI/2026",
    bidang: "PTUK",
    sbm_kategori: "SBM PMK 32/2025",
    penyedia: "RM. Wong Solo & Toko Kue Prima",
    nama_penerima: "RM. Wong Solo & Toko Kue Prima",
    jumlah_porsi: 80,
    total: 3200000,
    pajak_pph23: 64000,
    netto: 3136000,
    status: "aktif",
    jumlah_jenis_item: 2,
    isian: {
      dalam_rangka: "Konsinyering Penyusunan Petunjuk Teknis Pengelolaan Keuangan TA 2026",
      nama_kegiatan: "Konsinyering Penyusunan Petunjuk Teknis Pengelolaan Keuangan TA 2026",
      tanggal_kegiatan: "2026-11-25",
      lokasi_provinsi: "D.K.I. Jakarta",
      lokasi_detail: "Ruang Rapat Integritas Gedung Kemnaker Lt. 5",
      bidang: "PTUK",
      sbm_kategori: "SBM PMK 32/2025",
      dua_restoran: true,
      penyedia: "RM. Wong Solo Masakan Jawa",
      nomor_spby: "045/SPBY-ROKEU/XI/2026",
      status_pajak: "Ber-NPWP — Jasa Katering (PPh Pasal 23: 2%)",
      persen_pph23: 2,
      ttd_penerima_nama: "Bambang Soetrisno",
      ttd_penerima_nip: "",
      penyedia_2: "Toko Kue & Snack Prima",
      nomor_spby_2: "046/SPBY-ROKEU/XI/2026",
      status_pajak_2: "Ber-NPWP — Jasa Katering (PPh Pasal 23: 2%)",
      persen_pph23_2: 2,
      ttd_penerima_nama_2: "Dewi Sartika",
      ttd_penerima_nip_2: "",
      akun: "026.01.WA.2158.EBA.994.002.A.521211",
      items: [
        { namaItem: "Makan Siang Nasi Box Ayam Bakar", uraianMenu: "Makan Siang Nasi Box Ayam Bakar", porsi: 40, volume: 40, satuan: "Kotak", hargaSatuan: 55000, subtotal: 2200000, resto: 1, jenis: "Makanan" },
        { namaItem: "Snack Box Pagi & Sore", uraianMenu: "Snack Box Pagi & Sore", porsi: 40, volume: 40, satuan: "Kotak", hargaSatuan: 25000, subtotal: 1000000, resto: 2, jenis: "Kudapan" },
      ],
      ppk: { nama: "Dra. Hj. Nurul Hidayati, M.Si.", nip: "197508121998032001" },
      bendahara: { nama: "Rahmat Hidayat, S.E.", nip: "198304152006041002" },
    },
  },
];

// Penyimpanan lokal (fallback tangguh bila PostgreSQL lokal offline/bermasalah)
let penyimpananLokal = [...DATA_CONTOH_AWAL];

let siap = false;

async function pastikanSkema() {
  try {
    const skema = await fs.promises.readFile(BERKAS_SKEMA, "utf8");
    await kueri(skema);
    siap = true;
    console.log("[KONSUMSI] Tabel konsumsi siap.");
  } catch (err) {
    siap = false;
    console.warn("[KONSUMSI] Database PostgreSQL belum siap, menggunakan penyimpanan lokal:", err?.message || err);
  }
  return siap;
}

function ringkasan(isian) {
  const items = Array.isArray(isian.items) ? isian.items : [];
  const jumlahPorsi = items.reduce(
    (acc, it) => acc + (Number(it.volume || it.porsi) || 0),
    0,
  );

  const duaResto = Boolean(isian.dua_restoran && isian.penyedia_2 && String(isian.penyedia_2).trim());
  let totalBiaya = 0;
  let pph23 = 0;

  if (duaResto) {
    const items1 = items.filter((it) => (it.resto ?? 1) === 1);
    const items2 = items.filter((it) => it.resto === 2);

    const sub1 = items1.reduce(
      (acc, it) => acc + (Number(it.volume || it.porsi) || 0) * (Number(it.hargaSatuan || it.harga_satuan) || 0),
      0,
    );
    const persen1 = Number(isian.persen_pph23 ?? 2);
    const pph1 = Math.round((sub1 * persen1) / 100);

    const sub2 = items2.reduce(
      (acc, it) => acc + (Number(it.volume || it.porsi) || 0) * (Number(it.hargaSatuan || it.harga_satuan) || 0),
      0,
    );
    const persen2 = Number(isian.persen_pph23_2 ?? isian.persen_pph23 ?? 2);
    const pph2 = Math.round((sub2 * persen2) / 100);

    totalBiaya = sub1 + sub2;
    pph23 = pph1 + pph2;
  } else {
    totalBiaya = items.reduce(
      (acc, it) => acc + (Number(it.volume || it.porsi) || 0) * (Number(it.hargaSatuan || it.harga_satuan) || 0),
      0,
    );
    const pphPersen = Number(isian.persen_pph23 ?? (isian.pajak_pph23 ? (isian.pajak_pph23 / (totalBiaya || 1)) * 100 : 2));
    pph23 = Math.round((totalBiaya * pphPersen) / 100);
  }

  const netto = totalBiaya - pph23;
  const namaPenyedia = duaResto
    ? `${String(isian.penyedia || "").trim()} & ${String(isian.penyedia_2 || "").trim()}`
    : String(isian.penyedia || "").trim();

  return {
    nama_kegiatan: String(isian.dalam_rangka || isian.nama_kegiatan || "Rapat Konsumsi").trim().slice(0, 300),
    tanggal_kegiatan: isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10),
    lokasi_provinsi: String(isian.lokasi_provinsi || "D.K.I. Jakarta").trim().slice(0, 100),
    lokasi_detail: String(isian.tempat_kegiatan || isian.lokasi_detail || "").trim().slice(0, 200),
    nomor_spby: String(isian.nomor_spby || "").trim().slice(0, 100),
    sbm_kategori: String(isian.sbm_kategori || "SBM PMK 32/2025").trim().slice(0, 100),
    penyedia: namaPenyedia.slice(0, 200),
    nama_penerima: namaPenyedia.slice(0, 200),
    jumlah_porsi: jumlahPorsi,
    total: totalBiaya,
    pajak_pph23: pph23,
    netto: netto,
  };
}

const jejak = (oleh, aksi, catatan = "") =>
  JSON.stringify([{ waktu: new Date().toISOString(), oleh, aksi, catatan }]);

// bidang null = semua bidang (admin/bendahara)
async function daftar({ bidang = null, tahun = null, status = null } = {}) {
  try {
    const syarat = [];
    const nilai = [];

    if (bidang && bidang !== "Semua bidang") {
      nilai.push(bidang);
      syarat.push(`bidang = $${nilai.length}`);
    }
    if (tahun && tahun !== "Semua tahun") {
      nilai.push(Number(tahun));
      syarat.push(`EXTRACT(YEAR FROM tanggal_kegiatan) = $${nilai.length}`);
    }
    if (status && status !== "semua" && status !== "Semua status") {
      nilai.push(status.toLowerCase());
      syarat.push(`status = $${nilai.length}`);
    }

    const sqlWhere = syarat.length ? `WHERE ${syarat.join(" AND ")}` : "";
    const hasil = await semuaBaris(
      `SELECT ${KOLOM_RINGKAS} FROM konsumsi
       ${sqlWhere}
       ORDER BY tanggal_kegiatan DESC, id DESC`,
      nilai,
    );
    if (hasil && hasil.length > 0) return hasil;
  } catch (err) {
    console.warn("[KONSUMSI] Gagal baca Postgres, beralih ke memori:", err?.message);
  }

  // Filter memori lokal
  return penyimpananLokal.filter((d) => {
    if (bidang && bidang !== "Semua bidang" && d.bidang !== bidang) return false;
    if (tahun && tahun !== "Semua tahun" && !String(d.tanggal_kegiatan).startsWith(String(tahun))) return false;
    if (status && status !== "semua" && status !== "Semua status" && d.status !== status.toLowerCase()) return false;
    return true;
  });
}

async function satu(id) {
  try {
    const baris = await satuBaris(
      `SELECT ${KOLOM_RINGKAS}, isian, riwayat FROM konsumsi WHERE id = $1`,
      [Number(id)],
    );
    if (baris) return baris;
  } catch {
    // abaikan, cari di memori
  }

  const temuan = penyimpananLokal.find((d) => String(d.id) === String(id));
  return temuan || null;
}

async function buat({ bidang, isian, oleh }) {
  const r = ringkasan(isian);
  const baruLokal = {
    id: Date.now(),
    bidang: bidang || "BMN",
    status: "aktif",
    ...r,
    isian,
    alasan_batal: "",
    tanggal_batal: null,
    dibatalkan_oleh: "",
    dibuat_oleh: oleh,
    diubah_oleh: oleh,
    dibuat_pada: new Date().toISOString(),
    diubah_pada: new Date().toISOString(),
    jumlah_jenis_item: Array.isArray(isian.items) ? isian.items.length : 1,
  };

  try {
    const hasil = await satuBaris(
      `INSERT INTO konsumsi
         (bidang, nama_kegiatan, tanggal_kegiatan, lokasi_provinsi, lokasi_detail,
          nomor_spby, sbm_kategori, penyedia, nama_penerima, jumlah_porsi,
          total, pajak_pph23, netto, isian, dibuat_oleh, diubah_oleh, riwayat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16)
       RETURNING ${KOLOM_RINGKAS}`,
      [
        baruLokal.bidang,
        r.nama_kegiatan,
        r.tanggal_kegiatan,
        r.lokasi_provinsi,
        r.lokasi_detail,
        r.nomor_spby,
        r.sbm_kategori,
        r.penyedia,
        r.nama_penerima,
        r.jumlah_porsi,
        r.total,
        r.pajak_pph23,
        r.netto,
        JSON.stringify(isian),
        oleh,
        jejak(oleh, "dibuat"),
      ],
    );
    if (hasil) {
      penyimpananLokal.unshift({ ...hasil, isian });
      return hasil;
    }
  } catch (err) {
    console.warn("[KONSUMSI] Gagal insert Postgres, disimpan ke memori lokal:", err?.message);
  }

  penyimpananLokal.unshift(baruLokal);
  return baruLokal;
}

async function ubah(id, { isian, oleh }) {
  const r = ringkasan(isian);

  try {
    const hasil = await satuBaris(
      `UPDATE konsumsi SET
         nama_kegiatan = $2, tanggal_kegiatan = $3, lokasi_provinsi = $4,
         lokasi_detail = $5, nomor_spby = $6, sbm_kategori = $7,
         penyedia = $8, nama_penerima = $9, jumlah_porsi = $10,
         total = $11, pajak_pph23 = $12, netto = $13,
         isian = $14, diubah_oleh = $15,
         riwayat = riwayat || $16::jsonb, diubah_pada = now()
       WHERE id = $1
       RETURNING ${KOLOM_RINGKAS}`,
      [
        Number(id),
        r.nama_kegiatan,
        r.tanggal_kegiatan,
        r.lokasi_provinsi,
        r.lokasi_detail,
        r.nomor_spby,
        r.sbm_kategori,
        r.penyedia,
        r.nama_penerima,
        r.jumlah_porsi,
        r.total,
        r.pajak_pph23,
        r.netto,
        JSON.stringify(isian),
        oleh,
        jejak(oleh, "diubah"),
      ],
    );
    if (hasil) {
      const idx = penyimpananLokal.findIndex((d) => String(d.id) === String(id));
      if (idx !== -1) penyimpananLokal[idx] = { ...hasil, isian };
      return hasil;
    }
  } catch (err) {
    console.warn("[KONSUMSI] Gagal update Postgres, update memori lokal:", err?.message);
  }

  const idx = penyimpananLokal.findIndex((d) => String(d.id) === String(id));
  if (idx !== -1) {
    penyimpananLokal[idx] = {
      ...penyimpananLokal[idx],
      ...r,
      isian,
      diubah_oleh: oleh,
      diubah_pada: new Date().toISOString(),
    };
    return penyimpananLokal[idx];
  }
  return { id, isian, ...r };
}

async function batalkan(id, { alasan = "", oleh }) {
  try {
    const hasil = await satuBaris(
      `UPDATE konsumsi SET
         status = 'dibatalkan', alasan_batal = $2, tanggal_batal = now(),
         dibatalkan_oleh = $3, diubah_oleh = $3,
         riwayat = riwayat || $4::jsonb, diubah_pada = now()
       WHERE id = $1
       RETURNING ${KOLOM_RINGKAS}`,
      [Number(id), alasan, oleh, jejak(oleh, "dibatalkan", alasan)],
    );
    if (hasil) {
      const idx = penyimpananLokal.findIndex((d) => String(d.id) === String(id));
      if (idx !== -1) penyimpananLokal[idx] = { ...penyimpananLokal[idx], status: "dibatalkan", alasan_batal: alasan };
      return hasil;
    }
  } catch {
    // fallback
  }

  const idx = penyimpananLokal.findIndex((d) => String(d.id) === String(id));
  if (idx !== -1) {
    penyimpananLokal[idx] = {
      ...penyimpananLokal[idx],
      status: "dibatalkan",
      alasan_batal: alasan,
      tanggal_batal: new Date().toISOString().slice(0, 10),
      dibatalkan_oleh: oleh,
    };
    return penyimpananLokal[idx];
  }
  return { id, status: "dibatalkan" };
}

async function pulihkan(id, { oleh }) {
  try {
    const hasil = await satuBaris(
      `UPDATE konsumsi SET
         status = 'aktif', alasan_batal = NULL, tanggal_batal = NULL,
         dibatalkan_oleh = NULL, diubah_oleh = $2,
         riwayat = riwayat || $3::jsonb, diubah_pada = now()
       WHERE id = $1
       RETURNING ${KOLOM_RINGKAS}`,
      [Number(id), oleh, jejak(oleh, "dipulihkan")],
    );
    if (hasil) {
      const idx = penyimpananLokal.findIndex((d) => String(d.id) === String(id));
      if (idx !== -1) penyimpananLokal[idx] = { ...penyimpananLokal[idx], status: "aktif", alasan_batal: "" };
      return hasil;
    }
  } catch {
    // fallback
  }

  const idx = penyimpananLokal.findIndex((d) => String(d.id) === String(id));
  if (idx !== -1) {
    penyimpananLokal[idx] = {
      ...penyimpananLokal[idx],
      status: "aktif",
      alasan_batal: "",
      tanggal_batal: null,
      dibatalkan_oleh: "",
    };
    return penyimpananLokal[idx];
  }
  return { id, status: "aktif" };
}

async function hapus(id) {
  try {
    await kueri(`DELETE FROM konsumsi WHERE id = $1`, [Number(id)]);
  } catch {
    // fallback
  }
  penyimpananLokal = penyimpananLokal.filter((d) => String(d.id) !== String(id));
  return true;
}

function sudahSiap() {
  return siap;
}

module.exports = {
  pastikanSkema,
  ringkasan,
  daftar,
  satu,
  buat,
  ubah,
  batalkan,
  pulihkan,
  hapus,
  sudahSiap,
};
