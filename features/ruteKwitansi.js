// =========================================================
// RUTE API KWITANSI PERJALANAN DINAS
// =========================================================
//
// Semua rute kecuali login dan referensi butuh token operator
// (lihat kwitansiAuth.js). Operator hanya melihat perjalanan dinas
// bidangnya sendiri; admin melihat semua.
//
// Perjalanan dinas disimpan di tabel perjalanan_dinas sebagai isian
// form utuh. PDF tidak disimpan: disusun ulang dari isian setiap kali
// diminta, lewat hitungKegiatan() yang sama dengan pratinjau.

const { hitungKegiatan, referensi, GalatKwitansi } = require("./kwitansiTarif");
const { tulisKwitansiPdf } = require("./kwitansiPdf");
const auth = require("./kwitansiAuth");
const db = require("../db/perjalananDinas");

const tanggalHariIni = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function pasangRuteKwitansi(app) {
  db.pastikanSkema();

  const balasGalat = (res, err, umum) => {
    if (err instanceof GalatKwitansi) return res.status(400).json({ error: err.message });
    console.error(`[API] ${umum}:`, err?.message || err);
    res.status(500).json({ error: umum });
  };

  const kirimPdf = (res, kegiatan, awalan = "Kwitansi") => {
    const nama = `${awalan}_${kegiatan.kotaTujuan}_${kegiatan.tanggalBerangkat}.pdf`.replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nama}"`);
    try {
      tulisKwitansiPdf(kegiatan, res);
    } catch (err) {
      console.error("[API] Gagal membuat PDF kwitansi:", err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: "Gagal membuat PDF kwitansi" });
      else res.end();
    }
  };

  // Baris milik bidang operator, atau balasan 404/403 sudah dikirim.
  const ambilMilik = async (req, res) => {
    const baris = await db.satu(req.params.id);
    if (!baris) {
      res.status(404).json({ error: "Perjalanan dinas tidak ditemukan" });
      return null;
    }
    if (!auth.bolehBidang(req.operator, baris.bidang)) {
      res.status(403).json({ error: "Perjalanan dinas ini milik bidang lain" });
      return null;
    }
    return baris;
  };

  // ---------- Login ----------
  app.post("/api/kwitansi/login", auth.login);
  app.get("/api/kwitansi/saya", auth.wajibLogin, (req, res) => {
    res.json({ operator: req.operator, bidang: auth.BIDANG });
  });

  // Tarif PMK, daftar akun, tingkat pegawai, dan penandatangan.
  app.get("/api/kwitansi/referensi", (req, res) => {
    res.json({ ...referensi(), bidang: auth.BIDANG });
  });

  // Pratinjau perhitungan — dipanggil dashboard setiap isian berubah.
  app.post("/api/kwitansi/hitung", auth.wajibLogin, (req, res) => {
    try {
      res.json(hitungKegiatan(req.body));
    } catch (err) {
      balasGalat(res, err, "Gagal menghitung kwitansi");
    }
  });

  // PDF dari isian yang belum disimpan.
  app.post("/api/kwitansi/pdf", auth.wajibLogin, (req, res) => {
    let kegiatan;
    try {
      kegiatan = hitungKegiatan(req.body);
    } catch (err) {
      return balasGalat(res, err, "Gagal menghitung kwitansi");
    }
    kirimPdf(res, kegiatan);
  });

  // ---------- Perjalanan dinas tersimpan ----------
  app.get("/api/kwitansi/perjalanan", auth.wajibLogin, async (req, res) => {
    try {
      const op = req.operator;
      const bidang = op.peran === "admin" ? req.query.bidang || null : op.bidang;
      res.json(await db.daftar({ bidang, tahun: req.query.tahun || null }));
    } catch (err) {
      balasGalat(res, err, "Gagal memuat daftar perjalanan dinas");
    }
  });

  app.get("/api/kwitansi/perjalanan/:id", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (baris) res.json(baris);
    } catch (err) {
      balasGalat(res, err, "Gagal memuat perjalanan dinas");
    }
  });

  app.post("/api/kwitansi/perjalanan", auth.wajibLogin, async (req, res) => {
    try {
      const op = req.operator;
      const isian = req.body?.isian || {};
      const bidang = op.peran === "admin" ? String(req.body?.bidang || "") : op.bidang;
      if (!auth.BIDANG.includes(bidang)) throw new GalatKwitansi("Pilih bidang.");
      const kegiatan = hitungKegiatan(isian);
      res.status(201).json(await db.buat({ bidang, isian, kegiatan, oleh: op.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal menyimpan perjalanan dinas");
    }
  });

  app.put("/api/kwitansi/perjalanan/:id", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      if (baris.status === "dibatalkan") throw new GalatKwitansi("Perjalanan dinas yang dibatalkan tidak bisa diubah. Pulihkan dulu.");
      const isian = req.body?.isian || {};
      const kegiatan = hitungKegiatan(isian);
      res.json(await db.ubah(baris.id, { isian, kegiatan, oleh: req.operator.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal mengubah perjalanan dinas");
    }
  });

  app.post("/api/kwitansi/perjalanan/:id/batal", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      const alasan = String(req.body?.alasan || "").trim().slice(0, 500);
      if (!alasan) throw new GalatKwitansi("Alasan pembatalan wajib diisi.");
      const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.tanggal || "") ? req.body.tanggal : tanggalHariIni();
      res.json(await db.batalkan(baris.id, { alasan, tanggal, oleh: req.operator.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal membatalkan perjalanan dinas");
    }
  });

  app.post("/api/kwitansi/perjalanan/:id/pulihkan", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (baris) res.json(await db.pulihkan(baris.id, { oleh: req.operator.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal memulihkan perjalanan dinas");
    }
  });

  app.delete("/api/kwitansi/perjalanan/:id", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      await db.hapus(baris.id);
      console.log(`[PERDIN] #${baris.id} (${baris.bidang}) dihapus oleh ${req.operator.nama}`);
      res.status(204).end();
    } catch (err) {
      balasGalat(res, err, "Gagal menghapus perjalanan dinas");
    }
  });

  // PDF perjalanan dinas tersimpan, disusun ulang dari isiannya.
  app.get("/api/kwitansi/perjalanan/:id/pdf", auth.wajibLogin, async (req, res) => {
    let kegiatan;
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      kegiatan = hitungKegiatan(baris.isian);
    } catch (err) {
      return balasGalat(res, err, "Gagal menyusun PDF perjalanan dinas");
    }
    kirimPdf(res, kegiatan);
  });
}

module.exports = { pasangRuteKwitansi };
