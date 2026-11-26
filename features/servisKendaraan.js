// =========================================================
// ALUR WA: PEMELIHARAAN / SERVICE KENDARAAN DINAS
// =========================================================
//
// Menu 4 (Layanan Kendaraan) → 4. Lapor Service / Pemeliharaan
//
//   servis-pilih-jenis      1. Mobil / 2. Motor
//   servis-pilih-kendaraan  pilih dari daftar kendaraan jenis itu (0 = ganti jenis)
//   servis-tanggal          tanggal service (DD-MM-YYYY / "hari ini")
//   servis-bengkel          nama bengkel
//   servis-biaya            total biaya sesuai nota
//   servis-foto-nota        foto nota/kuitansi/invoice, minimal 1
//   servis-foto-dokumentasi foto kendaraan di bengkel, minimal 1
//   servis-konfirmasi       ringkasan → kirim ke Penanggung Jawab
//
// Seperti peminjaman kendaraan, laporan diteruskan ke Penanggung
// Jawab kendaraan (Ketua Sub TU, NO_KETUA_SUB_TU) untuk disetujui
// lewat QUOTE REPLY "1"/"2". PDF SPBY baru disusun dan dikirim ke
// pelapor setelah disetujui. Kalau pelapornya Penanggung Jawab itu
// sendiri, PDF langsung dibuat.
//
// Ketik "batal" di langkah mana pun untuk berhenti; foto yang
// sudah terkirim ikut dibuang.
//
// Foto tidak disimpan di basis data. Setiap foto langsung
// dikompres lalu ditaruh sementara di uploads/servis/. Selama
// menunggu persetujuan foto dipindah ke uploads/servis/menunggu/
// (tidak ikut disapu), lalu dihapus begitu PDF jadi atau laporan
// ditolak.

const fs = require("fs");
const path = require("path");
const pdf = require("./spbyServisPdf");
const penyimpanan = require("./penyimpananLaporan");

const FOLDER_FOTO = path.join(__dirname, "..", "uploads", "servis");
const FOLDER_MENUNGGU = path.join(FOLDER_FOTO, "menunggu");

const MAKS_FOTO_PER_JENIS = 8;
const UMUR_SISA_FOTO_MS = 24 * 60 * 60 * 1000;

// Disuntik dari index.js lewat pasang(), supaya modul ini tidak
// membuat client WhatsApp atau koneksi basis data sendiri.
let dep = null;

function pasang(dependensi) {
  dep = dependensi;
}

function konfigurasiSpby() {
  const env = process.env;

  return {
    kegiatan: env.SPBY_SERVIS_KEGIATAN || "2158.EBA.994",
    akun: env.SPBY_SERVIS_AKUN || "523129",
    bendaharaNip: String(env.SPBY_BENDAHARA_NIP || "199611272018121001").trim(),
  };
}

// Bendahara Pengeluaran dicari di master data pegawai lewat NIP di
// .env, supaya pergantian nama atau gelar cukup diubah di Master
// Data. Kalau tidak ketemu, nama dibiarkan bertitik untuk ditulis
// tangan — PDF tetap jadi.
async function cariBendahara(nip) {
  try {
    const p = await dep.cariPegawaiNip(nip);
    if (p && p.nama) return { nama: p.nama, nip: p.nip || nip };
    console.warn(`[SERVIS] Bendahara dengan NIP ${nip} tidak ada di master data pegawai.`);
  } catch (err) {
    console.error("[SERVIS] Gagal mencari bendahara:", err?.message || err);
  }
  return { nama: "..............................", nip };
}

// =========================================================
// UTILITAS
// =========================================================

async function hapusFoto(flow) {
  const semua = [...(flow?.fotoNota || []), ...(flow?.fotoDokumentasi || [])];
  await Promise.all(semua.map((f) => fs.promises.unlink(f.path).catch(() => {})));
}

// Foto dari alur yang ditinggal (pegawai mengetik "menu" di tengah
// jalan, atau bot restart) tidak pernah sampai ke PDF. Disapu
// setiap kali alur baru dimulai.
async function sapuSisaFoto() {
  try {
    const isi = await fs.promises.readdir(FOLDER_FOTO);
    const batas = Date.now() - UMUR_SISA_FOTO_MS;

    for (const nama of isi) {
      const berkas = path.join(FOLDER_FOTO, nama);
      const st = await fs.promises.stat(berkas).catch(() => null);
      if (st && st.isFile() && st.mtimeMs < batas) {
        await fs.promises.unlink(berkas).catch(() => {});
      }
    }
  } catch (err) {
    if (err?.code !== "ENOENT") console.warn("[SERVIS] Gagal menyapu sisa foto:", err?.message || err);
  }
}

// "17-11-2026", "17/11/2026", "17-11-26", "hari ini", "kemarin"
// → "2026-11-17". Null kalau tidak sah.
function bacaTanggal(teks) {
  const t = String(teks || "").trim().toLowerCase();
  const hariIni = pdf.hariIniWIB();

  if (t === "hari ini" || t === "hariini") return hariIni;
  if (t === "kemarin") {
    const d = new Date(`${hariIni}T12:00:00+07:00`);
    d.setDate(d.getDate() - 1);
    return pdf.hariIniWIB(d);
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const m = iso
    ? [null, iso[3], iso[2], iso[1]]
    : /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;

  const hari = Number(m[1]);
  const bulan = Number(m[2]);
  let tahun = Number(m[3]);
  if (tahun < 100) tahun += 2000;

  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  if (d.getUTCFullYear() !== tahun || d.getUTCMonth() !== bulan - 1 || d.getUTCDate() !== hari) {
    return null;
  }

  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
}

// "Rp 1.250.000", "1250000", "1,250,000" → 1250000.
// Desimal sen tidak dipakai di SPBY, jadi semua pemisah dibuang.
function bacaBiaya(teks) {
  const t = String(teks || "").trim().toLowerCase().replace(/^rp\.?\s*/, "");
  if (!/^[\d.,\s]+$/.test(t)) return null;

  const angka = Number(t.replace(/[.,\s]/g, ""));
  return Number.isSafeInteger(angka) && angka > 0 ? angka : null;
}

// Kalimat baku "Untuk pembayaran" di SPBY, mengikuti contoh Tata Usaha:
// "Biaya pemeliharaan kendaraan dinas roda empat (4) dengan Nomor polisi
// B 1509 SQP Biro Keuangan dan BMN, sesuai bukti/faktur terlampir".
function susunUraian(flow) {
  const k = flow.kendaraan;
  const roda = jenisKendaraan(k) === "Motor" ? "roda dua (2)" : "roda empat (4)";

  return (
    `Biaya pemeliharaan kendaraan dinas ${roda} ${k.nama} dengan Nomor Polisi ${k.plat || "-"} ` +
    "Biro Keuangan dan BMN, sesuai bukti/faktur terlampir"
  );
}

function ringkasan(flow) {
  const k = flow.kendaraan;
  return (
    `*Ringkasan Laporan Service*\n\n` +
    `Kendaraan : ${k.nama} (${k.plat || "-"})\n` +
    `Tanggal   : ${pdf.tanggalPanjang(flow.tanggalServis)}\n` +
    `Bengkel   : ${flow.bengkel}\n` +
    `Biaya     : ${pdf.formatRupiah(flow.biaya)}\n` +
    `           (${pdf.terbilangRupiah(flow.biaya)})\n` +
    `Foto nota : ${flow.fotoNota.length}\n` +
    `Foto dokumentasi : ${flow.fotoDokumentasi.length}\n\n` +
    `Ketik:\n1. *Kirim untuk persetujuan*\n2. *Batal*`
  );
}

// =========================================================
// ANTREAN PER CHAT
// =========================================================
//
// Foto yang dikirim sekaligus (album) masuk sebagai beberapa pesan
// yang diproses bersamaan. Tanpa antrean, dua pesan bisa membaca
// jumlah foto yang sama dan saling menimpa balasannya.
const antrean = new Map();

function berurutan(chatId, kerja) {
  const sebelumnya = antrean.get(chatId) || Promise.resolve();
  const berikut = sebelumnya.catch(() => {}).then(kerja);
  antrean.set(chatId, berikut);
  berikut.finally(() => {
    if (antrean.get(chatId) === berikut) antrean.delete(chatId);
  });
  return berikut;
}

// =========================================================
// MULAI
// =========================================================

async function mulai(chatId, pegawai) {
  const { kirim, daftarKendaraan, setFlow } = dep;

  sapuSisaFoto();

  const list = (await daftarKendaraan()).filter((k) => k && k.nama);

  if (list.length === 0) {
    await kirim(chatId, "Data kendaraan dinas belum ada. Silakan hubungi admin TU.\n\nKetik *menu* untuk kembali.");
    return;
  }

  list.sort((a, b) => String(a.nama).localeCompare(String(b.nama)));

  // Jenis dipilih dulu, seperti menu pinjam: daftar 25 kendaraan
  // sekaligus terlalu panjang dibaca di WhatsApp.
  await kirim(
    chatId,
    "*Lapor Service / Pemeliharaan Kendaraan* 🔧\n\n" +
      "Jenis kendaraan apa yang di-service?\n1. Mobil 🚗\n2. Motor 🏍️\n\n" +
      "_Ketik *batal* kapan saja untuk berhenti._",
  );

  setFlow(chatId, {
    step: "servis-pilih-jenis",
    pegawai,
    semuaKendaraan: list.map((k) => ({ id: k._id, nama: k.nama, plat: k.plat, jenis: k.jenis })),
    fotoNota: [],
    fotoDokumentasi: [],
  });
}

function jenisKendaraan(k) {
  return /motor/i.test(k?.jenis || "") ? "Motor" : "Mobil";
}

// =========================================================
// TERIMA FOTO
// =========================================================

function bolehDipakaiSebagaiFoto(message) {
  const mime = message._data?.mimetype || "";
  if (message.type === "image") return true;
  return message.type === "document" && /^image\//i.test(mime);
}

async function terimaFoto({ message, chatId, flow, kunci, kategori }) {
  const { kirim, ambilMedia } = dep;
  const daftar = flow[kunci];

  if (!bolehDipakaiSebagaiFoto(message)) {
    await kirim(
      chatId,
      message.type === "document"
        ? "❌ Berkas itu bukan gambar. Mohon kirim *foto* (bukan PDF/dokumen). Kalau notanya PDF, silakan screenshot lalu kirim sebagai foto."
        : "❌ Mohon kirimkan *foto*, bukan pesan teks/video.",
    );
    return false;
  }

  if (daftar.length >= MAKS_FOTO_PER_JENIS) {
    await kirim(chatId, `Maksimal ${MAKS_FOTO_PER_JENIS} foto ${kategori.toLowerCase()}. Ketik *lanjut* untuk melanjutkan.`);
    return false;
  }

  const media = await ambilMedia(message, chatId);
  if (!media || !media.data) return false; // ambilMedia sudah memberi tahu pegawai

  let buffer;
  try {
    buffer = await pdf.kompresFoto(media.data, media.mimetype);
  } catch (err) {
    console.error("[SERVIS] Foto tidak terbaca:", err?.message || err);
    await kirim(chatId, "❌ Foto itu tidak bisa dibaca. Mohon kirim ulang dalam format JPG/PNG biasa.");
    return false;
  }

  await fs.promises.mkdir(FOLDER_FOTO, { recursive: true });
  const nama = `${kunci}_${String(chatId).replace(/\D/g, "")}_${Date.now()}_${daftar.length + 1}.jpg`;
  const berkas = path.join(FOLDER_FOTO, nama);
  await fs.promises.writeFile(berkas, buffer);

  daftar.push({ path: berkas, kategori });
  return true;
}

// =========================================================
// BUAT PDF
// =========================================================

async function buatDanKirimPdf(chatId, flow, { disetujuiOleh } = {}) {
  const { kirim, kirimDokumen } = dep;
  const cfg = konfigurasiSpby();
  const pegawai = flow.pegawai || {};

  await kirim(chatId, "⏳ Menyusun SPBY dan lampiran foto menjadi PDF...");

  const plat = String(flow.kendaraan.plat || flow.kendaraan.nama).replace(/\s+/g, "");
  const tujuan = await penyimpanan.siapkanTujuan({
    jenis: "servis",
    pemilik: pegawai.nama,
    namaFile: `SPBY_Service_${plat}_${flow.tanggalServis}.pdf`,
  });

  const data = {
    // Tanggal di kop dan di atas tanda tangan = tanggal service.
    tanggalSurat: flow.tanggalServis,
    tanggalServis: flow.tanggalServis,
    nomor: "",
    biaya: flow.biaya,
    bengkel: flow.bengkel,
    uraianPembayaran: susunUraian(flow),
    kendaraan: flow.kendaraan,
    kegiatan: cfg.kegiatan,
    akun: cfg.akun,
    bendahara: await cariBendahara(cfg.bendaharaNip),
    // Pejabat Pembuat Komitmen = pegawai yang melapor.
    ppk: { nama: pegawai.nama || "-", nip: pegawai.nip || "-" },
    jumlahNota: flow.fotoNota.length,
    jumlahDokumentasi: flow.fotoDokumentasi.length,
    fotoList: [...flow.fotoNota, ...flow.fotoDokumentasi],
  };

  try {
    await pdf.tulisSpbyServis(data, tujuan);
  } finally {
    // PDF jadi atau gagal, foto sementara tidak dipakai lagi.
    await hapusFoto(flow);
  }

  // Catat ke rekap dashboard. Kegagalan di sini tidak menahan PDF:
  // pegawai tetap menerima SPBY-nya, dan admin bisa menambah barisnya
  // tangan dari dashboard.
  try {
    await dep.simpanRekap({
      kendaraan_id: flow.kendaraan.id,
      nama_kendaraan: flow.kendaraan.nama,
      plat: flow.kendaraan.plat || "",
      jenis: /motor/i.test(flow.kendaraan.jenis || "") ? "Motor" : "Mobil",
      tanggal_servis: flow.tanggalServis,
      bengkel: flow.bengkel,
      biaya: flow.biaya,
      pelapor_nama: pegawai.nama || "",
      pelapor_nip: pegawai.nip || "",
      pelapor_wa: String(chatId).replace(/\D/g, ""),
      jumlah_foto_nota: flow.fotoNota.length,
      jumlah_foto_dokumentasi: flow.fotoDokumentasi.length,
      berkas_pdf: path.relative(penyimpanan.AKAR_LAPORAN, tujuan).split(path.sep).join("/"),
      sumber: "whatsapp",
    });
  } catch (err) {
    console.error("[SERVIS] PDF jadi, tapi gagal dicatat ke rekap:", err?.message || err);
  }

  try {
    await kirimDokumen(
      chatId,
      tujuan,
      "✅ *SPBY Service Kendaraan* sudah jadi" +
        (disetujuiOleh ? ` (disetujui oleh ${disetujuiOleh})` : "") +
        ".\n\n" +
        "Halaman 1 berisi Surat Perintah Bayar, halaman berikutnya lampiran foto nota dan dokumentasi. " +
        "Nomor SPBY dibiarkan kosong untuk diisi Bendahara/PPK.",
    );
  } catch (err) {
    console.error("[SERVIS] Gagal mengirim PDF:", err?.message || err);
    await kirim(
      chatId,
      "⚠️ PDF SPBY *sudah dibuat dan tersimpan*, tapi WhatsApp gagal mengirim berkasnya. Silakan hubungi admin TU untuk mengambilnya.",
    );
  }
}

async function buatPdfAman(chatId, flow, opsi) {
  try {
    await buatDanKirimPdf(chatId, flow, opsi);
  } catch (err) {
    console.error("[SERVIS] Gagal membuat PDF SPBY:", err?.stack || err);
    await dep.kirim(chatId, `❌ Gagal membuat PDF SPBY. Silakan hubungi admin TU.\nInfo: ${err?.message || err}`);
  }
}

// =========================================================
// PERSETUJUAN PENANGGUNG JAWAB
// =========================================================

// Foto dipindah keluar dari jangkauan sapuSisaFoto(): persetujuan
// bisa datang berhari-hari kemudian.
async function pindahkanKeMenunggu(daftar) {
  await fs.promises.mkdir(FOLDER_MENUNGGU, { recursive: true });
  const hasil = [];
  for (const f of daftar) {
    const tujuan = path.join(FOLDER_MENUNGGU, path.basename(f.path));
    await fs.promises.rename(f.path, tujuan);
    hasil.push({ ...f, path: tujuan });
  }
  return hasil;
}

function teksPengajuan(flow) {
  const k = flow.kendaraan;
  return (
    `*Pengajuan SPBY Service Kendaraan* dari ${flow.pegawai?.nama || "-"}\n\n` +
    `Kendaraan : ${k.nama} (${k.plat || "-"})\n` +
    `Tanggal   : ${pdf.tanggalPanjang(flow.tanggalServis)}\n` +
    `Bengkel   : ${flow.bengkel}\n` +
    `Biaya     : ${pdf.formatRupiah(flow.biaya)}\n` +
    `Foto      : ${flow.fotoNota.length} nota, ${flow.fotoDokumentasi.length} dokumentasi\n\n` +
    `*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju\n2. Tidak Setuju`
  );
}

async function ajukanPersetujuan(chatId, flow, pj) {
  const { kirim } = dep;
  let data = null;

  try {
    const fotoNota = await pindahkanKeMenunggu(flow.fotoNota);
    const fotoDokumentasi = await pindahkanKeMenunggu(flow.fotoDokumentasi);
    data = { ...flow, fotoNota, fotoDokumentasi };

    // Foto nota dikirim lebih dulu supaya Penanggung Jawab bisa
    // memeriksa nominalnya; pesan yang dibalas tetap teks terakhir.
    for (const [i, f] of fotoNota.entries()) {
      await dep.kirimGambar(
        pj.waId,
        f.path,
        `Nota service ${flow.kendaraan.plat || flow.kendaraan.nama} (${i + 1}/${fotoNota.length})`,
      );
    }

    const teks = teksPengajuan(data);
    const terkirim = await dep.kirimMentah(pj.waId, teks);

    await dep.daftarkanAntrian(terkirim, {
      sender: chatId,
      jenis: "Servis",
      pegawai: flow.pegawai,
      atasan: { nama: pj.nama, nip: pj.nip, no_wa: pj.no_wa },
      teksPesan: teks,
      servis: {
        kendaraan: data.kendaraan,
        tanggalServis: data.tanggalServis,
        bengkel: data.bengkel,
        biaya: data.biaya,
        fotoNota,
        fotoDokumentasi,
      },
    });
  } catch (err) {
    console.error(`[SERVIS] Gagal meneruskan laporan ke ${pj.waId} (${pj.nama || "?"}):`, err?.message || err);
    await hapusFoto(data || flow);
    await kirim(
      chatId,
      `❌ Gagal meneruskan laporan ke Penanggung Jawab (${pj.nama || "-"}). Silakan ulangi dari *menu*, atau hubungi admin TU.`,
    );
    return;
  }

  await kirim(
    chatId,
    `✅ Laporan service sudah diteruskan ke Penanggung Jawab (${pj.nama || "-"}) untuk persetujuan.\n\n` +
      "PDF SPBY akan dikirim ke sini begitu disetujui.",
  );
}

// Dipanggil index.js saat Penanggung Jawab membalas "1".
async function disetujui(pengajuan) {
  const s = pengajuan.servis || {};
  const flow = { ...s, pegawai: pengajuan.pegawai };
  const semuaFoto = [...(s.fotoNota || []), ...(s.fotoDokumentasi || [])];
  const ada = await Promise.all(
    semuaFoto.map((f) => fs.promises.access(f.path).then(() => true, () => false)),
  );

  if (!s.kendaraan || semuaFoto.length === 0 || ada.includes(false)) {
    console.error("[SERVIS] Pengajuan disetujui tapi data/foto sementaranya hilang:", pengajuan.sender);
    await hapusFoto(flow);
    await dep.kirim(
      pengajuan.sender,
      "Laporan service Anda *disetujui*, tetapi foto lampirannya sudah tidak tersedia di server. " +
        "Mohon kirim ulang laporannya dari *menu* → Layanan Kendaraan → Lapor Service.",
    );
    return false;
  }

  await buatPdfAman(pengajuan.sender, flow, { disetujuiOleh: pengajuan.atasan?.nama });
  return true;
}

// Dipanggil index.js saat Penanggung Jawab membalas "2".
async function ditolak(pengajuan) {
  const s = pengajuan.servis || {};
  await hapusFoto({ fotoNota: s.fotoNota, fotoDokumentasi: s.fotoDokumentasi });
}

// =========================================================
// PENANGAN LANGKAH
// =========================================================

async function tangani({ message, chatId, flow, bodyLower }) {
  return berurutan(chatId, () => tanganiLangkah({ message, chatId, bodyLower }));
}

async function tanganiLangkah({ message, chatId, bodyLower }) {
  const { kirim, getFlow, setFlow, hapusFlow } = dep;

  // Baca ulang di dalam antrean: pesan sebelumnya mungkin sudah
  // memindahkan langkahnya.
  const flow = getFlow(chatId);
  if (!flow || !String(flow.step || "").startsWith("servis-")) return;

  const teks = String(message.body || "").trim();

  if (bodyLower === "batal") {
    await hapusFoto(flow);
    hapusFlow(chatId);
    await kirim(chatId, "Laporan service dibatalkan. Ketik *menu* untuk kembali.");
    return;
  }

  switch (flow.step) {
    case "servis-pilih-jenis": {
      const jenis = { 1: "Mobil", 2: "Motor", mobil: "Mobil", motor: "Motor" }[bodyLower];
      if (!jenis) {
        await kirim(chatId, "Ketik *1* untuk Mobil atau *2* untuk Motor.");
        return;
      }

      const daftar = (flow.semuaKendaraan || []).filter((k) => jenisKendaraan(k) === jenis);
      if (daftar.length === 0) {
        const lain = jenis === "Mobil" ? "*2* untuk Motor" : "*1* untuk Mobil";
        await kirim(chatId, `Belum ada data ${jenis.toLowerCase()} dinas. Ketik ${lain}, atau *batal*.`);
        return;
      }

      let teks = `*Daftar ${jenis} Dinas*\n\nMana yang di-service? Ketik *angka urutannya*:\n`;
      daftar.forEach((k, i) => {
        teks += `\n${i + 1}. ${k.nama} (${k.plat || "-"})`;
      });
      teks += "\n\n_Ketik *0* untuk ganti jenis, atau *batal* untuk berhenti._";

      setFlow(chatId, { ...flow, step: "servis-pilih-kendaraan", daftar });
      await kirim(chatId, teks);
      return;
    }

    case "servis-pilih-kendaraan": {
      if (bodyLower === "0") {
        setFlow(chatId, { ...flow, step: "servis-pilih-jenis", daftar: undefined });
        await kirim(chatId, "Jenis kendaraan apa yang di-service?\n1. Mobil 🚗\n2. Motor 🏍️");
        return;
      }

      const n = Number(bodyLower);
      const k = Number.isInteger(n) ? flow.daftar[n - 1] : null;
      if (!k) {
        await kirim(chatId, `Pilihan tidak valid. Ketik angka 1 - ${flow.daftar.length}, atau *0* untuk ganti jenis.`);
        return;
      }
      setFlow(chatId, {
        ...flow,
        step: "servis-tanggal",
        kendaraan: k,
        daftar: undefined,
        semuaKendaraan: undefined,
      });
      await kirim(
        chatId,
        `Kendaraan: *${k.nama}* (${k.plat || "-"})\n\n` +
          "Kapan *tanggal service*-nya?\nFormat *DD-MM-YYYY*, misal 15-11-2026, atau ketik *hari ini*.",
      );
      return;
    }

    case "servis-tanggal": {
      const iso = bacaTanggal(teks);
      if (!iso) {
        await kirim(chatId, "Format tanggal tidak dikenali. Contoh: *15-11-2026* atau *hari ini*.");
        return;
      }
      if (iso > pdf.hariIniWIB()) {
        await kirim(chatId, "Tanggal service tidak boleh di masa depan. Silakan ketik ulang.");
        return;
      }
      setFlow(chatId, { ...flow, step: "servis-bengkel", tanggalServis: iso });
      await kirim(chatId, "Apa *nama bengkel*-nya? (misal: Fortuna Motor, Auto2000 Cawang)");
      return;
    }

    case "servis-bengkel": {
      if (teks.length < 3) {
        await kirim(chatId, "Nama bengkel terlalu pendek. Silakan ketik ulang.");
        return;
      }
      setFlow(chatId, { ...flow, step: "servis-biaya", bengkel: teks.slice(0, 120) });
      await kirim(chatId, "Berapa *total biaya* sesuai nota? Ketik angkanya saja, misal *1250000* atau *1.250.000*.");
      return;
    }

    case "servis-biaya": {
      const biaya = bacaBiaya(teks);
      if (!biaya) {
        await kirim(chatId, "Nominal tidak dikenali. Ketik angka saja, misal *1250000*.");
        return;
      }
      setFlow(chatId, { ...flow, step: "servis-foto-nota", biaya });
      await kirim(
        chatId,
        `Biaya: *${pdf.formatRupiah(biaya)}*\n_${pdf.terbilangRupiah(biaya)}_\n\n` +
          "📸 Sekarang kirim *foto nota / kuitansi / invoice* bengkel (*wajib*, minimal 1).\n" +
          "Kalau notanya lebih dari satu lembar, kirim semuanya.\n\n" +
          "Setelah semua terkirim, ketik *lanjut*.",
      );
      return;
    }

    case "servis-foto-nota":
    case "servis-foto-dokumentasi": {
      const nota = flow.step === "servis-foto-nota";
      const kunci = nota ? "fotoNota" : "fotoDokumentasi";
      const kategori = nota ? "Nota/Kuitansi" : "Dokumentasi";

      if (message.hasMedia) {
        const ok = await terimaFoto({ message, chatId, flow, kunci, kategori });
        if (ok) {
          setFlow(chatId, flow); // simpan daftar foto yang bertambah
          await kirim(chatId, `✅ Foto ${kategori.toLowerCase()} ke-${flow[kunci].length} diterima. Kirim lagi, atau ketik *lanjut*.`);
        }
        return;
      }

      if (bodyLower === "lanjut" || bodyLower === "selesai") {
        if (flow[kunci].length === 0) {
          await kirim(chatId, `❌ Foto ${kategori.toLowerCase()} *wajib* minimal 1. Silakan kirim fotonya dulu.`);
          return;
        }

        if (nota) {
          setFlow(chatId, { ...flow, step: "servis-foto-dokumentasi" });
          await kirim(
            chatId,
            "📸 Sekarang kirim *foto dokumentasi* (*wajib*, minimal 1). Yang biasanya dilampirkan:\n" +
              "• Kendaraan di bengkel, tampak depan dengan *plat nomor* terlihat\n" +
              "• *Odometer* / angka kilometer\n" +
              "• Proses pengerjaan\n" +
              "• Suku cadang *lama* yang diganti dan yang *baru*\n\n" +
              "Setelah semua terkirim, ketik *lanjut*.",
          );
          return;
        }

        setFlow(chatId, { ...flow, step: "servis-konfirmasi" });
        await kirim(chatId, ringkasan(flow));
        return;
      }

      await kirim(chatId, `Mohon kirim *foto ${kategori.toLowerCase()}*, atau ketik *lanjut* jika sudah semua.`);
      return;
    }

    case "servis-konfirmasi": {
      if (bodyLower === "2") {
        await hapusFoto(flow);
        hapusFlow(chatId);
        await kirim(chatId, "Laporan service dibatalkan. Ketik *menu* untuk kembali.");
        return;
      }
      if (bodyLower !== "1") {
        await kirim(chatId, "Ketik *1* untuk mengirim laporan ke Penanggung Jawab, atau *2* untuk membatalkan.");
        return;
      }

      // Lepas alurnya dulu supaya "1" yang terkirim dua kali tidak
      // mengirim dua pengajuan.
      hapusFlow(chatId);

      const pj = dep.penyetuju();

      // Pelapornya Penanggung Jawab sendiri: tidak ada yang perlu
      // dimintai persetujuan, sama seperti peminjaman kendaraan.
      if (!pj.waId || pj.waId === chatId) {
        if (!pj.waId) {
          console.warn("[SERVIS] NO_KETUA_SUB_TU kosong/tidak sah — SPBY dibuat tanpa persetujuan.");
        }
        await buatPdfAman(chatId, flow);
        return;
      }

      await ajukanPersetujuan(chatId, flow, pj);
      return;
    }

    default:
      hapusFlow(chatId);
      await kirim(chatId, "Sesi laporan service tidak dikenali. Ketik *menu* untuk mulai lagi.");
  }
}

module.exports = {
  pasang,
  mulai,
  tangani,
  disetujui,
  ditolak,
  // untuk pengujian
  bacaTanggal,
  bacaBiaya,
  susunUraian,
};
