// =========================================================
// AKSES DATA ABSENSI (BOT)
// =========================================================
//
// Tabel `absensi` DIMILIKI aplikasi presensi, bukan bot. Bot
// hanya menyentuhnya di dua tempat, dan keduanya disengaja:
//
//   1. Mencatat lembur yang disetujui atasan
//   2. Menghapus absensi saat reset data pengujian
//
// KENAPA BOT MENULIS LANGSUNG, BUKAN LEWAT API BACKEND
//
// Alasan aslinya ada di komentar index.js dan masih berlaku:
// endpoint tulis di backend bisa dijangkau dari jaringan kantor
// lewat nginx, dan pegawai tidak boleh bisa menyetujui lemburnya
// sendiri dengan curl. Persetujuan hanya boleh datang dari balasan
// atasan di WhatsApp.
//
// Jadi modul ini sengaja sempit: hanya dua operasi itu. Semua
// pembacaan absensi tetap lewat API backend seperti sebelumnya.

const { satuBaris, kueri } = require("./kolam");

// =========================================================
// CATAT LEMBUR DISETUJUI
// =========================================================
//
// Mongo:
//   collection("absensi").updateOne(
//     { no_wa, tanggal },
//     { $set: { "lembur.disetujui": true, "lembur.alasan": ...,
//               "lembur.atasan": ..., "lembur.disetujuiPada": new Date() } })
//
// Sub-dokumen `lembur` kini empat kolom datar, jadi $set
// bersarangnya jadi SET biasa.
//
// Mengembalikan true kalau ada baris yang kena — sama seperti
// pemeriksaan matchedCount > 0 dulu. Itu yang membedakan
// "persetujuan tercatat" dari "absensi hari itu tidak ada",
// dan pemanggilnya memakainya untuk memilih pesan balasan.
async function catatLemburDisetujui({ noWa, tanggal, alasan, atasan }) {
  const b = await satuBaris(
    `UPDATE absensi
        SET lembur_disetujui = true,
            lembur_alasan = $3,
            lembur_atasan = $4,
            lembur_disetujui_pada = now()
      WHERE no_wa = $1 AND tanggal = $2
      RETURNING id`,
    [noWa, tanggal, alasan || "", atasan || ""],
  );

  return Boolean(b);
}

// =========================================================
// HAPUS ABSENSI SATU PEGAWAI
// =========================================================
//
// Dipakai fitur reset data pengujian. Riwayat perubahan status
// dan jam ikut terhapus lewat ON DELETE CASCADE — di Mongo
// keduanya ada DI DALAM dokumen absensinya, jadi perilakunya
// sama.
//
// Nomor kosong mengembalikan 0 tanpa menyentuh apa pun: DELETE
// tanpa syarat yang bermakna akan menghapus absensi SEMUA
// PEGAWAI, dan ini fitur yang dipicu dari chat.
async function hapusMilikPegawai(noWa) {
  const n = String(noWa || "").trim();

  if (!n) return 0;

  const { rowCount } = await kueri("DELETE FROM absensi WHERE no_wa = $1", [n]);

  return rowCount;
}

module.exports = { catatLemburDisetujui, hapusMilikPegawai };
