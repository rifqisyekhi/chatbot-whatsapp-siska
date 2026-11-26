// =========================================================
// PDF KWITANSI, SPBY & RINCIAN FOTOKOPI & PENJILIDAN (KEMNAKER)
// =========================================================

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const FONT_DIR = path.join(__dirname, "..", "..", "..", "assets", "fonts");

const JUDUL_KWITANSI = "Times-TebalMiring";
const ISI = "Tahoma";
const TEBAL = "Tahoma-Tebal";

function pasangFontSemua(doc) {
  const daftar = [
    ["Tahoma", "tahoma.ttf", "Helvetica"],
    ["Tahoma-Tebal", "tahomabd.ttf", "Helvetica-Bold"],
    ["Narrow", "arialn.ttf", "Helvetica"],
    ["Narrow-Tebal", "arialnb.ttf", "Helvetica-Bold"],
    [JUDUL_KWITANSI, "timesbi.ttf", "Times-BoldItalic"],
    ["Arial", "arial.ttf", "Helvetica"],
    ["Arial-Tebal", "arialbd.ttf", "Helvetica-Bold"],
  ];
  for (const [nama, berkas, cadangan] of daftar) {
    const lokasi = path.join(FONT_DIR, berkas);
    doc.registerFont(nama, fs.existsSync(lokasi) ? lokasi : cadangan);
  }
}

const angka = (n) => Math.floor(Number(n) || 0).toLocaleString("id-ID");
const rupiah = (n) => `Rp ${angka(n)}`;

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
    return `${terbilangDasar(Math.floor(n / 10))} ratus${sisa ? " " + terbilangDasar(sisa) : ""}`;
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

function terbilangRupiah(nom) {
  const n = Math.floor(Number(nom) || 0);
  if (n <= 0) return "Nol rupiah";
  const teks = `${terbilangDasar(n)} rupiah`.replace(/\s+/g, " ").trim();
  return teks.charAt(0).toUpperCase() + teks.slice(1);
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

function susunUraianPembayaran(namaKegiatan, tglKegiatan, tempat) {
  const tglTeks = tanggalPanjang(tglKegiatan);
  const lokasiTeks = tempat ? ` di ${tempat}` : "";
  return `Biaya belanja penggandaan, fotokopi dan penjilidan dokumen dalam rangka ${namaKegiatan}${lokasiTeks} pada tanggal ${tglTeks}, sesuai dengan bukti terlampir`;
}

function uraikanAkunDipa(akunRaw) {
  const str = String(akunRaw || "026.01.WA.2158.EBA.994.002.A.521111").split(" — ")[0].trim();
  const kodeMatch = str.match(/52\d{4}/);
  const kodeAkun = kodeMatch ? kodeMatch[0] : str.split(".").pop() || "521111";

  const makMatch = str.match(/2158\.[A-Za-z0-9.]+/);
  let makKegiatan = makMatch ? makMatch[0].replace(/\.52\d{4}$/, "") : "2158.EBA.994";
  if (!makKegiatan) makKegiatan = "2158.EBA.994";

  return { makKegiatan, kodeAkun, strUtuh: str };
}

// =========================================================
// HALAMAN 1: SURAT PERINTAH BAYAR (SPBY FOTOKOPI)
// =========================================================
function halamanSpbyFotokopi(doc, data) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 32, bottom: 32, left: 32, right: 32 } });

  const isian = data.isian || {};
  const tglKegiatan = data.tanggal_kegiatan || isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10);
  const tglSpby = isian.tanggal_spby || tglKegiatan;
  const totalBiaya = Number(data.total || isian.total) || 0;
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || isian.nama_kegiatan || "Penggandaan Dokumen";
  const tempat = isian.tempat_kegiatan || data.lokasi_detail || "Biro Keuangan dan BMN, Gedung Kemnaker";
  const penyedia = data.penyedia || isian.penyedia || isian.nama_penerima || "Rekanan Fotokopi & Percetakan";

  const ppk = {
    nama: isian.ppk?.nama || isian.ppk_nama || "Drs. Hendra Wijaya, M.M.",
    nip: isian.ppk?.nip || isian.ppk_nip || "",
  };
  const bendahara = {
    nama: isian.bendahara?.nama || isian.bendahara_nama || "Siti Rahmawati, S.E.",
    nip: isian.bendahara?.nip || isian.bendahara_nip || "",
  };

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

  // 3. TERBILANG
  ySekarang += 6;
  doc.font("Arial-Tebal").fontSize(10).text(terbilangRupiah(totalBiaya), xKiri + 8, ySekarang, { width: lebar - 16 });

  ySekarang = doc.y + 6;
  garisDatar(ySekarang);

  // 4. KEPADA, UNTUK PEMBAYARAN, ATAS DASAR, PEMBEBANAN
  ySekarang += 10;
  const xTitikDua = xKiri + 160;
  const xKonten = xKiri + 175;
  const lebarKonten = lebar - 185;

  doc.font("Arial").fontSize(9.5).text("Kepada", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  doc.font("Arial-Tebal").text(penyedia, xKonten, ySekarang, { width: lebarKonten });

  ySekarang = doc.y + 8;
  doc.font("Arial").text("Untuk pembayaran", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  const uraianSpby = susunUraianPembayaran(namaKegiatan, tglKegiatan, tempat);
  doc.text(uraianSpby, xKonten, ySekarang, { width: lebarKonten, align: "justify" });

  ySekarang = Math.max(doc.y + 10, ySekarang + 36);
  doc.font("Arial").text("Atas dasar :", xKiri + 8, ySekarang);
  ySekarang += 14;
  doc.text("1. Kuitansi/bukti pembelian", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  doc.text(penyedia, xKonten, ySekarang, { width: lebarKonten });

  ySekarang += 14;
  doc.text("2. Nota/bukti penerimaan barang/jasa/", xKiri + 8, ySekarang);
  doc.text(":", xTitikDua, ySekarang);
  doc.text("Bukti Faktur / Nota Pembelian Terlampir", xKonten, ySekarang, { width: lebarKonten });
  ySekarang += 12;
  doc.text("    bukti lainnya", xKiri + 8, ySekarang);

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

  // 5. TANDA TANGAN BENDAHARA & PPK
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
  doc.text(bendahara.nama || "Siti Rahmawati, S.E.", xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text(ppk.nama || "Drs. Hendra Wijaya, M.M.", xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  ySekarang += 12;
  doc.font("Arial").fontSize(9);
  doc.text(bendahara.nip ? `NIP. ${bendahara.nip}` : "NIP. 198304152006041002", xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text(ppk.nip ? `NIP. ${ppk.nip}` : "NIP. 197508121998032001", xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  doc.lineWidth(1).rect(xKiri, yAtas, lebar, tinggiSpby).stroke();
}

// =========================================================
// HALAMAN 2: KWITANSI FOTOKOPI
// =========================================================
function halamanKwitansiFotokopi(doc, data) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 45, right: 45 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  const isian = data.isian || {};
  const tglKegiatan = data.tanggal_kegiatan || isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10);
  const tglSpby = isian.tanggal_spby || tglKegiatan;
  const thn = tglKegiatan.slice(0, 4) || "2026";
  const totalBiaya = Number(data.total || isian.total) || 0;
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || isian.nama_kegiatan || "Penggandaan Dokumen";
  const tempat = isian.tempat_kegiatan || data.lokasi_detail || "Biro Keuangan dan BMN, Gedung Kemnaker";
  const penyedia = data.penyedia || isian.penyedia || isian.nama_penerima || "Rekanan Percetakan / Fotokopi";

  const ppk = {
    nama: isian.ppk?.nama || isian.ppk_nama || "Drs. Hendra Wijaya, M.M.",
    nip: isian.ppk?.nip || isian.ppk_nip || "",
  };
  const bendahara = {
    nama: isian.bendahara?.nama || isian.bendahara_nama || "Siti Rahmawati, S.E.",
    nip: isian.bendahara?.nip || isian.bendahara_nip || "",
  };

  const { kodeAkun } = uraikanAkunDipa(isian.akun || data.akun);

  // 1. JUDUL KWITANSI
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
  doc.text(kodeAkun || "", xIsiMeta, y);
  y = doc.y + 6;

  garisGanda(doc, x, y, w);
  y += 24;

  // 3. ISI TRANSAKSI
  const xTitik = x + 145;
  const xIsi = x + 155;
  const wIsi = w - 155;

  doc.font(ISI).fontSize(10).text("Sudah Terima Dari", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.text("KPA DIPA Setjen Kemnaker", xIsi, y, { width: wIsi });
  y = doc.y + 8;

  // Rp. [ kotak nominal ]
  doc.font(ISI).fontSize(10).text("Rp.", xIsi, y + 4, { lineBreak: false });
  doc.rect(xIsi + 26, y, 190, 22).stroke("#000000");
  doc.font(ISI).fontSize(10).text(angka(totalBiaya), xIsi + 32, y + 5, { width: 178, align: "left" });
  y += 34;

  // Banyaknya Uang : [ kotak terbilang ]
  doc.font(ISI).fontSize(10).text("Banyaknya Uang", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  const tTerbilang = terbilangRupiah(totalBiaya);
  doc.rect(xIsi, y, wIsi, 24).stroke("#000000");
  doc.font(ISI).fontSize(9.5).text(tTerbilang, xIsi + 6, y + 6, { width: wIsi - 12 });
  y += 28;
  doc.rect(xIsi, y, wIsi, 16).stroke("#000000");
  y += 24;

  // Untuk Pembayaran : [ kotak besar ]
  doc.font(ISI).fontSize(10).text("Untuk Pembayaran", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  const uraianKwitansi = susunUraianPembayaran(namaKegiatan, tglKegiatan, tempat);
  const tKotakBayar = 72;
  doc.rect(xIsi, y, wIsi, tKotakBayar).stroke("#000000");
  doc.font(ISI).fontSize(9.5).text(uraianKwitansi, xIsi + 6, y + 6, { width: wIsi - 12, align: "justify" });
  y += tKotakBayar + 12;

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

  const ttdBawahTanggal = isian.ttd_penerima_bawah_tanggal || "Penerima / Pembuat Daftar";
  doc.text(ttdBawahTanggal, xCol3, y + 13, { width: colW, align: "center" });

  doc.text("Biro Keuangan Kemnaker", xCol1, y + 26, { width: colW, align: "center" });
  doc.text("Biro Keuangan Kemnaker", xCol2, y + 26, { width: colW, align: "center" });

  const yLineTtd = y + 92;

  doc.font(ISI).fontSize(9.5);
  if (ppk.nama) doc.text(ppk.nama, xCol1, yLineTtd - 14, { width: colW, align: "center" });
  if (bendahara.nama) doc.text(bendahara.nama, xCol2, yLineTtd - 14, { width: colW, align: "center" });

  const ttdPenerimaNama = isian.ttd_penerima_nama || penyedia || "";
  if (ttdPenerimaNama && String(ttdPenerimaNama).trim()) {
    doc.text(String(ttdPenerimaNama).trim(), xCol3, yLineTtd - 14, { width: colW, align: "center" });
  }

  const padLine = 16;
  doc.lineWidth(1).moveTo(xCol1 + padLine, yLineTtd).lineTo(xCol1 + colW - padLine, yLineTtd).stroke();
  doc.lineWidth(1).moveTo(xCol2 + padLine, yLineTtd).lineTo(xCol2 + colW - padLine, yLineTtd).stroke();
  doc.lineWidth(1).moveTo(xCol3 + padLine, yLineTtd).lineTo(xCol3 + colW - padLine, yLineTtd).stroke();

  const ttdPenerimaNip = isian.ttd_penerima_nip || "";
  const teksNip3 = ttdPenerimaNip && String(ttdPenerimaNip).trim() ? `NIP. ${String(ttdPenerimaNip).trim()}` : "NIP.";

  doc.text(ppk.nip ? `NIP. ${ppk.nip}` : "NIP.", xCol1, yLineTtd + 4, { width: colW, align: "center" });
  doc.text(bendahara.nip ? `NIP. ${bendahara.nip}` : "NIP.", xCol2, yLineTtd + 4, { width: colW, align: "center" });
  doc.text(teksNip3, xCol3, yLineTtd + 4, { width: colW, align: "center" });
}

// =========================================================
// HALAMAN 3: RINCIAN BIAYA PENGGANDAAN & PENJILIDAN (LAMPIRAN)
// =========================================================
function halamanRincianFotokopi(doc, data) {
  const isian = data.isian || {};
  const items = Array.isArray(isian.items) ? isian.items : [];
  if (!items.length) return;

  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 40, right: 40 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  const tglKegiatan = data.tanggal_kegiatan || isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10);
  const tglCetak = tanggalPanjang(tglKegiatan);
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || isian.nama_kegiatan || "Penggandaan Dokumen";
  const penyedia = data.penyedia || isian.penyedia || isian.nama_penerima || "Rekanan Percetakan";
  const nomorSpbyVal = isian.nomor_spby || data.nomor_spby || "-";

  const ppk = isian.ppk || {
    nama: isian.ppk_nama || "Drs. Hendra Wijaya, M.M.",
    nip: isian.ppk_nip || "",
  };

  doc.font(TEBAL).fontSize(13).text("RINCIAN BIAYA FOTOKOPI & PENJILIDAN", x, 34, { width: w, align: "center" });
  let y = doc.y + 14;

  const xTitikMeta = x + 160;
  const xIsiMeta = x + 175;
  const wIsiMeta = w - 175;

  const baris = (lbl, val) => {
    doc.font(ISI).fontSize(10);
    doc.text(lbl, x, y, { lineBreak: false });
    doc.text(":", xTitikMeta, y, { lineBreak: false });
    doc.font(TEBAL);
    doc.text(String(val ?? "-"), xIsiMeta, y, { width: wIsiMeta });
    y = Math.max(doc.y, y + doc.currentLineHeight()) + 4;
  };

  baris("Nama Kegiatan", namaKegiatan);
  baris("Nomor SPBY", nomorSpbyVal);
  baris("Penyedia / Rekanan", penyedia);
  baris("Tanggal Pelaksanaan", tglCetak);
  y += 6;

  // Tabel Rincian Pekerjaan
  const colTable = [30, 205, 50, 55, 85, 90];
  const headerLabels = ["No", "Jenis Pekerjaan / Spesifikasi", "Vol", "Satuan", "Harga Satuan (Rp)", "Jumlah Harga (Rp)"];

  doc.font(TEBAL).fontSize(8.5);
  doc.rect(x, y, w, 20).fillAndStroke("#E5E9EE", "#9CA3AF");
  doc.fillColor("#000000");

  let hX = x;
  headerLabels.forEach((lbl, idx) => {
    const align = idx === 0 ? "center" : idx >= 2 ? "right" : "left";
    doc.text(lbl, hX + 4, y + 5, { width: colTable[idx] - 8, align });
    hX += colTable[idx];
  });
  y += 20;

  // Baris Item Pekerjaan
  doc.font(ISI).fontSize(9);
  items.forEach((it, idx) => {
    const vol = Number(it.volume || it.porsi) || 0;
    const hrg = Number(it.hargaSatuan || it.harga_satuan) || 0;
    const sub = Number(it.subtotal || it.jumlah_harga) || vol * hrg;
    const namaMenu = it.uraianMenu || it.namaItem || it.uraian || it.jenis || "-";

    doc.rect(x, y, w, 18).stroke("#D1D5DB");
    let rowX = x;

    doc.text(String(idx + 1), rowX + 4, y + 4, { width: colTable[0] - 8, align: "center" });
    rowX += colTable[0];
    doc.text(namaMenu, rowX + 4, y + 4, { width: colTable[1] - 8, align: "left" });
    rowX += colTable[1];
    doc.text(angka(vol), rowX + 4, y + 4, { width: colTable[2] - 8, align: "right" });
    rowX += colTable[2];
    doc.text(it.satuan || "Lembar", rowX + 4, y + 4, { width: colTable[3] - 8, align: "right" });
    rowX += colTable[3];
    doc.text(rupiah(hrg), rowX + 4, y + 4, { width: colTable[4] - 8, align: "right" });
    rowX += colTable[4];
    doc.text(rupiah(sub), rowX + 4, y + 4, { width: colTable[5] - 8, align: "right" });

    y += 18;
  });

  const totalBiaya = Number(data.total || isian.total) || 0;
  const pph = Number(data.pajak_pph ?? isian.pajak_pph ?? isian.pajak_pph23) || 0;
  const netto = Number(data.netto || isian.netto) || totalBiaya - pph;

  // Total Bruto
  doc.font(TEBAL);
  doc.rect(x, y, w, 18).fillAndStroke("#F3F4F6", "#9CA3AF");
  doc.fillColor("#000000");
  doc.text("TOTAL BIAYA (BRUTO)", x + 10, y + 4, {
    width: colTable[0] + colTable[1] + colTable[2] + colTable[3] - 20,
    align: "right",
  });
  doc.text(rupiah(totalBiaya), x + colTable[0] + colTable[1] + colTable[2] + colTable[3] + colTable[4] + 4, y + 4, {
    width: colTable[5] - 8,
    align: "right",
  });
  y += 18;

  // Potongan Pajak
  doc.rect(x, y, w, 18).fillAndStroke("#FFFFFF", "#D1D5DB");
  doc.fillColor("#000000");
  doc.text("POTONGAN PAJAK (PPh)", x + 10, y + 4, {
    width: colTable[0] + colTable[1] + colTable[2] + colTable[3] - 20,
    align: "right",
  });
  doc.text(rupiah(pph), x + colTable[0] + colTable[1] + colTable[2] + colTable[3] + colTable[4] + 4, y + 4, {
    width: colTable[5] - 8,
    align: "right",
  });
  y += 18;

  // Netto
  doc.rect(x, y, w, 18).fillAndStroke("#E5E9EE", "#9CA3AF");
  doc.fillColor("#000000");
  doc.text("JUMLAH BERSIH (NETTO)", x + 10, y + 4, {
    width: colTable[0] + colTable[1] + colTable[2] + colTable[3] - 20,
    align: "right",
  });
  doc.text(rupiah(netto), x + colTable[0] + colTable[1] + colTable[2] + colTable[3] + colTable[4] + 4, y + 4, {
    width: colTable[5] - 8,
    align: "right",
  });
  y += 28;

  // Tanda tangan Lampiran
  const colW = w / 2;
  doc.font(ISI).fontSize(9.5);
  doc.text("Mengetahui,", x, y, { width: colW, align: "center" });
  doc.text("Pejabat Pembuat Komitmen", x, y + 12, { width: colW, align: "center" });

  doc.text("Penyedia / Rekanan Percetakan,", x + colW, y, { width: colW, align: "center" });
  doc.text(penyedia, x + colW, y + 12, { width: colW, align: "center" });

  const ttdY = y + 54;
  doc.text(ppk.nama || "", x, ttdY, { width: colW, align: "center", underline: true });
  doc.text(ppk.nip ? `NIP. ${ppk.nip}` : "NIP. -", x, ttdY + 14, { width: colW, align: "center" });

  doc.text(penyedia, x + colW, ttdY, { width: colW, align: "center", underline: true });
  doc.text("(Penanggung Jawab / Cap)", x + colW, ttdY + 14, { width: colW, align: "center" });
}

// =========================================================
// EKSPORTIR UTAMA DOKUMEN PDF FOTOKOPI
// =========================================================
function susunPdfFotokopi({ data, streamRes }) {
  const isian = data.isian || {};
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || isian.nama_kegiatan || "Fotokopi";

  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: `Kwitansi & SPBY Fotokopi - ${namaKegiatan}`,
      Author: "SisKA Biro Keuangan dan BMN Kemnaker",
    },
  });

  pasangFontSemua(doc);
  doc.pipe(streamRes);

  // 1. Halaman 1: SURAT PERINTAH BAYAR (SPBY Fotokopi)
  halamanSpbyFotokopi(doc, data);

  // 2. Halaman 2: KWITANSI (Format 1:1 Kemnaker)
  halamanKwitansiFotokopi(doc, data);

  // 3. Halaman 3: RINCIAN BIAYA PENGGANDAAN (Lampiran)
  halamanRincianFotokopi(doc, data);

  doc.end();
  return doc;
}

module.exports = { susunPdfFotokopi };
