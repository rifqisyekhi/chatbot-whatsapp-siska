// =========================================================
// PDF SURAT PEMBATALAN PERJALANAN DINAS
// =========================================================
//
// Meniru "surat pernyataan pembatalan tugas" (Word) Biro Keuangan:
//   1. Surat Pernyataan Pembatalan Tugas Perjalanan Dinas — ditandatangani
//      Kepala Biro Keuangan dan BMN, satu lembar per peserta.
//   2. Surat Pernyataan Pembebanan Biaya Pembatalan Perjalanan Dinas
//      Jabatan — ditandatangani PPK, hanya bila ada biaya yang terlanjur
//      dibayar dan tidak bisa dikembalikan (mis. tiket pesawat).
//
// Data: kegiatan dari hitungKegiatan(), daftar pembatalan dari kolom
// perjalanan_dinas.pembatalan, dan Kepala Biro dari db.kepalaBiro().

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { terbilangRupiah, tanggalPanjang } = require("./spbyServisPdf");

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const KOP = path.join(__dirname, "..", "assets", "images", "kop-kemnaker.png");
const KOP_RASIO = 178 / 804;

const ISI = "Arial";
const TEBAL = "Arial-Tebal";
const UKURAN = 11.5;

const UNIT = "Biro Keuangan dan BMN Unit Setjen";
const KL = "Kementerian Ketenagakerjaan RI";
const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const nipRapat = (nip) => String(nip || "").replace(/\s+/g, "");
const rupiah = (n) => `Rp${Math.floor(Number(n) || 0).toLocaleString("id-ID")},00`;

// Nomor kosong → pola isian tangan seperti di templat ("    /KU.02.00/X/2026").
function polaNomor(iso, kode) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || "");
  return m ? `......../${kode}/${ROMAWI[Number(m[2]) - 1]}/${m[1]}` : `......../${kode}/....../......`;
}

function rentang(k) {
  if (k.tanggalBerangkat === k.tanggalKembali) return tanggalPanjang(k.tanggalBerangkat);
  return `${tanggalPanjang(k.tanggalBerangkat)} s.d. ${tanggalPanjang(k.tanggalKembali)}`;
}

function pasangFont(doc) {
  for (const [nama, berkas, cadangan] of [[ISI, "arial.ttf", "Helvetica"], [TEBAL, "arialbd.ttf", "Helvetica-Bold"]]) {
    const lokasi = path.join(FONT_DIR, berkas);
    doc.registerFont(nama, fs.existsSync(lokasi) ? lokasi : cadangan);
  }
}

function halamanBaru(doc) {
  doc.addPage({ size: "A4", margins: { top: 30, bottom: 24, left: 72, right: 64 } });
  const x = doc.page.margins.left;
  const w = doc.page.width - x - doc.page.margins.right;
  let y = doc.page.margins.top;
  if (fs.existsSync(KOP)) {
    const lebar = w + 20;
    doc.image(KOP, x - 20, y, { width: lebar });
    y += lebar * KOP_RASIO + 4;
    doc.lineWidth(1).moveTo(x - 20, y).lineTo(x + w, y).stroke();
    y += 16;
  }
  return { x, w, y };
}

function judul(doc, baris, x, y, w) {
  doc.font(TEBAL).fontSize(12);
  for (const b of baris) {
    doc.text(b, x, y, { width: w, align: "center" });
    y = doc.y;
  }
  return y;
}

function paragraf(doc, isi, x, y, w) {
  doc.font(ISI).fontSize(UKURAN).text(isi, x, y, { width: w, align: "justify", lineGap: 2 });
  return doc.y;
}

// Blok "Nama : ..." dengan titik dua sejajar.
function identitas(doc, data, x, y, w, indent = 28) {
  const xLabel = x + indent;
  const xTitik = x + 160;
  doc.font(ISI).fontSize(UKURAN);
  for (const [label, nilai] of data) {
    doc.text(label, xLabel, y, { lineBreak: false });
    doc.text(":", xTitik, y, { lineBreak: false });
    doc.text(nilai || "-", xTitik + 12, y, { width: x + w - xTitik - 12 });
    y = doc.y + 3;
  }
  return y;
}

function tandaTangan(doc, { tanggal, nama, nip }, x, y, w) {
  const xKol = x + w * 0.5;
  const lebar = w * 0.5;
  doc.font(ISI).fontSize(UKURAN);
  doc.text(`Jakarta, ${tanggal ? tanggalPanjang(tanggal) : ""}`, xKol, y, { width: lebar, align: "center" });
  doc.text("Yang membuat pernyataan,", xKol, doc.y + 8, { width: lebar, align: "center" });
  y = doc.y + 54;
  doc.text(nama || "............................................", xKol, y, { width: lebar, align: "center" });
  doc.text(`NIP. ${nipRapat(nip) || "...................."}`, xKol, doc.y, { width: lebar, align: "center" });
}

const dataPegawai = (p) => [
  ["Nama", p.nama],
  ["NIP", nipRapat(p.nip)],
  ["Jabatan", p.jabatan],
  ["Unit Organisasi", UNIT],
  ["Kementerian/Lembaga", KL],
];

function suratTugas(e) {
  const nomor = e.nomor_surat_tugas || "............................";
  const tanggal = e.tanggal_surat_tugas ? tanggalPanjang(e.tanggal_surat_tugas) : "....................";
  return `Surat Tugas Nomor : ${nomor} tanggal ${tanggal}`;
}

function halamanPembatalan(doc, k, e, p, kepalaBiro) {
  let { x, w, y } = halamanBaru(doc);
  y = judul(doc, ["SURAT PERNYATAAN PEMBATALAN TUGAS PERJALANAN DINAS"], x, y, w);
  doc.font(ISI).fontSize(UKURAN).text(`NOMOR ${e.nomor_pernyataan || polaNomor(e.tanggal, "KU.02.00")}`, x, y + 2, { width: w, align: "center" });
  y = doc.y + 26;

  doc.text("Yang bertanda tangan di bawah ini :", x, y);
  y = identitas(doc, [
    ["Nama", kepalaBiro.nama],
    ["NIP", nipRapat(kepalaBiro.nip)],
    ["Jabatan", "Kepala Biro Keuangan dan Barang Milik Negara"],
    ["Unit Organisasi", UNIT],
    ["Kementerian/Lembaga", KL],
  ], x, doc.y + 6, w);

  y = paragraf(doc, `menyatakan dengan sesungguhnya, bahwa tugas Perjalanan Dinas berdasarkan ${suratTugas(e)} atas nama :`, x, y + 10, w);
  y = identitas(doc, dataPegawai(p), x, y + 6, w, 14);

  const alasan = e.alasan.replace(/[.\s]+$/, "");
  y = paragraf(doc, `dibatalkan atau tidak dapat dilaksanakan disebabkan ${alasan}.`, x, y + 10, w);

  const maksud = k.maksud.replace(/^perjalanan dinas\s*/i, "").replace(/^dalam rangka\s*/i, "");
  const tempat = k.tempat || k.kotaTujuan;
  y = paragraf(
    doc,
    `Sehubungan dengan pembatalan tersebut, maka pelaksanaan Perjalanan Dinas dalam rangka ${maksud}, pada tanggal ${rentang(k)} di ${tempat} tidak dapat digantikan oleh pegawai negeri/pegawai tidak tetap.`,
    x, y + 12, w,
  );
  y = paragraf(
    doc,
    "Demikian surat pernyataan ini dibuat dengan sebenarnya, apabila di kemudian hari ternyata surat pernyataan ini tidak benar, saya bersedia dikenakan sanksi sesuai peraturan perundang-undangan.",
    x, y + 12, w,
  );
  tandaTangan(doc, { tanggal: e.tanggal, ...kepalaBiro }, x, y + 26, w);
}

function halamanPembebanan(doc, k, e, p) {
  let { x, w, y } = halamanBaru(doc);
  y = judul(doc, ["SURAT PERNYATAAN PEMBEBANAN", "BIAYA PEMBATALAN PERJALANAN DINAS JABATAN"], x, y, w) + 20;

  doc.font(ISI).fontSize(UKURAN).text("Yang bertanda tangan di bawah ini :", x, y);
  y = identitas(doc, [
    ["Nama", k.pejabat.ppk.nama],
    ["NIP", nipRapat(k.pejabat.ppk.nip)],
    ["Jabatan", "PPK Biro Keuangan dan Barang Milik Negara"],
    ["Unit Organisasi", UNIT],
    ["Kementerian/Lembaga", KL],
  ], x, doc.y + 6, w);

  const spd = `SPD Nomor: ${k.nomorSpd || polaNomor(k.tanggalSpd, "BKU")} tanggal ${tanggalPanjang(k.tanggalSpd)}`;
  y = paragraf(doc, `menyatakan dengan sesungguhnya, bahwa Perjalanan Dinas berdasarkan ${suratTugas(e)} dan ${spd} atas nama :`, x, y + 10, w);
  y = identitas(doc, dataPegawai(p), x, y + 6, w, 14);

  y = paragraf(
    doc,
    `dibatalkan sesuai dengan Surat Pernyataan Pembatalan Tugas Perjalanan Dinas Nomor: ${e.nomor_pernyataan || polaNomor(e.tanggal, "KU.02.00")} tanggal ${tanggalPanjang(e.tanggal)}.`,
    x, y + 10, w,
  );
  const terbilang = terbilangRupiah(p.biaya_hangus).toLowerCase();
  const dipa = e.dipa || "....................................................";
  y = paragraf(
    doc,
    `Berkenaan dengan pembatalan tersebut, biaya ${e.uraian_biaya} yang telah terlanjur dibayarkan atas beban DIPA tidak dapat dikembalikan/refund ${e.sifat_biaya} sebesar ${rupiah(p.biaya_hangus)} (${terbilang}), sehingga dibebankan pada DIPA Nomor: ${dipa} Satker Sekretariat Jenderal.`,
    x, y + 4, w,
  );
  y = paragraf(
    doc,
    "Demikian surat pernyataan ini dibuat dengan sebenarnya, apabila di kemudian hari ternyata surat pernyataan ini tidak benar dan menimbulkan kerugian negara, saya bersedia menyetorkan kerugian negara tersebut ke Kas Negara.",
    x, y + 12, w,
  );
  tandaTangan(doc, { tanggal: e.tanggal, ...k.pejabat.ppk }, x, y + 26, w);
}

function tulisSuratBatalPdf({ kegiatan, pembatalan, kepalaBiro }, tujuan) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    info: { Title: `Surat Pembatalan Perjalanan Dinas ${kegiatan.kotaTujuan}`, Author: "SisKA Biro Keuangan dan BMN" },
  });
  pasangFont(doc);
  doc.pipe(tujuan);
  for (const e of pembatalan) {
    for (const p of e.peserta) {
      halamanPembatalan(doc, kegiatan, e, p, kepalaBiro);
      if (p.biaya_hangus > 0) halamanPembebanan(doc, kegiatan, e, p);
    }
  }
  doc.end();
  return doc;
}

module.exports = { tulisSuratBatalPdf };
