// =========================================================
// PDF KWITANSI PERJALANAN DINAS
// =========================================================
//
// Meniru lembar "NOMI" (Excel) yang dipakai TU:
//   1. Per peserta: Kwitansi, Rincian Biaya + Perhitungan SPD
//      Rampung, SPD lembar depan, dan Daftar Pengeluaran Riil berkop
//      (hanya kalau ada biaya tanpa bukti, mis. transport dalam kota).
//   2. Form Bukti Kehadiran (dalam kota s.d. 8 jam saja).
//   3. Daftar Nominatif (landscape) — semua peserta, di akhir.
//
// Data masuk sudah dihitung oleh kwitansiTarif.hitungKegiatan(), jadi
// berkas ini hanya menata letak — tidak ada aturan PMK di sini.

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { terbilangRupiah, tanggalPanjang, pasangFont: pasangFontSpby, halamanSpby } = require("./spbyServisPdf");

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
const ARIAL = "Arial";
const ARIAL_TEBAL = "Arial-Tebal";

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

function pasangFontKwitansi(doc) {
  const daftar = [
    ["Tahoma", "tahoma.ttf", "Helvetica"],
    ["Tahoma-Tebal", "tahomabd.ttf", "Helvetica-Bold"],
    [NARROW, "arialn.ttf", "Helvetica"],
    [NARROW_TEBAL, "arialnb.ttf", "Helvetica-Bold"],
    [JUDUL_KWITANSI, "timesbi.ttf", "Times-BoldItalic"],
    [ARIAL, "arial.ttf", "Helvetica"],
    [ARIAL_TEBAL, "arialbd.ttf", "Helvetica-Bold"],
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

// =========================================================
// HALAMAN
// =========================================================

// =========================================================
// DAFTAR NOMINATIF (FORMAT "NOMI" TU)
// =========================================================
//
// Meniru lembar NOMINATIF berkas NOMI yang dipakai TU, tiga varian:
//   - Kota sekitar Jakarta (NOMI BEKASI): uang harian (tarif, jumlah),
//     representasi bila ada, dan transport lumpsum PMK (vol, tarif, jumlah).
//   - Luar kota lainnya (NOMI SOLO): tujuan, uang harian dan representasi
//     (vol, tarif, jumlah), taksi kota tujuan, taksi Jakarta, transport
//     (tiket + darat), penginapan (vol, tarif, jumlah).
//   - Dalam kota (SPJ koordinasi BNSP): tanggal, GOL, NIP, jabatan,
//     tujuan, transport per kali; uang harian bila > 8 jam.
// Ditandatangani PPK ("Setuju dibayar") dan operator pembuat daftar.

const KUNCI_SEKITAR = ["harian", "representasi", "darat"];

function nominatifSekitar(k) {
  return k.rute?.jenis === "sekitar" && k.peserta.every((p) => p.rincian.every((r) => KUNCI_SEKITAR.includes(r.kunci)));
}

// Kolom: { judul, lebar (relatif), align, nilai(p, i), bentuk: "rp" | "angka" | "teks", total }
function kolomNominatifNomi(k) {
  const ambil = (p, kunci) => p.rincian.find((r) => r.kunci === kunci);
  const jml = (p, ...kunci) => p.rincian.filter((r) => kunci.includes(r.kunci)).reduce((a, r) => a + r.jumlah, 0);
  const adaRep = k.peserta.some((p) => ambil(p, "representasi"));
  const no = { judul: "NO.", lebar: 3.5, align: "center", nilai: (p, i) => String(i + 1), bentuk: "teks" };
  const nama = { judul: "N A M A", lebar: 20, align: "left", nilai: (p) => p.nama, bentuk: "teks" };
  const jumlah = { judul: "JUMLAH", lebar: 10, nilai: (p) => p.total, bentuk: "rp", total: true };
  const ttd = { judul: "Tanda Terima", lebar: 7, align: "left", nilai: () => "", bentuk: "teks" };

  // Dalam kota (SPJ "koordinasi BNSP"): data pegawai lengkap, transport
  // per kali; uang harian dan representasi hanya bila ada (> 8 jam).
  if (k.jenis === "dalam") {
    const ada = (kunci) => k.peserta.some((p) => ambil(p, kunci));
    return [
      no,
      { ...nama, lebar: 16 },
      { judul: "", lebar: 7, align: "left", nilai: () => lamaHari(k.hari), bentuk: "teks" },
      { judul: "TANGGAL BERANGKAT", lebar: 8, align: "center", nilai: () => tanggalPanjang(k.tanggalBerangkat), bentuk: "teks" },
      { judul: "TANGGAL KEMBALI", lebar: 8, align: "center", nilai: () => tanggalPanjang(k.tanggalKembali), bentuk: "teks" },
      { judul: "GOL", lebar: 4, align: "center", nilai: (p) => p.golongan || "-", bentuk: "teks" },
      { judul: "NIP", lebar: 14, align: "center", nilai: (p) => p.nip || "-", bentuk: "teks" },
      { judul: "Jabatan", lebar: 15, align: "center", nilai: (p) => [p.jabatan, p.unit].filter(Boolean).join(" / ") || "-", bentuk: "teks" },
      { judul: "TUJUAN", lebar: 8, align: "center", nilai: () => k.tempat || k.kotaTujuan, bentuk: "teks" },
      ...(ada("harian")
        ? [
            { judul: "UANG HARIAN", lebar: 5, align: "center", nilai: (p) => String(ambil(p, "harian")?.volume || ""), bentuk: "teks" },
            { judul: "UANG HARIAN", lebar: 8, nilai: (p) => jml(p, "harian"), bentuk: "rp", total: true },
          ]
        : []),
      ...(ada("representasi")
        ? [{ judul: "Representatif", lebar: 8, nilai: (p) => jml(p, "representasi"), bentuk: "rp", total: true }]
        : []),
      { judul: "TRANSPORT (KALI)", lebar: 6, align: "center", nilai: (p) => String(ambil(p, "transport")?.volume || "-"), bentuk: "teks" },
      { judul: "TRANSPORT", lebar: 8, nilai: (p) => jml(p, "transport"), bentuk: "rp", total: true },
      { ...jumlah, lebar: 9 }, ttd,
    ];
  }

  if (nominatifSekitar(k)) {
    return [
      no, nama,
      { judul: "", lebar: 9.5, align: "left", nilai: () => lamaHari(k.hari), bentuk: "teks" },
      { judul: "UANG HARIAN", lebar: 10, nilai: (p) => ambil(p, "harian")?.tarif || 0, bentuk: "angka" },
      { judul: "UANG HARIAN", lebar: 10, nilai: (p) => jml(p, "harian"), bentuk: "rp", total: true },
      ...(adaRep
        ? [
            { judul: "REPRESENTATIF", lebar: 9, nilai: (p) => ambil(p, "representasi")?.tarif || 0, bentuk: "rp" },
            { judul: "REPRESENTATIF", lebar: 9, nilai: (p) => jml(p, "representasi"), bentuk: "rp", total: true },
          ]
        : []),
      { judul: "TRANSPORT", lebar: 7, align: "center", nilai: (p) => String(ambil(p, "darat")?.volume || 0), bentuk: "teks" },
      { judul: "TRANSPORT", lebar: 9, nilai: (p) => ambil(p, "darat")?.tarif || 0, bentuk: "rp" },
      { judul: "TRANSPORT", lebar: 9, nilai: (p) => jml(p, "darat"), bentuk: "angka", total: true },
      { ...jumlah, lebar: 12 }, ttd,
    ];
  }

  // Taksi kota tujuan diberi nama kotanya, seperti "TAKSI Surakarta".
  const ketTaksi = k.peserta.flatMap((p) => p.rincian).find((r) => r.kunci === "taksiTujuan")?.keterangan;
  const kotaTaksi = (ketTaksi || k.kotaTujuan).replace(/\s*PP$/, "").replace(/^(Kota|Kab\.?|Kabupaten)\s+/i, "");
  const volume = (kunci) => (p) => (ambil(p, kunci) ? String(ambil(p, kunci).volume) : "");
  return [
    no, nama,
    { judul: "TUJUAN", lebar: 9, align: "left", nilai: () => k.tempat || k.kotaTujuan, bentuk: "teks" },
    { judul: "UANG HARIAN", lebar: 5, align: "center", nilai: volume("harian"), bentuk: "teks" },
    { judul: "UANG HARIAN", lebar: 7, nilai: (p) => ambil(p, "harian")?.tarif || 0, bentuk: "angka" },
    { judul: "UANG HARIAN", lebar: 8, nilai: (p) => jml(p, "harian"), bentuk: "rp", total: true },
    { judul: "Representatif", lebar: 5, align: "center", nilai: volume("representasi"), bentuk: "teks" },
    { judul: "Representatif", lebar: 7, nilai: (p) => ambil(p, "representasi")?.tarif || 0, bentuk: "rp" },
    { judul: "Representatif", lebar: 7, nilai: (p) => jml(p, "representasi"), bentuk: "rp", total: true },
    { judul: `TAKSI ${kotaTaksi}`, lebar: 7.5, nilai: (p) => jml(p, "taksiTujuan"), bentuk: "angka", total: true },
    { judul: "TAKSI Jakarta", lebar: 7.5, nilai: (p) => jml(p, "taksiAsal"), bentuk: "rp", total: true },
    { judul: "TRANSPORT", lebar: 8, nilai: (p) => jml(p, "tiket", "darat"), bentuk: "angka", total: true },
    { judul: "PENGINAPAN", lebar: 5.5, align: "center", nilai: volume("penginapan"), bentuk: "teks" },
    { judul: "PENGINAPAN", lebar: 7.5, nilai: (p) => ambil(p, "penginapan")?.tarif || 0, bentuk: "rp" },
    { judul: "PENGINAPAN", lebar: 7.5, nilai: (p) => jml(p, "penginapan"), bentuk: "rp", total: true },
    jumlah, ttd,
  ];
}

function halamanNominatifNomi(doc, k) {
  const halaman = () => doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 24, right: 24 } });
  halaman();
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);
  const kolom = kolomNominatifNomi(k);
  const rapat = kolom.length > 12;
  const huruf = rapat ? 7.5 : 9;

  // Kepala: uraian di kanan, SPD dan Akun di kiri.
  const xUraian = x + w * 0.4;
  doc.font(TEBAL).fontSize(10).text("Daftar Nominatif:", x + w * 0.26, 32, { width: w * 0.14 - 4, align: "right" });
  doc.font(ISI).fontSize(11).text(untukPembayaran(k), xUraian, 30, { width: x + w - xUraian, align: "justify" });
  let y = Math.max(doc.y + 10, 96);
  doc.font(TEBAL).fontSize(10);
  doc.text("SPD", x, y - 32, { lineBreak: false });
  doc.text(`:  ${tanggalPanjang(k.tanggalSpd)}`, x + 34, y - 32, { lineBreak: false });
  doc.text("Akun", x, y - 17, { lineBreak: false });
  doc.text(`:  ${k.akun.kode}`, x + 34, y - 17, { lineBreak: false });

  const skala = w / kolom.reduce((a, c) => a + c.lebar, 0);
  const xs = kolom.reduce((a, c) => [...a, a[a.length - 1] + c.lebar * skala], [x]);

  const isiSel = (c, nilai, i, yy, h, tebal = false) => {
    const x0 = xs[i] + 3;
    const lebar = xs[i + 1] - xs[i] - 6;
    doc.font(tebal ? TEBAL : ISI).fontSize(huruf);
    if (c.bentuk === "teks") {
      // Teks panjang (nama, tujuan) boleh dua baris, ditengahkan tegak.
      const isi = String(nilai ?? "");
      const th = Math.min(h - 2, doc.heightOfString(isi, { width: lebar }));
      doc.text(isi, x0, yy + (h - th) / 2, { width: lebar, align: c.align || "left", height: h - 2, ellipsis: true });
      return;
    }
    const ty = yy + (h - doc.currentLineHeight()) / 2;
    const teks = nilai ? angka(nilai) : "-";
    // "Rp" di kiri sel hanya kalau muat berdampingan dengan angkanya.
    if (c.bentuk === "rp" && doc.widthOfString(`Rp ${teks}`) <= lebar) doc.text("Rp", x0, ty, { lineBreak: false });
    doc.text(teks, x0, ty, { width: lebar, align: "right", lineBreak: false });
  };

  const kepalaTabel = () => {
    const tKepala = 28;
    doc.lineWidth(1).moveTo(x, y).lineTo(x + w, y).stroke();
    kolom.forEach((c, i) => {
      const lebar = xs[i + 1] - xs[i] - 4;
      // Huruf dikecilkan sampai kata terpanjang muat (tanpa memotong kata).
      let ukuran = rapat ? 7.5 : 8.5;
      doc.font(TEBAL).fontSize(ukuran);
      const kataTerpanjang = () => Math.max(...c.judul.split(/\s+/).map((kata) => doc.widthOfString(kata)), 0);
      while (ukuran > 5 && kataTerpanjang() > lebar) doc.fontSize((ukuran -= 0.5));
      const th = doc.heightOfString(c.judul, { width: lebar, align: "center" });
      doc.text(c.judul, xs[i] + 2, y + (tKepala - th) / 2 + 1, { width: lebar, align: "center" });
    });
    y += tKepala;
    doc.lineWidth(1).moveTo(x, y).lineTo(x + w, y).stroke();
    return y - tKepala;
  };
  let yTabel = kepalaTabel();
  const tutupKolom = (yAkhir) => xs.forEach((xx) => doc.lineWidth(0.6).moveTo(xx, yTabel).lineTo(xx, yAkhir).stroke());

  // Isi: garis antarbaris putus-putus seperti cetakan Excel.
  const tBaris = 25;
  k.peserta.forEach((p, i) => {
    if (y + tBaris > doc.page.height - 150) {
      doc.lineWidth(1).moveTo(x, y).lineTo(x + w, y).stroke();
      tutupKolom(y);
      halaman();
      y = doc.page.margins.top;
      yTabel = kepalaTabel();
    }
    kolom.forEach((c, j) => isiSel(c, c.nilai(p, i), j, y, tBaris));
    y += tBaris;
    if (i < k.peserta.length - 1) {
      doc.save().lineWidth(0.5).dash(2, { space: 2 }).moveTo(x, y).lineTo(x + w, y).stroke().undash().restore();
    }
  });

  // Baris jumlah dengan garis ganda di atas.
  doc.lineWidth(1).moveTo(x, y).lineTo(x + w, y).stroke();
  doc.lineWidth(0.5).moveTo(x, y + 2.5).lineTo(x + w, y + 2.5).stroke();
  const tJumlah = 20;
  doc.font(TEBAL).fontSize(10).text("J u m l a h", xs[1], y + 6, { width: xs[2] - xs[1], align: "center", lineBreak: false });
  kolom.forEach((c, j) => {
    if (c.total) isiSel(c, k.peserta.reduce((a, p, i) => a + c.nilai(p, i), 0), j, y + 2, tJumlah, true);
  });
  y += tJumlah + 2;
  doc.lineWidth(1).moveTo(x, y).lineTo(x + w, y).stroke();
  tutupKolom(y);

  // Tanda tangan: PPK (setuju dibayar) dan operator pembuat daftar.
  if (y + 130 > doc.page.height - doc.page.margins.bottom) {
    halaman();
    y = doc.page.margins.top;
  }
  const pembuat = k.pembuat || {};
  const lebarTtd = 280;
  const xKanan = x + w - lebarTtd;
  doc.font(TEBAL).fontSize(10).text(`Jakarta, ${tanggalPanjang(k.tanggalKembali)}`, xKanan, y + 14, { width: lebarTtd, align: "center" });
  const yTtd = y + 42;
  const asli = [ISI, HURUF];
  [ISI, HURUF] = [TEBAL, 10];
  try {
    blokTtd(doc, {
      x: x + 20, y: yTtd, lebar: lebarTtd, tinggi: 56, tebalNip: true,
      judul: ["Setuju dibayar :", "Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Setjen Kemnaker"], ...k.pejabat.ppk,
    });
    blokTtd(doc, {
      x: xKanan, y: yTtd, lebar: lebarTtd, tinggi: 56, tebalNip: true,
      judul: ["", "Pembuat daftar,", ""], nama: pembuat.nama || "", nip: pembuat.nip || "",
    });
  } finally {
    [ISI, HURUF] = asli;
  }
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
    `a. ${p.golongan || "-"}\nb. ${[p.jabatan, p.unit].filter(Boolean).join(" / ") || "-"}\nc. ${p.tingkatBiaya}`, { ukuranIsi: HURUF + 1 });
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
// Biaya yang lazim tanpa bukti: transport dalam kota, transport darat,
// dan transport ke/dari bandara/stasiun/terminal (luar kota).
const KUNCI_RIIL = ["transport", "darat", "taksiAsal", "taksiTujuan"];

function itemRiil(p) {
  return p.rincian.filter((r) => KUNCI_RIIL.includes(r.kunci));
}

function uraianRiil(r) {
  const ket = r.keterangan ? ` ${r.keterangan}` : "";
  if (r.kunci === "transport") return `Biaya transportasi dalam kota${ket}`;
  if (r.kunci === "darat") return `Biaya transport darat${ket}`;
  return `Biaya ${r.uraian.toLowerCase()}${ket}`;
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
    const ur = uraianRiil(r) + (r.volume > 1 ? ` (${r.volume} x ${rp(r.tarif)})` : "");
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
// FORM BUKTI KEHADIRAN — DALAM KOTA S.D. 8 JAM
// =========================================================
//
// Satu lembar untuk seluruh peserta (landscape, kop Kemnaker). Penugasan
// lebih dari sehari diisi per hari: tiap hari satu blok berisi semua
// peserta, dengan Hari, Tanggal, dan kolom pejabat pengesah digabung
// sepanjang blok seperti templat. Nama/jabatan/tanda tangan pejabat di
// tempat tujuan dikosongkan untuk diisi tangan.

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function daftarTanggal(dari, sampai) {
  const hasil = [];
  const t = new Date(`${dari}T00:00:00Z`);
  const akhir = new Date(`${sampai || dari}T00:00:00Z`);
  while (t <= akhir && hasil.length < 60) {
    hasil.push({ iso: t.toISOString().slice(0, 10), hari: NAMA_HARI[t.getUTCDay()] });
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return hasil;
}

const KOP_GAMBAR = path.join(__dirname, "..", "assets", "images", "kop-kemnaker.png");
const KOP_RASIO = 178 / 804; // tinggi/lebar kop-kemnaker.png

function halamanBuktiKehadiran(doc, k) {
  const BARIS = 30;
  // Lebar kolom mengikuti templat Excel (A..G), diskalakan ke lebar isi.
  const PROPORSI = [13.8, 29.5, 10.5, 24, 22.5, 18.2, 20.9];
  let xs;
  let y;

  const sel = (isi, x0, x1, y0, h, { tebal = true, ukuran = 11 } = {}) => {
    doc.lineWidth(0.6).rect(x0, y0, x1 - x0, h).stroke();
    doc.font(tebal ? ARIAL_TEBAL : ARIAL).fontSize(ukuran);
    const th = doc.heightOfString(isi, { width: x1 - x0 - 6, align: "center" });
    doc.text(isi, x0 + 3, y0 + (h - th) / 2, { width: x1 - x0 - 6, align: "center" });
  };

  const kepala = () => {
    doc.addPage({ size: "A4", layout: "landscape", margins: { top: 28, bottom: 28, left: 40, right: 40 } });
    const x = doc.page.margins.left;
    const w = lebarIsi(doc);
    const total = PROPORSI.reduce((a, b) => a + b, 0);
    xs = PROPORSI.reduce((a, p) => [...a, a[a.length - 1] + (p / total) * w], [x]);
    y = doc.page.margins.top;
    if (fs.existsSync(KOP_GAMBAR)) {
      const lebarKop = w * 0.8;
      doc.image(KOP_GAMBAR, x, y, { width: lebarKop });
      y += lebarKop * KOP_RASIO + 6;
      doc.lineWidth(1).moveTo(x, y).lineTo(x + w, y).stroke();
      y += 16;
    } else {
      y = kopKemnaker(doc, x, y, w) + 14;
    }
    doc.font(ARIAL_TEBAL).fontSize(12);
    doc.text("Form Bukti Kehadiran Pelaksanaan Perjalanan Dinas Jabatan", x, y, { width: w, align: "center" });
    doc.text("Dalam Kota sampai dengan 8 (delapan) jam", x, doc.y + 1, { width: w, align: "center" });
    y = doc.y + 14;

    // Kepala tabel dua tingkat + baris nomor kolom.
    const t1 = 20;
    ["No", "Pelaksana SPD", "Hari", "Tanggal"].forEach((s, i) => sel(s, xs[i], xs[i + 1], y, 2 * t1));
    sel("Pejabat/Petugas yang mengesahkan", xs[4], xs[7], y, t1);
    ["Nama", "Jabatan", "Tanda Tangan"].forEach((s, i) => sel(s, xs[4 + i], xs[5 + i], y + t1, t1));
    y += 2 * t1;
    for (let i = 0; i < 7; i++) sel(`(${i + 1})`, xs[i], xs[i + 1], y, 16, { tebal: false, ukuran: 9 });
    y += 16;
  };

  const tulisSel = (isi, i, y0, h, align = "center") => {
    doc.font(ARIAL).fontSize(10);
    const lebar = xs[i + 1] - xs[i] - 8;
    const th = Math.min(h - 4, doc.heightOfString(isi, { width: lebar, align }));
    doc.text(isi, xs[i] + 4, y0 + Math.max(2, (h - th) / 2), { width: lebar, align, height: h - 2, ellipsis: true });
  };

  kepala();
  const batasBawah = () => doc.page.height - doc.page.margins.bottom;
  let no = 1;
  for (const hari of daftarTanggal(k.tanggalBerangkat, k.tanggalKembali)) {
    let sisa = [...k.peserta];
    while (sisa.length) {
      if (batasBawah() - y < BARIS) kepala();
      const muat = Math.floor((batasBawah() - y) / BARIS);
      const blok = sisa.slice(0, muat);
      sisa = sisa.slice(muat);
      const yAwal = y;
      for (const p of blok) {
        doc.lineWidth(0.6).rect(xs[0], y, xs[1] - xs[0], BARIS).stroke();
        doc.rect(xs[1], y, xs[2] - xs[1], BARIS).stroke();
        tulisSel(String(no++), 0, y, BARIS);
        tulisSel(p.nama, 1, y, BARIS, "left");
        y += BARIS;
      }
      // Hari, Tanggal, dan pejabat pengesah: satu sel sepanjang blok.
      for (let i = 2; i < 7; i++) doc.lineWidth(0.6).rect(xs[i], yAwal, xs[i + 1] - xs[i], y - yAwal).stroke();
      tulisSel(hari.hari, 2, yAwal, y - yAwal);
      tulisSel(tanggalPanjang(hari.iso), 3, yAwal, y - yAwal);
    }
  }
  doc.font(ISI).fontSize(HURUF);
}

// SPBY per peserta, memakai halaman yang sama dengan SPBY service
// kendaraan. Akun 026.01.WA.2158.EBA.994.002.A.524111 dipecah:
// kegiatan/output/komponen "2158.EBA.994.002.A" dan kode akun "524111".
function halamanSpbyPerdin(doc, k, p) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 36, right: 36 } });
  const bagian = k.akun.kode.split(".");
  const kodeAkun = bagian.pop();
  const kegiatan = bagian.slice(3).join(".") || k.akun.kode;
  halamanSpby(doc, {
    tanggalSurat: k.tanggalKembali,
    tanggalServis: k.tanggalKembali,
    nomor: "",
    biaya: p.total,
    bengkel: p.nama,
    uraianPembayaran: untukPembayaran(k),
    kegiatan,
    akun: kodeAkun,
    bendahara: k.pejabat.bendahara,
    ppk: k.pejabat.ppk,
  });
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
  pasangFontSpby(doc);
  doc.pipe(tujuan);

  // Urutan berkas: per peserta SPBY, Kwitansi, Rincian, SPD, Daftar
  // Pengeluaran Riil (bila ada); Daftar Nominatif seluruh peserta di akhir.
  for (const p of kegiatan.peserta) {
    halamanSpbyPerdin(doc, kegiatan, p);
    halamanKwitansi(doc, kegiatan, p);
    halamanRincian(doc, kegiatan, p);
    halamanSpd(doc, kegiatan, p);
    if (itemRiil(p).length) halamanRiil(doc, kegiatan, p);
  }
  if (kegiatan.sampai8Jam) halamanBuktiKehadiran(doc, kegiatan);
  halamanNominatifNomi(doc, kegiatan);

  doc.end();
  return doc;
}

module.exports = { tulisKwitansiPdf };
