// =========================================================
// BAGIAN BERSAMA SKRIP IMPOR RIWAYAT BARANG
// =========================================================
//
// Dipakai scripts/impor-riwayat-log-barang.js (log bot di VPS) dan
// scripts/impor-riwayat-chat-barang.js (ekspor chat WhatsApp).
// Keduanya merekonstruksi order WA lama yang sama dari sumber yang
// berbeda, jadi batas waktu, pemeriksaan duplikat, dan cara
// menyimpannya harus satu.

const { satuBaris, semuaBaris, dalamTransaksi } = require("../../db/kolam");

// Setiap baris rekonstruksi memuat frasa ini di keterangannya,
// apa pun sumbernya.
const PENANDA_UMUM = "Direkonstruksi dari";

// Sumber berbeda mencatat waktu order yang sama sedikit berbeda:
// log sampai detik saat notifikasi gudang dikirim, ekspor chat
// hanya sampai menit saat pesan ke pemohon dikirim.
const SELISIH_KEMBAR_MS = 15 * 60 * 1000;

const tglWib = (d) =>
  new Date(d.getTime() + 7 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);

// Order sesudah rekap aktif sudah dicatat bot sendiri. Batasnya
// mutasi WA pertama yang BUKAN rekonstruksi, atau --sampai.
async function batasWaktu(argumen) {
  const arg = argumen.find((a) => a.startsWith("--sampai="));

  if (arg) {
    const sampai = new Date(arg.split("=")[1]);
    if (Number.isNaN(sampai.getTime())) throw new Error(`--sampai tidak terbaca: ${arg}`);
    return sampai;
  }

  const pertama = await satuBaris(
    `SELECT min(dibuat_pada) AS t FROM mutasi_barang
      WHERE sumber = 'wa' AND keterangan NOT LIKE $1`,
    [`%${PENANDA_UMUM}%`],
  );

  return pertama?.t ? new Date(pertama.t) : new Date();
}

const samakan = (teks) => String(teks || "").trim().toLowerCase().replace(/\s+/g, " ");

// Membuang baris yang sudah ada di rekap: barang, pemohon, jenis,
// dan jumlah sama, dengan waktu terpaut paling lama 15 menit.
async function saringSudahAda(baris) {
  const ada = (
    await semuaBaris(
      `SELECT tanggal, id_barang, pihak, jenis, jumlah FROM mutasi_barang WHERE sumber = 'wa'`,
    )
  ).map((r) => ({ ...r, t: new Date(r.tanggal).getTime(), pihak: samakan(r.pihak) }));

  return baris.filter(
    (b) =>
      !ada.some(
        (r) =>
          r.id_barang === b.id_barang &&
          r.jenis === b.jenis &&
          r.jumlah === b.jumlah &&
          r.pihak === samakan(b.pihak) &&
          Math.abs(r.t - b.tanggal.getTime()) <= SELISIH_KEMBAR_MS,
      ),
  );
}

// Ditulis langsung ke tabel, bukan lewat db/mutasiBarang.js: stok
// sekarang sudah mencerminkan order ini, jadi stok_sesudah kosong
// dan stok tidak disentuh. Setiap baris tetap masuk log audit.
async function simpan(baru, oleh) {
  await dalamTransaksi(async (koneksi) => {
    for (const b of baru) {
      const { rows } = await koneksi.query(
        `INSERT INTO mutasi_barang
           (tanggal, id_barang, nama_barang, satuan, jenis, jumlah, stok_sesudah,
            pihak, unit, keterangan, sumber, dicatat_oleh)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, 'wa', $10)
         RETURNING *`,
        [b.tanggal, b.id_barang, b.nama_barang, b.satuan, b.jenis, b.jumlah, b.pihak, b.unit, b.keterangan, oleh],
      );

      await koneksi.query(
        `INSERT INTO mutasi_barang_log (mutasi_id, aksi, data_lama, data_baru, oleh)
         VALUES ($1, 'buat', NULL, $2, $3)`,
        [rows[0].id, rows[0], oleh],
      );
    }
  });
}

module.exports = { PENANDA_UMUM, tglWib, batasWaktu, saringSudahAda, simpan };
