// =========================================================
// API FITUR BBM KEPALA BIRO — DIKERJAKAN ANAK MAGANG (branch magang/bbm-kepala-biro)
// =========================================================
//
// Semua rute fitur ini di /api/kwitansi/bbm-kepala-biro/... (nginx :8005 hanya
// membuka /api/kwitansi). Panduan: PANDUAN-MAGANG.pdf
//
// Rencana umum (sesuaikan dengan contoh dokumen dari Tata Usaha):
//   GET    /api/kwitansi/bbm-kepala-biro            daftar (per bidang)
//   POST   /api/kwitansi/bbm-kepala-biro            simpan baru      (wajibPengubah)
//   GET    /api/kwitansi/bbm-kepala-biro/:id        detail
//   PUT    /api/kwitansi/bbm-kepala-biro/:id        ubah             (wajibPengubah)
//   DELETE /api/kwitansi/bbm-kepala-biro/:id        hapus            (wajibPengubah)
//   GET    /api/kwitansi/bbm-kepala-biro/:id/pdf    SPBY + kwitansi
//
// Tabel: buat db/010-bbm-kepala-biro.sql (nomor 010 sudah dipesan untuk fitur
// ini) dan modul aksesnya di db/ — contoh: db/007-perjalanan-dinas.sql dan
// db/perjalananDinas.js.

function pasang(app, { auth }) {
  // Rute contoh — boleh dihapus setelah rute sungguhan dibuat. Dipakai
  // halaman fitur untuk memastikan login & sambungan API sudah benar.
  app.get("/api/kwitansi/bbm-kepala-biro/status", auth.wajibLogin, (req, res) => {
    res.json({ fitur: "bbm-kepala-biro", siap: false, operator: req.operator.nama });
  });
}

module.exports = { pasang };
