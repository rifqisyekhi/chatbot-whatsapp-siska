// =========================================================
// PDF KWITANSI PERJALANAN DINAS
// =========================================================
//
// Meniru lembar "NOMI" (Excel) yang dipakai TU:
//   1. Per peserta: Kwitansi, Rincian Biaya + Perhitungan SPD
//      Rampung, SPD lembar depan, dan Daftar Pengeluaran Riil berkop
//      (hanya kalau ada biaya tanpa bukti, mis. transport dalam kota).
//   2. Daftar Nominatif (landscape) — semua peserta, di akhir.
//
// Data masuk sudah dihitung oleh kwitansiTarif.hitungKegiatan(), jadi
// berkas ini hanya menata letak — tidak ada aturan PMK di sini.

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { terbilangRupiah, tanggalPanjang } = require("./spbyServisPdf");

const angka = (n) => Math.floor(Number(n) || 0).toLocaleString("id-ID");
const rp = (n) => `Rp ${angka(n)},-`;

let HURUF = 10; // `let`: halaman riil memakai 11 (Arial Narrow 12 di templat)

// Font mengikuti lembar NOMI: Tahoma untuk nominatif, kwitansi,
// rincian, dan SPD; Times New Roman tebal-miring untuk judul KWITANSI;
// Arial Narrow untuk Daftar Pengeluaran Riil beserta kop suratnya.
// ISI/TEBAL sengaja `let`: halaman riil menukarnya ke Arial Narrow
// sementara, supaya semua alat tata letak di bawah ikut berganti.
let ISI = "Tahoma";
let TEBAL = "Tahoma-Tebal";
const NARROW = "Narrow";
const NARROW_TEBAL = "Narrow-Tebal";
const JUDUL_KWITANSI = "Times-TebalMiring";

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

function pasangFontKwitansi(doc) {
  const daftar = [
    ["Tahoma", "tahoma.ttf", "Helvetica"],
    ["Tahoma-Tebal", "tahomabd.ttf", "Helvetica-Bold"],
    [NARROW, "arialn.ttf", "Helvetica"],
    [NARROW_TEBAL, "arialnb.ttf", "Helvetica-Bold"],
    [JUDUL_KWITANSI, "timesbi.ttf", "Times-BoldItalic"],
  ];
  for (const [nama, berkas, cadangan] of daftar) {
    const lokasi = path.join(FONT_DIR, berkas);
    doc.registerFont(nama, fs.existsSync(lokasi) ? lokasi : cadangan);
  }
}

// "Perjalanan dinas dalam rangka ..." — maksud diketik bebas,
// awalan "dalam rangka" tidak digandakan kalau sudah diketik user.
function untukPembayaran(k) {
  const m = k.maksud.replace(/^perjalanan dinas\s*/i, "").replace(/^dalam rangka\s*/i, "");
  const tujuan = k.tempat ? ` di ${k.tempat}` : "";
  return `Perjalanan dinas dalam rangka ${m}${tujuan} pada tanggal ${rentangTanggal(k)}`;
}

function rentangTanggal(k) {
  if (k.tanggalBerangkat === k.tanggalKembali) return tanggalPanjang(k.tanggalBerangkat);
  return `${tanggalPanjang(k.tanggalBerangkat)} s.d. ${tanggalPanjang(k.tanggalKembali)}`;
}

const lamaHari = (hari) => {
  const kata = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh"];
  return `${hari} (${kata[hari] || terbilangRupiah(hari).replace(/ rupiah$/i, "")}) Hari`;
};

// =========================================================
// ALAT TATA LETAK
// =========================================================

function lebarIsi(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function tulis(doc, isi, x, y, opsi = {}) {
  doc.font(opsi.tebal ? TEBAL : ISI).fontSize(opsi.ukuran || HURUF);
  doc.text(String(isi ?? ""), x, y, { lineBreak: opsi.lebar !== undefined, ...opsi, width: opsi.lebar });
}

// Baris "Label : isi" dengan isi yang boleh membungkus. Mengembalikan y berikutnya.
function barisLabel(doc, label, isi, y, { xLabel, xTitik, xIsi, lebarIsi: w, tebal = false, jarak = 6 }) {
  doc.font(ISI).fontSize(HURUF);
  doc.text(label, xLabel, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  doc.font(tebal ? TEBAL : ISI);
  doc.text(String(isi ?? ""), xIsi, y, { width: w });
  return Math.max(doc.y, y + doc.currentLineHeight()) + jarak;
}

// Blok tanda tangan: beberapa baris judul, ruang kosong, nama bergaris bawah, NIP.
// Setiap baris judul memakai tinggi satu baris tetap (judul kosong pun),
// supaya blok yang berdampingan punya nama di ketinggian yang sama.
function blokTtd(doc, {
  x, y, lebar, judul = [], nama, nip, tinggi = 48, align = "center", ukuranNama = HURUF,
  tebalNama = true, tebalNip = false, tebalJudul = false, garisNama = true,
}) {
  doc.font(tebalJudul ? TEBAL : ISI).fontSize(HURUF);
  const tBaris = doc.currentLineHeight(true);
  judul.forEach((j, i) => {
    if (j) doc.text(j, x, y + i * tBaris, { width: lebar, align, lineBreak: false });
  });
  let yy = y + judul.length * tBaris + tinggi;
  doc.font(tebalNama ? TEBAL : ISI).fontSize(ukuranNama).text(nama || "", x, yy, { width: lebar, align, underline: garisNama });
  yy = doc.y;
  doc.fontSize(HURUF);
  if (nip !== undefined) {
    doc.font(tebalNip ? TEBAL : ISI).text(nip ? `NIP. ${nip}` : "NIP. -", x, yy, { width: lebar, align });
  }
  return doc.y;
}

// Tabel sederhana dengan garis. kolom: [{ judul, lebar, align }].
// Mengembalikan y bawah tabel.
function tabel(doc, { x, y, kolom, baris, ukuran = HURUF, ukuranJudul, pad = 3, barisTebal = [] }) {
  const total = (k) => kolom.slice(0, k).reduce((a, c) => a + c.lebar, 0);
  const lebarTotal = total(kolom.length);

  const tinggiBaris = (sel, tebal) => {
    doc.font(tebal ? TEBAL : ISI).fontSize(ukuran);
    return Math.max(
      ...sel.map((isi, i) => doc.heightOfString(String(isi ?? ""), { width: kolom[i].lebar - 2 * pad })),
    ) + 2 * pad;
  };

  const gambarBaris = (sel, yy, tebal, latar) => {
    const t = tinggiBaris(sel, tebal);
    if (yy + t > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      yy = doc.page.margins.top;
    }
    if (latar) doc.rect(x, yy, lebarTotal, t).fill(latar).fillColor("black");
    doc.font(tebal ? TEBAL : ISI).fontSize(ukuran);
    sel.forEach((isi, i) => {
      doc.text(String(isi ?? ""), x + total(i) + pad, yy + pad, {
        width: kolom[i].lebar - 2 * pad,
        align: kolom[i].align || "left",
      });
    });
    doc.lineWidth(0.5);
    doc.rect(x, yy, lebarTotal, t).stroke();
    for (let i = 1; i < kolom.length; i++) {
      doc.moveTo(x + total(i), yy).lineTo(x + total(i), yy + t).stroke();
    }
    return yy + t;
  };

  doc.fontSize(ukuranJudul || ukuran);
  let yy = gambarBaris(kolom.map((k) => k.judul), y, true, "#E5E9EE");
  baris.forEach((sel, i) => {
    yy = gambarBaris(sel, yy, barisTebal.includes(i));
  });
  return yy;
}

// =========================================================
// HALAMAN
// =========================================================

function halamanNominatif(doc, k) {
  doc.addPage({ size: "A4", layout: "landscape", margins: { top: 36, bottom: 36, left: 30, right: 30 } });
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  tulis(doc, "DAFTAR NOMINATIF", x, 36, { tebal: true, ukuran: 12, lebar: w, align: "center" });
  doc.font(ISI).fontSize(HURUF).text(untukPembayaran(k), x, doc.y + 2, { width: w, align: "center" });

  let y = doc.y + 8;
  y = barisLabel(doc, "Tanggal SPD", tanggalPanjang(k.tanggalSpd), y, { xLabel: x, xTitik: x + 60, xIsi: x + 68, lebarIsi: 400, jarak: 1 });
  y = barisLabel(doc, "Akun", `${k.akun.kode} — ${k.akun.uraian}`, y, { xLabel: x, xTitik: x + 60, xIsi: x + 68, lebarIsi: 600, jarak: 6 });

  const jumlahJenis = (p, kunci) => p.rincian.filter((r) => kunci.includes(r.kunci)).reduce((a, r) => a + r.jumlah, 0);

  const kolom = [
    { judul: "No", lebar: 22, align: "center" },
    { judul: "Nama / NIP", lebar: 135 },
    { judul: "Gol", lebar: 30, align: "center" },
    { judul: "Jabatan", lebar: 95 },
    { judul: "Tujuan / Lama", lebar: 72 },
    { judul: "Uang Harian", lebar: 60, align: "right" },
    { judul: "Represen-tasi", lebar: 50, align: "right" },
    { judul: "Transport", lebar: 60, align: "right" },
    { judul: `Transport ${k.alatAngkut?.simpul || "Terminal"}`, lebar: 50, align: "right" },
    { judul: "Penginapan", lebar: 60, align: "right" },
    { judul: "Jumlah", lebar: 66, align: "right" },
  ];
  const sisa = w - kolom.reduce((a, c) => a + c.lebar, 0);
  kolom.push({ judul: "Keterangan", lebar: sisa });

  const sel = (n) => (n ? angka(n) : "-");
  const baris = k.peserta.map((p, i) => [
    i + 1,
    `${p.nama}\nNIP. ${p.nip || "-"}`,
    p.golongan || "-",
    p.jabatan || "-",
    `${k.kotaTujuan}\n${lamaHari(k.hari)}`,
    sel(jumlahJenis(p, ["harian"])),
    sel(jumlahJenis(p, ["representasi"])),
    sel(jumlahJenis(p, ["tiket", "transport", "darat"])),
    sel(jumlahJenis(p, ["taksiAsal", "taksiTujuan"])),
    sel(jumlahJenis(p, ["penginapan"])),
    angka(p.total),
    "",
  ]);
  const jumlahSemua = (kunci) => k.peserta.reduce((a, p) => a + jumlahJenis(p, kunci), 0);
  baris.push([
    "", "JUMLAH", "", "", "",
    sel(jumlahSemua(["harian"])),
    sel(jumlahSemua(["representasi"])),
    sel(jumlahSemua(["tiket", "transport", "darat"])),
    sel(jumlahSemua(["taksiAsal", "taksiTujuan"])),
    sel(jumlahSemua(["penginapan"])),
    angka(k.total),
    "",
  ]);

  y = tabel(doc, { x, y, kolom, baris, ukuran: 8, barisTebal: [baris.length - 1] });

  if (y + 120 > doc.page.height - doc.page.margins.bottom) {
    doc.addPage({ size: "A4", layout: "landscape", margins: { top: 36, bottom: 36, left: 30, right: 30 } });
    y = doc.page.margins.top;
  }
  doc.font(ISI).fontSize(HURUF).text(`Terbilang: ${terbilangRupiah(k.total)}`, x, y + 6, { width: w });
  const yTtd = doc.y + 14;
  const lebarTtd = 220;
  blokTtd(doc, { x: x + 20, y: yTtd, lebar: lebarTtd, judul: ["Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN"], ...k.pejabat.ppk });
  blokTtd(doc, { x: x + w - lebarTtd - 20, y: yTtd, lebar: lebarTtd, judul: ["Bendahara Pengeluaran", "Setjen Kemnaker"], ...k.pejabat.bendahara });
}

// Bingkai tipis sekeliling halaman, seperti cetakan lembar NOMI.
function bingkai(doc) {
  doc.lineWidth(0.8).rect(18, 18, doc.page.width - 36, doc.page.height - 36).stroke();
}

function garisGanda(doc, x, y, w) {
  doc.lineWidth(1.2).moveTo(x, y).lineTo(x + w, y).stroke();
  doc.lineWidth(0.5).moveTo(x, y + 3).lineTo(x + w, y + 3).stroke();
}

// Teks dalam kotak bergaris; mengembalikan y bawah kotak.
function kotakTeks(doc, isi, x, y, w, { minTinggi = 0, pad = 4, tebal = false, align = "left" } = {}) {
  doc.font(tebal ? TEBAL : ISI).fontSize(HURUF);
  const t = Math.max(minTinggi, doc.heightOfString(isi, { width: w - 2 * pad, align }) + 2 * pad);
  doc.lineWidth(0.6).rect(x, y, w, t).stroke();
  doc.text(isi, x + pad, y + pad, { width: w - 2 * pad, align });
  return y + t;
}

function halamanKwitansi(doc, k, p) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  doc.font(JUDUL_KWITANSI).fontSize(20).text("KWITANSI", x, 30, { width: w, align: "center", underline: true });
  let y = doc.y + 2;
  doc.lineWidth(1.2).moveTo(x, y).lineTo(x + w, y).stroke();
  y += 6;

  const opsiKepala = { xLabel: x, xTitik: x + 140, xIsi: x + 150, lebarIsi: w - 150, jarak: 1 };
  y = barisLabel(doc, "No. BKU", k.noBku, y, opsiKepala);
  y = barisLabel(doc, "Tahun Anggaran", k.tahunAnggaran, y, opsiKepala);
  y = barisLabel(doc, "Akun", k.akun.kode, y, opsiKepala);
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
  kotakTeks(doc, angka(p.total), xIsi + 26, y, 180, { pad: 3 });
  y += 36;

  doc.font(ISI).text("Banyaknya Uang", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  y = kotakTeks(doc, terbilangRupiah(p.total), xIsi, y, wIsi, { minTinggi: 40, pad: 8 }) + 16;

  doc.font(ISI).text("Untuk Pembayaran", x, y, { lineBreak: false });
  doc.text(":", xTitik, y, { lineBreak: false });
  y = kotakTeks(doc, untukPembayaran(k), xIsi, y, wIsi, { minTinggi: 66, align: "justify" }) + 8;

  garisGanda(doc, x, y, w);
  y += 12;

  const kol = w / 3;
  const ukuranNama = 8.5;
  tulis(doc, `Jakarta, ${tanggalPanjang(k.tanggalKembali)}`, x + 2 * kol, y, { lebar: kol, align: "center" });
  blokTtd(doc, { x, y, lebar: kol, ukuranNama, tebalNama: false, judul: ["Setuju dibayar", "Pejabat Pembuat Komitmen", "Biro Keuangan Kemnaker"], ...k.pejabat.ppk });
  blokTtd(doc, { x: x + kol, y, lebar: kol, ukuranNama, tebalNama: false, judul: ["Lunas dibayar", "Bendahara Pengeluaran", "Setjen Kemnaker"], ...k.pejabat.bendahara });
  blokTtd(doc, { x: x + 2 * kol, y, lebar: kol, ukuranNama, tebalNama: false, judul: ["", "Yang Menerima,", ""], nama: p.nama, nip: p.nip });
}

function halamanRincian(doc, k, p) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 40, right: 40 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  tulis(doc, "RINCIAN BIAYA PERJALANAN DINAS", x, 34, { tebal: true, ukuran: 13, lebar: w, align: "center" });
  let y = doc.y + 18;
  const opsi = { xLabel: x, xTitik: x + 165, xIsi: x + 180, lebarIsi: w - 180, jarak: 1 };
  y = barisLabel(doc, "Lampiran SPD Nomor", k.nomorSpd || "", y, opsi);
  y = barisLabel(doc, "Tanggal", tanggalPanjang(k.tanggalSpd), y, { ...opsi, jarak: 8 });

  // Tabel rincian: garis tepi + kolom, baris isi tanpa garis antar baris
  // (seperti lembar NOMI); hanya JUMLAH yang dipisah garis.
  const kNo = 24;
  const kJml = 115;
  const kKet = 48;
  const kUr = w - kNo - kJml - kKet;
  const xs = [x, x + kNo, x + kNo + kUr, x + kNo + kUr + kJml, x + w];
  const yAtas = y;
  doc.font(TEBAL).fontSize(HURUF);
  doc.text("NO.", xs[0] + 2, y + 3, { width: kNo - 4, align: "center" });
  doc.text("PERINCIAN BIAYA", xs[1], y + 3, { width: kUr, align: "center" });
  doc.text("JUMLAH", xs[2], y + 3, { width: kJml, align: "center" });
  doc.text("KET", xs[3], y + 3, { width: kKet, align: "center" });
  y += 18;
  doc.lineWidth(0.6).moveTo(x, y).lineTo(x + w, y).stroke();
  y += 8;

  doc.font(ISI).fontSize(HURUF);
  p.rincian.forEach((r, i) => {
    // Biaya PP (tiket, taksi) menaruh rutenya di kanan titik dua,
    // seperti "Transport : Jakarta - Bali PP" di lembar NOMI.
    const pp = r.volume === 1 && r.satuan === "PP";
    const judul = r.keterangan && !pp ? `${r.uraian} (${r.keterangan})` : r.uraian;
    doc.text(String(i + 1), xs[0], y, { width: kNo, align: "center" });
    doc.text(judul, xs[1] + 4, y, { width: 130 });
    doc.text(":", xs[1] + 140, y, { lineBreak: false });
    if (pp) {
      doc.text(r.keterangan || "", xs[1] + 152, y, { width: kUr - 158 });
    } else {
      doc.text(String(r.volume), xs[1] + 148, y, { width: 20, align: "right" });
      doc.text(r.satuan, xs[1] + 174, y, { lineBreak: false });
      doc.text("x", xs[1] + 218, y, { lineBreak: false });
      doc.text("Rp", xs[1] + 238, y, { lineBreak: false });
      doc.text(angka(r.tarif), xs[1] + 254, y, { width: kUr - 260, align: "right" });
    }
    doc.text("Rp", xs[2] + 4, y, { lineBreak: false });
    doc.text(angka(r.jumlah), xs[2] + 20, y, { width: kJml - 26, align: "right" });
    y = Math.max(doc.y, y + 14) + 12;
  });

  doc.lineWidth(0.6).moveTo(x, y).lineTo(x + w, y).stroke();
  doc.text("JUMLAH", xs[1] + 4, y + 3, { lineBreak: false });
  doc.text(":", xs[1] + 140, y + 3, { lineBreak: false });
  doc.text("Rp", xs[2] + 4, y + 3, { lineBreak: false });
  doc.text(angka(p.total), xs[2] + 20, y + 3, { width: kJml - 26, align: "right" });
  y += 17;
  doc.moveTo(x, y).lineTo(x + w, y).stroke();
  doc.rect(x, yAtas, w, y - yAtas).stroke();
  for (let i = 1; i < 4; i++) doc.moveTo(xs[i], yAtas).lineTo(xs[i], y).stroke();

  doc.font(TEBAL).text("TERBILANG", xs[1] + 4, y + 4, { lineBreak: false });
  doc.text(":", xs[1] + 140, y + 4, { lineBreak: false });
  doc.fontSize(HURUF - 1).text(terbilangRupiah(p.total), xs[1] + 152, y + 5, { width: w - kNo - 152 });
  doc.fontSize(HURUF);
  y = doc.y + 24;

  const kol = w / 2;
  tulis(doc, `Jakarta, ${tanggalPanjang(k.tanggalKembali)}`, x + kol, y, { lebar: kol, align: "center" });
  y += 22;
  blokTtd(doc, { x, y, lebar: kol, tebalNip: true, judul: ["Telah dibayar sejumlah", rp(p.total), "", "Bendahara Pengeluaran"], ...k.pejabat.bendahara });
  const yAkhir = blokTtd(doc, { x: x + kol, y, lebar: kol, tebalNip: true, judul: ["Telah menerima jumlah uang sebesar", rp(p.total), "", "Yang menerima,"], nama: p.nama, nip: p.nip });

  // Perhitungan SPD Rampung
  y = yAkhir + 16;
  doc.lineWidth(1).moveTo(x, y).lineTo(x + w, y).stroke();
  tulis(doc, "PERHITUNGAN SPD RAMPUNG", x, y + 14, { lebar: w, align: "center" });
  y = doc.y + 18;
  for (const [l, v] of [["Ditetapkan sejumlah", p.total], ["Yang telah dibayar semula", p.total], ["Sisa kurang/lebih", 0]]) {
    doc.font(ISI).fontSize(HURUF).text(l, x + 25, y, { lineBreak: false });
    doc.text(":", x + 245, y, { lineBreak: false });
    doc.text(angka(v), x + 280, y, { width: 80, align: "right" });
    y += 14;
  }

  blokTtd(doc, { x: x + kol, y: y + 22, lebar: kol, tebalNip: true, judul: ["Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Kemnaker"], tinggi: 60, ...k.pejabat.ppk });
}

function halamanSpd(doc, k, p) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 32, bottom: 30, left: 40, right: 40 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  doc.font(TEBAL).fontSize(HURUF).text("KEMENTERIAN KETENAGAKERJAAN", x, 30, { lineBreak: false });
  doc.text("SEKRETARIAT JENDERAL", x, 42, { width: 260, underline: true });

  const xKanan = x + w - 210;
  let y = 54;
  for (const [l, v] of [["Lembar Ke", ""], ["Kode Nomor", ""], ["N  o  m  o  r", k.nomorSpd]]) {
    doc.font(TEBAL).text(l, xKanan, y, { lineBreak: false });
    doc.text(":", xKanan + 105, y, { lineBreak: false });
    doc.font(ISI).text(v || "", xKanan + 115, y, { width: 95 });
    y += 12;
  }

  tulis(doc, "SURAT PERJALANAN DINAS (SPD)", x, y + 8, { tebal: true, ukuran: 11.5, lebar: w, align: "center", underline: true });
  y = doc.y + 3;

  const kNo = 26;
  const kUr = 245;
  const kIsi = w - kNo - kUr;
  const xIsi = x + kNo + kUr;

  // Kolom isi baris 3–7 di templat memakai huruf satu tingkat lebih besar.
  const baris = (no, uraian, isi, { minTinggi = 0, tebalIsi = false, ukuranIsi = HURUF } = {}) => {
    doc.font(ISI).fontSize(HURUF);
    const tU = doc.heightOfString(uraian, { width: kUr - 8 });
    doc.font(tebalIsi ? TEBAL : ISI).fontSize(ukuranIsi);
    const tI = doc.heightOfString(isi, { width: kIsi - 8 });
    doc.fontSize(HURUF);
    const t = Math.max(minTinggi, tU, tI) + 12;
    doc.lineWidth(0.6).rect(x, y, w, t).stroke();
    doc.moveTo(x + kNo, y).lineTo(x + kNo, y + t).stroke();
    doc.moveTo(xIsi, y).lineTo(xIsi, y + t).stroke();
    const yT = y + (t - Math.max(tU, tI)) / 2;
    doc.font(ISI).text(no, x, yT, { width: kNo, align: "center" });
    doc.text(uraian, x + kNo + 4, yT, { width: kUr - 8 });
    doc.font(tebalIsi ? TEBAL : ISI).fontSize(ukuranIsi).text(isi, xIsi + 4, yT, { width: kIsi - 8 });
    doc.fontSize(HURUF);
    y += t;
  };

  baris("1.", "Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Unit Sekretariat Jenderal Kementerian Ketenagakerjaan");
  // Nama tebal, NIP tebal — dua baris di kolom isi.
  baris("2.", "Nama /NIP pegawai yang melaksanakan perjalanan dinas", `${p.nama}\nNIP. ${p.nip || "-"}`, { tebalIsi: true });
  baris("3.", "a. Pangkat dan Golongan\nb. Jabatan/Instansi\nc. Tingkat Biaya Perjalanan Dinas",
    `a. ${p.golongan || "-"}\nb. ${p.jabatan || "-"}\nc. ${p.tingkatBiaya}`, { ukuranIsi: HURUF + 1 });
  baris("4", "a. Maksud Perjalanan Dinas", untukPembayaran(k), { minTinggi: 56, ukuranIsi: HURUF + 1 });

  // Baris 5: alat angkut yang tidak dipakai dicoret, seperti di templat.
  {
    const t = 24;
    doc.lineWidth(0.6).rect(x, y, w, t).stroke();
    doc.moveTo(x + kNo, y).lineTo(x + kNo, y + t).stroke();
    doc.moveTo(xIsi, y).lineTo(xIsi, y + t).stroke();
    doc.font(ISI).fontSize(HURUF).text("5.", x, y + 7, { width: kNo, align: "center" });
    doc.text("Alat Angkutan yang dipergunakan", x + kNo + 4, y + 7, { lineBreak: false });
    // Pesawat/kendaraan umum: format templat dengan coretan. Kereta api dan
    // kendaraan dinas ditulis apa adanya.
    const kode = k.alatAngkut?.kode || "umum";
    const dicoret = kode === "pesawat" ? "Kendaraan Umum" : "Pesawat";
    // Urutan di templat tetap "Kendaraan Umum / Pesawat"; yang tidak
    // dipakai diberi garis coret.
    let xx = xIsi + 4;
    const yy = y + 7;
    const tengah = yy + doc.currentLineHeight() / 2;
    const kataAlat = kode === "kereta" ? ["Kereta Api"] : kode === "dinas" ? ["Kendaraan Dinas"] : ["Kendaraan Umum", "Pesawat"];
    for (const [i, kata] of kataAlat.entries()) {
      const teksKata = i < kataAlat.length - 1 ? `${kata} / ` : kata;
      doc.text(teksKata, xx, yy, { lineBreak: false });
      if (kataAlat.length > 1 && kata === dicoret) {
        doc.lineWidth(0.6).moveTo(xx, tengah).lineTo(xx + doc.widthOfString(kata), tengah).stroke();
      }
      xx += doc.widthOfString(teksKata);
    }
    y += t;
  }

  baris("6.", "a. Tempat berangkat\nb. Tempat tujuan", `a. ${k.kotaAsal}\nb. ${k.kotaTujuan}          PP`, { ukuranIsi: HURUF + 1 });
  baris("7.", "a. Lamanya Perjalanan Dinas\nb. Tanggal berangkat\nc. Tanggal harus kembali / tiba di tempat baru *)",
    `a. ${lamaHari(k.hari)}\nb. ${tanggalPanjang(k.tanggalBerangkat)}\nc. ${tanggalPanjang(k.tanggalKembali)}`, { ukuranIsi: HURUF + 1 });

  // Baris 8: pengikut — sub-kolom Tanggal Lahir dan Keterangan.
  {
    const kTgl = kIsi * 0.55;
    const tJudul = 36;
    const tDaftar = 62;
    const t = tJudul + tDaftar;
    doc.lineWidth(0.6).rect(x, y, w, t).stroke();
    doc.moveTo(x + kNo, y).lineTo(x + kNo, y + t).stroke();
    doc.moveTo(xIsi, y).lineTo(xIsi, y + t).stroke();
    doc.moveTo(xIsi + kTgl, y).lineTo(xIsi + kTgl, y + t).stroke();
    doc.moveTo(x, y + tJudul).lineTo(x + w, y + tJudul).stroke();
    doc.font(ISI).fontSize(HURUF).text("8.", x, y + 13, { width: kNo, align: "center" });
    doc.text("Pengikut :    Nama", x + kNo + 4, y + 13, { lineBreak: false });
    doc.text("Tanggal Lahir", xIsi, y + 13, { width: kTgl, align: "center" });
    doc.text("Keterangan", xIsi + kTgl, y + 13, { width: kIsi - kTgl, align: "center" });
    doc.fontSize(8);
    for (let i = 0; i < 5; i++) doc.text(`${i + 1}.`, x + kNo + 14, y + tJudul + 8 + i * 11, { lineBreak: false });
    doc.fontSize(HURUF);
    y += t;
  }

  baris("9.", "Pembebanan Anggaran\na. Instansi\nb. Akun", `\na. KEMENTERIAN KETENAGAKERJAAN R.I.\nb. ${k.akun.kode}`);
  baris("10.", "Keterangan lain-lain", "", { minTinggi: 14 });

  // Dikeluarkan di / tanggal
  const xT = x + 280;
  y += 12;
  doc.font(ISI).fontSize(HURUF).text("DIKELUARKAN DI", xT, y, { lineBreak: false });
  doc.text(":", xT + 145, y, { lineBreak: false });
  doc.text("Jakarta", xT + 170, y, { lineBreak: false });
  y += 13;
  doc.text("TANGGAL", xT, y, { lineBreak: false });
  doc.text(":", xT + 145, y, { lineBreak: false });
  doc.text(tanggalPanjang(k.tanggalSpd), xT + 170, y, { lineBreak: false });
  y += 13;
  doc.lineWidth(0.6).moveTo(xT, y).lineTo(x + w, y).stroke();

  y += 16;
  blokTtd(doc, {
    x: x + 150, y, lebar: w - 150, tebalNip: true, tebalJudul: true, tinggi: 34,
    judul: ["PEJABAT PEMBUAT KOMITMEN", "BIRO KEUANGAN DAN BMN UNIT SEKRETARIAT JENDERAL", "KEMENTERIAN KETENAGAKERJAAN"],
    ...k.pejabat.ppk,
  });

  doc.fontSize(HURUF);
}

// Kop surat Kemnaker — kepala halaman Daftar Pengeluaran Riil.
// Mengembalikan y di bawah garis ganda.
function kopKemnaker(doc, x, y, w) {
  doc.font(NARROW_TEBAL).fontSize(15).text("KEMENTERIAN KETENAGAKERJAAN", x, y, { width: w, align: "center" });
  doc.font(NARROW).fontSize(13).text("SEKRETARIAT JENDERAL", x, doc.y, { width: w, align: "center" });
  doc.fontSize(10).text("Jalan Gatot Subroto Kav. 51 Jakarta Selatan 12950 telp 5255733 ext 280", x, doc.y, { width: w, align: "center" });
  const yGaris = doc.y + 4;
  garisGanda(doc, x, yGaris, w);
  doc.fontSize(HURUF);
  return yGaris + 4;
}

// Daftar Pengeluaran Riil — untuk biaya tanpa bukti (transport dalam
// kota). Hanya dibuat kalau peserta memang menerima biaya itu.
function itemRiil(p) {
  return p.rincian.filter((r) => r.kunci === "transport");
}

function halamanRiil(doc, k, p) {
  const asli = [ISI, TEBAL, HURUF];
  [ISI, TEBAL, HURUF] = [NARROW, NARROW_TEBAL, 11];
  try {
    isiHalamanRiil(doc, k, p);
  } finally {
    [ISI, TEBAL, HURUF] = asli;
  }
}

function isiHalamanRiil(doc, k, p) {
  const item = itemRiil(p);
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
  bingkai(doc);
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  const yKop = kopKemnaker(doc, x, 34, w);
  tulis(doc, "DAFTAR PENGELUARAN RIIL", x, yKop + 18, { tebal: true, ukuran: 13, lebar: w, align: "center" });
  let y = doc.y + 18;
  doc.font(ISI).fontSize(HURUF).text("Yang bertanda tangan di bawah ini :", x + 20, y);
  y = doc.y + 14;
  for (const [l, v] of [["Nama", p.nama], ["NIP", `NIP. ${p.nip || "-"}`], ["Jabatan", p.jabatan || "-"]]) {
    doc.font(ISI).text(l, x + 20, y, { lineBreak: false });
    doc.text(":", x + 160, y, { lineBreak: false });
    doc.font(TEBAL).text(v, x + 175, y, { width: w - 175 });
    y = doc.y + 14;
  }

  y += 8;
  const tahun = k.tahunAnggaran;
  doc.font(ISI).text(
    `Berdasarkan Surat Perjalanan Dinas (SPD) Nomor : ${k.nomorSpd || "          /BKU/     /" + tahun}    Tanggal : ${tanggalPanjang(k.tanggalSpd)}`,
    x + 8, y, { width: w - 8 },
  );
  doc.text("dengan ini kami menyatakan dengan sesungguhnya bahwa :", x, doc.y);
  y = doc.y + 22;

  doc.text("1.", x + 10, y, { lineBreak: false });
  doc.text("Biaya transport pegawai dan/atau biaya penginapan di bawah ini yang tidak dapat diperoleh bukti-bukti pengeluarannya, meliputi :", x + 25, y, { width: w - 40 });
  y = doc.y + 6;

  const kNo = 26;
  const kJml = 175;
  const kUr = w - kNo - kJml;
  const yAtas = y;
  doc.font(ISI).text("No.", x, y + 3, { width: kNo, align: "center" });
  doc.text("URAIAN", x + kNo, y + 3, { width: kUr, align: "center" });
  doc.text("JUMLAH", x + kNo + kUr, y + 3, { width: kJml, align: "center" });
  y += 16;
  doc.lineWidth(0.6).moveTo(x, y).lineTo(x + w, y).stroke();
  y += 22;
  const total = item.reduce((a, r) => a + r.jumlah, 0);
  item.forEach((r, i) => {
    const ur = `Biaya transportasi dalam kota ${r.keterangan || ""}`.trim() + (r.volume > 1 ? ` (${r.volume} x ${rp(r.tarif)})` : "");
    doc.text(`${i + 1}.`, x, y, { width: kNo, align: "center" });
    doc.text(ur, x + kNo + 4, y, { width: kUr - 8 });
    doc.text("Rp.", x + kNo + kUr + 4, y, { lineBreak: false });
    doc.text(`${angka(r.jumlah)} ,-`, x + kNo + kUr + 30, y, { width: kJml - 40, align: "right" });
    y = doc.y + 14;
  });
  y = Math.max(y, yAtas + 116);
  garisGanda(doc, x, y, w);
  doc.text("Jumlah", x + kNo, y + 5, { width: kUr, align: "center" });
  doc.font(TEBAL).text("Rp.", x + kNo + kUr + 4, y + 5, { lineBreak: false });
  doc.text(`${angka(total)} ,-`, x + kNo + kUr + 30, y + 5, { width: kJml - 40, align: "right" });
  y += 19;
  doc.lineWidth(0.6).rect(x, yAtas, w, y - yAtas).stroke();
  doc.moveTo(x + kNo, yAtas).lineTo(x + kNo, y).stroke();
  doc.moveTo(x + kNo + kUr, yAtas).lineTo(x + kNo + kUr, y).stroke();

  y += 10;
  doc.font(ISI).text("2.", x + 10, y, { lineBreak: false });
  doc.text(
    "Jumlah uang tersebut pada angka 1 di atas benar-benar dikeluarkan untuk pelaksanaan perjalanan dinas dimaksud dan apabila di kemudian hari terdapat kelebihan atas pembayaran, kami bersedia untuk menyetorkan kelebihan tersebut ke Kas Negara.",
    x + 25, y, { width: w - 40, align: "justify" },
  );
  y = doc.y + 12;
  doc.text("Demikian pernyataan ini kami buat dengan sebenarnya, untuk dipergunakan sebagaimana mestinya", x + 30, y, { width: w - 40 });
  y = doc.y + 26;

  const kol = w / 2;
  tulis(doc, `Jakarta, ${tanggalPanjang(k.tanggalKembali)}`, x + kol + 30, y, { lebar: kol - 30 });
  y += 14;
  blokTtd(doc, { x, y, lebar: kol, tebalNip: true, tinggi: 56, judul: ["Mengetahui / Menyetujui:", "PPK Biro Keuangan dan BMN", "DIPA Setjen Kemnaker"], ...k.pejabat.ppk });
  blokTtd(doc, { x: x + kol + 30, y, lebar: kol - 30, align: "left", tebalNip: true, garisNama: false, tinggi: 56, judul: ["", "Pelaksana Surat Perjalanan Dinas", ""], nama: p.nama, nip: p.nip });
}

// =========================================================
// PENULIS
// =========================================================

// Menulis PDF ke stream `tujuan` (mis. respons Express).
function tulisKwitansiPdf(kegiatan, tujuan) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    info: { Title: `Kwitansi Perjalanan Dinas ${kegiatan.kotaTujuan}`, Author: "SisKA Biro Keuangan dan BMN" },
  });
  pasangFontKwitansi(doc);
  doc.pipe(tujuan);

  // Urutan berkas: per peserta Kwitansi, Rincian, SPD, Daftar
  // Pengeluaran Riil; Daftar Nominatif seluruh peserta di akhir.
  for (const p of kegiatan.peserta) {
    halamanKwitansi(doc, kegiatan, p);
    halamanRincian(doc, kegiatan, p);
    halamanSpd(doc, kegiatan, p);
    if (itemRiil(p).length) halamanRiil(doc, kegiatan, p);
  }
  halamanNominatif(doc, kegiatan);

  doc.end();
  return doc;
}

module.exports = { tulisKwitansiPdf };
