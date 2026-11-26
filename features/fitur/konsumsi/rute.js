// =========================================================
// API FITUR KONSUMSI — ADMINISTRASI ROKEU
// =========================================================
//
// Semua data hanya di Postgres (db/konsumsi.js). Galat database dibalas
// 500 lewat balasGalat, isian salah dibalas 400 (GalatKwitansi).
// Angka (subtotal, PPh 23, netto) selalu dihitung ulang di server.

const db = require("../../../db/konsumsi");
const { periksaIsian, hitungKonsumsi } = require("./hitung");
const { susunPdfKonsumsi } = require("./pdf");

const STATUS = ["aktif", "dibatalkan"];

function pasang(app, alat) {
  const { auth, GalatKwitansi, balasGalat, pejabat } = alat;

  db.pastikanSkema();

  app.get("/api/kwitansi/konsumsi/status", auth.wajibLogin, (req, res) => {
    res.json({
      fitur: "konsumsi",
      siap: db.sudahSiap(),
      operator: req.operator.nama,
      bidang: req.operator.bidang,
    });
  });

  // Baris milik bidang operator, atau balasan 404/403 sudah dikirim.
  async function ambilMilik(req, res) {
    const baris = /^\d+$/.test(req.params.id) ? await db.satu(req.params.id) : null;
    if (!baris) {
      res.status(404).json({ error: "Data konsumsi tidak ditemukan." });
      return null;
    }
    if (!auth.bolehBidang(req.operator, baris.bidang)) {
      res.status(403).json({ error: "Data konsumsi ini milik bidang lain." });
      return null;
    }
    return baris;
  }

  // PDF dari data (tersimpan atau pratinjau) dengan penandatangan dari .env.
  function kirimPdf(res, data, namaBerkas) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${namaBerkas.replace(/[^\w.-]+/g, "_")}"`);
    res.setHeader("Cache-Control", "no-store");
    try {
      susunPdfKonsumsi({ data, hitungan: hitungKonsumsi(data.isian), pejabat, streamRes: res });
    } catch (err) {
      console.error("[KONSUMSI] Gagal menyusun PDF:", err?.message || err);
      if (!res.headersSent) {
        res.removeHeader("Content-Type");
        res.removeHeader("Content-Disposition");
        balasGalat(res, err, "Gagal membuat PDF konsumsi");
      } else {
        res.end();
      }
    }
  }

  // 1. DAFTAR
  app.get("/api/kwitansi/konsumsi", auth.wajibLogin, async (req, res) => {
    try {
      const op = req.operator;
      const bidang = auth.lihatSemua(op) ? req.query.bidang || null : op.bidang;
      const tahun = /^\d{4}$/.test(String(req.query.tahun || "")) ? req.query.tahun : null;
      const status = STATUS.includes(req.query.status) ? req.query.status : null;
      res.json(await db.daftar({ bidang, tahun, status }));
    } catch (err) {
      balasGalat(res, err, "Gagal memuat daftar konsumsi");
    }
  });

  // 2. PRATINJAU PDF DARI ISIAN FORM (belum disimpan). Didaftarkan sebelum
  //    rute /:id supaya "pdf-preview" tidak dianggap id.
  app.post("/api/kwitansi/konsumsi/pdf-preview", auth.wajibLogin, auth.wajibPengubah, (req, res) => {
    let isian;
    try {
      isian = periksaIsian(req.body?.isian);
    } catch (err) {
      return balasGalat(res, err, "Gagal membuat pratinjau PDF");
    }
    const h = hitungKonsumsi(isian);
    kirimPdf(
      res,
      { nama_kegiatan: isian.dalam_rangka, tanggal_kegiatan: isian.tanggal_kegiatan, total: h.total, isian },
      "Pratinjau_Konsumsi.pdf",
    );
  });

  // 3. DETAIL
  app.get("/api/kwitansi/konsumsi/:id", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (baris) res.json(baris);
    } catch (err) {
      balasGalat(res, err, "Gagal memuat detail konsumsi");
    }
  });

  // 4. SIMPAN BARU
  app.post("/api/kwitansi/konsumsi", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const op = req.operator;
      const bidang = op.peran === "admin" ? String(req.body?.bidang || "") : op.bidang;
      if (!auth.BIDANG.includes(bidang)) throw new GalatKwitansi("Pilih bidang.");
      const isian = periksaIsian(req.body?.isian);
      const hitungan = hitungKonsumsi(isian);
      res.status(201).json(await db.buat({ bidang, isian, hitungan, oleh: op.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal menyimpan konsumsi");
    }
  });

  // 5. UBAH
  app.put("/api/kwitansi/konsumsi/:id", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      if (baris.status === "dibatalkan") {
        throw new GalatKwitansi("Konsumsi yang dibatalkan tidak bisa diubah. Pulihkan terlebih dahulu.");
      }
      const isian = periksaIsian(req.body?.isian);
      const hitungan = hitungKonsumsi(isian);
      res.json(await db.ubah(baris.id, { isian, hitungan, oleh: req.operator.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal mengubah konsumsi");
    }
  });

  // 6. BATALKAN
  app.post("/api/kwitansi/konsumsi/:id/batalkan", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      if (baris.status === "dibatalkan") throw new GalatKwitansi("Konsumsi ini sudah dibatalkan.");
      const alasan = String(req.body?.alasan || "").trim().slice(0, 500);
      if (!alasan) throw new GalatKwitansi("Alasan pembatalan wajib diisi.");
      res.json(await db.batalkan(baris.id, { alasan, oleh: req.operator.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal membatalkan konsumsi");
    }
  });

  // 7. PULIHKAN
  app.post("/api/kwitansi/konsumsi/:id/pulihkan", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      if (baris.status !== "dibatalkan") throw new GalatKwitansi("Konsumsi ini tidak dalam status dibatalkan.");
      res.json(await db.pulihkan(baris.id, { oleh: req.operator.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal memulihkan konsumsi");
    }
  });

  // 8. HAPUS
  app.delete("/api/kwitansi/konsumsi/:id", auth.wajibLogin, auth.wajibPengubah, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      if (!(await db.hapus(baris.id))) {
        return res.status(404).json({ error: "Data konsumsi tidak ditemukan." });
      }
      console.log(`[KONSUMSI] #${baris.id} (${baris.bidang}) dihapus oleh ${req.operator.nama}`);
      res.json({ ok: true, id: baris.id });
    } catch (err) {
      balasGalat(res, err, "Gagal menghapus konsumsi");
    }
  });

  // 9. PDF DARI DATA TERSIMPAN (bendahara juga boleh membuka)
  app.get("/api/kwitansi/konsumsi/:id/pdf", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      kirimPdf(res, baris, `Konsumsi_${String(baris.nama_kegiatan || "kegiatan").slice(0, 30)}_${baris.tanggal_kegiatan}.pdf`);
    } catch (err) {
      if (!res.headersSent) balasGalat(res, err, "Gagal membuat PDF konsumsi");
      else res.end();
    }
  });
}

module.exports = { pasang };
