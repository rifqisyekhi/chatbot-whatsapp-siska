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

// Terbilang bersama dengan SPBY servis kendaraan (sudah teruji).
const { terbilangRupiah } = require("../../spbyServisPdf");

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

// Kalimat baku contoh Tata Usaha: "Biaya hard cover dan jilid laporan
// keuangan, Biro keuangan dan BMN Setjen Kemnaker, sesuai bukti/faktur
// terlampir". Uraian yang sudah diawali "Biaya" dipakai apa adanya.
function susunUraianPembayaran(namaKegiatan) {
  let teks = String(namaKegiatan || "").trim().replace(/[.,;\s]+$/, "");
  if (!/^biaya\b/i.test(teks)) {
    const isi = /^(dalam rangka|untuk)\b/i.test(teks) ? teks : `untuk ${teks}`;
    teks = `Biaya fotokopi dan penjilidan ${isi}, Biro Keuangan dan BMN Setjen Kemnaker`;
  }
  return /sesuai (dengan )?(bukti|faktur)/i.test(teks) ? teks : `${teks}, sesuai bukti/faktur terlampir`;
}

function uraikanAkunDipa(akunRaw) {
  const str = String(akunRaw || "026.01.WA.2158.EBA.994.002.A.521119").split(" — ")[0].trim();
  const kodeMatch = str.match(/52\d{4}/);
  const kodeAkun = kodeMatch ? kodeMatch[0] : str.split(".").pop() || "521119";

  // Kegiatan.Output.Komponen saja, mis. "2158.EBA.994" (seperti contoh SPBY Tata Usaha).
  const makMatch = str.match(/\d{4}\.[A-Z]{3}\.\d{3}/);
  const makKegiatan = makMatch ? makMatch[0] : "2158.EBA.994";

  return { makKegiatan, kodeAkun, strUtuh: str };
}

// =========================================================
// HALAMAN 1: SURAT PERINTAH BAYAR (SPBY FOTOKOPI)
// =========================================================
function halamanSpbyFotokopi(doc, data, pejabat) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 32, bottom: 32, left: 32, right: 32 } });

  const isian = data.isian || {};
  const tglKegiatan = data.tanggal_kegiatan || isian.tanggal_kegiatan || new Date().toISOString().slice(0, 10);
  const tglSpby = isian.tanggal_spby || tglKegiatan;
  const totalBiaya = Number(data.total || isian.total) || 0;
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || isian.nama_kegiatan || "Penggandaan Dokumen";
  const penyedia = data.penyedia || isian.penyedia || isian.nama_penerima || "Rekanan Fotokopi & Percetakan";

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
  const uraianSpby = susunUraianPembayaran(namaKegiatan);
  doc.text(uraianSpby, xKonten, ySekarang, { width: lebarKonten, align: "justify" });

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
  doc.text(bendahara.nama, xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text(ppk.nama, xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  ySekarang += 12;
  doc.font("Arial").fontSize(9);
  doc.text(bendahara.nip ? `NIP. ${bendahara.nip}` : "NIP.", xKiri + 8, ySekarang, { width: lebarKolomTtd - 16, align: "center" });
  doc.text(ppk.nip ? `NIP. ${ppk.nip}` : "NIP.", xKiri + lebarKolomTtd, ySekarang, { width: lebarKolomTtd - 8, align: "center" });

  doc.lineWidth(1).rect(xKiri, yAtas, lebar, tinggiSpby).stroke();
}

// =========================================================
// HALAMAN 2: KWITANSI FOTOKOPI
// =========================================================
function halamanKwitansiFotokopi(doc, data, pejabat) {
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

  // Penandatangan dari .env (alat.pejabat), bukan dari isian klien.
  const ppk = { nama: pejabat?.ppk?.nama || "", nip: pejabat?.ppk?.nip || "" };
  const bendahara = { nama: pejabat?.bendahara?.nama || "", nip: pejabat?.bendahara?.nip || "" };

  const { strUtuh: akunLengkap } = uraikanAkunDipa(isian.akun || data.akun);

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
  doc.text(akunLengkap || "", xIsiMeta, y);
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
  const uraianKwitansi = susunUraianPembayaran(namaKegiatan);
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


  doc.text("Biro Keuangan Kemnaker", xCol1, y + 26, { width: colW, align: "center" });
  doc.text("Biro Keuangan Kemnaker", xCol2, y + 26, { width: colW, align: "center" });

  const yLineTtd = y + 92;

  doc.font(ISI).fontSize(9.5);
  if (ppk.nama) namaSebaris(doc, ppk.nama, xCol1, yLineTtd - 14, colW);
  if (bendahara.nama) namaSebaris(doc, bendahara.nama, xCol2, yLineTtd - 14, colW);

  // Kolom ke-3: pegawai yang membayarkan (contoh Tata Usaha), bukan rekanan.
  const ttdPenerimaNama = isian.ttd_penerima_nama || "";
  if (ttdPenerimaNama && String(ttdPenerimaNama).trim()) {
    namaSebaris(doc, String(ttdPenerimaNama).trim(), xCol3, yLineTtd - 14, colW);
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
function halamanRincianFotokopi(doc, data, hitungan, pejabat) {
  const isian = data.isian || {};
  const items = hitungan.items;
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

  const ppk = { nama: pejabat?.ppk?.nama || "", nip: pejabat?.ppk?.nip || "" };

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
  const headerLabels = ["No", "Jenis Pekerjaan / Spesifikasi", "Vol", "Satuan", "Harga Satuan", "Jumlah Harga"];

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
    const vol = it.volume;
    const hrg = it.hargaSatuan;
    const sub = it.subtotal;
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

  const { total: totalBiaya, pph, netto } = hitungan;

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
  doc.text(`POTONGAN PAJAK (PPh ${String(hitungan.persenPph).replace(".", ",")}%)`, x + 10, y + 4, {
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
// `hitungan` dari hitungFotokopi() (hitung.js) — sumber angka yang sama
// dengan kolom ringkasan di database. Semua halaman digambar dulu, baru
// dialirkan ke respons, supaya galat saat menyusun masih bisa dibalas JSON.
function susunPdfFotokopi({ data, hitungan, pejabat, streamRes }) {
  const isian = data.isian || {};
  const namaKegiatan = data.nama_kegiatan || isian.dalam_rangka || "Fotokopi";

  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: `Kwitansi & SPBY Fotokopi - ${namaKegiatan}`,
      Author: "SisKA Biro Keuangan dan BMN Kemnaker",
    },
  });
  pasangFontSemua(doc);

  const dataCetak = { ...data, total: hitungan.total };
  halamanSpbyFotokopi(doc, dataCetak, pejabat);
  halamanKwitansiFotokopi(doc, dataCetak, pejabat);
  halamanRincianFotokopi(doc, dataCetak, hitungan, pejabat);

  doc.pipe(streamRes);
  doc.end();
  return doc;
}

module.exports = { susunPdfFotokopi };
