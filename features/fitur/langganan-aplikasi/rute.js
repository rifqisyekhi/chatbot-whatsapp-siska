// =========================================================
// API FITUR LANGGANAN APLIKASI — DIKERJAKAN ANAK MAGANG (branch magang/langganan-aplikasi)
// =========================================================
//
// Semua rute fitur ini di /api/kwitansi/langganan-aplikasi/... (nginx :8005 hanya
// membuka /api/kwitansi). Panduan: PANDUAN-MAGANG.md
//
// Rencana umum (sesuaikan dengan contoh dokumen dari Tata Usaha):
//   GET    /api/kwitansi/langganan-aplikasi            daftar (per bidang)
//   POST   /api/kwitansi/langganan-aplikasi            simpan baru      (wajibPengubah)
//   GET    /api/kwitansi/langganan-aplikasi/:id        detail
//   PUT    /api/kwitansi/langganan-aplikasi/:id        ubah             (wajibPengubah)
//   DELETE /api/kwitansi/langganan-aplikasi/:id        hapus            (wajibPengubah)
//   GET    /api/kwitansi/langganan-aplikasi/:id/pdf    SPBY + kwitansi
//
// Tabel: buat db/009-langganan-aplikasi.sql (nomor 009 sudah dipesan untuk fitur
// ini) dan modul aksesnya di db/ — contoh: db/007-perjalanan-dinas.sql dan
// db/perjalananDinas.js.

function pasang(app, { auth }) {
  // Rute contoh — boleh dihapus setelah rute sungguhan dibuat. Dipakai
  // halaman fitur untuk memastikan login & sambungan API sudah benar.
  app.get("/api/kwitansi/langganan-aplikasi/status", auth.wajibLogin, (req, res) => {
    res.json({ fitur: "langganan-aplikasi", siap: false, operator: req.operator.nama });
  });
}

module.exports = { pasang };
