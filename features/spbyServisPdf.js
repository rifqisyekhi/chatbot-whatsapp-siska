// =========================================================
// SPBY PEMELIHARAAN / SERVICE KENDARAAN DINAS
// =========================================================
//
// Halaman pertama meniru templat "docs/SPBY NEW.xlsx" (Surat
// Perintah Bayar). Halaman berikutnya adalah lampiran foto: nota
// atau kuitansi bengkel lebih dulu, lalu dokumentasi kendaraan.
//
// FOTO TIDAK MASUK BASIS DATA
//
// Foto hanya hidup sebagai berkas sementara di uploads/servis/
// selama pegawai mengisi alurnya, lalu ditanam ke PDF dan dihapus.
// Yang tersisa hanya PDF di reports/servis-kendaraan/<pegawai>/.
//
// Foto sudah dikompres saat diterima (kompresFoto), bukan saat PDF
// dibuat: berkas sementaranya ikut kecil, dan PDF berisi sepuluh
// foto tetap beberapa MB saja — di bawah batas kirim WhatsApp.

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");

let sharp = null;
try {
  sharp = require("sharp");
} catch (err) {
  // Tanpa sharp, foto JPEG/PNG tetap dipakai apa adanya (tidak
  // dikompres). Format lain ditolak saat diterima, karena pdfkit
  // hanya bisa menanam JPEG dan PNG.
  console.warn("[SERVIS] sharp tidak tersedia, foto tidak dikompres:", err?.message || err);
}

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

// Ukuran sisi terpanjang dan mutu JPEG. 1600 px masih cukup untuk
// membaca angka di nota yang difoto miring; di atas itu ukurannya
// naik tanpa menambah keterbacaan saat dicetak setengah halaman.
const SISI_MAKS = 1600;
const MUTU_JPEG = 70;

// =========================================================
// TERBILANG
// =========================================================

const SATUAN = [
  "", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
];

function terbilangDasar(n) {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${terbilangDasar(n - 10)} belas`;
  if (n < 100) {
    const sisa = n % 10;
    return `${terbilangDasar(Math.floor(n / 10))} puluh${sisa ? " " + terbilangDasar(sisa) : ""}`;
  }
  if (n < 200) return `seratus${n > 100 ? " " + terbilangDasar(n - 100) : ""}`;
  if (n < 1000) {
    const sisa = n % 100;
    return `${terbilangDasar(Math.floor(n / 100))} ratus${sisa ? " " + terbilangDasar(sisa) : ""}`;
  }
  if (n < 2000) return `seribu${n > 1000 ? " " + terbilangDasar(n - 1000) : ""}`;

  const SKALA = [
    [1e12, "triliun"],
    [1e9, "miliar"],
    [1e6, "juta"],
    [1e3, "ribu"],
  ];

  for (const [nilai, nama] of SKALA) {
    if (n >= nilai) {
      const depan = Math.floor(n / nilai);
      const sisa = n % nilai;
      return `${terbilangDasar(depan)} ${nama}${sisa ? " " + terbilangDasar(sisa) : ""}`;
    }
  }

  return "";
}

// 5195000 → "Lima juta seratus sembilan puluh lima ribu rupiah"
function terbilangRupiah(angka) {
  const n = Math.floor(Number(angka) || 0);
  if (n <= 0) return "Nol rupiah";

  const teks = `${terbilangDasar(n)} rupiah`.replace(/\s+/g, " ").trim();
  return teks.charAt(0).toUpperCase() + teks.slice(1);
}

function formatRupiah(angka) {
  return "Rp " + Math.floor(Number(angka) || 0).toLocaleString("id-ID");
}

// =========================================================
// TANGGAL
// =========================================================

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// "2026-11-17" → "17 November 2026"
function tanggalPanjang(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
}

// "2026-11-17" → "17-11-2026", format tanggal yang dipakai templat.
function tanggalPendek(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Tanggal hari ini di WIB, bentuk ISO.
function hariIniWIB(tanggal = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tanggal);
}

// =========================================================
// KOMPRES FOTO
// =========================================================

// Menerima base64 dari WhatsApp, mengembalikan Buffer JPEG yang
// sudah diputar sesuai EXIF dan diperkecil. Melempar galat kalau
// berkasnya bukan gambar yang bisa dibaca.
async function kompresFoto(base64, mimetype = "") {
  const asli = Buffer.from(base64, "base64");

  if (sharp) {
    return sharp(asli, { failOn: "none" })
      .rotate()
      .resize({
        width: SISI_MAKS,
        height: SISI_MAKS,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: MUTU_JPEG, mozjpeg: true })
      .toBuffer();
  }

  if (!/^image\/(jpe?g|png)$/i.test(mimetype)) {
    throw new Error(`Format ${mimetype || "tidak dikenal"} tidak didukung tanpa sharp`);
  }

  imageSize(asli); // melempar kalau rusak
  return asli;
}

// =========================================================
// PENULIS PDF
// =========================================================

function pasangFont(doc) {
  const biasa = path.join(FONT_DIR, "arial.ttf");
  const tebal = path.join(FONT_DIR, "arialbd.ttf");

  if (fs.existsSync(biasa) && fs.existsSync(tebal)) {
    doc.registerFont("Isi", biasa);
    doc.registerFont("Isi-Tebal", tebal);
  } else {
    doc.registerFont("Isi", "Helvetica");
    doc.registerFont("Isi-Tebal", "Helvetica-Bold");
  }
}

// =========================================================
// HALAMAN SPBY — meniru lembar "SPBY FIX" di docs/SPBY NEW.xlsx
// =========================================================
//
// Disusun sebagai grid yang sama dengan Excel-nya: lebar kolom A–I
// dan tinggi baris 1–34 diambil dari lembar itu, lalu diperkecil
// seragam supaya pas selebar A4. Hasilnya sebanding dengan cetakan
// Excel "fit to page": huruf 12 pt di Excel menjadi ±10 pt di sini.

// Lebar kolom A–I dalam piksel Excel (lebar karakter × 7 + 5).
const KOLOM_PX = [224, 77, 49, 210, 48, 66, 35, 19, 112];

// Tinggi baris 1–34 dalam poin Excel.
const TINGGI_BARIS = [
  16, 16, 16, 16, 16, 16, 36, 21.75, 22.5, 16, // 1–10
  16, 16, 16, 84, 16, 15.75, 16, 16, 16, 16, // 11–20
  16, 16, 17, 16, 16, 16, 16, 16, 16, 16, // 21–30
  16, 19.5, 16, 16, // 31–34
];

const KOL = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8 };

function susunGrid(doc) {
  const kiri = doc.page.margins.left;
  const lebar = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalPx = KOLOM_PX.reduce((a, b) => a + b, 0);
  const skala = lebar / totalPx; // poin PDF per piksel Excel

  const xs = [kiri];
  KOLOM_PX.forEach((px) => xs.push(xs[xs.length - 1] + px * skala));

  const ys = [doc.page.margins.top];
  TINGGI_BARIS.forEach((pt) => ys.push(ys[ys.length - 1] + ((pt * 4) / 3) * skala));

  return {
    huruf: 16 * skala, // 12 pt Excel = 16 px
    // Tepi kiri kolom (A=0 … I=8); x(9) = tepi kanan kolom I.
    x: (kolom) => xs[kolom],
    // Tepi atas baris (mulai 1); y(35) = tepi bawah baris 34.
    y: (baris) => ys[baris - 1],
  };
}

function halamanSpby(doc, data) {
  const g = susunGrid(doc);
  const pad = 3;

  // Teks di satu sel atau rentang sel, rata bawah seperti bawaan Excel.
  const sel = (teks, { dari, sampai = dari, baris, tebal = false, align = "left", ukuran, garisBawah = false }) => {
    doc.font(tebal ? "Isi-Tebal" : "Isi").fontSize(ukuran || g.huruf);
    const x0 = g.x(KOL[dari]) + pad;
    const x1 = g.x(KOL[sampai] + 1) - pad;
    const yTeks = g.y(baris + 1) - doc.currentLineHeight() - 2;
    doc.text(String(teks ?? ""), x0, yTeks, { width: x1 - x0, align, lineBreak: false, underline: garisBawah });
    doc.fontSize(g.huruf);
  };

  // Teks panjang yang membungkus (A7:I7 dan C12:I14).
  const paragraf = (teks, { dari, sampai, yMulai }) => {
    doc.font("Isi").fontSize(g.huruf);
    const x0 = g.x(KOL[dari]) + pad;
    const x1 = g.x(KOL[sampai] + 1) - pad;
    doc.text(teks, x0, yMulai, { width: x1 - x0, align: "justify" });
  };

  const titikDua = (baris) => sel(":", { dari: "B", baris, align: "center" });

  // ---- Kop ----
  sel("KEMENTERIAN KETENAGAKERJAAN", { dari: "A", sampai: "I", baris: 1, tebal: true, align: "center" });
  sel("BIRO KEUANGAN DAN BARANG MILIK NEGARA", { dari: "A", sampai: "I", baris: 2, tebal: true, align: "center" });
  sel("SURAT PERINTAH BAYAR", { dari: "A", sampai: "I", baris: 4, tebal: true, align: "center", garisBawah: true });

  // Nomor dibiarkan kosong untuk diisi Bendahara/PPK.
  const nomor = data.nomor ? String(data.nomor) : "                    ";
  sel(`Tanggal :   ${tanggalPendek(data.tanggalSurat)}    Nomor : ${nomor}`, {
    dari: "A",
    sampai: "I",
    baris: 5,
    align: "center",
  });

  // ---- Perintah bayar ----
  paragraf(
    "Saya yang bertanda tangan di bawah ini selaku Pejabat Pembuat Komitmen " +
      "memerintahkan Bendahara Pengeluaran agar melakukan pembayaran sejumlah :",
    { dari: "A", sampai: "I", yMulai: g.y(7) + 4 },
  );

  // Format akuntansi Excel: "Rp" menempel kiri, angka rata kanan sel A.
  sel("Rp", { dari: "A", baris: 8, tebal: true });
  sel(Math.floor(Number(data.biaya) || 0).toLocaleString("id-ID"), { dari: "A", baris: 8, tebal: true, align: "right" });
  sel(terbilangRupiah(data.biaya).toLowerCase(), { dari: "A", sampai: "I", baris: 9, tebal: true });

  // ---- Kepada / untuk pembayaran ----
  sel("Kepada", { dari: "A", baris: 11 });
  titikDua(11);
  sel(data.bengkel, { dari: "C", sampai: "I", baris: 11, tebal: true });

  sel("Untuk pembayaran", { dari: "A", baris: 12 });
  titikDua(12);
  doc.font("Isi").fontSize(g.huruf);
  paragraf(data.uraianPembayaran, {
    dari: "C",
    sampai: "I",
    yMulai: g.y(13) - doc.currentLineHeight() - 2, // sebaris dengan label
  });

  // ---- Atas dasar ----
  sel("Atas dasar :", { dari: "A", baris: 15 });
  const teksKuitansi = "1. Nilai Kuitansi/bukti pembelian";
  sel(teksKuitansi, { dari: "A", sampai: "B", baris: 16 });
  // Teksnya meluber ke kolom B; titik dua digeser kalau tertimpa.
  doc.font("Isi").fontSize(g.huruf);
  const ujungTeks = g.x(KOL.A) + pad + doc.widthOfString(teksKuitansi);
  const tengahB = (g.x(KOL.B) + g.x(KOL.C)) / 2 - doc.widthOfString(":") / 2;
  doc.text(":", Math.max(ujungTeks + 8, tengahB), g.y(17) - doc.currentLineHeight() - 2, { lineBreak: false });

  // ---- Pembebanan ----
  sel("Dibebankan pada :", { dari: "A", baris: 19 });
  sel("Kegiatan, Output, MAK", { dari: "A", baris: 20 });
  titikDua(20);
  sel(data.kegiatan, { dari: "C", sampai: "I", baris: 20 });
  sel("Kode", { dari: "A", baris: 21 });
  titikDua(21);
  sel(data.akun, { dari: "C", sampai: "I", baris: 21 });

  // ---- Tanda tangan ----
  // Tanggal di atas tanda tangan = tanggal service yang diisi pegawai.
  const tglTtd = tanggalPendek(data.tanggalServis || data.tanggalSurat);
  // Templat memakai Arial Narrow di baris ini; huruf sedikit lebih
  // kecil menjaganya setara.
  sel(`Setuju/lunas dibayar, Tgl   ${tglTtd}`, { dari: "A", sampai: "D", baris: 25, ukuran: g.huruf * 0.9 });
  sel(`Jakarta,   ${tglTtd}`, { dari: "E", sampai: "I", baris: 25, align: "center", ukuran: g.huruf * 0.9 });

  sel("Bendahara Pengeluaran", { dari: "A", sampai: "B", baris: 27, align: "center" });
  sel("Sekretariat Jenderal Kemnaker", { dari: "A", sampai: "B", baris: 28, align: "center" });
  sel("Pejabat Pembuat Komitmen", { dari: "E", sampai: "I", baris: 27, align: "center" });
  sel("Biro Keuangan dan BMN", { dari: "E", sampai: "I", baris: 28, align: "center" });

  sel(data.bendahara.nama, { dari: "A", sampai: "B", baris: 32, align: "center" });
  sel(`NIP. ${formatNip(data.bendahara.nip)}`, { dari: "A", sampai: "B", baris: 33, align: "center" });
  sel(data.ppk.nama, { dari: "E", sampai: "I", baris: 32, align: "center" });
  sel(`NIP. ${formatNip(data.ppk.nip)}`, { dari: "E", sampai: "I", baris: 33, align: "center" });

  // ---- Garis ----
  // Bingkai luar baris 1–34, garis bawah baris Rp, kotak terbilang,
  // dan pemisah sebelum blok tanda tangan.
  const xKiri = g.x(0);
  const xKanan = g.x(9);
  const datar = (yy) => doc.moveTo(xKiri, yy).lineTo(xKanan, yy);

  doc.lineWidth(0.7);
  doc.rect(xKiri, g.y(1), xKanan - xKiri, g.y(35) - g.y(1));
  datar(g.y(9)); // bawah baris 8 (Rp)
  datar(g.y(10)); // bawah baris 9 (terbilang)
  datar(g.y(24)); // bawah baris 23
  doc.stroke();
}

// Lampiran berisi foto saja, tanpa judul atau keterangan — semua
// keterangannya sudah ada di halaman SPBY. Dua foto per halaman,
// nota lebih dulu lalu dokumentasi.
function halamanLampiran(doc, data) {
  const kiri = doc.page.margins.left;
  const atas = doc.page.margins.top;
  const lebar = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const tinggi = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

  const perHalaman = 2;
  const jarak = 14;
  const tinggiSlot = (tinggi - jarak * (perHalaman - 1)) / perHalaman;

  data.fotos.forEach((foto, i) => {
    const s = i % perHalaman;
    if (s === 0) doc.addPage();

    const y = atas + s * (tinggiSlot + jarak);

    try {
      doc.image(foto.buffer, kiri, y, {
        fit: [lebar, tinggiSlot],
        align: "center",
        valign: "center",
      });
    } catch (err) {
      doc.font("Isi").fontSize(10).text("(foto tidak dapat ditampilkan)", kiri, y + tinggiSlot / 2, {
        width: lebar,
        align: "center",
      });
    }
  });
}

// NIP dicetak rapat tanpa spasi: "199611272018121001".
function formatNip(nip) {
  return String(nip || "").replace(/\s+/g, "");
}

// data: lihat servisKendaraan.js → susunDataPdf(). Menulis ke
// `tujuan` dan selesai saat berkasnya tertutup.
async function tulisSpbyServis(data, tujuan) {
  const fotos = [];
  for (const f of data.fotoList) {
    fotos.push({ ...f, buffer: await fs.promises.readFile(f.path) });
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 36, right: 36 },
    info: {
      Title: `SPBY Service ${data.kendaraan.plat || data.kendaraan.nama}`,
      Author: "SisKA Biro Keuangan dan BMN",
    },
  });

  pasangFont(doc);

  const selesai = new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(tujuan);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);
  });

  halamanSpby(doc, data);
  halamanLampiran(doc, { ...data, fotos });

  doc.end();
  await selesai;
  return tujuan;
}

module.exports = {
  pasangFont,
  terbilangRupiah,
  formatRupiah,
  tanggalPanjang,
  tanggalPendek,
  hariIniWIB,
  kompresFoto,
  tulisSpbyServis,
};
