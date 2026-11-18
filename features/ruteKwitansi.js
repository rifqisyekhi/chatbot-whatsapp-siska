// =========================================================
// RUTE API KWITANSI PERJALANAN DINAS
// =========================================================
//
// Tahap dummy: belum ada tabel. Dashboard mengirim isian form, server
// menghitung sesuai PMK 32/2025 lalu membalas pratinjau (JSON) atau
// PDF. Tidak ada yang disimpan.

const { hitungKegiatan, referensi, GalatKwitansi } = require("./kwitansiTarif");
const { tulisKwitansiPdf } = require("./kwitansiPdf");

function pasangRuteKwitansi(app) {
  const balasGalat = (res, err, umum) => {
    if (err instanceof GalatKwitansi) return res.status(400).json({ error: err.message });
    console.error(`[API] ${umum}:`, err?.message || err);
    res.status(500).json({ error: umum });
  };

  // Tarif PMK, daftar akun, tingkat pegawai, dan penandatangan.
  app.get("/api/kwitansi/referensi", (req, res) => {
    res.json(referensi());
  });

  // Pratinjau perhitungan — dipanggil dashboard setiap isian berubah.
  app.post("/api/kwitansi/hitung", (req, res) => {
    try {
      res.json(hitungKegiatan(req.body));
    } catch (err) {
      balasGalat(res, err, "Gagal menghitung kwitansi");
    }
  });

  app.post("/api/kwitansi/pdf", (req, res) => {
    let kegiatan;
    try {
      kegiatan = hitungKegiatan(req.body);
    } catch (err) {
      return balasGalat(res, err, "Gagal menghitung kwitansi");
    }

    const nama = `Kwitansi_${kegiatan.kotaTujuan}_${kegiatan.tanggalBerangkat}.pdf`.replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nama}"`);
    try {
      tulisKwitansiPdf(kegiatan, res);
    } catch (err) {
      // Header sudah terkirim kalau galat terjadi di tengah penulisan.
      console.error("[API] Gagal membuat PDF kwitansi:", err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: "Gagal membuat PDF kwitansi" });
      else res.end();
    }
  });
}

module.exports = { pasangRuteKwitansi };
