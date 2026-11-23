// =========================================================
// API FITUR KONSUMSI — DIKERJAKAN ANAK MAGANG (branch magang/konsumsi)
// =========================================================
//
// Semua rute fitur ini di /api/kwitansi/konsumsi/... (nginx :8005 hanya
// membuka /api/kwitansi). Panduan: PANDUAN-MAGANG.md
//
// Rencana umum (sesuaikan dengan contoh dokumen dari Tata Usaha):
//   GET    /api/kwitansi/konsumsi            daftar (per bidang)
//   POST   /api/kwitansi/konsumsi            simpan baru      (wajibPengubah)
//   GET    /api/kwitansi/konsumsi/:id        detail
//   PUT    /api/kwitansi/konsumsi/:id        ubah             (wajibPengubah)
//   DELETE /api/kwitansi/konsumsi/:id        hapus            (wajibPengubah)
//   GET    /api/kwitansi/konsumsi/:id/pdf    SPBY + kwitansi
//
// Tabel: buat db/008-konsumsi.sql (nomor 008 sudah dipesan untuk fitur
// ini) dan modul aksesnya di db/ — contoh: db/007-perjalanan-dinas.sql dan
// db/perjalananDinas.js.

function pasang(app, { auth }) {
  // Rute contoh — boleh dihapus setelah rute sungguhan dibuat. Dipakai
  // halaman fitur untuk memastikan login & sambungan API sudah benar.
  app.get("/api/kwitansi/konsumsi/status", auth.wajibLogin, (req, res) => {
    res.json({ fitur: "konsumsi", siap: false, operator: req.operator.nama });
  });
}

module.exports = { pasang };
