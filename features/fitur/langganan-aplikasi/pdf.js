// =========================================================
// PDF SPBY & KWITANSI LANGGANAN APLIKASI
// =========================================================
//
// Menyusun dokumen PDF SPJ Langganan Aplikasi:
//   1. Halaman 1: Surat Perintah Bayar (SPBY) — sesuai format Biro Keuangan dan BMN.
//   2. Halaman 2: Kwitansi pembayaran langganan aplikasi.
//   3. Halaman 3: Rincian Biaya Langganan Aplikasi.
//   4. Halaman 4+: Lampiran gambar bukti/nota pembelian (bila diunggah).

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const angka = (n) => Math.floor(Number(n) || 0).toLocaleString("id-ID");
const rp = (n) => `Rp ${angka(n)},-`;

const HURUF = 10;
const ISI = "Tahoma";
const TEBAL = "Tahoma-Tebal";
const JUDUL_KWITANSI = "Times-TebalMiring";
const ARIAL = "Arial";
const ARIAL_TEBAL = "Arial-Tebal";

const FONT_DIR = path.join(__dirname, "..", "..", "..", "assets", "fonts");

function pasangFontDokumen(doc) {
  const daftar = [
    [ISI, "tahoma.ttf", "Helvetica"],
    [TEBAL, "tahomabd.ttf", "Helvetica-Bold"],
    [JUDUL_KWITANSI, "timesbi.ttf", "Times-BoldItalic"],
    [ARIAL, "arial.ttf", "Helvetica"],
    [ARIAL_TEBAL, "arialbd.ttf", "Helvetica-Bold"],
  ];
  for (const [nama, berkas, cadangan] of daftar) {
    const lokasi = path.join(FONT_DIR, berkas);
    doc.registerFont(nama, fs.existsSync(lokasi) ? lokasi : cadangan);
  }
}

// Memastikan nama PPK menggunakan gelar "Alpha Sandro Adithyaswara, S.Sos."
function namaPpkResmi(nama) {
  const s = String(nama || "").trim();
  if (!s || /alpha\s+sandro/i.test(s)) {
    return "Alpha Sandro Adithyaswara, S.Sos.";
  }
  return s;
}

// Memformat 18 digit NIP dengan spasi (8 - 6 - 1 - 3) untuk halaman SPBY.
function formatNipSpby(nip) {
  const bersih = String(nip || "").replace(/\s+/g, "");
  if (/^\d{18}$/.test(bersih)) {
    return `${bersih.slice(0, 8)} ${bersih.slice(8, 14)} ${bersih.slice(14, 15)} ${bersih.slice(15)}`;
  }
  return String(nip || "").trim();
}

function rentangTanggal(h, tanggalPanjang) {
  if (!h.tanggalMulai) return tanggalPanjang(h.tanggalBayar);
  if (h.tanggalMulai === h.tanggalSelesai) return tanggalPanjang(h.tanggalMulai);
  return `${tanggalPanjang(h.tanggalMulai)} s.d ${tanggalPanjang(h.tanggalSelesai)}`;
}

function untukPembayaran(h, tanggalPanjang) {
  if (h.uraianSpby) {
    const teks = h.uraianSpby.trim();
    return /sesuai dengan bukti terlampir/i.test(teks)
      ? teks
      : `${teks.replace(/[.,;\s]+$/, "")}, sesuai dengan bukti terlampir`;
  }
  const paket = h.paket ? ` (${h.paket})` : "";
  const penyedia = h.penyedia ? ` pada ${h.penyedia}` : "";
  const keperluan = h.keperluan ? ` dalam rangka ${h.keperluan.replace(/^dalam rangka\s*/i, "")}` : "";
  const tanggal = ` pada ${rentangTanggal(h, tanggalPanjang)}`;
  const dasar = `Biaya langganan aplikasi ${h.namaAplikasi}${paket}${penyedia}${keperluan}${tanggal}`;
  return /sesuai dengan bukti terlampir/i.test(dasar)
    ? dasar
    : `${dasar}, sesuai dengan bukti terlampir`;
}

function lebarIsi(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function bingkai(doc) {
  doc.lineWidth(0.8).rect(18, 18, doc.page.width - 36, doc.page.height - 36).stroke();
}

function garisGanda(doc, x, y, w) {
  doc.lineWidth(1.2).moveTo(x, y).lineTo(x + w, y).stroke();
  doc.lineWidth(0.5).moveTo(x, y + 3).lineTo(x + w, y + 3).stroke();
}

function tulis(doc, isi, x, y, opsi = {}) {
  doc.font(opsi.tebal ? TEBAL : ISI).fontSize(opsi.ukuran || HURUF);
  doc.text(String(isi ?? ""), x, y, { lineBreak: opsi.lebar !== undefined, ...opsi, width: opsi.lebar });
}

function barisLabel(doc, label, isi, y, { xLabel, xTitik, xIsi, lebarIsi: w, tebal = false, jarak = 6 }) {
  doc.font(ISI).fontSize(HURUF);
  doc.text(label, xLabel, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.font(tebal ? TEBAL : ISI);
  doc.text(String(isi ?? ""), xIsi, y, { width: w });
  return Math.max(doc.y, y + doc.currentLineHeight()) + jarak;
}

function kotakTeks(doc, isi, x, y, w, { minTinggi = 0, pad = 4, tebal = false, align = "left" } = {}) {
  doc.font(tebal ? TEBAL : ISI).fontSize(HURUF);
  const t = Math.max(minTinggi, doc.heightOfString(isi, { width: w - 2 * pad, align }) + 2 * pad);
  doc.lineWidth(0.6).rect(x, y, w, t).stroke();
  doc.text(isi, x + pad, y + pad, { width: w - 2 * pad, align });
  return y + t;
}

function ukuranSatuBaris(doc, daftar, lebar, font, maks, min = 6) {
  doc.font(font);
  let u = maks;
  while (u > min && daftar.some((t) => doc.fontSize(u).widthOfString(String(t || "")) > lebar)) u -= 0.25;
  doc.fontSize(HURUF);
  return u;
}

function blokTtd(doc, {
  x, y, lebar, judul = [], nama, nip, tinggi = 48, align = "center", ukuranNama = HURUF,
  tebalNama = true, tebalNip = false, tebalJudul = false, garisNama = true,
}) {
  const fontJudul = tebalJudul ? TEBAL : ISI;
  const ukuranJudul = ukuranSatuBaris(doc, judul.filter(Boolean), lebar - 4, fontJudul, HURUF);
  doc.font(fontJudul).fontSize(HURUF);
  const tBaris = doc.currentLineHeight(true);
  doc.fontSize(ukuranJudul);
  judul.forEach((j, i) => {
    if (j) doc.text(j, x, y + i * tBaris, { width: lebar, align, lineBreak: false });
  });
  let yy = y + judul.length * tBaris + tinggi;
  doc.font(tebalNama ? TEBAL : ISI).fontSize(ukuranNama).text(nama || "", x, yy, {
    width: lebar,
    align,
    underline: garisNama,
    lineBreak: false,
  });
  yy = doc.y;
  doc.fontSize(HURUF);
  if (nip !== undefined) {
    doc.font(tebalNip ? TEBAL : ISI).text(nip ? `NIP. ${nip}` : "NIP. -", x, yy, {
      width: lebar,
      align,
      lineBreak: false,
    });
  }
  return doc.y;
}

// =========================================================
// HALAMAN 1: SURAT PERINTAH BAYAR (SPBY)
// =========================================================

function halamanSpbyPersis(doc, h, { terbilangRupiah, tanggalPanjang }) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 36, bottom: 36, left: 38, right: 38 } });

  const xKiri = 38;
  const xKanan = doc.page.width - 38;
  const w = xKanan - xKiri;
  const yAtas = 38;
  const yBawah = 695;
  const H = 10;

  const tahun = String(h.tahunAnggaran || "2026");
  const labelTgl = h.cetakTanggalLengkap ? tanggalPanjang(h.tanggalBayar) : `        ${tahun}`;
  const nomorSpby = h.nomorSpby ? ` ${h.nomorSpby}` : "";

  // ---- 1. KOP & JUDUL ----
  doc.font(ARIAL_TEBAL).fontSize(10.5);
  doc.text("KEMENTERIAN KETENAGAKERJAAN", xKiri, 44, { width: w, align: "center" });
  doc.text("BIRO KEUANGAN DAN BMN", xKiri, 59, { width: w, align: "center" });

  doc.font(ARIAL_TEBAL).fontSize(10.5);
  doc.text("SURAT PERINTAH BAYAR", xKiri, 88, { width: w, align: "center", underline: true });

  doc.font(ARIAL).fontSize(H);
  doc.text(`Tanggal :${labelTgl} Nomor :${nomorSpby}`, xKiri, 104, { width: w, align: "center" });

  const yGaris1 = 126;
  doc.lineWidth(0.9).moveTo(xKiri, yGaris1).lineTo(xKanan, yGaris1).stroke();

  // ---- 2. PERINTAH BAYAR, NOMINAL, & TERBILANG ----
  doc.font(ARIAL).fontSize(H);
  doc.text(
    "Saya yang bertanda tangan di bawah ini selaku Pejabat Pembuat Komitmen memerintahkan Bendahara Pengeluaran agar melakukan pembayaran sejumlah :",
    xKiri + 5,
    134,
    { width: w - 10, align: "justify" },
  );

  doc.font(ARIAL_TEBAL).fontSize(10.5);
  doc.text("Rp", xKiri + 6, 172, { lineBreak: false });
  doc.text(angka(h.total), xKiri + 6, 172, { width: 130, align: "right" });

  const teksTerbilang = terbilangRupiah(h.total);
  doc.font(ARIAL_TEBAL).fontSize(H);
  doc.text(teksTerbilang, xKiri + 5, 200, { width: w - 10 });

  const yGaris2 = Math.max(226, doc.y + 8);
  doc.lineWidth(1.5).moveTo(xKiri, yGaris2).lineTo(xKanan, yGaris2).stroke();

  // ---- 3. KEPADA, UNTUK PEMBAYARAN, ATAS DASAR, PEMBEBANAN ----
  const xLabel = xKiri + 5;
  const xTitik = xKiri + 150;
  const xIsi = xKiri + 170;
  const wIsi = xKanan - xIsi - 6;

  let y = yGaris2 + 22;

  doc.font(ARIAL).fontSize(H).text("Kepada", xLabel, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.font(ARIAL_TEBAL).fontSize(H).text(h.penerima.nama, xIsi, y, { width: wIsi });
  y = Math.max(doc.y, y + 14) + 4;

  doc.font(ARIAL).fontSize(H).text("Untuk pembayaran", xLabel, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.font(ARIAL).fontSize(H).text(untukPembayaran(h, tanggalPanjang), xIsi, y, {
    width: wIsi,
    align: "justify",
  });

  y = Math.max(doc.y + 38, 355);
  doc.font(ARIAL).fontSize(H);
  doc.text("Atas dasar :", xLabel, y);
  y += 18;

  const xTitikDasar = xKiri + 206;
  const xIsiDasar = xKiri + 220;
  doc.text("1. Kuitansi/bukti pembelian", xLabel, y, { lineBreak: false });
  doc.text(":", xTitikDasar, y, { lineBreak: false });
  if (h.atasDasarKuitansi) {
    doc.text(h.atasDasarKuitansi, xIsiDasar, y, { width: xKanan - xIsiDasar - 6 });
  }
  y += 17;

  doc.text("2. Nota/bukti penerimaan barang/jasa/", xLabel, y, { lineBreak: false });
  doc.text(":", xTitikDasar, y, { lineBreak: false });
  if (h.atasDasarNota) {
    doc.text(h.atasDasarNota, xIsiDasar, y, { width: xKanan - xIsiDasar - 6 });
  }
  y += 15;
  doc.text("    bukti lainnya", xLabel, y);

  y += 38;
  doc.font(ARIAL).fontSize(H);
  doc.text("Dibebankan pada :", xLabel, y);
  y += 18;

  doc.text("Kegiatan, Output, MAK", xLabel, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.text(h.kegiatanMak, xIsi, y, { width: wIsi });
  y += 17;

  doc.text("Kode", xLabel, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.text(h.kodeAkun, xIsi, y, { width: wIsi });

  const yGaris3 = Math.max(536, y + 36);
  doc.lineWidth(1.5).moveTo(xKiri, yGaris3).lineTo(xKanan, yGaris3).stroke();

  // ---- 4. TANDA TANGAN BENDAHARA & PPK ----
  const yTtdAtas = yGaris3 + 22;
  const xKolKiri = xKiri + 6;
  const wKolKiri = 210;
  const wKolKanan = 230;
  const xKolKanan = xKanan - wKolKanan - 6;

  const tglBawah = h.cetakTanggalLengkap ? tanggalPanjang(h.tanggalBayar) : `      ${tahun}`;
  const tglKanan = h.cetakTanggalLengkap ? tanggalPanjang(h.tanggalBayar) : `            ${tahun}`;

  doc.font(ARIAL).fontSize(H);
  doc.text(`Setuju/lunas dibayar, Tgl${tglBawah}`, xKolKiri, yTtdAtas, {
    width: wKolKiri,
    align: "center",
    lineBreak: false,
  });
  doc.text("Bendahara Pengeluaran", xKolKiri, yTtdAtas + 17, { width: wKolKiri, align: "center" });
  doc.text("Sekretariat Jenderal Kemnaker", xKolKiri, yTtdAtas + 33, { width: wKolKiri, align: "center" });

  doc.text(`Jakarta,${tglKanan}`, xKolKanan, yTtdAtas, {
    width: wKolKanan,
    align: "center",
    lineBreak: false,
  });
  doc.text("Pejabat Pembuat Komitmen", xKolKanan, yTtdAtas + 17, { width: wKolKanan, align: "center" });
  doc.text("Biro Keuangan Setjen Kemnaker", xKolKanan, yTtdAtas + 33, { width: wKolKanan, align: "center" });

  const yNama = yTtdAtas + 105;
  const namaBendahara = h.pejabat?.bendahara?.nama || "";
  const nipBendahara = formatNipSpby(h.pejabat?.bendahara?.nip);
  const namaPpk = namaPpkResmi(h.pejabat?.ppk?.nama);
  const nipPpk = formatNipSpby(h.pejabat?.ppk?.nip);

  const uBendahara = ukuranSatuBaris(doc, [namaBendahara], wKolKiri - 4, ARIAL, H);
  doc.font(ARIAL).fontSize(uBendahara).text(namaBendahara, xKolKiri, yNama, {
    width: wKolKiri,
    align: "center",
    lineBreak: false,
  });
  doc.font(ARIAL).fontSize(H).text(`NIP ${nipBendahara}`, xKolKiri, yNama + 16, {
    width: wKolKiri,
    align: "center",
    lineBreak: false,
  });

  const uPpk = ukuranSatuBaris(doc, [namaPpk], wKolKanan - 4, ARIAL, H);
  doc.font(ARIAL).fontSize(uPpk).text(namaPpk, xKolKanan, yNama, {
    width: wKolKanan,
    align: "center",
    lineBreak: false,
  });
  doc.font(ARIAL).fontSize(H).text(`NIP ${nipPpk}`, xKolKanan, yNama + 16, {
    width: wKolKanan,
    align: "center",
    lineBreak: false,
  });

  const yKotakBawah = Math.max(yBawah, yNama + 38);
  doc.lineWidth(1).rect(xKiri, yAtas, w, yKotakBawah - yAtas).stroke();
}

// =========================================================
// HALAMAN 2: KWITANSI
// =========================================================

function halamanKwitansiLangganan(doc, h, { terbilangRupiah, tanggalPanjang }) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  doc.font(JUDUL_KWITANSI).fontSize(20).text("KWITANSI", x, 30, { width: w, align: "center", underline: true });
  let y = doc.y + 2;
  doc.lineWidth(1.2).moveTo(x, y).lineTo(x + w, y).stroke();
  y += 6;

  const opsiKepala = { xLabel: x, xTitik: x + 140, xIsi: x + 150, lebarIsi: w - 150, jarak: 1 };
  y = barisLabel(doc, "No. BKU", h.noBku, y, opsiKepala);
  y = barisLabel(doc, "Tahun Anggaran", h.tahunAnggaran, y, opsiKepala);
  y = barisLabel(doc, "Akun", h.akun.kode, y, opsiKepala);
  garisGanda(doc, x, y + 6, w);
  y += 28;

  const xTitik = x + 155;
  const xIsi = x + 165;
  const wIsi = w - 165;

  doc.font(ISI).fontSize(HURUF).text("Sudah Terima Dari", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.text("Kuasa Pengguna Anggaran DIPA Setjen Kemnaker", xIsi, y, { width: wIsi });
  y = doc.y + 6;

  doc.text("Rp.", xIsi, y + 3, { lineBreak: false });
  kotakTeks(doc, angka(h.total), xIsi + 26, y, 180, { pad: 3 });
  y += 36;

  doc.font(ISI).text("Banyaknya Uang", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  y = kotakTeks(doc, terbilangRupiah(h.total), xIsi, y, wIsi, { minTinggi: 40, pad: 8 }) + 16;

  doc.font(ISI).text("Untuk Pembayaran", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  y = kotakTeks(doc, untukPembayaran(h, tanggalPanjang), xIsi, y, wIsi, { minTinggi: 66, align: "justify" }) + 8;

  garisGanda(doc, x, y, w);
  y += 12;

  const namaPpk = namaPpkResmi(h.pejabat?.ppk?.nama);
  const tglJakarta = `Jakarta, ${tanggalPanjang(h.tanggalBayar)}`;

  // Tanggal "Jakarta, ..." dimasukkan langsung sebagai baris pertama judul
  // kolom ke-3 agar lebarnya ikut dihitung dan tidak pernah menimpa
  // teks "Yang Menerima," di bawahnya.
  const blok = [
    {
      judul: ["Setuju dibayar", "Pejabat Pembuat Komitmen", "Biro Keuangan Kemnaker"],
      nama: namaPpk,
      nip: h.pejabat?.ppk?.nip || "",
    },
    {
      judul: ["Lunas dibayar", "Bendahara Pengeluaran", "Setjen Kemnaker"],
      nama: h.pejabat?.bendahara?.nama || "",
      nip: h.pejabat?.bendahara?.nip || "",
    },
    {
      judul: [tglJakarta, "Yang Menerima,", ""],
      nama: h.penerima.nama,
      nip: h.penerima.nip,
    },
  ];

  doc.font(ISI).fontSize(HURUF);
  const lebarKol = [w * 0.36, w * 0.32, w * 0.32];
  const ukuranNama = Math.min(...blok.map((b, i) => ukuranSatuBaris(doc, [b.nama], lebarKol[i] - 8, ISI, HURUF)));
  const xKol = [x, x + lebarKol[0], x + lebarKol[0] + lebarKol[1]];

  blok.forEach((b, i) =>
    blokTtd(doc, {
      x: xKol[i],
      y,
      lebar: lebarKol[i],
      ukuranNama,
      tebalNama: false,
      ...b,
    }),
  );
}

// =========================================================
// HALAMAN 3: RINCIAN BIAYA LANGGANAN APLIKASI
// =========================================================

function halamanRincianLangganan(doc, h, { terbilangRupiah, tanggalPanjang }) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 40, right: 40 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  tulis(doc, "RINCIAN BIAYA LANGGANAN APLIKASI", x, 34, { tebal: true, ukuran: 13, lebar: w, align: "center" });
  let y = doc.y + 18;
  const opsi = { xLabel: x, xTitik: x + 150, xIsi: x + 165, lebarIsi: w - 165, jarak: 2 };
  y = barisLabel(doc, "Aplikasi / Layanan", `${h.namaAplikasi}${h.paket ? ` (${h.paket})` : ""}`, y, {
    ...opsi,
    tebal: true,
  });
  y = barisLabel(doc, "Penyedia / Vendor", h.penyedia || "-", y, opsi);
  y = barisLabel(doc, "Periode Langganan", rentangTanggal(h, tanggalPanjang), y, opsi);
  y = barisLabel(doc, "Tanggal Pembayaran", tanggalPanjang(h.tanggalBayar), y, { ...opsi, jarak: 10 });

  const kNo = 28;
  const kJml = 120;
  const kKet = 70;
  const kUr = w - kNo - kJml - kKet;
  const xs = [x, x + kNo, x + kNo + kUr, x + kNo + kUr + kJml, x + w];
  const yAtas = y;

  doc.font(TEBAL).fontSize(HURUF);
  doc.text("NO.", xs[0] + 2, y + 4, { width: kNo - 4, align: "center" });
  doc.text("PERINCIAN BIAYA", xs[1] + 4, y + 4, { width: kUr - 8, align: "center" });
  doc.text("JUMLAH", xs[2] + 4, y + 4, { width: kJml - 8, align: "center" });
  doc.text("KET", xs[3] + 4, y + 4, { width: kKet - 8, align: "center" });
  y += 20;
  doc.lineWidth(0.6).moveTo(x, y).lineTo(x + w, y).stroke();
  y += 8;

  doc.font(ISI).fontSize(HURUF);
  h.rincian.forEach((r, i) => {
    doc.text(String(i + 1), xs[0], y, { width: kNo, align: "center" });
    doc.text(r.uraian, xs[1] + 6, y, { width: kUr - 12 });
    const ySub = doc.y + 2;
    doc.fontSize(HURUF - 1).text(
      `${r.volume} ${r.satuan} × Rp ${angka(r.hargaSatuan)}${r.pajak > 0 ? ` + Pajak/Admin Rp ${angka(r.pajak)}` : ""}`,
      xs[1] + 6,
      ySub,
      { width: kUr - 12 },
    );
    doc.fontSize(HURUF);
    const yBawah = doc.y;
    doc.text("Rp", xs[2] + 6, y, { lineBreak: false });
    doc.text(angka(r.jumlah), xs[2] + 22, y, { width: kJml - 28, align: "right" });
    if (r.keterangan) {
      doc.fontSize(HURUF - 1).text(r.keterangan, xs[3] + 4, y, { width: kKet - 8, align: "center" });
      doc.fontSize(HURUF);
    }
    y = Math.max(yBawah, y + 18) + 10;
  });

  doc.lineWidth(0.6).moveTo(x, y).lineTo(x + w, y).stroke();
  doc.font(TEBAL).text("JUMLAH", xs[1] + 6, y + 4, { lineBreak: false });
  doc.text("Rp", xs[2] + 6, y + 4, { lineBreak: false });
  doc.text(angka(h.total), xs[2] + 22, y + 4, { width: kJml - 28, align: "right" });
  y += 19;
  doc.moveTo(x, y).lineTo(x + w, y).stroke();
  doc.rect(x, yAtas, w, y - yAtas).stroke();
  for (let i = 1; i < 4; i++) doc.moveTo(xs[i], yAtas).lineTo(xs[i], y).stroke();

  doc.font(TEBAL).text("TERBILANG", xs[1] + 6, y + 5, { lineBreak: false });
  doc.text(":", xs[1] + 90, y + 5, { lineBreak: false });
  doc.fontSize(HURUF - 1).text(terbilangRupiah(h.total), xs[1] + 100, y + 6, { width: w - kNo - 104 });
  doc.fontSize(HURUF);
  y = doc.y + 28;

  const kol = w / 2;
  tulis(doc, `Jakarta, ${tanggalPanjang(h.tanggalBayar)}`, x + kol, y, { lebar: kol, align: "center" });
  y += 22;
  blokTtd(doc, {
    x,
    y,
    lebar: kol,
    tebalNip: true,
    judul: ["Telah dibayar sejumlah", rp(h.total), "", "Bendahara Pengeluaran"],
    ...h.pejabat.bendahara,
  });
  const yAkhir = blokTtd(doc, {
    x: x + kol,
    y,
    lebar: kol,
    tebalNip: true,
    judul: ["Telah menerima jumlah uang sebesar", rp(h.total), "", "Yang menerima,"],
    nama: h.penerima.nama,
    nip: h.penerima.nip,
  });

  const namaPpk = namaPpkResmi(h.pejabat?.ppk?.nama);
  y = yAkhir + 24;
  doc.lineWidth(0.8).moveTo(x, y).lineTo(x + w, y).stroke();
  blokTtd(doc, {
    x: x + kol / 2,
    y: y + 18,
    lebar: kol,
    tebalNip: true,
    judul: ["Mengetahui / Menyetujui,", "Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Kemnaker"],
    tinggi: 54,
    nama: namaPpk,
    nip: h.pejabat?.ppk?.nip || "",
  });
}

// =========================================================
// HALAMAN 4+: LAMPIRAN BUKTI / NOTA PEMBELIAN
// =========================================================

function halamanLampiranBukti(doc, lampiran = []) {
  const daftarBuffer = lampiran
    .map((item) => {
      const m = /^data:image\/(?:jpe?g|png);base64,(.+)$/i.exec(String(item?.dataUrl || ""));
      if (!m) return null;
      try {
        return { nama: item.nama || "", buffer: Buffer.from(m[1], "base64") };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (!daftarBuffer.length) return;

  const perHalaman = 2;
  const jarak = 14;

  daftarBuffer.forEach((foto, i) => {
    const s = i % perHalaman;
    if (s === 0) {
      doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 38, right: 38 } });
    }
    const kiri = doc.page.margins.left;
    const atas = doc.page.margins.top;
    const lebar = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const tinggi = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    const tinggiSlot = (tinggi - jarak * (perHalaman - 1)) / perHalaman;
    const y = atas + s * (tinggiSlot + jarak);

    try {
      doc.image(foto.buffer, kiri, y, {
        fit: [lebar, tinggiSlot],
        align: "center",
        valign: "center",
      });
    } catch {
      doc.font(ARIAL).fontSize(10).text("(gambar bukti tidak dapat ditampilkan)", kiri, y + tinggiSlot / 2, {
        width: lebar,
        align: "center",
      });
    }
  });
}

function tulisLanggananPdf(hitungan, tujuan, alat) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: `SPBY & Kwitansi Langganan ${hitungan.namaAplikasi}`,
      Author: "SisKA Biro Keuangan dan BMN",
    },
  });
  pasangFontDokumen(doc);
  if (alat?.pasangFontSpby) alat.pasangFontSpby(doc);
  doc.pipe(tujuan);

  halamanSpbyPersis(doc, hitungan, alat);
  halamanKwitansiLangganan(doc, hitungan, alat);
  halamanRincianLangganan(doc, hitungan, alat);
  if (Array.isArray(hitungan.lampiran) && hitungan.lampiran.length) {
    halamanLampiranBukti(doc, hitungan.lampiran);
  }

  doc.end();
  return doc;
}

module.exports = { tulisLanggananPdf };
