// =========================================================
// PDF KWITANSI PERJALANAN DINAS
// =========================================================
//
// Meniru lembar "NOMI" (Excel) yang dipakai TU:
//   1. Daftar Nominatif (landscape) — semua peserta.
//   2. Per peserta: Kwitansi, Rincian Biaya + Perhitungan SPD
//      Rampung, dan SPD lembar depan.
//
// Data masuk sudah dihitung oleh kwitansiTarif.hitungKegiatan(), jadi
// berkas ini hanya menata letak — tidak ada aturan PMK di sini.

const PDFDocument = require("pdfkit");
const { pasangFont, terbilangRupiah, tanggalPanjang } = require("./spbyServisPdf");

const angka = (n) => Math.floor(Number(n) || 0).toLocaleString("id-ID");
const rp = (n) => `Rp ${angka(n)},-`;

const HURUF = 10;
const ISI = "Isi";
const TEBAL = "Isi-Tebal";

// "Biaya perjalanan dinas dalam rangka ..." — maksud diketik bebas,
// awalan "dalam rangka" tidak digandakan kalau sudah diketik user.
function untukPembayaran(k) {
  const m = k.maksud.replace(/^perjalanan dinas\s*/i, "").replace(/^dalam rangka\s*/i, "");
  const tujuan = k.tempat ? ` di ${k.tempat}` : "";
  return `Biaya perjalanan dinas dalam rangka ${m}${tujuan} pada tanggal ${rentangTanggal(k)}`;
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
function blokTtd(doc, { x, y, lebar, judul = [], nama, nip, tinggi = 48, align = "center", ukuranNama = HURUF }) {
  doc.font(ISI).fontSize(HURUF);
  const tBaris = doc.currentLineHeight(true);
  judul.forEach((j, i) => {
    if (j) doc.text(j, x, y + i * tBaris, { width: lebar, align, lineBreak: false });
  });
  let yy = y + judul.length * tBaris + tinggi;
  doc.font(TEBAL).fontSize(ukuranNama).text(nama || "", x, yy, { width: lebar, align, underline: true });
  yy = doc.y;
  doc.fontSize(HURUF);
  if (nip !== undefined) {
    doc.font(ISI).text(nip ? `NIP. ${nip}` : "NIP. -", x, yy, { width: lebar, align });
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
  doc.font(ISI).fontSize(HURUF).text(untukPembayaran(k).replace(/^Biaya p/, "P"), x, doc.y + 2, { width: w, align: "center" });

  let y = doc.y + 8;
  y = barisLabel(doc, "Tanggal SPD", tanggalPanjang(k.tanggalSpd), y, { xLabel: x, xTitik: x + 60, xIsi: x + 68, lebarIsi: 400, jarak: 1 });
  y = barisLabel(doc, "Akun", `${k.akun.kode} — ${k.akun.uraian}`, y, { xLabel: x, xTitik: x + 60, xIsi: x + 68, lebarIsi: 600, jarak: 6 });

  const luar = k.jenis === "luar";
  const jumlahJenis = (p, kunci) => p.rincian.filter((r) => kunci.includes(r.kunci)).reduce((a, r) => a + r.jumlah, 0);

  const kolom = [
    { judul: "No", lebar: 22, align: "center" },
    { judul: "Nama / NIP", lebar: 135 },
    { judul: "Gol", lebar: 30, align: "center" },
    { judul: "Jabatan", lebar: 95 },
    { judul: "Tujuan / Lama", lebar: 72 },
    { judul: "Uang Harian", lebar: 60, align: "right" },
    { judul: "Represen-tasi", lebar: 50, align: "right" },
    { judul: luar ? "Tiket" : "Transport", lebar: 60, align: "right" },
    { judul: "Taksi", lebar: 50, align: "right" },
    { judul: "Penginapan", lebar: 60, align: "right" },
    { judul: "Jumlah", lebar: 66, align: "right" },
  ];
  const sisa = w - kolom.reduce((a, c) => a + c.lebar, 0);
  kolom.push({ judul: "Tanda Tangan", lebar: sisa });

  const sel = (n) => (n ? angka(n) : "-");
  const baris = k.peserta.map((p, i) => [
    i + 1,
    `${p.nama}\nNIP. ${p.nip || "-"}`,
    p.golongan || "-",
    p.jabatan || "-",
    `${k.kotaTujuan}\n${lamaHari(k.hari)}`,
    sel(jumlahJenis(p, ["harian"])),
    sel(jumlahJenis(p, ["representasi"])),
    sel(jumlahJenis(p, ["tiket", "transport"])),
    sel(jumlahJenis(p, ["taksiAsal", "taksiTujuan"])),
    sel(jumlahJenis(p, ["penginapan"])),
    angka(p.total),
    `${i + 1}. ........`,
  ]);
  const jumlahSemua = (kunci) => k.peserta.reduce((a, p) => a + jumlahJenis(p, kunci), 0);
  baris.push([
    "", "JUMLAH", "", "", "",
    sel(jumlahSemua(["harian"])),
    sel(jumlahSemua(["representasi"])),
    sel(jumlahSemua(["tiket", "transport"])),
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

function halamanKwitansi(doc, k, p) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 50, bottom: 50, left: 45, right: 45 } });
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  // Kepala kanan atas — kode akun 36 karakter harus muat satu baris.
  const xKanan = x + w - 290;
  let y = 50;
  for (const [l, v] of [["No. BKU", k.noBku], ["Tahun Anggaran", k.tahunAnggaran], ["Akun", k.akun.kode]]) {
    y = barisLabel(doc, l, v, y, { xLabel: xKanan, xTitik: xKanan + 78, xIsi: xKanan + 86, lebarIsi: 204, jarak: 2 });
  }

  tulis(doc, "KWITANSI", x, y + 16, { tebal: true, ukuran: 16, lebar: w, align: "center", underline: true });
  y = doc.y + 24;

  const opsi = { xLabel: x, xTitik: x + 110, xIsi: x + 120, lebarIsi: w - 120, jarak: 12 };
  y = barisLabel(doc, "Sudah Terima Dari", "Kuasa Pengguna Anggaran DIPA Setjen Kemnaker", y, opsi);

  // Banyaknya uang dalam kotak berlatar, seperti cetakan kwitansi.
  doc.font(TEBAL).fontSize(HURUF);
  const teksTerbilang = `# ${terbilangRupiah(p.total)} #`;
  const tKotak = doc.heightOfString(teksTerbilang, { width: w - 128 }) + 10;
  doc.font(ISI).text("Banyaknya Uang", x, y + 5, { lineBreak: false });
  doc.text(":", x + 110, y + 5, { lineBreak: false });
  doc.rect(x + 120, y, w - 120, tKotak).fill("#EEF3F8").fillColor("black");
  doc.font(TEBAL).text(teksTerbilang, x + 124, y + 5, { width: w - 128, oblique: true });
  y += tKotak + 12;

  y = barisLabel(doc, "Untuk Pembayaran", untukPembayaran(k), y, { ...opsi, jarak: 20 });

  // Jumlah dalam kotak bergaris
  doc.lineWidth(1).rect(x, y, 200, 28).stroke();
  tulis(doc, rp(p.total), x + 8, y + 8, { tebal: true, ukuran: 13 });
  y += 50;

  const kol = w / 3;
  tulis(doc, `Jakarta, ${tanggalPanjang(k.tanggalKembali)}`, x + 2 * kol, y, { lebar: kol, align: "center" });
  y += 14;
  const ukuranNama = 8.5; // nama bergelar panjang tetap satu baris di kolom sepertiga
  blokTtd(doc, { x, y, lebar: kol, ukuranNama, judul: ["Setuju dibayar", "Pejabat Pembuat Komitmen", "Biro Keuangan Kemnaker"], ...k.pejabat.ppk });
  blokTtd(doc, { x: x + kol, y, lebar: kol, ukuranNama, judul: ["Lunas dibayar", "Bendahara Pengeluaran", "Setjen Kemnaker"], ...k.pejabat.bendahara });
  blokTtd(doc, { x: x + 2 * kol, y, lebar: kol, ukuranNama, judul: ["", "Yang Menerima,", ""], nama: p.nama, nip: p.nip });
}

function halamanRincian(doc, k, p) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 50, bottom: 50, left: 56, right: 56 } });
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  tulis(doc, "RINCIAN BIAYA PERJALANAN DINAS", x, 50, { tebal: true, ukuran: 12, lebar: w, align: "center" });
  let y = doc.y + 12;
  const opsi = { xLabel: x, xTitik: x + 110, xIsi: x + 120, lebarIsi: w - 120, jarak: 2 };
  y = barisLabel(doc, "Lampiran SPD Nomor", k.nomorSpd || "", y, opsi);
  y = barisLabel(doc, "Tanggal", tanggalPanjang(k.tanggalSpd), y, { ...opsi, jarak: 10 });

  const uraian = (r) => {
    const ket = r.keterangan ? ` (${r.keterangan})` : "";
    if (r.volume === 1 && r.satuan === "PP") return `${r.uraian}${ket}`;
    return `${r.uraian}${ket}: ${r.volume} ${r.satuan} x ${rp(r.tarif)}`;
  };

  const baris = p.rincian.map((r, i) => [i + 1, uraian(r), rp(r.jumlah), ""]);
  baris.push(["", "JUMLAH", rp(p.total), ""]);
  y = tabel(doc, {
    x, y,
    kolom: [
      { judul: "No.", lebar: 30, align: "center" },
      { judul: "Perincian Biaya", lebar: w - 30 - 120 - 90 },
      { judul: "Jumlah", lebar: 120, align: "right" },
      { judul: "Keterangan", lebar: 90 },
    ],
    baris,
    barisTebal: [baris.length - 1],
  });

  doc.font(ISI).fontSize(HURUF).text(`Terbilang: ${terbilangRupiah(p.total)}`, x, y + 6, { width: w, oblique: true });
  y = doc.y + 16;

  const kol = w / 2;
  tulis(doc, `Jakarta, ${tanggalPanjang(k.tanggalKembali)}`, x + kol, y, { lebar: kol, align: "center" });
  y += 14;
  blokTtd(doc, { x, y, lebar: kol, judul: ["Telah dibayar sejumlah", rp(p.total), "Bendahara Pengeluaran"], ...k.pejabat.bendahara });
  const yAkhir = blokTtd(doc, { x: x + kol, y, lebar: kol, judul: ["Telah menerima jumlah uang sebesar", rp(p.total), "Yang menerima,"], nama: p.nama, nip: p.nip });

  // Perhitungan SPD Rampung
  y = yAkhir + 20;
  doc.lineWidth(0.8).moveTo(x, y).lineTo(x + w, y).stroke();
  tulis(doc, "PERHITUNGAN SPD RAMPUNG", x, y + 10, { tebal: true, lebar: w, align: "center" });
  y = doc.y + 8;
  const opsiR = { xLabel: x, xTitik: x + 150, xIsi: x + 160, lebarIsi: 160, jarak: 2 };
  y = barisLabel(doc, "Ditetapkan sejumlah", rp(p.total), y, opsiR);
  y = barisLabel(doc, "Yang telah dibayar semula", rp(p.total), y, opsiR);
  y = barisLabel(doc, "Sisa kurang/lebih", rp(0), y, opsiR);

  blokTtd(doc, { x: x + kol, y: y + 6, lebar: kol, judul: ["Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Kemnaker"], ...k.pejabat.ppk });
}

function halamanSpd(doc, k, p) {
  doc.addPage({ size: "A4", layout: "portrait", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
  const x = doc.page.margins.left;
  const w = lebarIsi(doc);

  tulis(doc, "KEMENTERIAN KETENAGAKERJAAN", x, 40, { tebal: true, lebar: 260 });
  tulis(doc, "SEKRETARIAT JENDERAL", x, doc.y, { tebal: true, lebar: 260 });

  const xKanan = x + w - 200;
  let y = 40;
  for (const [l, v] of [["Lembar Ke", ""], ["Kode Nomor", ""], ["Nomor", k.nomorSpd]]) {
    y = barisLabel(doc, l, v, y, { xLabel: xKanan, xTitik: xKanan + 68, xIsi: xKanan + 76, lebarIsi: 124, jarak: 2 });
  }

  tulis(doc, "SURAT PERJALANAN DINAS (SPD)", x, y + 14, { tebal: true, ukuran: 12, lebar: w, align: "center", underline: true });
  y = doc.y + 10;

  const kolom = [
    { judul: "No", lebar: 26, align: "center" },
    { judul: "Uraian", lebar: 210 },
    { judul: "Keterangan", lebar: w - 236 },
  ];
  const baris = [
    ["1.", "Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Unit Sekretariat Jenderal Kementerian Ketenagakerjaan"],
    ["2.", "Nama / NIP pegawai yang melaksanakan perjalanan dinas", `${p.nama}\nNIP. ${p.nip || "-"}`],
    ["3.", "a. Pangkat dan Golongan\nb. Jabatan / Instansi\nc. Tingkat Biaya Perjalanan Dinas",
      `a. ${p.golongan || "-"}\nb. ${p.jabatan || "-"}\nc. ${p.tingkatBiaya}`],
    ["4.", "Maksud Perjalanan Dinas", untukPembayaran(k).replace(/^Biaya p/, "P")],
    ["5.", "Alat angkutan yang dipergunakan", k.alatAngkut],
    ["6.", "a. Tempat berangkat\nb. Tempat tujuan", `a. ${k.kotaAsal}\nb. ${k.kotaTujuan}`],
    ["7.", "a. Lamanya Perjalanan Dinas\nb. Tanggal berangkat\nc. Tanggal harus kembali",
      `a. ${lamaHari(k.hari)}\nb. ${tanggalPanjang(k.tanggalBerangkat)}\nc. ${tanggalPanjang(k.tanggalKembali)}`],
    ["8.", "Pengikut : Nama", "-"],
    ["9.", "Pembebanan Anggaran\na. Instansi\nb. Akun", `\na. Kementerian Ketenagakerjaan R.I.\nb. ${k.akun.kode}`],
    ["10.", "Keterangan lain-lain", ""],
  ];
  y = tabel(doc, { x, y, kolom, baris });

  const xT = x + w - 250;
  y = barisLabel(doc, "Dikeluarkan di", "Jakarta", y + 14, { xLabel: xT, xTitik: xT + 80, xIsi: xT + 88, lebarIsi: 160, jarak: 2 });
  y = barisLabel(doc, "Tanggal", tanggalPanjang(k.tanggalSpd), y, { xLabel: xT, xTitik: xT + 80, xIsi: xT + 88, lebarIsi: 160, jarak: 8 });
  blokTtd(doc, {
    x: xT, y, lebar: 250,
    judul: ["Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Unit Sekretariat Jenderal", "Kementerian Ketenagakerjaan"],
    ...k.pejabat.ppk,
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
  pasangFont(doc);
  doc.pipe(tujuan);

  halamanNominatif(doc, kegiatan);
  for (const p of kegiatan.peserta) {
    halamanKwitansi(doc, kegiatan, p);
    halamanRincian(doc, kegiatan, p);
    halamanSpd(doc, kegiatan, p);
  }

  doc.end();
  return doc;
}

module.exports = { tulisKwitansiPdf };
