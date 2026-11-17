// =========================================================
// RUTE API REKAP SERVICE KENDARAAN DINAS
// =========================================================
//
// Dipisah dari index.js supaya bisa dipasang di server uji tanpa
// menyalakan klien WhatsApp.

const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const dbServis = require("../db/servisKendaraan");
const penyimpananLaporan = require("./penyimpananLaporan");

function pasangRuteServis(app) {
  // SBM (Standar Biaya Masukan) pemeliharaan per kendaraan per tahun,
  // untuk kolom "SBM Tahunan" dan "Saldo" di rekap.
  function sbmServis() {
    const angka = (v, bawaan) => {
      const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
      return n > 0 ? n : bawaan;
    };
    return {
      Mobil: angka(process.env.SBM_SERVIS_MOBIL, 37000000),
      Motor: angka(process.env.SBM_SERVIS_MOTOR, 4960000),
    };
  }

  function balasGalatServis(res, err, pesanUmum) {
    if (err instanceof dbServis.GalatData) return res.status(400).json({ error: err.message });
    console.error(`[API] ${pesanUmum}:`, err?.message || err);
    res.status(500).json({ error: pesanUmum });
  }

  function servisBelumSiap(res) {
    if (dbServis.sudahSiap()) return false;
    res.status(503).json({
      error: "Tabel rekap service belum siap. Lihat log bot untuk migrasi db/006-servis-kendaraan.sql.",
    });
    return true;
  }

  app.get("/api/servis-kendaraan", async (req, res) => {
    if (servisBelumSiap(res)) return;
    try {
      const [data, tahunTersedia] = await Promise.all([
        dbServis.semua({ tahun: req.query.tahun }),
        dbServis.daftarTahun(),
      ]);
      res.json({ data, tahunTersedia, sbm: sbmServis() });
    } catch (err) {
      balasGalatServis(res, err, "Gagal memuat rekap service kendaraan");
    }
  });

  app.post("/api/servis-kendaraan", async (req, res) => {
    if (servisBelumSiap(res)) return;
    try {
      const baris = await dbServis.buat({ ...req.body, sumber: "dashboard", berkas_pdf: "" });
      res.status(201).json({ message: "Data service ditambahkan", data: baris });
    } catch (err) {
      balasGalatServis(res, err, "Gagal menambah data service");
    }
  });

  app.put("/api/servis-kendaraan/:id", async (req, res) => {
    if (servisBelumSiap(res)) return;
    try {
      const baris = await dbServis.perbarui(req.params.id, req.body);
      if (!baris) return res.status(404).json({ error: "Data service tidak ditemukan" });
      res.json({ message: "Data service diperbarui", data: baris });
    } catch (err) {
      balasGalatServis(res, err, "Gagal memperbarui data service");
    }
  });

  // PDF SPBY tetap disimpan di disk walau barisnya dihapus.
  app.delete("/api/servis-kendaraan/:id", async (req, res) => {
    if (servisBelumSiap(res)) return;
    try {
      const baris = await dbServis.hapus(req.params.id);
      if (!baris) return res.status(404).json({ error: "Data service tidak ditemukan" });
      res.json({ message: "Data service dihapus" });
    } catch (err) {
      balasGalatServis(res, err, "Gagal menghapus data service");
    }
  });

  app.get("/api/servis-kendaraan/:id/pdf", async (req, res) => {
    if (servisBelumSiap(res)) return;
    try {
      const baris = await dbServis.satu(req.params.id);
      if (!baris || !baris.berkas_pdf) {
        return res.status(404).json({ error: "Data ini tidak punya PDF SPBY" });
      }

      // Path disimpan relatif terhadap reports/. Dipastikan tetap di
      // dalam folder itu, supaya isi kolom tidak bisa menunjuk berkas
      // lain di server.
      const akar = path.resolve(penyimpananLaporan.AKAR_LAPORAN);
      const berkas = path.resolve(akar, baris.berkas_pdf);
      if (!berkas.startsWith(akar + path.sep)) {
        return res.status(400).json({ error: "Path PDF tidak sah" });
      }

      await fsPromises.access(berkas);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(path.basename(berkas))}"`,
      );
      fs.createReadStream(berkas).pipe(res);
    } catch (err) {
      if (err?.code === "ENOENT") return res.status(404).json({ error: "Berkas PDF sudah tidak ada di server" });
      balasGalatServis(res, err, "Gagal membuka PDF SPBY");
    }
  });
}

module.exports = { pasangRuteServis };
