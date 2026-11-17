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

// Baris "Label : isi" dengan isi yang boleh membungkus.
function barisLabel(doc, { x, y, lebarLabel, lebar, label, isi, tebal = false }) {
  const xTitikDua = x + lebarLabel;
  const xIsi = xTitikDua + 14;

  doc.font("Isi").text(label, x, y, { width: lebarLabel });
  doc.text(":", xTitikDua, y);
  doc.font(tebal ? "Isi-Tebal" : "Isi").text(isi, xIsi, y, {
    width: lebar - (xIsi - x),
    align: "justify",
  });

  return Math.max(doc.y, y + doc.currentLineHeight());
}

function halamanSpby(doc, data) {
  const kiri = doc.page.margins.left;
  const lebar = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lebarLabel = lebar * 0.3;

  doc.fontSize(12);

  doc.font("Isi-Tebal").text("KEMENTERIAN KETENAGAKERJAAN", kiri, doc.page.margins.top, {
    width: lebar,
    align: "center",
  });
  doc.text("BIRO KEUANGAN DAN BARANG MILIK NEGARA", { width: lebar, align: "center" });

  // Garis kop, seperti tepi bawah sel A1:I2 di templat.
  const yGaris = doc.y + 4;
  doc.moveTo(kiri, yGaris).lineTo(kiri + lebar, yGaris).lineWidth(1).stroke();

  doc.y = yGaris + 16;
  doc.font("Isi-Tebal").text("SURAT PERINTAH BAYAR", kiri, doc.y, {
    width: lebar,
    align: "center",
    underline: true,
  });

  const nomor = data.nomor ? data.nomor : "...............";
  doc.font("Isi").text(
    `Tanggal :   ${tanggalPendek(data.tanggalSurat)}      Nomor ${nomor}`,
    kiri,
    doc.y + 2,
    { width: lebar, align: "center" },
  );

  doc.moveDown(1.5);
  doc.text(
    "Saya yang bertanda tangan di bawah ini selaku Pejabat Pembuat Komitmen " +
      "memerintahkan Bendahara Pengeluaran agar melakukan pembayaran sejumlah :",
    kiri,
    doc.y,
    { width: lebar, align: "justify" },
  );

  // Kotak nilai dan terbilang, seperti sel A8 dan A9 yang berbingkai.
  doc.moveDown(0.5);
  const yKotak = doc.y;
  doc.font("Isi-Tebal").text(formatRupiah(data.biaya), kiri + 6, yKotak + 6, { width: lebar - 12 });
  doc.text(terbilangRupiah(data.biaya), kiri + 6, doc.y + 4, { width: lebar - 12 });
  const tinggiKotak = doc.y - yKotak + 6;
  doc.rect(kiri, yKotak, lebar, tinggiKotak).lineWidth(0.8).stroke();

  let y = yKotak + tinggiKotak + 20;

  y = barisLabel(doc, { x: kiri, y, lebarLabel, lebar, label: "Kepada", isi: data.bengkel, tebal: true });
  y = barisLabel(doc, { x: kiri, y: y + 6, lebarLabel, lebar, label: "Untuk pembayaran", isi: data.uraianPembayaran });

  y += 22;
  doc.font("Isi").text("Atas dasar :", kiri, y);
  y = doc.y;
  doc.text("1. Kuitansi/bukti pembelian", kiri, y);
  doc.text(":", kiri + lebar * 0.62, y);
  doc.text(`terlampir (${data.jumlahNota} lembar)`, kiri + lebar * 0.62 + 14, y);
  y = doc.y;
  doc.text("2. Nota/bukti penerimaan barang/jasa/", kiri, y);
  doc.text(":", kiri + lebar * 0.62, y);
  doc.text(`terlampir (${data.jumlahDokumentasi} foto)`, kiri + lebar * 0.62 + 14, y);
  doc.text("    bukti lainnya", kiri, doc.y);

  y = doc.y + 18;
  doc.text("Dibebankan pada :", kiri, y);
  y = doc.y;
  y = barisLabel(doc, { x: kiri, y, lebarLabel, lebar, label: "Kegiatan, Output, MAK", isi: data.kegiatan });
  y = barisLabel(doc, { x: kiri, y, lebarLabel, lebar, label: "Kode", isi: data.akun });

  // Tanda tangan, dua kolom.
  y += 40;
  const lebarKolom = lebar / 2;
  const xKanan = kiri + lebarKolom;
  const tglSurat = tanggalPendek(data.tanggalSurat);

  doc.text("Setuju/lunas dibayar, Tgl ..................", kiri, y, { width: lebarKolom });
  doc.text(`Jakarta,   ${tglSurat}`, xKanan, y, { width: lebarKolom, align: "center" });

  y = doc.y + 14;
  doc.text("Bendahara Pengeluaran", kiri, y, { width: lebarKolom, align: "center" });
  doc.text("Sekretariat Jenderal Kemnaker", kiri, doc.y, { width: lebarKolom, align: "center" });
  doc.text("Pejabat Pembuat Komitmen", xKanan, y, { width: lebarKolom, align: "center" });
  doc.text("Biro Keuangan Setjen Kemnaker", xKanan, doc.y, { width: lebarKolom, align: "center" });

  y = doc.y + 64;
  doc.text(data.bendahara.nama, kiri, y, { width: lebarKolom, align: "center" });
  doc.text(`NIP. ${formatNip(data.bendahara.nip)}`, kiri, doc.y, { width: lebarKolom, align: "center" });
  doc.text(data.ppk.nama, xKanan, y, { width: lebarKolom, align: "center" });
  doc.text(`NIP. ${formatNip(data.ppk.nip)}`, xKanan, doc.y, { width: lebarKolom, align: "center" });
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
    margins: { top: 57, bottom: 57, left: 64, right: 57 },
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
  terbilangRupiah,
  formatRupiah,
  tanggalPanjang,
  tanggalPendek,
  hariIniWIB,
  kompresFoto,
  tulisSpbyServis,
};
