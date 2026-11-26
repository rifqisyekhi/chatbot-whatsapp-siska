// =========================================================
// API FITUR ADMINISTRASI ROKEU
// =========================================================
//
// Tiap fitur punya folder sendiri: features/fitur/<slug>/rute.js yang
// mengekspor pasang(app, alat). Semua rutenya WAJIB berawalan
// /api/kwitansi/<slug>/ — hanya awalan /api/kwitansi yang dibuka nginx :8005.
//
// `alat` berisi perlengkapan bersama supaya fitur tidak perlu menyalin:
//   auth.wajibLogin     middleware: tolak tanpa token, isi req.operator
//   auth.wajibPengubah  middleware: tolak bendahara (hanya memantau)
//   auth.bolehBidang(op, bidang)  operator hanya bidangnya; admin/bendahara semua
//   auth.lihatSemua(op) admin/bendahara melihat semua bidang
//   GalatKwitansi       lempar ini untuk pesan 400 ke pengguna
//   balasGalat(res, err, pesanUmum)
//   pejabat             penandatangan bawaan (PPK, bendahara) dari .env
//   halamanSpby, pasangFontSpby   halaman SPBY yang sama dengan servis kendaraan
//   terbilangRupiah, tanggalPanjang

const FITUR = ["konsumsi", "langganan-aplikasi", "bbm-kepala-biro"];

function pasangSemuaFitur(app, alat) {
  for (const slug of FITUR) {
    try {
      require(`./${slug}/rute`).pasang(app, alat);
    } catch (err) {
      // Satu fitur yang rusak tidak boleh menjatuhkan bot dan fitur lain.
      console.error(`[ADMINISTRASI] Fitur ${slug} gagal dipasang:`, err?.message || err);
    }
  }
}

module.exports = { pasangSemuaFitur };
