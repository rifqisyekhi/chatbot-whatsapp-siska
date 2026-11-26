// =========================================================
// API FITUR BBM KEPALA BIRO (branch magang/bbm-kepala-biro)
// =========================================================
//
// Semua rute fitur ini di /api/kwitansi/bbm-kepala-biro/...

const db = require("../../../db/bbmKepalaBiro");

function pejabatBbm(pejabatBawaan) {
  const p = pejabatBawaan || {};
  return {
    ...p,
    ppk: {
      ...(p.ppk || {}),
      nama: "Alpha Sandro Adithyaswara, S.Sos.",
    },
  };
}

const AKUN_BBM = [
  {
    kode: "026.01.WA.2158.EBA.994.002.A.523121",
    uraian: "523121 — Belanja Biaya Pemeliharaan Peralatan dan Mesin (BBM Kendaraan Dinas)",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.521111",
    uraian: "521111 — Belanja Keperluan Perkantoran",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.521211",
    uraian: "521211 — Belanja Bahan / Operasional Kegiatan",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.524111",
    uraian: "524111 — Belanja Perjalanan / Operasional",
  },
];

const JENIS_BBM_POPULER = [
  { nama: "Pertamax" },
  { nama: "Pertamax Turbo" },
  { nama: "Pertamina Dex" },
  { nama: "Dexlite" },
  { nama: "Pertalite" },
  { nama: "Solar" },
];

const SATUAN = ["Liter", "Pengisian", "Paket", "Unit"];

const tanggalHariIni = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const tanggalSah = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const teks = (v, n = 300) => String(v ?? "").trim().slice(0, n);
const angkaBulat = (v) => Math.max(0, Math.floor(Number(String(v ?? "").replace(/[^\d]/g, "")) || 0));

function pecahAkunSpby(kodeLengkap) {
  const bagian = String(kodeLengkap || "").split(".");
  const kodeAkun = bagian[bagian.length - 1] || "523121";
  const kegiatanMak = bagian.length >= 6 ? bagian.slice(3, 6).join(".") : "2158.EBA.994";
  return { kegiatanMak, kodeAkun };
}

function hitungBbm(isian = {}, GalatKwitansi, pejabatBawaan) {
  const jenisBbm = teks(isian.jenis_bbm, 200);
  if (!jenisBbm) throw new GalatKwitansi("Jenis BBM wajib diisi.");

  const penyedia = teks(isian.penyedia, 200);
  const namaKendaraan = teks(isian.kendaraan, 100).replace(/[•·]|â€¢/g, "-");
  const nomorPolisi = teks(isian.nomor_polisi, 60).replace(/[•·]|â€¢/g, "-");
  const kendaraan = [namaKendaraan, nomorPolisi]
    .filter(Boolean)
    .join(" - ");
  const keperluan = teks(isian.keperluan, 500);

  const tanggalBayar = tanggalSah(isian.tanggal_bayar) ? isian.tanggal_bayar : tanggalHariIni();
  const tanggalMulai = tanggalSah(isian.tanggal_mulai) ? isian.tanggal_mulai : tanggalBayar;
  const tanggalSelesai = tanggalSah(isian.tanggal_selesai) ? isian.tanggal_selesai : tanggalMulai;
  if (tanggalSelesai < tanggalMulai) {
    throw new GalatKwitansi("Tanggal batas akhir tidak boleh sebelum tanggal pembelian.");
  }

  const kodeAkunLengkap = teks(isian.akun, 120) || AKUN_BBM[0].kode;
  const akunDitemukan = AKUN_BBM.find((a) => a.kode === kodeAkunLengkap);
  const akun = akunDitemukan || { kode: kodeAkunLengkap, uraian: "Belanja BBM Kepala Biro" };
  const { kegiatanMak, kodeAkun } = pecahAkunSpby(akun.kode);

  const penerimaNama = teks(isian.penerima_nama, 200);
  if (!penerimaNama) throw new GalatKwitansi("Nama penerima (Kepada) wajib diisi.");
  const penerimaNip = teks(isian.penerima_nip, 50).replace(/\s+/g, "");
  const penerimaJabatan = teks(isian.penerima_jabatan, 200);

  const daftarRincian = Array.isArray(isian.rincian) && isian.rincian.length ? isian.rincian : [{}];
  const rincian = daftarRincian.map((item, idx) => {
    const uraianDefault =
      idx === 0
        ? `Pembelian BBM ${jenisBbm}${kendaraan ? ` (${kendaraan})` : ""}`
        : `Item BBM ${idx + 1}`;
    const uraian = teks(item.uraian, 250) || uraianDefault;
    const volume = Math.max(1, angkaBulat(item.volume || 1));
    const satuan = teks(item.satuan, 40) || "Liter";
    const hargaSatuan = angkaBulat(item.harga_satuan);
    const pajak = angkaBulat(item.pajak);
    const keterangan = teks(item.keterangan, 100);
    const jumlah = volume * hargaSatuan + pajak;
    return { uraian, volume, satuan, hargaSatuan, pajak, keterangan, jumlah };
  });

  const total = rincian.reduce((a, r) => a + r.jumlah, 0);
  if (total <= 0) {
    throw new GalatKwitansi("Isi harga satuan pada rincian biaya (total harus lebih dari Rp 0).");
  }

  const jumlahLiter = rincian.reduce((a, r) => a + r.volume, 0);

  const lampiran = Array.isArray(isian.lampiran)
    ? isian.lampiran
        .slice(0, 10)
        .filter((l) => l && typeof l.dataUrl === "string" && /^data:image\/(?:jpe?g|png);base64,/i.test(l.dataUrl))
        .map((l) => ({ nama: teks(l.nama, 150), dataUrl: l.dataUrl }))
    : [];

  return {
    jenisBbm,
    penyedia,
    namaKendaraan,
    nomorPolisi,
    kendaraan,
    keperluan,
    tanggalBayar,
    tanggalMulai,
    tanggalSelesai,
    tahunAnggaran: tanggalBayar.slice(0, 4),
    nomorSpby: teks(isian.nomor_spby, 100),
    noBku: teks(isian.no_bku, 100),
    akun,
    kegiatanMak,
    kodeAkun,
    penerima: {
      nama: penerimaNama,
      nip: penerimaNip,
      jabatan: penerimaJabatan,
    },
    rincian,
    jumlahLiter,
    jumlahLampiran: lampiran.length,
    lampiran,
    total,
    pejabat: pejabatBawaan,
  };
}

function pasang(app, alat) {
  const { auth, GalatKwitansi, balasGalat } = alat;
  const pejabat = pejabatBbm(alat.pejabat);

  db.pastikanSkema();

  const kirimPdf = (res, hitungan) => {
    const nama = `SPBY_BBM_Kepala_Biro_${hitungan.jenisBbm}_${hitungan.tanggalBayar}.pdf`.replace(
      /[^\w.-]+/g,
      "_",
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nama}"`);
    try {
      delete require.cache[require.resolve("./pdf")];
      const { tulisBbmPdf } = require("./pdf");
      tulisBbmPdf(hitungan, res, alat);
    } catch (err) {
      console.error("[BBM KABIRO] Gagal membuat PDF:", err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: "Gagal membuat PDF BBM Kepala Biro" });
      else res.end();
    }
  };

  const ambilMilik = async (req, res) => {
    const baris = await db.satu(req.params.id);
    if (!baris) {
      res.status(404).json({ error: "Data BBM Kepala Biro tidak ditemukan" });
      return null;
    }
    if (!auth.bolehBidang(req.operator, baris.bidang)) {
      res.status(403).json({ error: "Data BBM Kepala Biro ini milik bidang lain" });
      return null;
    }
    return baris;
  };

  app.get("/api/kwitansi/bbm-kepala-biro/status", auth.wajibLogin, (req, res) => {
    res.json({
      fitur: "bbm-kepala-biro",
      siap: db.sudahSiap(),
      operator: req.operator.nama,
    });
  });

  app.get("/api/kwitansi/bbm-kepala-biro/referensi", auth.wajibLogin, (req, res) => {
    res.json({
      akun: AKUN_BBM,
      jenisBbmPopuler: JENIS_BBM_POPULER,
      satuan: SATUAN,
      bidang: auth.BIDANG,
      pejabat,
    });
  });

  app.post("/api/kwitansi/bbm-kepala-biro/hitung", auth.wajibLogin, (req, res) => {
    try {
      const { lampiran: _, ...hasilTanpaGambar } = hitungBbm(req.body, GalatKwitansi, pejabat);
      res.json(hasilTanpaGambar);
    } catch (err) {
      balasGalat(res, err, "Gagal menghitung rincian BBM Kepala Biro");
    }
  });

  app.post("/api/kwitansi/bbm-kepala-biro/pdf", auth.wajibLogin, (req, res) => {
    let hitungan;
    try {
      hitungan = hitungBbm(req.body, GalatKwitansi, pejabat);
    } catch (err) {
      return balasGalat(res, err, "Gagal menghitung rincian BBM Kepala Biro");
    }
    kirimPdf(res, hitungan);
  });

  app.get("/api/kwitansi/bbm-kepala-biro", auth.wajibLogin, async (req, res) => {
    try {
      const op = req.operator;
      const bidang = auth.lihatSemua(op) ? req.query.bidang || null : op.bidang;
      res.json(await db.daftar({ bidang, tahun: req.query.tahun || null }));
    } catch (err) {
      balasGalat(res, err, "Gagal memuat daftar BBM Kepala Biro");
    }
  });

  app.post(
    "/api/kwitansi/bbm-kepala-biro",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const op = req.operator;
        const isian = req.body?.isian || {};
        const bidang = op.peran === "admin" ? String(req.body?.bidang || "") : op.bidang;
        if (!auth.BIDANG.includes(bidang)) throw new GalatKwitansi("Pilih bidang terlebih dahulu.");
        const hitungan = hitungBbm(isian, GalatKwitansi, pejabat);
        res.status(201).json(await db.buat({ bidang, isian, hitungan, oleh: op.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal menyimpan BBM Kepala Biro");
      }
    },
  );

  app.get("/api/kwitansi/bbm-kepala-biro/:id", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (baris) res.json(baris);
    } catch (err) {
      balasGalat(res, err, "Gagal memuat detail BBM Kepala Biro");
    }
  });

  app.put(
    "/api/kwitansi/bbm-kepala-biro/:id",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        if (baris.status === "dibatalkan") {
          throw new GalatKwitansi("Data BBM yang dibatalkan tidak bisa diubah. Pulihkan dulu.");
        }
        const isian = req.body?.isian || {};
        const hitungan = hitungBbm(isian, GalatKwitansi, pejabat);
        res.json(await db.ubah(baris.id, { isian, hitungan, oleh: req.operator.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal mengubah BBM Kepala Biro");
      }
    },
  );

  app.post(
    "/api/kwitansi/bbm-kepala-biro/:id/batal",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        if (baris.status === "dibatalkan") {
          throw new GalatKwitansi("Data BBM ini sudah dibatalkan.");
        }
        const alasan = teks(req.body?.alasan, 500);
        if (!alasan) throw new GalatKwitansi("Alasan pembatalan wajib diisi.");
        const tanggal = tanggalSah(req.body?.tanggal) ? req.body.tanggal : tanggalHariIni();
        res.json(await db.batalkan(baris.id, { alasan, tanggal, oleh: req.operator.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal membatalkan BBM Kepala Biro");
      }
    },
  );

  app.post(
    "/api/kwitansi/bbm-kepala-biro/:id/pulihkan",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        res.json(await db.pulihkan(baris.id, { oleh: req.operator.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal memulihkan BBM Kepala Biro");
      }
    },
  );

  app.delete(
    "/api/kwitansi/bbm-kepala-biro/:id",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        await db.hapus(baris.id);
        console.log(`[BBM KABIRO] #${baris.id} (${baris.bidang}) dihapus oleh ${req.operator.nama}`);
        res.status(204).end();
      } catch (err) {
        balasGalat(res, err, "Gagal menghapus BBM Kepala Biro");
      }
    },
  );

  app.get("/api/kwitansi/bbm-kepala-biro/:id/pdf", auth.wajibLogin, async (req, res) => {
    let hitungan;
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      hitungan = hitungBbm(baris.isian, GalatKwitansi, pejabat);
    } catch (err) {
      return balasGalat(res, err, "Gagal menyusun PDF BBM Kepala Biro");
    }
    kirimPdf(res, hitungan);
  });
}

module.exports = { pasang };
