// =========================================================
// PEMBUAT PDF SPBY & KWITANSI LANGGANAN APLIKASI (BROWSER)
// =========================================================
//
// Menyusun berkas PDF 1.4 langsung di browser (Blob application/pdf)
// agar perubahan tata letak Kwitansi, SPBY, Rincian Biaya, dan nama
// PPK ("Alpha Sandro Adithyaswara, S.Sos.") langsung tampil seketika
// tanpa bergantung pada restart proses Node.js di terminal.

const LEBAR_A4 = 595.28;
const TINGGI_A4 = 841.89;

const NAMA_PPK = "Alpha Sandro Adithyaswara, S.Sos.";
const NIP_PPK = "198703232015031002";
const NAMA_BENDAHARA = "Prasetyo Muhammad Sidqi";
const NIP_BENDAHARA = "199611272018121001";

const BULAN_PANJANG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const SATUAN_KATA = [
  "", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
];

function terbilangDasar(n) {
  if (n < 12) return SATUAN_KATA[n];
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

function terbilangRupiah(angkaInput) {
  const n = Math.floor(Number(angkaInput) || 0);
  if (n <= 0) return "Nol rupiah";
  const teks = `${terbilangDasar(n)} rupiah`.replace(/\s+/g, " ").trim();
  return teks.charAt(0).toUpperCase() + teks.slice(1);
}

function tanggalPanjang(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  return `${Number(m[3])} ${BULAN_PANJANG[Number(m[2]) - 1]} ${m[1]}`;
}

function formatNipSpby(nip) {
  const bersih = String(nip || "").replace(/\s+/g, "");
  if (/^\d{18}$/.test(bersih)) {
    return `${bersih.slice(0, 8)} ${bersih.slice(8, 14)} ${bersih.slice(14, 15)} ${bersih.slice(15)}`;
  }
  return String(nip || "").trim();
}

const angka = (n) => Math.floor(Number(n) || 0).toLocaleString("id-ID");

// Pengukur lebar teks menggunakan canvas browser agar rata tengah/kanan presisi.
let ctxUkur = null;
function ukurTeks(teks, ukuran = 10, font = "F1") {
  if (!ctxUkur && typeof document !== "undefined") {
    ctxUkur = document.createElement("canvas").getContext("2d");
  }
  if (!ctxUkur) return String(teks || "").length * ukuran * 0.52;
  const keluarga = font === "F3" ? "bold italic" : font === "F2" ? "bold" : "normal";
  const namaFont = font === "F3" ? "'Times New Roman', serif" : "Arial, Helvetica, sans-serif";
  ctxUkur.font = `${keluarga} ${ukuran}px ${namaFont}`;
  return ctxUkur.measureText(String(teks || "")).width;
}

function pecahBaris(teks, lebarMaks, ukuran = 10, font = "F1") {
  const kata = String(teks || "").trim().split(/\s+/).filter(Boolean);
  if (!kata.length) return [""];
  const baris = [];
  let sekarang = kata[0];
  for (let i = 1; i < kata.length; i++) {
    const calon = `${sekarang} ${kata[i]}`;
    if (ukurTeks(calon, ukuran, font) <= lebarMaks) {
      sekarang = calon;
    } else {
      baris.push(sekarang);
      sekarang = kata[i];
    }
  }
  baris.push(sekarang);
  return baris;
}

function lolosPdf(teks) {
  return String(teks ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// Kelas kanvas halaman PDF 1.4 (koordinat y dari atas ke bawah seperti PDFKit).
class HalamanPdf {
  constructor() {
    this.perintah = [];
    this.gambar = [];
  }

  yPdf(yAtas) {
    return (TINGGI_A4 - yAtas).toFixed(2);
  }

  garis(x1, y1, x2, y2, tebal = 0.8) {
    this.perintah.push(
      `${tebal.toFixed(2)} w ${x1.toFixed(2)} ${this.yPdf(y1)} m ${x2.toFixed(2)} ${this.yPdf(y2)} l S`,
    );
  }

  kotak(x, yAtas, w, h, tebal = 0.8) {
    const yBawahPdf = (TINGGI_A4 - (yAtas + h)).toFixed(2);
    this.perintah.push(`${tebal.toFixed(2)} w ${x.toFixed(2)} ${yBawahPdf} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  }

  teks(isi, x, yAtas, { font = "F1", ukuran = 10, align = "left", lebar = 0, garisBawah = false } = {}) {
    const str = String(isi ?? "");
    if (!str) return;
    const wTeks = ukurTeks(str, ukuran, font);
    let xPakai = x;
    if (lebar > 0) {
      if (align === "center") xPakai = x + (lebar - wTeks) / 2;
      else if (align === "right") xPakai = x + lebar - wTeks;
    }
    const yBaseline = yAtas + ukuran * 0.82;
    this.perintah.push(
      `BT /${font} ${ukuran.toFixed(2)} Tf ${xPakai.toFixed(2)} ${this.yPdf(yBaseline)} Td (${lolosPdf(str)}) Tj ET`,
    );
    if (garisBawah) {
      this.garis(xPakai, yBaseline + 2, xPakai + wTeks, yBaseline + 2, 0.7);
    }
  }

  paragraf(isi, x, yAtas, lebar, { font = "F1", ukuran = 10, tinggiBaris = 14, align = "left" } = {}) {
    const baris = pecahBaris(isi, lebar, ukuran, font);
    baris.forEach((b, i) => {
      this.teks(b, x, yAtas + i * tinggiBaris, { font, ukuran, align, lebar });
    });
    return yAtas + baris.length * tinggiBaris;
  }

  kotakTeks(isi, x, yAtas, w, { minTinggi = 0, pad = 6, font = "F1", ukuran = 10, tinggiBaris = 14 } = {}) {
    const baris = pecahBaris(isi, w - 2 * pad, ukuran, font);
    const h = Math.max(minTinggi, baris.length * tinggiBaris + 2 * pad);
    this.kotak(x, yAtas, w, h, 0.6);
    baris.forEach((b, i) => {
      this.teks(b, x + pad, yAtas + pad + i * tinggiBaris, { font, ukuran });
    });
    return yAtas + h;
  }

  tambahGambarJpeg(namaXObject, x, yAtas, wKotak, hKotak, wAsli, hAsli) {
    const skala = Math.min(wKotak / (wAsli || 1), hKotak / (hAsli || 1));
    const wGambar = (wAsli || 1) * skala;
    const hGambar = (hAsli || 1) * skala;
    const xGambar = x + (wKotak - wGambar) / 2;
    const yBawahPdf = TINGGI_A4 - (yAtas + (hKotak - hGambar) / 2 + hGambar);
    this.perintah.push(
      `q ${wGambar.toFixed(2)} 0 0 ${hGambar.toFixed(2)} ${xGambar.toFixed(2)} ${yBawahPdf.toFixed(2)} cm /${namaXObject} Do Q`,
    );
  }
}

function rentangTanggal(h) {
  if (!h.tanggalMulai) return tanggalPanjang(h.tanggalBayar);
  if (h.tanggalMulai === h.tanggalSelesai) return tanggalPanjang(h.tanggalMulai);
  return `${tanggalPanjang(h.tanggalMulai)} s.d ${tanggalPanjang(h.tanggalSelesai)}`;
}

function untukPembayaran(h) {
  const paket = h.paket ? ` (${h.paket})` : "";
  const penyedia = h.penyedia ? ` pada ${h.penyedia}` : "";
  const keperluan = h.keperluan ? ` dalam rangka ${h.keperluan.replace(/^dalam rangka\s*/i, "")}` : "";
  const tanggal = ` periode ${rentangTanggal(h)}`;
  const dasar = `Pembayaran langganan aplikasi ${h.namaAplikasi}${paket}${penyedia}${tanggal}${keperluan}`;
  return /sesuai dengan bukti terlampir/i.test(dasar)
    ? dasar
    : `${dasar}, sesuai dengan bukti terlampir`;
}

// =========================================================
// HALAMAN 1: SURAT PERINTAH BAYAR (SPBY)
// =========================================================

function susunHalamanSpby(h) {
  const hal = new HalamanPdf();
  const xKiri = 38;
  const xKanan = LEBAR_A4 - 38;
  const w = xKanan - xKiri;
  const yAtas = 38;
  const tahun = String(h.tahunAnggaran || "2026");
  const labelTgl = h.cetakTanggalLengkap ? ` ${tanggalPanjang(h.tanggalBayar)} ` : `        ${tahun} `;
  const nomorSpby = h.nomorSpby ? ` ${h.nomorSpby}` : "";

  hal.teks("KEMENTERIAN KETENAGAKERJAAN", xKiri, 46, { font: "F2", ukuran: 10.5, align: "center", lebar: w });
  hal.teks("BIRO KEUANGAN DAN BMN", xKiri, 61, { font: "F2", ukuran: 10.5, align: "center", lebar: w });
  hal.teks("SURAT PERINTAH BAYAR", xKiri, 88, {
    font: "F2",
    ukuran: 10.5,
    align: "center",
    lebar: w,
    garisBawah: true,
  });
  hal.teks(`Tanggal :${labelTgl}Nomor :${nomorSpby}`, xKiri, 105, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: w,
  });

  hal.garis(xKiri, 126, xKanan, 126, 0.9);

  hal.paragraf(
    "Saya yang bertanda tangan di bawah ini selaku Pejabat Pembuat Komitmen memerintahkan Bendahara Pengeluaran agar melakukan pembayaran sejumlah :",
    xKiri + 6,
    135,
    w - 12,
    { font: "F1", ukuran: 10, tinggiBaris: 14 },
  );

  hal.teks("Rp", xKiri + 8, 173, { font: "F2", ukuran: 10.5 });
  hal.teks(angka(h.total), xKiri + 8, 173, { font: "F2", ukuran: 10.5, align: "right", lebar: 130 });

  const yTerbilangAkhir = hal.paragraf(terbilangRupiah(h.total), xKiri + 6, 200, w - 12, {
    font: "F2",
    ukuran: 10,
    tinggiBaris: 14,
  });

  const yGaris2 = Math.max(226, yTerbilangAkhir + 8);
  hal.garis(xKiri, yGaris2, xKanan, yGaris2, 1.5);

  const xLabel = xKiri + 6;
  const xTitik = xKiri + 150;
  const xIsi = xKiri + 170;
  const wIsi = xKanan - xIsi - 8;

  let y = yGaris2 + 20;
  hal.teks("Kepada", xLabel, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xTitik, y, { font: "F1", ukuran: 10 });
  hal.teks(h.penerima.nama, xIsi, y, { font: "F2", ukuran: 10 });

  y += 18;
  hal.teks("Untuk pembayaran", xLabel, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xTitik, y, { font: "F1", ukuran: 10 });
  const yUraianAkhir = hal.paragraf(untukPembayaran(h), xIsi, y, wIsi, {
    font: "F1",
    ukuran: 10,
    tinggiBaris: 14,
  });

  y = Math.max(355, yUraianAkhir + 34);
  hal.teks("Atas dasar :", xLabel, y, { font: "F1", ukuran: 10 });
  y += 18;
  hal.teks("1. Kuitansi/bukti pembelian", xLabel, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xKiri + 206, y, { font: "F1", ukuran: 10 });
  y += 17;
  hal.teks("2. Nota/bukti penerimaan barang/jasa/", xLabel, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xKiri + 206, y, { font: "F1", ukuran: 10 });
  y += 15;
  hal.teks("    bukti lainnya", xLabel, y, { font: "F1", ukuran: 10 });

  y += 36;
  hal.teks("Dibebankan pada :", xLabel, y, { font: "F1", ukuran: 10 });
  y += 18;
  hal.teks("Kegiatan, Output, MAK", xLabel, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xTitik, y, { font: "F1", ukuran: 10 });
  hal.teks(h.kegiatanMak, xIsi, y, { font: "F1", ukuran: 10 });

  y += 17;
  hal.teks("Kode", xLabel, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xTitik, y, { font: "F1", ukuran: 10 });
  hal.teks(h.kodeAkun, xIsi, y, { font: "F1", ukuran: 10 });

  const yGaris3 = Math.max(536, y + 36);
  hal.garis(xKiri, yGaris3, xKanan, yGaris3, 1.5);

  const yTtd = yGaris3 + 22;
  const xKolKiri = xKiri + 8;
  const wKolKiri = 215;
  const wKolKanan = 225;
  const xKolKanan = xKanan - wKolKanan - 8;

  const tglKiri = h.cetakTanggalLengkap ? ` ${tanggalPanjang(h.tanggalBayar)}` : `      ${tahun}`;
  const tglKanan = h.cetakTanggalLengkap ? ` ${tanggalPanjang(h.tanggalBayar)}` : `            ${tahun}`;

  hal.teks(`Setuju/lunas dibayar, Tgl${tglKiri}`, xKolKiri, yTtd, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKiri,
  });
  hal.teks("Bendahara Pengeluaran", xKolKiri, yTtd + 16, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKiri,
  });
  hal.teks("Sekretariat Jenderal Kemnaker", xKolKiri, yTtd + 32, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKiri,
  });

  hal.teks(`Jakarta,${tglKanan}`, xKolKanan, yTtd, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKanan,
  });
  hal.teks("Pejabat Pembuat Komitmen", xKolKanan, yTtd + 16, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKanan,
  });
  hal.teks("Biro Keuangan Setjen Kemnaker", xKolKanan, yTtd + 32, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKanan,
  });

  const yNama = yTtd + 100;
  hal.teks(NAMA_BENDAHARA, xKolKiri, yNama, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKiri,
  });
  hal.teks(`NIP ${formatNipSpby(NIP_BENDAHARA)}`, xKolKiri, yNama + 16, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKiri,
  });

  hal.teks(NAMA_PPK, xKolKanan, yNama, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKanan,
  });
  hal.teks(`NIP ${formatNipSpby(NIP_PPK)}`, xKolKanan, yNama + 16, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: wKolKanan,
  });

  hal.kotak(xKiri, yAtas, w, yNama + 38 - yAtas, 1);
  return hal;
}

// =========================================================
// HALAMAN 2: KWITANSI
// =========================================================

function susunHalamanKwitansi(h) {
  const hal = new HalamanPdf();
  hal.kotak(18, 18, LEBAR_A4 - 36, TINGGI_A4 - 36, 0.8);

  const x = 50;
  const w = LEBAR_A4 - 100;

  hal.teks("KWITANSI", x, 34, {
    font: "F3",
    ukuran: 20,
    align: "center",
    lebar: w,
    garisBawah: true,
  });
  hal.garis(x, 60, x + w, 60, 1.2);

  let y = 68;
  for (const [label, isi] of [
    ["No. BKU", h.noBku || ""],
    ["Tahun Anggaran", h.tahunAnggaran || "2026"],
    ["Akun", h.akunKode || ""],
  ]) {
    hal.teks(label, x, y, { font: "F1", ukuran: 10 });
    hal.teks(":", x + 140, y, { font: "F1", ukuran: 10 });
    hal.teks(isi, x + 150, y, { font: "F1", ukuran: 10 });
    y += 15;
  }

  hal.garis(x, y + 4, x + w, y + 4, 1.2);
  hal.garis(x, y + 7, x + w, y + 7, 0.5);
  y += 28;

  const xTitik = x + 155;
  const xIsi = x + 165;
  const wIsi = w - 165;

  hal.teks("Sudah Terima Dari", x, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xTitik, y, { font: "F1", ukuran: 10 });
  hal.teks("Kuasa Pengguna Anggaran DIPA Setjen Kemnaker", xIsi, y, { font: "F1", ukuran: 10 });
  y += 22;

  hal.teks("Rp.", xIsi, y + 4, { font: "F1", ukuran: 10 });
  hal.kotak(xIsi + 26, y, 180, 22, 0.6);
  hal.teks(angka(h.total), xIsi + 32, y + 5, { font: "F1", ukuran: 10 });
  y += 36;

  hal.teks("Banyaknya Uang", x, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xTitik, y, { font: "F1", ukuran: 10 });
  y = hal.kotakTeks(terbilangRupiah(h.total), xIsi, y, wIsi, { minTinggi: 40, pad: 8 }) + 16;

  hal.teks("Untuk Pembayaran", x, y, { font: "F1", ukuran: 10 });
  hal.teks(":", xTitik, y, { font: "F1", ukuran: 10 });
  y = hal.kotakTeks(untukPembayaran(h), xIsi, y, wIsi, { minTinggi: 66, pad: 8 }) + 12;

  hal.garis(x, y, x + w, y, 1.2);
  hal.garis(x, y + 3, x + w, y + 3, 0.5);
  y += 16;

  // Tiga kolom tanda tangan dengan lebar seimbang agar kolom ke-3 (pojok kanan)
  // cukup lebar untuk memuat "Jakarta, 24 November 2026" dalam satu baris
  // dan "Yang Menerima," berada rapi tepat di bawahnya.
  const lebarKol = [w * 0.36, w * 0.32, w * 0.32];
  const xKol = [x, x + lebarKol[0], x + lebarKol[0] + lebarKol[1]];
  const tglJakarta = `Jakarta, ${tanggalPanjang(h.tanggalBayar)}`;

  const blok = [
    {
      judul: ["Setuju dibayar", "Pejabat Pembuat Komitmen", "Biro Keuangan Kemnaker"],
      nama: NAMA_PPK,
      nip: NIP_PPK,
    },
    {
      judul: ["Lunas dibayar", "Bendahara Pengeluaran", "Setjen Kemnaker"],
      nama: NAMA_BENDAHARA,
      nip: NIP_BENDAHARA,
    },
    {
      judul: [tglJakarta, "Yang Menerima,", ""],
      nama: h.penerima.nama,
      nip: h.penerima.nip,
    },
  ];

  const tBaris = 14;
  const yNama = y + 3 * tBaris + 52;

  blok.forEach((b, i) => {
    const xK = xKol[i];
    const wK = lebarKol[i];
    b.judul.forEach((j, idx) => {
      if (j) {
        hal.teks(j, xK, y + idx * tBaris, {
          font: "F1",
          ukuran: 10,
          align: "center",
          lebar: wK,
        });
      }
    });
    hal.teks(b.nama || "", xK, yNama, {
      font: "F1",
      ukuran: 10,
      align: "center",
      lebar: wK,
      garisBawah: true,
    });
    hal.teks(b.nip ? `NIP. ${b.nip}` : "NIP. -", xK, yNama + 15, {
      font: "F1",
      ukuran: 10,
      align: "center",
      lebar: wK,
    });
  });

  return hal;
}

// =========================================================
// HALAMAN 3: RINCIAN BIAYA LANGGANAN APLIKASI
// =========================================================

function susunHalamanRincian(h) {
  const hal = new HalamanPdf();
  hal.kotak(18, 18, LEBAR_A4 - 36, TINGGI_A4 - 36, 0.8);

  const x = 40;
  const w = LEBAR_A4 - 80;

  hal.teks("RINCIAN BIAYA LANGGANAN APLIKASI", x, 36, {
    font: "F2",
    ukuran: 13,
    align: "center",
    lebar: w,
  });

  let y = 66;
  for (const [label, isi, tebal] of [
    ["Aplikasi / Layanan", `${h.namaAplikasi}${h.paket ? ` (${h.paket})` : ""}`, true],
    ["Penyedia / Vendor", h.penyedia || "-", false],
    ["Periode Langganan", rentangTanggal(h), false],
    ["Tanggal Pembayaran", tanggalPanjang(h.tanggalBayar), false],
  ]) {
    hal.teks(label, x, y, { font: "F1", ukuran: 10 });
    hal.teks(":", x + 150, y, { font: "F1", ukuran: 10 });
    hal.teks(isi, x + 165, y, { font: tebal ? "F2" : "F1", ukuran: 10 });
    y += 16;
  }

  y += 8;
  const kNo = 28;
  const kJml = 120;
  const kKet = 70;
  const kUr = w - kNo - kJml - kKet;
  const xs = [x, x + kNo, x + kNo + kUr, x + kNo + kUr + kJml, x + w];
  const yAtasTabel = y;

  hal.teks("NO.", xs[0], y + 5, { font: "F2", ukuran: 10, align: "center", lebar: kNo });
  hal.teks("PERINCIAN BIAYA", xs[1], y + 5, { font: "F2", ukuran: 10, align: "center", lebar: kUr });
  hal.teks("JUMLAH", xs[2], y + 5, { font: "F2", ukuran: 10, align: "center", lebar: kJml });
  hal.teks("KET", xs[3], y + 5, { font: "F2", ukuran: 10, align: "center", lebar: kKet });
  y += 20;
  hal.garis(x, y, x + w, y, 0.6);
  y += 8;

  h.rincian.forEach((r, i) => {
    hal.teks(String(i + 1), xs[0], y, { font: "F1", ukuran: 10, align: "center", lebar: kNo });
    hal.teks(r.uraian, xs[1] + 6, y, { font: "F1", ukuran: 10 });
    hal.teks(
      `${r.volume} ${r.satuan} x Rp ${angka(r.hargaSatuan)}${r.pajak > 0 ? ` + Pajak/Admin Rp ${angka(r.pajak)}` : ""}`,
      xs[1] + 6,
      y + 14,
      { font: "F1", ukuran: 9 },
    );
    hal.teks("Rp", xs[2] + 6, y, { font: "F1", ukuran: 10 });
    hal.teks(angka(r.jumlah), xs[2] + 22, y, { font: "F1", ukuran: 10, align: "right", lebar: kJml - 28 });
    if (r.keterangan) {
      hal.teks(r.keterangan, xs[3] + 4, y, { font: "F1", ukuran: 9, align: "center", lebar: kKet - 8 });
    }
    y += 32;
  });

  hal.garis(x, y, x + w, y, 0.6);
  hal.teks("JUMLAH", xs[1] + 6, y + 5, { font: "F2", ukuran: 10 });
  hal.teks("Rp", xs[2] + 6, y + 5, { font: "F2", ukuran: 10 });
  hal.teks(angka(h.total), xs[2] + 22, y + 5, { font: "F2", ukuran: 10, align: "right", lebar: kJml - 28 });
  y += 20;

  hal.kotak(x, yAtasTabel, w, y - yAtasTabel, 0.6);
  for (let i = 1; i < 4; i++) {
    hal.garis(xs[i], yAtasTabel, xs[i], y, 0.6);
  }

  hal.teks("TERBILANG", xs[1] + 6, y + 6, { font: "F2", ukuran: 10 });
  hal.teks(":", xs[1] + 90, y + 6, { font: "F2", ukuran: 10 });
  y = hal.paragraf(terbilangRupiah(h.total), xs[1] + 100, y + 6, w - kNo - 104, {
    font: "F2",
    ukuran: 9.5,
  }) + 24;

  const kol = w / 2;
  hal.teks(`Jakarta, ${tanggalPanjang(h.tanggalBayar)}`, x + kol, y, {
    font: "F1",
    ukuran: 10,
    align: "center",
    lebar: kol,
  });
  y += 22;

  const tulisBlok = (xK, yK, lebarK, judul, nama, nip) => {
    judul.forEach((j, idx) => {
      if (j) hal.teks(j, xK, yK + idx * 14, { font: "F1", ukuran: 10, align: "center", lebar: lebarK });
    });
    const yN = yK + judul.length * 14 + 48;
    hal.teks(nama, xK, yN, { font: "F2", ukuran: 10, align: "center", lebar: lebarK, garisBawah: true });
    hal.teks(nip ? `NIP. ${nip}` : "NIP. -", xK, yN + 15, {
      font: "F2",
      ukuran: 10,
      align: "center",
      lebar: lebarK,
    });
    return yN + 32;
  };

  tulisBlok(
    x,
    y,
    kol,
    ["Telah dibayar sejumlah", `Rp ${angka(h.total)},-`, "", "Bendahara Pengeluaran"],
    NAMA_BENDAHARA,
    NIP_BENDAHARA,
  );
  const yAkhir = tulisBlok(
    x + kol,
    y,
    kol,
    ["Telah menerima jumlah uang sebesar", `Rp ${angka(h.total)},-`, "", "Yang menerima,"],
    h.penerima.nama,
    h.penerima.nip,
  );

  y = yAkhir + 18;
  hal.garis(x, y, x + w, y, 0.8);
  tulisBlok(
    x + kol / 2,
    y + 16,
    kol,
    ["Mengetahui / Menyetujui,", "Pejabat Pembuat Komitmen", "Biro Keuangan dan BMN Kemnaker"],
    NAMA_PPK,
    NIP_PPK,
  );

  return hal;
}

// Membaca dimensi asli JPEG dan byte-nya dari dataURL.
function uraiJpegDataUrl(dataUrl) {
  const m = /^data:image\/jpe?g;base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) return null;
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  let w = 800;
  let h = 600;
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xc0 || marker === 0xc2) {
      h = (bytes[i + 5] << 8) | bytes[i + 6];
      w = (bytes[i + 7] << 8) | bytes[i + 8];
      break;
    }
    i += 2 + len;
  }
  return { bytes, w, h };
}

function rakitDokumenPdf(daftarHalaman) {
  const enc = new TextEncoder();
  const bagian = [];
  const offset = [];
  let panjangTotal = 0;

  const tulisTeks = (s) => {
    const b = enc.encode(s);
    bagian.push(b);
    panjangTotal += b.length;
  };
  const tulisByte = (b) => {
    bagian.push(b);
    panjangTotal += b.length;
  };

  tulisTeks("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  // 1: Catalog, 2: Pages, 3: Helvetica, 4: Helvetica-Bold, 5: Times-BoldItalic
  const idHalaman = [];
  let idBerikutnya = 6;

  const objekTambahan = [];
  for (const hal of daftarHalaman) {
    const idIsi = idBerikutnya++;
    const idHal = idBerikutnya++;
    const petaGambar = [];
    for (const g of hal.gambar) {
      const idImg = idBerikutnya++;
      petaGambar.push({ nama: g.nama, id: idImg, data: g });
    }
    idHalaman.push(idHal);
    objekTambahan.push({ hal, idIsi, idHal, petaGambar });
  }

  const mulaiObjek = (id) => {
    offset[id] = panjangTotal;
    tulisTeks(`${id} 0 obj\n`);
  };
  const akhirObjek = () => tulisTeks("\nendobj\n");

  mulaiObjek(1);
  tulisTeks("<< /Type /Catalog /Pages 2 0 R >>");
  akhirObjek();

  mulaiObjek(2);
  tulisTeks(`<< /Type /Pages /Kids [${idHalaman.map((id) => `${id} 0 R`).join(" ")}] /Count ${idHalaman.length} >>`);
  akhirObjek();

  mulaiObjek(3);
  tulisTeks("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  akhirObjek();

  mulaiObjek(4);
  tulisTeks("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  akhirObjek();

  mulaiObjek(5);
  tulisTeks("<< /Type /Font /Subtype /Type1 /BaseFont /Times-BoldItalic /Encoding /WinAnsiEncoding >>");
  akhirObjek();

  for (const item of objekTambahan) {
    const isiStream = enc.encode(item.hal.perintah.join("\n"));
    mulaiObjek(item.idIsi);
    tulisTeks(`<< /Length ${isiStream.length} >>\nstream\n`);
    tulisByte(isiStream);
    tulisTeks("\nendstream");
    akhirObjek();

    const xObj = item.petaGambar.length
      ? `/XObject << ${item.petaGambar.map((g) => `/${g.nama} ${g.id} 0 R`).join(" ")} >>`
      : "";

    mulaiObjek(item.idHal);
    tulisTeks(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LEBAR_A4} ${TINGGI_A4}] /Contents ${item.idIsi} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> ${xObj} >> >>`,
    );
    akhirObjek();

    for (const g of item.petaGambar) {
      mulaiObjek(g.id);
      tulisTeks(
        `<< /Type /XObject /Subtype /Image /Width ${g.data.w} /Height ${g.data.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${g.data.bytes.length} >>\nstream\n`,
      );
      tulisByte(g.data.bytes);
      tulisTeks("\nendstream");
      akhirObjek();
    }
  }

  const posisiXref = panjangTotal;
  const jumlahObjek = idBerikutnya;
  tulisTeks(`xref\n0 ${jumlahObjek}\n0000000000 65535 f \n`);
  for (let i = 1; i < jumlahObjek; i++) {
    tulisTeks(`${String(offset[i] || 0).padStart(10, "0")} 00000 n \n`);
  }
  tulisTeks(`trailer\n<< /Size ${jumlahObjek} /Root 1 0 R >>\nstartxref\n${posisiXref}\n%%EOF`);

  return new Blob(bagian, { type: "application/pdf" });
}

export function bukaPdfLanggananLokal(isian = {}) {
  const angkaBulat = (v) => Math.max(0, Math.floor(Number(String(v ?? "").replace(/[^\d]/g, "")) || 0));
  const namaAplikasi = String(isian.nama_aplikasi || "").trim() || "Aplikasi";
  const paket = String(isian.paket || "").trim();
  const penyedia = String(isian.penyedia || "").trim();
  const keperluan = String(isian.keperluan || "").trim();
  const tanggalBayar = isian.tanggal_bayar || new Date().toISOString().slice(0, 10);
  const tanggalMulai = isian.tanggal_mulai || tanggalBayar;
  const tanggalSelesai = isian.tanggal_selesai || tanggalMulai;
  const akunKode = String(isian.akun || "026.01.WA.2158.EBA.994.002.A.522191").trim();
  const bagianAkun = akunKode.split(".");
  const kegiatanMak =
    String(isian.kegiatan_mak || "").trim() ||
    (bagianAkun.length >= 6 ? bagianAkun.slice(3, 6).join(".") : "2158.EBA.994");
  const kodeAkun =
    String(isian.kode_akun || "").trim() || bagianAkun[bagianAkun.length - 1] || "522191";

  const daftarRincian = Array.isArray(isian.rincian) && isian.rincian.length ? isian.rincian : [{}];
  const rincian = daftarRincian.map((item, idx) => {
    const uraianDefault =
      idx === 0
        ? `Langganan ${namaAplikasi}${paket ? ` (${paket})` : ""}`
        : `Item langganan ${idx + 1}`;
    const uraian = String(item.uraian || "").trim() || uraianDefault;
    const volume = Math.max(1, angkaBulat(item.volume || 1));
    const satuan = String(item.satuan || "").trim() || "Lisensi";
    const hargaSatuan = angkaBulat(item.harga_satuan);
    const pajak = angkaBulat(item.pajak);
    const keterangan = String(item.keterangan || "").trim();
    const jumlah = volume * hargaSatuan + pajak;
    return { uraian, volume, satuan, hargaSatuan, pajak, keterangan, jumlah };
  });

  const total = rincian.reduce((a, r) => a + r.jumlah, 0);

  const h = {
    namaAplikasi,
    paket,
    penyedia,
    keperluan,
    tanggalBayar,
    tanggalMulai,
    tanggalSelesai,
    tahunAnggaran: tanggalBayar.slice(0, 4),
    nomorSpby: String(isian.nomor_spby || "").trim(),
    noBku: String(isian.no_bku || "").trim(),
    cetakTanggalLengkap: Boolean(isian.cetak_tanggal_lengkap),
    akunKode,
    kegiatanMak,
    kodeAkun,
    penerima: {
      nama: String(isian.penerima_nama || "").trim() || "-",
      nip: String(isian.penerima_nip || "").trim().replace(/\s+/g, ""),
      jabatan: String(isian.penerima_jabatan || "").trim(),
    },
    rincian,
    total,
  };

  const halaman = [susunHalamanSpby(h), susunHalamanKwitansi(h), susunHalamanRincian(h)];

  const lampiranJpeg = (Array.isArray(isian.lampiran) ? isian.lampiran : [])
    .map((l) => uraiJpegDataUrl(l?.dataUrl))
    .filter(Boolean);

  if (lampiranJpeg.length) {
    const perHalaman = 2;
    let halGambar = null;
    lampiranJpeg.forEach((g, idx) => {
      const slot = idx % perHalaman;
      if (slot === 0) {
        halGambar = new HalamanPdf();
        halaman.push(halGambar);
      }
      const namaX = `Im${idx + 1}`;
      halGambar.gambar.push({ nama: namaX, ...g });
      const ySlot = 40 + slot * 385;
      halGambar.tambahGambarJpeg(namaX, 40, ySlot, LEBAR_A4 - 80, 365, g.w, g.h);
    });
  }

  const blob = rakitDokumenPdf(halaman);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
