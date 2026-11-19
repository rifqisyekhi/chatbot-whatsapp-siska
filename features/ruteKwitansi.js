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
const { tulisSuratBatalPdf } = require("./suratBatalPdf");
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

  // `req` memberi nama operator untuk tanda tangan "Pembuat daftar"
  // pada nominatif kota sekitar Jakarta.
  const kirimPdf = (req, res, kegiatan, awalan = "Kwitansi") => {
    kegiatan.pembuat = { nama: req.operator?.nama || "", nip: req.operator?.nip || "" };
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
    kirimPdf(req, res, kegiatan);
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
      if (baris.status === "dibatalkan") throw new GalatKwitansi("Perjalanan dinas ini sudah dibatalkan.");
      const b = req.body || {};
      const teks = (v, n = 300) => String(v ?? "").trim().slice(0, n);
      const tanggalAtau = (v, cadangan) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : cadangan);

      const alasan = teks(b.alasan, 500);
      if (!alasan) throw new GalatKwitansi("Alasan pembatalan wajib diisi.");

      // Peserta dipilih lewat indeks di isian.peserta; semua = batal seluruhnya.
      const daftarPeserta = Array.isArray(baris.isian?.peserta) ? baris.isian.peserta : [];
      const pilih = [...new Set((Array.isArray(b.peserta) ? b.peserta : []).map(Number))]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < daftarPeserta.length);
      if (!pilih.length) throw new GalatKwitansi("Pilih peserta yang dibatalkan.");
      const seluruh = pilih.length === daftarPeserta.length;

      const biaya = b.biaya && typeof b.biaya === "object" ? b.biaya : {};
      const kejadian = {
        waktu: new Date().toISOString(),
        oleh: req.operator.nama,
        seluruh,
        alasan,
        tanggal: tanggalAtau(b.tanggal, tanggalHariIni()),
        nomor_pernyataan: teks(b.nomor_pernyataan, 200),
        nomor_surat_tugas: teks(b.nomor_surat_tugas, 200),
        tanggal_surat_tugas: tanggalAtau(b.tanggal_surat_tugas, ""),
        uraian_biaya: teks(b.uraian_biaya, 300) || "transport berupa tiket pesawat",
        sifat_biaya: b.sifat_biaya === "sebagian" ? "sebagian" : "seluruhnya",
        dipa: teks(b.dipa, 300),
        peserta: pilih.map((i) => ({
          ...daftarPeserta[i],
          biaya_hangus: Math.max(0, Math.floor(Number(String(biaya[i] ?? "").replace(/[^\d]/g, "")) || 0)),
        })),
      };

      if (seluruh) return res.json(await db.batalkan(baris.id, { kejadian, oleh: req.operator.nama }));
      const isian = { ...baris.isian, peserta: daftarPeserta.filter((_, i) => !pilih.includes(i)) };
      const kegiatan = hitungKegiatan(isian);
      res.json(await db.batalkan(baris.id, { kejadian, isian, kegiatan, oleh: req.operator.nama }));
    } catch (err) {
      balasGalat(res, err, "Gagal membatalkan perjalanan dinas");
    }
  });

  app.post("/api/kwitansi/perjalanan/:id/pulihkan", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      // Peserta yang dibatalkan sebagian dikembalikan ke isian.
      const kembali = (baris.pembatalan || [])
        .filter((e) => !e.seluruh)
        .flatMap((e) => e.peserta.map(({ biaya_hangus: _, ...p }) => p));
      const isian = { ...baris.isian, peserta: [...(baris.isian?.peserta || []), ...kembali] };
      const kegiatan = hitungKegiatan(isian);
      res.json(await db.pulihkan(baris.id, { isian, kegiatan, oleh: req.operator.nama }));
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
    kirimPdf(req, res, kegiatan);
  });

  // Surat Pernyataan Pembatalan (+ Pembebanan Biaya bila ada biaya yang
  // hangus) untuk setiap peserta yang dibatalkan.
  app.get("/api/kwitansi/perjalanan/:id/surat-batal", auth.wajibLogin, async (req, res) => {
    let data;
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      const pembatalan = baris.pembatalan || [];
      if (!pembatalan.length) throw new GalatKwitansi("Belum ada pembatalan pada perjalanan dinas ini.");
      // Maksud, tanggal, tempat, dan SPD diambil dari isian perjalanan.
      const isian = baris.isian?.peserta?.length ? baris.isian : { ...baris.isian, peserta: pembatalan[0].peserta };
      data = { kegiatan: hitungKegiatan(isian), pembatalan, kepalaBiro: await db.kepalaBiro() };
    } catch (err) {
      return balasGalat(res, err, "Gagal menyusun surat pembatalan");
    }
    const nama = `Surat_Pembatalan_${data.kegiatan.kotaTujuan}_${data.kegiatan.tanggalBerangkat}.pdf`.replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nama}"`);
    try {
      tulisSuratBatalPdf(data, res);
    } catch (err) {
      console.error("[API] Gagal membuat surat pembatalan:", err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: "Gagal membuat surat pembatalan" });
      else res.end();
    }
  });
}

module.exports = { pasangRuteKwitansi };
