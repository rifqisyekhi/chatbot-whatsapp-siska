// =========================================================
// LAPORAN PDF REKAP MUTASI BARANG
// =========================================================
//
// Dipanggil dari GET /api/mutasi-barang/pdf. PDF-nya ditulis
// langsung ke respons HTTP, tidak disimpan ke disk: laporan ini
// dibuat ulang setiap diminta dari data terbaru, jadi menyimpan
// salinannya hanya menambah berkas yang cepat basi.
//
// A4 melintang, karena tabelnya sembilan kolom dan nama barang
// serta keterangan tidak muat di kertas tegak.

const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const LABEL_JENIS = {
  masuk: "Masuk",
  keluar: "Keluar",
  pinjam: "Pinjam",
  kembali: "Kembali",
  koreksi: "Koreksi",
};

// Tanggal ditulis dalam WIB apa pun zona waktu servernya — rekap
// audit yang bergeser sehari karena server di UTC akan sulit
// dicocokkan dengan buku gudang.
function tglIndo(nilai, denganJam = false) {
  if (!nilai) return "-";

  const d = new Date(new Date(nilai).getTime() + 7 * 3600 * 1000);
  const dasar = `${d.getUTCDate()} ${BULAN[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;

  if (!denganJam) return dasar;

  const jam = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

  return `${dasar} ${jam}`;
}

function tglPanjang(teksTanggal) {
  const [y, m, d] = String(teksTanggal).split("-").map(Number);

  if (!y || !m || !d) return teksTanggal;

  return `${d} ${BULAN[m - 1]} ${y}`;
}

function teksPeriode(dari, sampai) {
  if (dari && sampai) return `${tglPanjang(dari)} s.d. ${tglPanjang(sampai)}`;
  if (dari) return `Sejak ${tglPanjang(dari)}`;
  if (sampai) return `Sampai ${tglPanjang(sampai)}`;

  return "Seluruh periode";
}

function tulisLaporanMutasi(res, { baris, ringkasan, dari, sampai, dicetakOleh }) {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 30, bottom: 30, left: 36, right: 36 },
    bufferPages: true,
  });

  let fontBiasa = "Helvetica";
  let fontTebal = "Helvetica-Bold";

  const fontDir = path.join(__dirname, "..", "assets", "fonts");

  if (
    fs.existsSync(path.join(fontDir, "arial.ttf")) &&
    fs.existsSync(path.join(fontDir, "arialbd.ttf"))
  ) {
    doc.registerFont("Arial", path.join(fontDir, "arial.ttf"));
    doc.registerFont("Arial-Bold", path.join(fontDir, "arialbd.ttf"));
    fontBiasa = "Arial";
    fontTebal = "Arial-Bold";
  }

  doc.pipe(res);

  const kiri = doc.page.margins.left;
  const lebar = doc.page.width - kiri - doc.page.margins.right;
  const bawah = doc.page.height - doc.page.margins.bottom;

  let y = doc.page.margins.top;

  // --- KOP ---
  const kopPath = path.join(__dirname, "..", "assets", "images", "kop-kemnaker.png");

  if (fs.existsSync(kopPath)) {
    const buf = fs.readFileSync(kopPath);
    const dim = imageSize(buf);

    // Kop dibatasi tingginya: di kertas melintang, kop selebar
    // halaman akan memakan sepertiga halaman pertama.
    const tinggi = Math.min(80, (lebar * dim.height) / dim.width);
    const lebarKop = (tinggi * dim.width) / dim.height;

    doc.image(buf, kiri + (lebar - lebarKop) / 2, y, { width: lebarKop, height: tinggi });
    y += tinggi + 8;
  }

  doc.font(fontTebal).fontSize(13).text("REKAP MUTASI PERSEDIAAN BARANG", kiri, y, {
    width: lebar,
    align: "center",
  });
  y = doc.y + 2;
  doc.font(fontBiasa).fontSize(10).text(`Periode: ${teksPeriode(dari, sampai)}`, kiri, y, {
    width: lebar,
    align: "center",
  });
  y = doc.y + 10;

  // --- TABEL ---
  const kolom = [
    { judul: "No", lebar: 26, ambil: (_, i) => String(i + 1), rata: "center" },
    { judul: "Tanggal", lebar: 82, ambil: (b) => tglIndo(b.tanggal, true) },
    { judul: "Kode", lebar: 52, ambil: (b) => b.id_barang },
    { judul: "Nama Barang", lebar: 130, ambil: (b) => b.nama_barang },
    { judul: "Jenis", lebar: 50, ambil: (b) => LABEL_JENIS[b.jenis] || b.jenis },
    {
      judul: "Jumlah",
      lebar: 56,
      rata: "right",
      ambil: (b) => `${b.jumlah > 0 && b.jenis === "koreksi" ? "+" : ""}${b.jumlah} ${b.satuan || ""}`.trim(),
    },
    { judul: "Stok", lebar: 36, rata: "right", ambil: (b) => (b.stok_sesudah ?? "-").toString() },
    {
      judul: "Pegawai / Unit",
      lebar: 120,
      ambil: (b) => [b.pihak, b.unit].filter(Boolean).join(" — ") || "-",
    },
    {
      judul: "Keterangan",
      lebar: 0,
      ambil: (b) => {
        const bagian = [b.keterangan];

        if (b.jenis === "pinjam") {
          bagian.push(
            b.dikembalikan_pada
              ? `Dikembalikan ${tglIndo(b.dikembalikan_pada)}`
              : `BELUM KEMBALI${b.rencana_kembali ? ` (rencana ${tglIndo(b.rencana_kembali)})` : ""}`,
          );
        }

        return bagian.filter(Boolean).join(". ") || "-";
      },
    },
    { judul: "Dicatat", lebar: 70, ambil: (b) => `${b.dicatat_oleh || "-"} (${b.sumber})` },
  ];

  // Kolom keterangan mengambil sisa lebar, supaya tabel selalu
  // pas satu halaman berapa pun lebar kertasnya.
  const terpakai = kolom.reduce((n, k) => n + k.lebar, 0);
  kolom.find((k) => k.lebar === 0).lebar = lebar - terpakai;

  const pad = 3;
  const ukuranHuruf = 8;

  const tinggiBaris = (isi) => {
    doc.font(fontBiasa).fontSize(ukuranHuruf);

    return (
      Math.max(
        ...kolom.map((k, i) =>
          doc.heightOfString(isi[i], { width: k.lebar - pad * 2 }),
        ),
      ) +
      pad * 2
    );
  };

  const gambarBaris = (isi, tebal = false, latar = null) => {
    const h = tinggiBaris(isi);
    let x = kiri;

    if (latar) doc.rect(kiri, y, lebar, h).fill(latar).fillColor("black");

    doc.font(tebal ? fontTebal : fontBiasa).fontSize(ukuranHuruf);

    kolom.forEach((k, i) => {
      doc.lineWidth(0.5).rect(x, y, k.lebar, h).stroke();
      doc.text(isi[i], x + pad, y + pad, { width: k.lebar - pad * 2, align: k.rata || "left" });
      x += k.lebar;
    });

    y += h;
  };

  const judulTabel = kolom.map((k) => k.judul);

  gambarBaris(judulTabel, true, "#e5e7eb");

  if (!baris.length) {
    doc.font(fontBiasa).fontSize(9).text("Tidak ada mutasi pada periode ini.", kiri, y + 8, {
      width: lebar,
      align: "center",
    });
    y = doc.y + 8;
  }

  baris.forEach((b, i) => {
    const isi = kolom.map((k) => String(k.ambil(b, i) ?? ""));

    // Judul kolom diulang di setiap halaman: auditor yang membaca
    // halaman 4 tidak perlu membalik ke halaman 1.
    if (y + tinggiBaris(isi) > bawah - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      gambarBaris(judulTabel, true, "#e5e7eb");
    }

    gambarBaris(isi);
  });

  // --- RINGKASAN PER BARANG ---
  if (ringkasan.length) {
    const kolomRingkas = [
      { judul: "Kode", lebar: 60 },
      { judul: "Nama Barang", lebar: 220 },
      { judul: "Masuk", lebar: 70 },
      { judul: "Keluar", lebar: 70 },
      { judul: "Pinjam", lebar: 70 },
      { judul: "Kembali", lebar: 70 },
      { judul: "Koreksi", lebar: 70 },
      { judul: "Satuan", lebar: 0 },
    ];

    const pakai = kolomRingkas.reduce((n, k) => n + k.lebar, 0);
    kolomRingkas[kolomRingkas.length - 1].lebar = lebar - pakai;

    const barisRingkas = (isi, tebal, latar) => {
      const h = 16;

      if (y + h > bawah - 20) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      let x = kiri;

      if (latar) doc.rect(kiri, y, lebar, h).fill(latar).fillColor("black");

      doc.font(tebal ? fontTebal : fontBiasa).fontSize(ukuranHuruf);

      kolomRingkas.forEach((k, i) => {
        doc.lineWidth(0.5).rect(x, y, k.lebar, h).stroke();
        doc.text(isi[i], x + pad, y + 4, {
          width: k.lebar - pad * 2,
          align: i >= 2 && i <= 6 ? "right" : "left",
          lineBreak: false,
          ellipsis: true,
        });
        x += k.lebar;
      });

      y += h;
    };

    if (y + 60 > bawah) {
      doc.addPage();
      y = doc.page.margins.top;
    } else {
      y += 16;
    }

    doc.font(fontTebal).fontSize(10).text("Ringkasan per Barang", kiri, y);
    y = doc.y + 4;

    barisRingkas(kolomRingkas.map((k) => k.judul), true, "#e5e7eb");

    for (const r of ringkasan) {
      barisRingkas(
        [
          r.id_barang,
          r.nama_barang,
          String(r.masuk),
          String(r.keluar),
          String(r.pinjam),
          String(r.kembali),
          `${r.koreksi > 0 ? "+" : ""}${r.koreksi}`,
          r.satuan || "",
        ],
        false,
      );
    }
  }

  // --- KAKI HALAMAN ---
  // Nomor halaman ditulis terakhir, setelah jumlah halamannya
  // diketahui — itu sebabnya bufferPages dinyalakan.
  const dicetak = `Dicetak ${tglIndo(new Date(), true)} WIB${dicetakOleh ? ` oleh ${dicetakOleh}` : ""}`;
  const rentang = doc.bufferedPageRange();

  for (let i = 0; i < rentang.count; i++) {
    doc.switchToPage(rentang.start + i);
    doc.font(fontBiasa).fontSize(7).fillColor("#6b7280");
    doc.text(dicetak, kiri, bawah - 10, { width: lebar / 2, lineBreak: false });
    doc.text(`Halaman ${i + 1} dari ${rentang.count}`, kiri + lebar / 2, bawah - 10, {
      width: lebar / 2,
      align: "right",
      lineBreak: false,
    });
    doc.fillColor("black");
  }

  doc.end();
}

module.exports = { tulisLaporanMutasi };
