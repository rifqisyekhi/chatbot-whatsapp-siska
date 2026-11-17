// =========================================================
// REKAP PEMELIHARAAN KENDARAAN DINAS: MATRIKS & EXPORT EXCEL
// =========================================================
//
// Bentuk export meniru lembar "KEndi" di docs/Monitoring Pemeliharaan
// Kendis.xlsx: per kendaraan satu baris, dikelompokkan Roda 4 lalu
// Roda 2, dengan kolom SBM Tahunan, Saldo, Total Pemeliharaan, dan
// Bulan 1–12. Isinya bukan dari templat (templatnya kosongan), tapi
// dari data service di dashboard untuk tahun yang dipilih.

const muatExcel = async () => (await import("exceljs")).default;

export const NAMA_BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export const platBersih = (p) => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const rupiah = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

// kendaraan: data Master Data (bentuk /api/kendaraan)
// servis:    baris /api/servis-kendaraan untuk SATU tahun
// sbm:       { Mobil, Motor }
//
// Baris service dicocokkan ke kendaraan lewat kendaraan_id, lalu
// nopol. Service untuk kendaraan yang sudah dihapus dari Master Data
// tetap tampil sebagai baris tersendiri, supaya totalnya tidak hilang.
export function susunMatriks(kendaraan, servis, sbm) {
  const baris = [];
  const perId = new Map();
  const perPlat = new Map();

  for (const k of kendaraan) {
    const b = {
      kunci: `k${k._id}`,
      nama: k.nama || "",
      tahun: k.tahun || "",
      plat: k.plat || "",
      noMesin: k.no_mesin || "",
      jenis: k.jenis === "Motor" ? "Motor" : "Mobil",
      bulan: Array(12).fill(0),
      jumlahServis: 0,
    };
    baris.push(b);
    perId.set(Number(k._id), b);
    if (b.plat) perPlat.set(platBersih(b.plat), b);
  }

  for (const s of servis) {
    let b = perId.get(Number(s.kendaraan_id)) || perPlat.get(platBersih(s.plat));

    if (!b) {
      b = {
        kunci: `x${platBersih(s.plat) || s.nama_kendaraan}`,
        nama: `${s.nama_kendaraan} (tidak ada di Master Data)`,
        tahun: "",
        plat: s.plat || "",
        noMesin: "",
        jenis: s.jenis === "Motor" ? "Motor" : "Mobil",
        bulan: Array(12).fill(0),
        jumlahServis: 0,
      };
      baris.push(b);
      if (b.plat) perPlat.set(platBersih(b.plat), b);
    }

    const bln = Number(String(s.tanggal_servis).slice(5, 7)) - 1;
    if (bln >= 0 && bln < 12) b.bulan[bln] += Number(s.biaya) || 0;
    b.jumlahServis += 1;
  }

  for (const b of baris) {
    b.sbm = sbm?.[b.jenis] || 0;
    b.total = b.bulan.reduce((a, n) => a + n, 0);
    b.saldo = b.sbm - b.total;
  }

  const urut = (a, c) => a.nama.localeCompare(c.nama, "id") || a.plat.localeCompare(c.plat, "id");

  return {
    mobil: baris.filter((b) => b.jenis === "Mobil").sort(urut),
    motor: baris.filter((b) => b.jenis === "Motor").sort(urut),
  };
}

// =========================================================
// EXPORT
// =========================================================

const FORMAT_ANGKA = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)';
const TIPIS = { style: "thin", color: { argb: "FF000000" } };
const BINGKAI = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS };
const BIRU_MUDA = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00FFFF" } };
const FONT = { name: "Arial", size: 11 };

function unduhBlob(buffer, namaBerkas) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaBerkas;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Kolom: A No, B Nama, C Tahun, D Nopol, E No. Mesin, F SBM, G Saldo,
// H Total, I..T Bulan 1..12 — sama persis dengan templat.
const KOL_BULAN = "IJKLMNOPQRST".split("");

function tulisKelompok(ws, barisMulai, romawi, judul, daftar) {
  const r0 = barisMulai;
  const pertama = r0 + 1;
  const terakhir = r0 + Math.max(daftar.length, 1);

  const kepala = ws.getRow(r0);
  kepala.getCell("A").value = romawi;
  kepala.getCell("B").value = judul;
  ws.mergeCells(`B${r0}:E${r0}`);
  kepala.getCell("F").value = { formula: `SUM(F${pertama}:F${terakhir})` };
  kepala.getCell("G").value = { formula: `SUM(G${pertama}:G${terakhir})` };
  kepala.getCell("H").value = { formula: `SUM(I${r0}:T${r0})` };
  for (const k of KOL_BULAN) {
    kepala.getCell(k).value = { formula: `SUM(${k}${pertama}:${k}${terakhir})` };
  }
  kepala.font = { ...FONT, bold: true };

  daftar.forEach((b, i) => {
    const r = pertama + i;
    const row = ws.getRow(r);
    row.getCell("A").value = i + 1;
    row.getCell("B").value = b.nama;
    row.getCell("C").value = b.tahun ? Number(b.tahun) : null;
    row.getCell("D").value = b.plat;
    row.getCell("E").value = b.noMesin;
    row.getCell("F").value = b.sbm;
    row.getCell("G").value = { formula: `F${r}-H${r}` };
    row.getCell("H").value = { formula: `SUM(I${r}:T${r})` };
    KOL_BULAN.forEach((k, m) => {
      row.getCell(k).value = b.bulan[m] ? b.bulan[m] : null;
    });
    row.font = FONT;
  });

  for (let r = r0; r <= terakhir; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 20; c++) {
      const cell = row.getCell(c);
      cell.border = BINGKAI;
      if (c >= 6) cell.numFmt = FORMAT_ANGKA;
      if (c === 8) cell.fill = BIRU_MUDA;
    }
    row.getCell("A").alignment = { horizontal: "center" };
    row.getCell("C").alignment = { horizontal: "center" };
  }

  return terakhir;
}

export async function exportMonitoring({ tahun, matriks, servis }) {
  const ExcelJS = await muatExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = "SisKA Biro Keuangan dan BMN";

  // ---------- Lembar 1: Monitoring (format templat) ----------
  const ws = wb.addWorksheet("KEndi", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const lebar = { A: 4, B: 38, C: 7, D: 14, E: 17, F: 13, G: 13, H: 18 };
  for (const [k, w] of Object.entries(lebar)) ws.getColumn(k).width = w;
  for (const k of KOL_BULAN) ws.getColumn(k).width = 12;

  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = `Monitoring  Pemeliharaan Kendaraan Dinas TA.${tahun}`;
  ws.getCell("A1").font = { ...FONT, size: 12, bold: true };

  const kepala = ws.getRow(2);
  ["SBM Tahunan", "Saldo", "Total Pemeliharaan", ...KOL_BULAN.map((_, i) => `Bulan ${i + 1}`)].forEach(
    (judul, i) => {
      const cell = kepala.getCell(6 + i);
      cell.value = judul;
      cell.font = { ...FONT, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = BINGKAI;
      if (i === 2) cell.fill = BIRU_MUDA;
    },
  );
  kepala.height = 30;

  const akhirMobil = tulisKelompok(ws, 3, "I", "Roda 4 (Empat)", matriks.mobil);
  tulisKelompok(ws, akhirMobil + 2, "II", "Roda 2 (Dua)", matriks.motor);

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];

  // ---------- Lembar 2: Rincian tiap service ----------
  const wr = wb.addWorksheet("Rincian Service");
  wr.columns = [
    { header: "No", key: "no", width: 5 },
    { header: "Tanggal Service", key: "tanggal", width: 16 },
    { header: "Kendaraan", key: "nama", width: 32 },
    { header: "Nopol", key: "plat", width: 14 },
    { header: "Jenis", key: "jenis", width: 8 },
    { header: "Bengkel", key: "bengkel", width: 26 },
    { header: "Biaya", key: "biaya", width: 15 },
    { header: "Dilaporkan oleh", key: "pelapor", width: 28 },
    { header: "NIP", key: "nip", width: 20 },
    { header: "Keterangan", key: "ket", width: 30 },
    { header: "Sumber", key: "sumber", width: 12 },
  ];

  const urut = [...servis].sort((a, b) => a.tanggal_servis.localeCompare(b.tanggal_servis) || a.id - b.id);
  urut.forEach((s, i) => {
    const [y, m, d] = s.tanggal_servis.split("-").map(Number);
    wr.addRow({
      no: i + 1,
      tanggal: new Date(Date.UTC(y, m - 1, d)),
      nama: s.nama_kendaraan,
      plat: s.plat,
      jenis: s.jenis,
      bengkel: s.bengkel,
      biaya: Number(s.biaya) || 0,
      pelapor: s.pelapor_nama,
      nip: s.pelapor_nip,
      ket: s.keterangan,
      sumber: s.sumber === "whatsapp" ? "WhatsApp" : "Dashboard",
    });
  });

  const jml = wr.addRow({ bengkel: "TOTAL", biaya: urut.reduce((a, s) => a + (Number(s.biaya) || 0), 0) });
  jml.font = { ...FONT, bold: true };

  wr.eachRow((row, nomor) => {
    row.eachCell({ includeEmpty: true }, (cell, kol) => {
      cell.border = BINGKAI;
      if (!row.font?.bold) cell.font = { ...FONT, bold: nomor === 1 };
      if (kol === 2 && nomor > 1) cell.numFmt = "dd/mm/yyyy";
      if (kol === 7) cell.numFmt = FORMAT_ANGKA;
    });
  });
  wr.getRow(1).fill = BIRU_MUDA;
  wr.views = [{ state: "frozen", ySplit: 1 }];

  unduhBlob(await wb.xlsx.writeBuffer(), `Monitoring Pemeliharaan Kendis ${tahun}.xlsx`);
}
