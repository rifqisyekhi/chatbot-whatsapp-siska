// =========================================================
// API FITUR KONSUMSI — ADMINISTRASI ROKEU
// =========================================================

const db = require("../../../db/konsumsi");

// Mengambil modul penyusun PDF secara dinamis dengan pembersihan cache require
// agar setiap perubahan format PDF langsung aktif tanpa harus me-restart server dev
function ambilSusunPdf() {
  try {
    delete require.cache[require.resolve("./pdf")];
  } catch {
    // abaikan jika belum di-cache
  }
  return require("./pdf").susunPdfKonsumsi;
}

function pasang(app, alat) {
  const { auth, GalatKwitansi, balasGalat } = alat;

  // Pastikan skema database dibuat otomatis saat server start
  db.pastikanSkema();

  // Status pengecekan koneksi & fitur
  app.get("/api/kwitansi/konsumsi/status", auth.wajibLogin, (req, res) => {
    res.json({
      fitur: "konsumsi",
      siap: db.sudahSiap(),
      operator: req.operator.nama,
      bidang: req.operator.bidang,
    });
  });

  // Helper memeriksa hak akses ke satu record
  async function ambilMilik(req, res) {
    const baris = await db.satu(req.params.id);
    if (!baris) {
      res.status(404).json({ error: "Data konsumsi tidak ditemukan." });
      return null;
    }
    if (!auth.bolehBidang(req.operator, baris.bidang)) {
      res.status(403).json({ error: "Anda tidak berhak mengakses data bidang ini." });
      return null;
    }
    return baris;
  }

  // 1. DAFTAR KONSUMSI
  app.get("/api/kwitansi/konsumsi", auth.wajibLogin, async (req, res) => {
    try {
      const op = req.operator;
      const bidang = auth.lihatSemua(op) ? req.query.bidang || null : op.bidang;
      const tahun = req.query.tahun || null;
      const status = req.query.status || null;

      const hasil = await db.daftar({ bidang, tahun, status });
      res.json(hasil);
    } catch (err) {
      balasGalat(res, err, "Gagal memuat daftar pengajuan konsumsi");
    }
  });

  // 2. DETAIL KONSUMSI
  app.get("/api/kwitansi/konsumsi/:id", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (baris) res.json(baris);
    } catch (err) {
      balasGalat(res, err, "Gagal memuat detail konsumsi");
    }
  });

  // 3. SIMPAN KONSUMSI BARU (wajibPengubah)
  app.post("/api/kwitansi/konsumsi", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const op = req.operator;
      const isian = req.body?.isian || req.body || {};
      const bidang = auth.lihatSemua(op)
        ? String(req.body?.bidang || isian.bidang || op.bidang || "BMN")
        : op.bidang;

      const namaKegiatan = isian.dalam_rangka || isian.nama_kegiatan || "";
      if (!namaKegiatan.trim()) {
        throw new GalatKwitansi("Uraian kegiatan / dalam rangka wajib diisi.");
      }

      const hasil = await db.buat({
        bidang,
        isian: { ...isian, nama_kegiatan: namaKegiatan },
        oleh: op.nama,
      });
      res.status(201).json(hasil);
    } catch (err) {
      balasGalat(res, err, "Gagal menyimpan pengajuan konsumsi");
    }
  });

  // 4. UBAH KONSUMSI (wajibPengubah)
  app.put("/api/kwitansi/konsumsi/:id", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;

      if (baris.status === "dibatalkan") {
        throw new GalatKwitansi("Pengajuan yang dibatalkan tidak bisa diubah. Pulihkan terlebih dahulu.");
      }

      const isian = req.body?.isian || req.body || {};
      const namaKegiatan = isian.dalam_rangka || isian.nama_kegiatan || baris.nama_kegiatan;
      const hasil = await db.ubah(baris.id, {
        isian: { ...isian, nama_kegiatan: namaKegiatan },
        oleh: req.operator.nama,
      });
      res.json(hasil);
    } catch (err) {
      balasGalat(res, err, "Gagal mengubah pengajuan konsumsi");
    }
  });

  // 5. BATALKAN KONSUMSI (wajibPengubah)
  app.post("/api/kwitansi/konsumsi/:id/batalkan", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;

      const alasan = String(req.body?.alasan || "Dibatalkan").trim();
      const hasil = await db.batalkan(baris.id, {
        alasan,
        oleh: req.operator.nama,
      });
      res.json(hasil);
    } catch (err) {
      balasGalat(res, err, "Gagal membatalkan pengajuan konsumsi");
    }
  });

  // 6. PULIHKAN KONSUMSI (wajibPengubah)
  app.post("/api/kwitansi/konsumsi/:id/pulihkan", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;

      const hasil = await db.pulihkan(baris.id, {
        oleh: req.operator.nama,
      });
      res.json(hasil);
    } catch (err) {
      balasGalat(res, err, "Gagal memulihkan pengajuan konsumsi");
    }
  });

  // 7. HAPUS KONSUMSI (wajibPengubah)
  app.delete("/api/kwitansi/konsumsi/:id", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;

      const sukses = await db.hapus(baris.id);
      res.json({ sukses, id: baris.id });
    } catch (err) {
      balasGalat(res, err, "Gagal menghapus pengajuan konsumsi");
    }
  });

  // 8. CETAK PDF SPBY & KWITANSI
  app.get("/api/kwitansi/konsumsi/:id/pdf", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;

      const namaBerkas = `Kwitansi_Konsumsi_${String(baris.nama_kegiatan || "kegiatan").slice(0, 30)}_${baris.tanggal_kegiatan}.pdf`.replace(/[^\w.-]+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${namaBerkas}"`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const susun = ambilSusunPdf();
      susun({
        data: baris,
        alat,
        streamRes: res,
      });
    } catch (err) {
      console.error("[KONSUMSI PDF] Gagal menyusun PDF:", err);
      if (!res.headersSent) {
        balasGalat(res, err, "Gagal mencetak dokumen PDF konsumsi");
      } else {
        res.end();
      }
    }
  });

  // 9. PREVIEW PDF DARI ISIAN FORM
  app.post("/api/kwitansi/konsumsi/pdf-preview", auth.wajibLogin, async (req, res) => {
    try {
      const isian = req.body?.isian || req.body || {};
      const ringkas = db.ringkasan(isian);
      const dataSemen = {
        ...ringkas,
        isian,
      };

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Preview_Konsumsi.pdf"`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const susun = ambilSusunPdf();
      susun({
        data: dataSemen,
        alat,
        streamRes: res,
      });
    } catch (err) {
      balasGalat(res, err, "Gagal membuat pratinjau PDF");
    }
  });
}

module.exports = { pasang };
