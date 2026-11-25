// =========================================================
// API FITUR LANGGANAN APLIKASI (branch magang/langganan-aplikasi)
// =========================================================
//
// Semua rute fitur ini di /api/kwitansi/langganan-aplikasi/...
// Mengelola daftar, pembuatan, pengubahan, pembatalan/pemulihan,
// penghapusan, serta cetak PDF SPBY (+ lampiran bukti yang diunggah).
//
// Data hanya di Postgres (db/langgananAplikasi.js). Galat database dibalas
// 500 lewat balasGalat, isian salah dibalas 400 (GalatKwitansi).
// Angka selalu dihitung ulang di server oleh hitungLangganan() — satu
// sumber untuk ringkasan tabel, pratinjau form, dan PDF.
// Penandatangan (PPK, bendahara) dari alat.pejabat (.env), tidak ditulis di kode.

const db = require("../../../db/langgananAplikasi");
const { tulisLanggananPdf } = require("./pdf");

// Kode akun (MAK) — perlu dipastikan ke Tata Usaha sebelum dipakai resmi.
// Akun mengikuti contoh SPBY langganan dari Tata Usaha (SPBY Open AI Oktober).
const AKUN_LANGGANAN = [
  {
    kode: "026.01.WA.2158.EBA.994.002.A.522119",
    uraian: "522119 — Belanja Langganan Daya dan Jasa Lainnya",
  },
];

// Penyedia = "Kepada" di SPBY, persis seperti di contoh Tata Usaha.
const APLIKASI_POPULER = [
  { nama: "Adobe", penyedia: "ADOBE" },
  { nama: "Zoom", penyedia: "Zoom" },
  { nama: "Google", penyedia: "Google" },
  { nama: "Google One", penyedia: "Google One" },
  { nama: "Google Workspace", penyedia: "Google Workspace" },
  { nama: "Open AI", penyedia: "OpenAI OpCo,LLC" },
  { nama: "Canva", penyedia: "CANVA" },
];

const PERIODE = ["Bulanan", "Triwulanan", "Semesteran", "Tahunan", "Sekali Bayar"];
const SATUAN = ["Lisensi", "Akun", "Bulan", "Tahun", "Paket", "Unit"];

// Batas lampiran gambar bukti yang disimpan di kolom `isian`.
const MAKS_LAMPIRAN = 5;
const MAKS_BYTE_LAMPIRAN = 1024 * 1024; // 1 MB per gambar (setelah base64 didekode)
const MAKS_RINCIAN = 50;
const BATAS_ANGKA = 1e12;

const tanggalHariIni = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

// Tanggal YYYY-MM-DD yang benar-benar ada di kalender ("2026-02-30" ditolak).
function tanggalSah(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return false;
  const [th, bl, hr] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(th, bl - 1, hr));
  return d.getUTCFullYear() === th && d.getUTCMonth() === bl - 1 && d.getUTCDate() === hr;
}

const teks = (v, n = 300) => String(v ?? "").trim().slice(0, n);

// Bilangan bulat >= 0. Kosong dianggap 0; selain itu harus angka bulat sah.
function angkaBulat(v, nama, GalatKwitansi) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new GalatKwitansi(`${nama} harus berupa angka.`);
  if (n < 0) throw new GalatKwitansi(`${nama} tidak boleh kurang dari 0.`);
  if (!Number.isInteger(n)) throw new GalatKwitansi(`${nama} harus bilangan bulat.`);
  if (n > BATAS_ANGKA) throw new GalatKwitansi(`${nama} terlalu besar.`);
  return n;
}

// Tanggal opsional: kosong → bawaan, terisi tapi salah → ditolak.
function tanggalAtau(v, bawaan, nama, GalatKwitansi) {
  if (v === "" || v === null || v === undefined) return bawaan;
  if (!tanggalSah(v)) {
    throw new GalatKwitansi(`${nama} tidak valid (format YYYY-MM-DD, tanggal harus ada di kalender).`);
  }
  return String(v).trim();
}

function periksaLampiran(mentah, GalatKwitansi) {
  if (mentah === undefined || mentah === null) return [];
  if (!Array.isArray(mentah)) throw new GalatKwitansi("Format lampiran tidak dikenali.");
  if (mentah.length > MAKS_LAMPIRAN) {
    throw new GalatKwitansi(`Lampiran gambar paling banyak ${MAKS_LAMPIRAN} berkas.`);
  }
  return mentah.map((l, i) => {
    const nama = teks(l?.nama, 150) || `Lampiran ${i + 1}`;
    const m = /^data:image\/(?:jpe?g|png);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(l?.dataUrl || ""));
    if (!m) throw new GalatKwitansi(`Lampiran "${nama}" harus gambar JPG atau PNG.`);
    const ukuran = Buffer.byteLength(m[1].replace(/\s+/g, ""), "base64");
    if (ukuran > MAKS_BYTE_LAMPIRAN) {
      throw new GalatKwitansi(`Lampiran "${nama}" terlalu besar (maksimal 1 MB per gambar).`);
    }
    return { nama, dataUrl: l.dataUrl };
  });
}

function pecahAkunSpby(kodeLengkap, kegiatanInput, kodeInput) {
  const bagian = String(kodeLengkap || "").split(".");
  const kodeBawaan = bagian[bagian.length - 1] || "522119";
  const kegiatanBawaan = bagian.length >= 6 ? bagian.slice(3, 6).join(".") : "2158.EBA.994";
  return {
    kegiatanMak: teks(kegiatanInput, 100) || kegiatanBawaan,
    kodeAkun: teks(kodeInput, 50) || kodeBawaan,
  };
}

function hitungLangganan(mentah, GalatKwitansi, pejabat) {
  const isian = mentah && typeof mentah === "object" ? mentah : {};
  const namaAplikasi = teks(isian.nama_aplikasi, 200);
  if (!namaAplikasi) throw new GalatKwitansi("Nama aplikasi atau layanan daring wajib diisi.");

  const penyedia = teks(isian.penyedia, 200);
  const paket = teks(isian.paket, 150);
  const periode = PERIODE.includes(isian.periode) ? isian.periode : "Bulanan";
  const keperluan = teks(isian.keperluan, 500);
  const uraianSpby = teks(isian.uraian_spby, 600);

  const tanggalBayar = tanggalAtau(isian.tanggal_bayar, tanggalHariIni(), "Tanggal bayar", GalatKwitansi);
  const tanggalMulai = tanggalAtau(isian.tanggal_mulai, tanggalBayar, "Tanggal pembelian", GalatKwitansi);
  const tanggalSelesai = tanggalAtau(isian.tanggal_selesai, tanggalMulai, "Tanggal batas akhir", GalatKwitansi);
  if (tanggalSelesai < tanggalMulai) {
    throw new GalatKwitansi("Tanggal batas akhir tidak boleh sebelum tanggal pembelian.");
  }

  const kodeAkunLengkap = teks(isian.akun, 120) || AKUN_LANGGANAN[0].kode;
  const akunDitemukan = AKUN_LANGGANAN.find((a) => a.kode === kodeAkunLengkap);
  const akun = akunDitemukan || { kode: kodeAkunLengkap, uraian: "Belanja Langganan Aplikasi" };
  const { kegiatanMak, kodeAkun } = pecahAkunSpby(akun.kode, isian.kegiatan_mak, isian.kode_akun);

  const penerimaNama = teks(isian.penerima_nama, 200);
  if (!penerimaNama) throw new GalatKwitansi("Nama pegawai penerima uang (penanda tangan kwitansi) wajib diisi.");
  const penerimaNip = teks(isian.penerima_nip, 50).replace(/\s+/g, "");
  const penerimaJabatan = teks(isian.penerima_jabatan, 200);

  const daftarRincian = Array.isArray(isian.rincian) && isian.rincian.length ? isian.rincian : [{}];
  if (daftarRincian.length > MAKS_RINCIAN) {
    throw new GalatKwitansi(`Rincian biaya paling banyak ${MAKS_RINCIAN} baris.`);
  }
  const rincian = daftarRincian.map((mentahItem, idx) => {
    const item = mentahItem && typeof mentahItem === "object" ? mentahItem : {};
    const ke = `baris ${idx + 1}`;
    const uraianDefault =
      idx === 0
        ? `Langganan ${namaAplikasi}${paket ? ` (${paket})` : ""}`
        : `Item langganan ${idx + 1}`;
    const uraian = teks(item.uraian, 250) || uraianDefault;
    const volume = Math.max(1, angkaBulat(item.volume, `Volume rincian ${ke}`, GalatKwitansi));
    const satuan = teks(item.satuan, 40) || "Lisensi";
    const hargaSatuan = angkaBulat(item.harga_satuan, `Harga satuan rincian ${ke}`, GalatKwitansi);
    const pajak = angkaBulat(item.pajak, `Pajak rincian ${ke}`, GalatKwitansi);
    const keterangan = teks(item.keterangan, 100);
    const jumlah = volume * hargaSatuan + pajak;
    return { uraian, volume, satuan, hargaSatuan, pajak, keterangan, jumlah };
  });

  const total = rincian.reduce((a, r) => a + r.jumlah, 0);
  if (total <= 0) {
    throw new GalatKwitansi("Isi harga satuan pada rincian biaya (total harus lebih dari Rp 0).");
  }
  if (total > BATAS_ANGKA) throw new GalatKwitansi("Total rincian biaya terlalu besar.");

  const jumlahLisensi = rincian.reduce((a, r) => a + r.volume, 0);
  const lampiran = periksaLampiran(isian.lampiran, GalatKwitansi);

  return {
    namaAplikasi,
    penyedia,
    paket,
    periode,
    keperluan,
    uraianSpby,
    tanggalBayar,
    tanggalMulai,
    tanggalSelesai,
    tahunAnggaran: tanggalBayar.slice(0, 4),
    nomorSpby: teks(isian.nomor_spby, 100),
    noBku: teks(isian.no_bku, 100),
    cetakTanggalLengkap: Boolean(isian.cetak_tanggal_lengkap),
    atasDasarKuitansi: teks(isian.atas_dasar_kuitansi, 200),
    atasDasarNota: teks(isian.atas_dasar_nota, 200),
    akun,
    kegiatanMak,
    kodeAkun,
    penerima: {
      nama: penerimaNama,
      nip: penerimaNip,
      jabatan: penerimaJabatan,
    },
    rincian,
    jumlahLisensi,
    jumlahLampiran: lampiran.length,
    lampiran,
    total,
    pejabat: {
      ppk: { nama: pejabat?.ppk?.nama || "", nip: pejabat?.ppk?.nip || "" },
      bendahara: { nama: pejabat?.bendahara?.nama || "", nip: pejabat?.bendahara?.nip || "" },
    },
  };
}

function pasang(app, alat) {
  const { auth, GalatKwitansi, balasGalat, pejabat } = alat;

  db.pastikanSkema();

  const kirimPdf = (res, hitungan) => {
    const nama = `SPBY_Langganan_${hitungan.namaAplikasi}_${hitungan.tanggalBayar}.pdf`.replace(
      /[^\w.-]+/g,
      "_",
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nama}"`);
    res.setHeader("Cache-Control", "no-store");
    try {
      tulisLanggananPdf(hitungan, res, alat);
    } catch (err) {
      console.error("[LANGGANAN] Gagal membuat PDF:", err?.message || err);
      if (!res.headersSent) {
        res.removeHeader("Content-Type");
        res.removeHeader("Content-Disposition");
        balasGalat(res, err, "Gagal membuat PDF langganan aplikasi");
      } else {
        res.end();
      }
    }
  };

  // Baris milik bidang operator, atau balasan 404/403 sudah dikirim.
  const ambilMilik = async (req, res) => {
    const baris = /^\d+$/.test(req.params.id) ? await db.satu(req.params.id) : null;
    if (!baris) {
      res.status(404).json({ error: "Data langganan aplikasi tidak ditemukan" });
      return null;
    }
    if (!auth.bolehBidang(req.operator, baris.bidang)) {
      res.status(403).json({ error: "Data langganan aplikasi ini milik bidang lain" });
      return null;
    }
    return baris;
  };

  // Isian dari body: { isian } (bentuk baku) atau isian langsung.
  const isianDari = (body) => (body && typeof body.isian === "object" ? body.isian : body) || {};

  // Status sambungan API fitur
  app.get("/api/kwitansi/langganan-aplikasi/status", auth.wajibLogin, (req, res) => {
    res.json({
      fitur: "langganan-aplikasi",
      siap: db.sudahSiap(),
      operator: req.operator.nama,
    });
  });

  // Data referensi form langganan aplikasi (pejabat diambil dari api/kwitansi/referensi)
  app.get("/api/kwitansi/langganan-aplikasi/referensi", auth.wajibLogin, (req, res) => {
    res.json({
      akun: AKUN_LANGGANAN,
      aplikasiPopuler: APLIKASI_POPULER,
      periode: PERIODE,
      satuan: SATUAN,
      bidang: auth.BIDANG,
      maksLampiran: MAKS_LAMPIRAN,
      maksByteLampiran: MAKS_BYTE_LAMPIRAN,
    });
  });

  // Pratinjau perhitungan rincian biaya (tanpa lampiran & pejabat)
  app.post("/api/kwitansi/langganan-aplikasi/hitung", auth.wajibLogin, (req, res) => {
    try {
      const isian = { ...isianDari(req.body), lampiran: undefined };
      const { lampiran: _l, pejabat: _p, ...hasil } = hitungLangganan(isian, GalatKwitansi, pejabat);
      res.json(hasil);
    } catch (err) {
      balasGalat(res, err, "Gagal menghitung rincian langganan aplikasi");
    }
  });

  // Pratinjau PDF dari isian form (belum disimpan). Didaftarkan sebelum
  // rute /:id supaya "pdf" tidak dianggap id.
  app.post("/api/kwitansi/langganan-aplikasi/pdf", auth.wajibLogin, auth.wajibPengubah, (req, res) => {
    let hitungan;
    try {
      hitungan = hitungLangganan(isianDari(req.body), GalatKwitansi, pejabat);
    } catch (err) {
      return balasGalat(res, err, "Gagal membuat pratinjau PDF langganan aplikasi");
    }
    kirimPdf(res, hitungan);
  });

  // Daftar langganan aplikasi per bidang (admin/bendahara melihat semua bidang)
  app.get("/api/kwitansi/langganan-aplikasi", auth.wajibLogin, async (req, res) => {
    try {
      const op = req.operator;
      const bidang = auth.lihatSemua(op) ? req.query.bidang || null : op.bidang;
      const tahun = /^\d{4}$/.test(String(req.query.tahun || "")) ? req.query.tahun : null;
      res.json(await db.daftar({ bidang, tahun }));
    } catch (err) {
      balasGalat(res, err, "Gagal memuat daftar langganan aplikasi");
    }
  });

  // Simpan pengajuan langganan aplikasi baru
  app.post(
    "/api/kwitansi/langganan-aplikasi",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const op = req.operator;
        const isian = req.body?.isian || {};
        const bidang = op.peran === "admin" ? String(req.body?.bidang || "") : op.bidang;
        if (!auth.BIDANG.includes(bidang)) throw new GalatKwitansi("Pilih bidang terlebih dahulu.");
        const hitungan = hitungLangganan(isian, GalatKwitansi, pejabat);
        res.status(201).json(await db.buat({ bidang, isian, hitungan, oleh: op.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal menyimpan langganan aplikasi");
      }
    },
  );

  // Detail satu langganan aplikasi
  app.get("/api/kwitansi/langganan-aplikasi/:id", auth.wajibLogin, async (req, res) => {
    try {
      const baris = await ambilMilik(req, res);
      if (baris) res.json(baris);
    } catch (err) {
      balasGalat(res, err, "Gagal memuat detail langganan aplikasi");
    }
  });

  // Ubah langganan aplikasi tersimpan
  app.put(
    "/api/kwitansi/langganan-aplikasi/:id",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        if (baris.status === "dibatalkan") {
          throw new GalatKwitansi("Langganan aplikasi yang dibatalkan tidak bisa diubah. Pulihkan dulu.");
        }
        const isian = req.body?.isian || {};
        const hitungan = hitungLangganan(isian, GalatKwitansi, pejabat);
        res.json(await db.ubah(baris.id, { isian, hitungan, oleh: req.operator.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal mengubah langganan aplikasi");
      }
    },
  );

  // Batalkan langganan aplikasi
  app.post(
    "/api/kwitansi/langganan-aplikasi/:id/batal",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        if (baris.status === "dibatalkan") {
          throw new GalatKwitansi("Langganan aplikasi ini sudah dibatalkan.");
        }
        const alasan = teks(req.body?.alasan, 500);
        if (!alasan) throw new GalatKwitansi("Alasan pembatalan wajib diisi.");
        const tanggal = tanggalAtau(req.body?.tanggal, tanggalHariIni(), "Tanggal pembatalan", GalatKwitansi);
        res.json(await db.batalkan(baris.id, { alasan, tanggal, oleh: req.operator.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal membatalkan langganan aplikasi");
      }
    },
  );

  // Pulihkan langganan aplikasi yang dibatalkan
  app.post(
    "/api/kwitansi/langganan-aplikasi/:id/pulihkan",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        if (baris.status !== "dibatalkan") {
          throw new GalatKwitansi("Langganan aplikasi ini tidak dalam status dibatalkan.");
        }
        res.json(await db.pulihkan(baris.id, { oleh: req.operator.nama }));
      } catch (err) {
        balasGalat(res, err, "Gagal memulihkan langganan aplikasi");
      }
    },
  );

  // Hapus langganan aplikasi
  app.delete(
    "/api/kwitansi/langganan-aplikasi/:id",
    auth.wajibLogin,
    auth.wajibPengubah,
    async (req, res) => {
      try {
        const baris = await ambilMilik(req, res);
        if (!baris) return;
        if (!(await db.hapus(baris.id))) {
          return res.status(404).json({ error: "Data langganan aplikasi tidak ditemukan" });
        }
        console.log(`[LANGGANAN] #${baris.id} (${baris.bidang}) dihapus oleh ${req.operator.nama}`);
        res.status(204).end();
      } catch (err) {
        balasGalat(res, err, "Gagal menghapus langganan aplikasi");
      }
    },
  );

  // Cetak PDF langganan aplikasi tersimpan (bendahara juga boleh membuka)
  app.get("/api/kwitansi/langganan-aplikasi/:id/pdf", auth.wajibLogin, async (req, res) => {
    let hitungan;
    try {
      const baris = await ambilMilik(req, res);
      if (!baris) return;
      hitungan = hitungLangganan(baris.isian, GalatKwitansi, pejabat);
    } catch (err) {
      if (res.headersSent) return res.end();
      return balasGalat(res, err, "Gagal menyusun PDF langganan aplikasi");
    }
    kirimPdf(res, hitungan);
  });
}

module.exports = { pasang };
