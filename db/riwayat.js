// =========================================================
// AKSES DATA RIWAYAT: CUTI, LEMBUR, KENDARAAN
// =========================================================
//
// Menggantikan models/RiwayatCuti.js, RiwayatLembur.js, dan
// RiwayatKendaraan.js (Mongoose).
//
// Ketiganya digabung dalam satu berkas karena pemakaiannya
// sedikit dan seragam — tulis satu baris, dan untuk cuti
// tambahkan path PDF-nya sesudah berkasnya dibuat. Memecahnya
// jadi tiga berkas berisi dua fungsi masing-masing hanya
// menambah tempat untuk dicari tanpa menambah kejelasan.

const { satuBaris, kueri } = require("./kolam");

// =========================================================
// RIWAYAT CUTI
// =========================================================

const KOLOM_CUTI = `
  id, nip, nama, jabatan, sub_unit, jenis_cuti, alasan, lama_cuti,
  alamat_cuti, kontak_cuti, atasan, status, file_pdf, dibuat_pada
`;

const STATUS_CUTI_SAH = ["DISETUJUI", "DITOLAK", "MENUNGGU"];

function cutiKeBentukLama(b) {
  if (!b) return null;

  return { ...b, _id: b.id, createdAt: b.dibuat_pada };
}

// Pengganti RiwayatCuti.create({...}).
//
// Default "-" bukan string kosong, meniru skema Mongoose: Form
// Cuti PDF mencetak nilainya apa adanya, dan sel kosong di
// formulir resmi terbaca seperti ada yang terlewat diisi.
const cuti = {
  async buat(data) {
    const status = String(data.status || "DISETUJUI").toUpperCase();

    if (!STATUS_CUTI_SAH.includes(status)) {
      throw new Error(
        `Status cuti "${data.status}" tidak dikenali. ` +
          `Pilih ${STATUS_CUTI_SAH.join(", ")}.`,
      );
    }

    return cutiKeBentukLama(
      await satuBaris(
        `INSERT INTO riwayat_cuti
           (nip, nama, jabatan, sub_unit, jenis_cuti, alasan, lama_cuti,
            alamat_cuti, kontak_cuti, atasan, status, file_pdf)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING ${KOLOM_CUTI}`,
        [
          data.nip || "-",
          data.nama,
          data.jabatan || "-",
          data.sub_unit || "-",
          data.jenis_cuti,
          data.alasan || "",
          data.lama_cuti || "",
          data.alamat_cuti || "",
          data.kontak_cuti || "",
          data.atasan || "-",
          status,
          data.file_pdf || "",
        ],
      ),
    );
  },

  // Pengganti RiwayatCuti.findByIdAndUpdate(id, { file_pdf }).
  //
  // Dipanggil sesudah Form Cuti PDF selesai dibuat: barisnya
  // ditulis lebih dulu supaya pengajuannya tercatat meski
  // pembuatan PDF-nya gagal.
  async pasangPdf(id, filePdf) {
    const n = Number(id);

    if (!Number.isInteger(n) || n <= 0) return null;

    return cutiKeBentukLama(
      await satuBaris(
        `UPDATE riwayat_cuti SET file_pdf = $2 WHERE id = $1
         RETURNING ${KOLOM_CUTI}`,
        [n, String(filePdf || "")],
      ),
    );
  },
};

// =========================================================
// RIWAYAT LEMBUR
// =========================================================

const lembur = {
  // Pengganti new RiwayatLembur(data).save().
  async buat(data) {
    const b = await satuBaris(
      `INSERT INTO riwayat_lembur
         (nip, nama, gol, jabatan, tanggal, kegiatan, atasan)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, nip, nama, gol, jabatan, tanggal, kegiatan, atasan, dibuat_pada`,
      [
        data.nip ?? null,
        data.nama ?? null,
        data.gol ?? null,
        data.jabatan ?? null,
        data.tanggal ?? null,
        data.kegiatan ?? null,
        data.atasan ?? null,
      ],
    );

    return b ? { ...b, _id: b.id, createdAt: b.dibuat_pada } : null;
  },

  // Pengganti RiwayatLembur.deleteMany({ nama }).
  //
  // Dicari lewat nama karena tabel ini tidak menyimpan nomor WA.
  // Nama kosong mengembalikan 0 tanpa menyentuh apa pun —
  // pemanggilnya sudah menjaga itu, tapi dijaga di sini juga:
  // DELETE tanpa syarat yang bermakna akan menghapus riwayat
  // lembur SEMUA ORANG.
  async hapusPerNama(nama) {
    const n = String(nama || "").trim();

    if (!n) return 0;

    const { rowCount } = await kueri(
      "DELETE FROM riwayat_lembur WHERE nama = $1",
      [n],
    );

    return rowCount;
  },
};

// =========================================================
// RIWAYAT KENDARAAN
// =========================================================

const kendaraan = {
  // Pengganti new RiwayatKendaraan(data).save().
  async buat(data) {
    const b = await satuBaris(
      `INSERT INTO riwayat_kendaraan
         (tanggal, nama_pegawai, nip, kendaraan, tujuan, kondisi,
          lama_pakai, jam_pinjam, jam_akhir)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, tanggal, nama_pegawai, nip, kendaraan, tujuan,
                 kondisi, lama_pakai, jam_pinjam, jam_akhir, dibuat_pada`,
      [
        data.tanggal ?? null,
        data.nama_pegawai ?? null,
        data.nip ?? null,
        data.kendaraan ?? null,
        data.tujuan ?? null,
        data.kondisi ?? null,
        data.lama_pakai ?? null,
        data.jam_pinjam ?? null,
        data.jam_akhir ?? null,
      ],
    );

    return b ? { ...b, _id: b.id, createdAt: b.dibuat_pada } : null;
  },
};

module.exports = { cuti, lembur, kendaraan, STATUS_CUTI_SAH };
