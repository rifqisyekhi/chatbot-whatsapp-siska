// =========================================================
// PDF KWITANSI & SPBY KONSUMSI — FORMAT RESMI KEMNAKER (PERDIN)
// =========================================================
//
// Format tampilan mengikuti persis dokumen Kwitansi & SPBY Perjalanan Dinas (PERDIN):
//   1. Halaman 1: KWITANSI (format resmi 1:1 sesuai gambar acuan templat NOMI)
//   2. Halaman 2: SURAT PERINTAH BAYAR (SPBY — format bingkai kotak baku Setjen Kemnaker)
//
// Semua isian dinamis diambil dari isian form khusus konsumsi.

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const FONT_DIR = path.join(__dirname, "..", "..", "..", "assets", "fonts");

const JUDUL_KWITANSI = "Times-TebalMiring";
const ISI = "Tahoma";

function pasangFontSemua(doc) {
  const daftar = [
    ["Tahoma", "tahoma.ttf", "Helvetica"],
    ["Tahoma-Tebal", "tahomabd.ttf", "Helvetica-Bold"],
    ["Narrow", "arialn.ttf", "Helvetica"],
    ["Narrow-Tebal", "arialnb.ttf", "Helvetica-Bold"],
    [JUDUL_KWITANSI, "timesbi.ttf", "Times-BoldItalic"],
    ["Arial", "arial.ttf", "Helvetica"],
    ["Arial-Tebal", "arialbd.ttf", "Helvetica-Bold"],
    ["Isi", "arial.ttf", "Helvetica"],
    ["Isi-Tebal", "arialbd.ttf", "Helvetica-Bold"],
  ];
  for (const [nama, berkas, cadangan] of daftar) {
    const lokasi = path.join(FONT_DIR, berkas);
    doc.registerFont(nama, fs.existsSync(lokasi) ? lokasi : cadangan);
  }
}

const angka = (n) => Math.floor(Number(n) || 0).toLocaleString("id-ID");

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function tanggalPanjang(iso) {
  if (!iso) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const bln = BULAN[parseInt(m[2], 10) - 1] || m[2];
  return `${parseInt(m[3], 10)} ${bln} ${m[1]}`;
}

function tanggalPendek(iso) {
  if (!iso) return "          2026";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const bln = BULAN[parseInt(m[2], 10) - 1] || m[2];
  return `${parseInt(m[3], 10)} ${bln} ${m[1]}`;
}

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

function terbilangRupiah(angka) {
  const n = Math.floor(Number(angka) || 0);
  if (n <= 0) return "Nol rupiah";

  const teks = `${terbilangDasar(n)} rupiah`.replace(/\s+/g, " ").trim();
  return teks.charAt(0).toUpperCase() + teks.slice(1);
}

// Bingkai sekeliling halaman
// Nama penanda tangan selalu satu baris: huruf dikecilkan bila terlalu
// panjang (mis. gelar lengkap PPK) supaya tidak menabrak baris NIP.
function namaSebaris(doc, teks, x, y, w, ukuran = 9.5) {
  let u = ukuran;
  doc.fontSize(u);
  while (u > 6.5 && doc.widthOfString(teks) > w - 4) {
    u -= 0.5;
    doc.fontSize(u);
  }
  doc.text(teks, x, y, { width: w, align: "center", lineBreak: false });
  doc.fontSize(ukuran);
}

function bingkai(doc) {
  doc.lineWidth(0.8).rect(24, 24, doc.page.width - 48, doc.page.height - 48).stroke();
}

function garisGanda(doc, x, y, w) {
  doc.lineWidth(1.2).moveTo(x, y).lineTo(x + w, y).stroke();
  doc.lineWidth(0.5).moveTo(x, y + 2.5).lineTo(x + w, y + 2.5).stroke();
}

function lebarIsi(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

// Uraian pembayaran khusus kegiatan konsumsi (mengikuti gaya formulasi PERDIN)
// Kalimat baku contoh SPBY Konsumsi Tata Usaha: "Biaya pembelian konsumsi
// rapat (nasi box) dalam rangka ... pada tanggal 22 September 2026, sesuai
// bukti/faktur terlampir". Makanan = nasi box, Kudapan = snack box.
function susunUraianPembayaran(namaKegiatan, tglKegiatan, items = []) {
  const ada = (j) => items.some((it) => it.jenis === j);
  const kotak = [ada("Makanan") || !items.length ? "nasi box" : "", ada("Kudapan") ? "snack box" : ""].filter(Boolean).join(" dan ");
  const rangka = String(namaKegiatan || "").replace(/^dalam rangka\s*/i, "");
  return `Biaya pembelian konsumsi rapat (${kotak}) dalam rangka ${rangka} pada tanggal ${tanggalPanjang(tglKegiatan)}, sesuai bukti/faktur terlampir`;
}

// Helper ekstraksi MAK dan Kode Akun dari format DIPA
function uraikanAkunDipa(akunRaw) {
  const str = String(akunRaw || "026.01.WA.2158.EBA.994.002.A.521119").split(" — ")[0].trim();
  const kodeMatch = str.match(/52\d{4}/);
  const kodeAkun = kodeMatch ? kodeMatch[0] : str.split(".").pop() || "521119";

  // Ambil pola Kegiatan.Output.MAK (misal: 2158.EBA.994 atau 2158.EBA.994.002.A)
  // Kegiatan.Output.Komponen saja, mis. "2158.EBA.994" (seperti contoh SPBY Tata Usaha).
  const makMatch = str.match(/\d{4}\.[A-Z]{3}\.\d{3}/);
  const makKegiatan = makMatch ? makMatch[0] : "2158.EBA.994";

  return { makKegiatan, kodeAkun, strUtuh: str };
}

// =========================================================
// HALAMAN 1: KWITANSI KONSUMSI
// Format 1:1 persis gambar acuan lembar Kwitansi (media_1795495110191_e41d653f.png)
// =========================================================
function halamanKwitansiKonsumsi(doc, data, pejabat) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 45, right: 45 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  const isian = data.isian || {};
  const tglKegiatan = data.tanggal_kegiatan || isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10);
  const tglSpby = isian.tanggal_spby || tglKegiatan;
  const thn = tglKegiatan.slice(0, 4) || "2026";
  const totalBiaya = Number(data.total || isian.total) || 0;
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || isian.nama_kegiatan || "Rapat Internal";

  // Penandatangan dari .env (alat.pejabat), bukan dari isian klien.
  const ppk = { nama: pejabat?.ppk?.nama || "", nip: pejabat?.ppk?.nip || "" };
  const bendahara = { nama: pejabat?.bendahara?.nama || "", nip: pejabat?.bendahara?.nip || "" };

  const { strUtuh: akunLengkap } = uraikanAkunDipa(isian.akun || data.akun);

  // 1. JUDUL KWITANSI (Times New Roman Bold Italic Underline)
  doc.font(JUDUL_KWITANSI).fontSize(20).text("KWITANSI", x, 32, { width: w, align: "center", underline: true });
  let y = doc.y + 2;
  doc.lineWidth(1.2).moveTo(x, y).lineTo(x + w, y).stroke();
  y += 8;

  // 2. HEADER META: No. BKU, Tahun Anggaran, Akun
  const xTitikMeta = x + 120;
  const xIsiMeta = x + 135;
  const noBkuInput = isian.no_bku ? String(isian.no_bku).trim() : "";
  const noBkuTeks = noBkuInput ? `${noBkuInput} /BKU /${thn}` : `            /BKU          /${thn}`;

  doc.font(ISI).fontSize(10);
  doc.text("No. BKU", x, y, { lineBreak: false });
  doc.text(":", xTitikMeta, y, { lineBreak: false });
  doc.text(noBkuTeks, xIsiMeta, y);
  y = doc.y + 2;

  doc.text("Tahun Anggaran", x, y, { lineBreak: false });
  doc.text(":", xTitikMeta, y, { lineBreak: false });
  doc.text(thn, xIsiMeta, y);
  y = doc.y + 2;

  doc.text("Akun", x, y, { lineBreak: false });
  doc.text(":", xTitikMeta, y, { lineBreak: false });
  doc.text(akunLengkap || "", xIsiMeta, y);
  y = doc.y + 6;

  // Garis ganda pembatas atas
  garisGanda(doc, x, y, w);
  y += 24;

  // 3. ISI TRANSAKSI
  const xTitik = x + 145;
  const xIsi = x + 155;
  const wIsi = w - 155;

  // Sudah Terima Dari
  doc.font(ISI).fontSize(10).text("Sudah Terima Dari", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.text("KPA DIPA Setjen Kemnaker", xIsi, y, { width: wIsi });
  y = doc.y + 8;

  // Rp. [ kotak nominal ]
  doc.font(ISI).fontSize(10).text("Rp.", xIsi, y + 4, { lineBreak: false });
  doc.rect(xIsi + 26, y, 190, 22).stroke("#000000");
  doc.font(ISI).fontSize(10).text(angka(totalBiaya), xIsi + 32, y + 5, { width: 178, align: "left" });
  y += 34;

  // Banyaknya Uang : [ kotak 1 ] & [ kotak 2 ]
  doc.font(ISI).fontSize(10).text("Banyaknya Uang", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  // Kotak baris pertama: teks terbilang rupiah (tidak bold sesuai acuan)
  const tTerbilang = terbilangRupiah(totalBiaya);
  doc.rect(xIsi, y, wIsi, 24).stroke("#000000");
  doc.font(ISI).fontSize(9.5).text(tTerbilang, xIsi + 6, y + 6, { width: wIsi - 12 });
  y += 28;
  // Kotak baris kedua (sesuai persis templat gambar kedua):
  doc.rect(xIsi, y, wIsi, 16).stroke("#000000");
  y += 24;

  // Untuk Pembayaran : [ kotak besar ]
  doc.font(ISI).fontSize(10).text("Untuk Pembayaran", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  const uraianKwitansi = susunUraianPembayaran(namaKegiatan, tglKegiatan, isian.items || []);
  const tKotakBayar = 72;
  doc.rect(xIsi, y, wIsi, tKotakBayar).stroke("#000000");
  doc.font(ISI).fontSize(9.5).text(uraianKwitansi, xIsi + 6, y + 6, { width: wIsi - 12, align: "justify" });
  y += tKotakBayar + 12;

  // Garis ganda pembatas bawah
  garisGanda(doc, x, y, w);
  y += 18;

  // 4. BLOK TANDA TANGAN 3 KOLOM
  const colW = w / 3;
  const xCol1 = x;
  const xCol2 = x + colW;
  const xCol3 = x + colW * 2;

  doc.font(ISI).fontSize(9.5);
  doc.text("Setuju dibayar", xCol1, y, { width: colW, align: "center" });
  doc.text("Lunas dibayar", xCol2, y, { width: colW, align: "center" });
  doc.text(`Jakarta,      ${tanggalPanjang(tglSpby)}`, xCol3, y, { width: colW, align: "center" });

  doc.text("Pejabat Pembuat Komitmen", xCol1, y + 13, { width: colW, align: "center" });
  doc.text("Bendahara Pengeluaran", xCol2, y + 13, { width: colW, align: "center" });

  // Teks kolom ketiga di bawah tanggal (jika ada)
  const ttdBawahTanggal = isian.ttd_penerima_bawah_tanggal || data.ttd_penerima_bawah_tanggal || "";
  if (ttdBawahTanggal && String(ttdBawahTanggal).trim()) {
    doc.text(String(ttdBawahTanggal).trim(), xCol3, y + 13, { width: colW, align: "center" });
  }

  doc.text("Biro Keuangan Kemnaker", xCol1, y + 26, { width: colW, align: "center" });
  doc.text("Biro Keuangan Kemnaker", xCol2, y + 26, { width: colW, align: "center" });

  const yLineTtd = y + 92;

  // Nama pejabat di atas garis (jika tersedia)
  doc.font(ISI).fontSize(9.5);
  if (ppk.nama) namaSebaris(doc, ppk.nama, xCol1, yLineTtd - 14, colW);
  if (bendahara.nama) namaSebaris(doc, bendahara.nama, xCol2, yLineTtd - 14, colW);
  // Nama di kolom ketiga di atas garis (kiri di form)
  const ttdPenerimaNama = isian.ttd_penerima_nama || data.ttd_penerima_nama || "";
  if (ttdPenerimaNama && String(ttdPenerimaNama).trim()) {
    namaSebaris(doc, String(ttdPenerimaNama).trim(), xCol3, yLineTtd - 14, colW);
  }

  // Garis horizontal tanda tangan persis seperti gambar acuan
  const padLine = 16;
  doc.lineWidth(1).moveTo(xCol1 + padLine, yLineTtd).lineTo(xCol1 + colW - padLine, yLineTtd).stroke();
  doc.lineWidth(1).moveTo(xCol2 + padLine, yLineTtd).lineTo(xCol2 + colW - padLine, yLineTtd).stroke();
  doc.lineWidth(1).moveTo(xCol3 + padLine, yLineTtd).lineTo(xCol3 + colW - padLine, yLineTtd).stroke();

  // NIP di bawah garis (samping di form)
  const ttdPenerimaNip = isian.ttd_penerima_nip || data.ttd_penerima_nip || "";
  const teksNip3 = ttdPenerimaNip && String(ttdPenerimaNip).trim() ? `NIP. ${String(ttdPenerimaNip).trim()}` : "NIP.";

  doc.text(ppk.nip ? `NIP. ${ppk.nip}` : "NIP.", xCol1, yLineTtd + 4, { width: colW, align: "center" });
  doc.text(bendahara.nip ? `NIP. ${bendahara.nip}` : "NIP.", xCol2, yLineTtd + 4, { width: colW, align: "center" });
  doc.text(teksNip3, xCol3, yLineTtd + 4, { width: colW, align: "center" });
}

// =========================================================
// HALAMAN 2: SURAT PERINTAH BAYAR (SPBY KONSUMSI)
// Mengikuti format resmi SPBY Perjalanan Dinas (media_1795485223066_2983f6b2.jpg)
// =========================================================
function halamanSpbyKonsumsi(doc, data, pejabat) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 32, bottom: 32, left: 32, right: 32 } });

  const isian = data.isian || {};
  const tglKegiatan = data.tanggal_kegiatan || isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10);
  const tglSpby = isian.tanggal_spby || tglKegiatan;
  const totalBiaya = Number(data.total || isian.total) || 0;
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || isian.nama_kegiatan || "Rapat Internal";
  const penyedia = data.penyedia || isian.penyedia || isian.nama_penerima || "Rekanan Katering";

  // Penandatangan dari .env (alat.pejabat), bukan dari isian klien.
  const ppk = { nama: pejabat?.ppk?.nama || "", nip: pejabat?.ppk?.nip || "" };
  const bendahara = { nama: pejabat?.bendahara?.nama || "", nip: pejabat?.bendahara?.nip || "" };

  const { makKegiatan, kodeAkun } = uraikanAkunDipa(isian.akun || data.akun);
  const nomorSpbyVal = isian.nomor_spby || data.nomor_spby || "";

  const xKiri = doc.page.margins.left;
  const lebar = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const xKanan = xKiri + lebar;
  const yAtas = doc.page.margins.top;
  const tinggiSpby = 740;

  const garisDatar = (yPos) => {
    doc.lineWidth(0.8).moveTo(xKiri, yPos).lineTo(xKanan, yPos).stroke();
  };

  // 1. KOP SURAT SPBY
  doc.font("Arial-Tebal").fontSize(11).text("KEMENTERIAN KETENAGAKERJAAN", xKiri, yAtas + 10, { width: lebar, align: "center" });
  doc.text("BIRO KEUANGAN DAN BMN", xKiri, doc.y + 2, { width: lebar, align: "center" });

  doc.font("Arial-Tebal").fontSize(12).text("SURAT PERINTAH BAYAR", xKiri, doc.y + 12, { width: lebar, align: "center", underline: true });
  doc.font("Arial").fontSize(9.5).text(
    `Tanggal :        ${tanggalPendek(tglSpby)}    Nomor : ${nomorSpbyVal || "                    "}`,
    xKiri,
    doc.y + 4,
    { width: lebar, align: "center" },
  );

  let ySekarang = doc.y + 10;
  garisDatar(ySekarang);

  // 2. PERINTAH BAYAR DARI PPK
  ySekarang += 8;
  doc.font("Arial").fontSize(9.5).text(
    "Saya yang bertanda tangan di bawah ini selaku Pejabat Pembuat Komitmen memerintahkan Bendahara Pengeluaran agar melakukan pembayaran sejumlah :",
    xKiri + 8,
    ySekarang,
    { width: lebar - 16, align: "justify" },
  );

  ySekarang = doc.y + 8;
  doc.font("Arial-Tebal").fontSize(10.5).text("Rp", xKiri + 8, ySekarang);
  doc.text(angka(totalBiaya), xKiri + 80, ySekarang);

  ySekarang = doc.y + 8;
  garisDatar(ySekarang);

  // 3. TERBILANG DALAM KOTAK BARIS
  ySekarang += 6;
  doc.font("Arial-Tebal").fontSize(10).text(terbilangRupiah(totalBiaya), xKiri + 8, ySekarang, { width: lebar - 16 });

  ySekarang = doc.y + 6;
  garisDatar(ySekarang);

  // 4. KEPADA, UNTUK PEMBAYARAN, ATAS DASAR, PEMBEBANAN
  ySekarang += 10;
  const xTitikDua = xKiri + 160;
  const xKonten = xKiri + 175;
  const lebarKonten = lebar - 185;

  // Kepada
  doc.font("Arial").fontSize(9.5).text("Kepada", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  doc.font("Arial-Tebal").text(penyedia, xKonten, ySekarang, { width: lebarKonten });

  // Untuk Pembayaran
  ySekarang = doc.y + 8;
  doc.font("Arial").text("Untuk pembayaran", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  const uraianSpby = susunUraianPembayaran(namaKegiatan, tglKegiatan, isian.items || []);
  doc.text(uraianSpby, xKonten, ySekarang, { width: lebarKonten, align: "justify" });

  // Atas Dasar
  ySekarang = Math.max(doc.y + 10, ySekarang + 36);
  doc.font("Arial").text("Atas dasar :", xKiri + 8, ySekarang);
  ySekarang += 14;
  doc.text("1. Kuitansi/bukti pembelian", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);

  ySekarang += 14;
  doc.text("2. Nota/bukti penerimaan barang/jasa/", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  ySekarang += 12;
  doc.text("    bukti lainnya", xKiri + 8, ySekarang);

  // Dibebankan pada
  ySekarang = doc.y + 12;
  doc.font("Arial").text("Dibebankan pada :", xKiri + 8, ySekarang);
  ySekarang += 14;
  doc.text("Kegiatan, Output, MAK", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  doc.text(makKegiatan, xKonten, ySekarang, { width: lebarKonten });

  ySekarang += 14;
  doc.text("Kode", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  doc.text(kodeAkun, xKonten, ySekarang, { width: lebarKonten });

  ySekarang = doc.y + 14;
  garisDatar(ySekarang);

  // 5. TANDA TANGAN BENDAHARA & PPK (2 KOLOM)
  ySekarang += 8;
  const lebarKolomTtd = lebar / 2;

  doc.font("Arial").fontSize(9);
  doc.text(`Setuju/lunas dibayar, Tgl        ${tanggalPendek(tglSpby)}`, xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text(`Jakarta,        ${tanggalPendek(tglSpby)}`, xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  ySekarang += 14;
  doc.text("Bendahara Pengeluaran", xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text("Pejabat Pembuat Komitmen", xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  ySekarang += 12;
  doc.text("Sekretariat Jenderal Kemnaker", xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text("Biro Keuangan Setjen Kemnaker", xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  ySekarang += 58;
  doc.font("Arial-Tebal").fontSize(9.5);
  doc.text(bendahara.nama, xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text(ppk.nama, xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  ySekarang += 12;
  doc.font("Arial").fontSize(9);
  doc.text(bendahara.nip ? `NIP. ${bendahara.nip}` : "NIP.", xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text(ppk.nip ? `NIP. ${ppk.nip}` : "NIP.", xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  // Bingkai luar pembungkus seluruh formulir SPBY
  doc.lineWidth(1).rect(xKiri, yAtas, lebar, tinggiSpby).stroke();
}
// =========================================================
// EKSPORTIR UTAMA DOKUMEN PDF KONSUMSI
// =========================================================
//
// `hitungan` dari hitungKonsumsi() (hitung.js) — sumber angka yang sama
// dengan kolom ringkasan di database. Satu restoran = SPBY + kwitansi;
// dua restoran = SPBY + kwitansi untuk masing-masing.
// Semua halaman digambar dulu, baru dialirkan ke respons, supaya galat
// saat menyusun masih bisa dibalas sebagai JSON.
function susunPdfKonsumsi({ data, hitungan, pejabat, streamRes }) {
  const isian = data.isian || {};
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || "Konsumsi";

  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: `Kwitansi & SPBY Konsumsi - ${namaKegiatan}`,
      Author: "SisKA Biro Keuangan dan BMN Kemnaker",
    },
  });
  pasangFontSemua(doc);

  for (const r of hitungan.resto) {
    const penyedia = r.penyedia || `Rekanan Katering ${r.ke}`;
    const dataResto = {
      ...data,
      penyedia,
      nomor_spby: r.nomor_spby,
      total: r.subtotal,
      ttd_penerima_nama: r.ttd_penerima_nama,
      ttd_penerima_nip: r.ttd_penerima_nip,
      ttd_penerima_bawah_tanggal: r.ttd_penerima_bawah_tanggal,
      isian: {
        ...isian,
        penyedia,
        nomor_spby: r.nomor_spby,
        no_bku: r.no_bku,
        total: r.subtotal,
        ttd_penerima_nama: r.ttd_penerima_nama,
        ttd_penerima_nip: r.ttd_penerima_nip,
        ttd_penerima_bawah_tanggal: r.ttd_penerima_bawah_tanggal,
        items: r.items,
      },
    };
    halamanSpbyKonsumsi(doc, dataResto, pejabat);
    halamanKwitansiKonsumsi(doc, dataResto, pejabat);
  }

  doc.pipe(streamRes);
  doc.end();
  return doc;
}

module.exports = { susunPdfKonsumsi };
