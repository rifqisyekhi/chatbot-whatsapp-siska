// =========================================================
// EXCEL UNTUK REKAP MUTASI BARANG: TEMPLATE, IMPORT, EXPORT
// =========================================================
//
// Memakai ExcelJS, bukan SheetJS: paket `xlsx` di npm berhenti di 0.18.5 dan
// punya celah keamanan saat MEMBACA berkas yang tidak dipercaya — persis yang
// dilakukan fitur import ini. ExcelJS dimuat dinamis supaya ukurannya (~1 MB)
// tidak ikut membebani katalog barang dan halaman lain.
//
// ZONA WAKTU
//
// Sel tanggal Excel tidak punya zona waktu. ExcelJS membacanya sebagai Date
// UTC dengan angka jam yang sama dengan yang tertulis di sel. Jadi di sini
// komponen UTC sel itu diperlakukan sebagai jam WIB, dan sebaliknya saat
// menulis. Tanpa itu, "02/11/2026 09:00" di Excel akan tersimpan sebagai
// 16:00 WIB.

const WIB = 7 * 3600 * 1000;

const muatExcel = async () => (await import("exceljs")).default;

export const LABEL_JENIS = {
  masuk: "Masuk",
  keluar: "Keluar",
  koreksi: "Koreksi",
};

// Ejaan yang lazim ditulis orang di buku gudang, dipetakan ke jenis baku.
const ALIAS_JENIS = {
  masuk: "masuk",
  "barang masuk": "masuk",
  pembelian: "masuk",
  keluar: "keluar",
  "barang keluar": "keluar",
  pengambilan: "keluar",
  permintaan: "keluar",
  koreksi: "koreksi",
  penyesuaian: "koreksi",
  opname: "koreksi",
  "stock opname": "koreksi",
};

// Judul kolom yang dikenali. Urutan kolom di berkas bebas; yang dicocokkan
// judulnya, jadi berkas hasil export dashboard ini bisa langsung diimpor
// ulang, begitu pula berkas buatan tangan dengan kolom tambahan.
const ALIAS_KOLOM = {
  tanggal: ["tanggal", "tgl", "waktu", "tanggal mutasi"],
  id_barang: ["kode", "kode barang", "id barang", "id_barang", "sku"],
  nama_barang: ["nama barang", "barang", "nama"],
  jenis: ["jenis", "jenis mutasi", "tipe", "transaksi"],
  jumlah: ["jumlah", "qty", "kuantitas", "banyak"],
  pihak: ["pegawai", "nama pegawai", "pihak", "pemohon", "pengambil", "penerima"],
  unit: ["unit", "unit kerja", "bagian"],
  keterangan: ["keterangan", "catatan", "ket"],
};

const TEMPLATE_KOLOM = [
  { header: "Tanggal", key: "tanggal", width: 18 },
  { header: "Kode Barang", key: "id_barang", width: 14 },
  { header: "Nama Barang", key: "nama_barang", width: 30 },
  { header: "Jenis", key: "jenis", width: 12 },
  { header: "Jumlah", key: "jumlah", width: 10 },
  { header: "Pegawai", key: "pihak", width: 24 },
  { header: "Unit", key: "unit", width: 22 },
  { header: "Keterangan", key: "keterangan", width: 36 },
];

const normal = (t) => String(t ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Sel ExcelJS bisa berupa angka, teks, Date, rumus { result }, tautan
// { text }, atau teks kaya { richText: [...] }. Semuanya diratakan di sini.
function nilaiSel(v) {
  if (v == null) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return nilaiSel(v.result);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return nilaiSel(v.text);
    if ("error" in v) return "";
  }
  return v;
}

const dua = (n) => String(n).padStart(2, "0");

// Mengubah isi sel tanggal menjadi ISO dengan offset +07:00 yang eksplisit,
// supaya server menafsirkannya sama apa pun zona waktu VPS-nya.
function keIsoWib(v) {
  if (v === "" || v == null) return { nilai: "" };

  // Nomor seri tanggal Excel (sel bertanggal tapi formatnya "General").
  if (typeof v === "number" && v > 20000 && v < 80000) {
    v = new Date(Math.round((v - 25569) * 86400000));
  }

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { galat: "tanggal tidak terbaca" };

    return {
      nilai:
        `${v.getUTCFullYear()}-${dua(v.getUTCMonth() + 1)}-${dua(v.getUTCDate())}` +
        `T${dua(v.getUTCHours())}:${dua(v.getUTCMinutes())}:00+07:00`,
    };
  }

  const t = String(v).trim();

  // 2026-11-02 atau 2026-11-02 09:30
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})[:.](\d{2}))?/);
  if (m) {
    const [, y, bln, h, jam = "0", mnt = "0"] = m;
    return { nilai: `${y}-${dua(bln)}-${dua(h)}T${dua(jam)}:${dua(mnt)}:00+07:00` };
  }

  // 02/11/2026, 2-11-2026, atau dengan jam — urutan hari/bulan Indonesia.
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2})[:.](\d{2}))?/);
  if (m) {
    const [, h, bln, y, jam = "0", mnt = "0"] = m;
    if (Number(bln) > 12) return { galat: `tanggal "${t}" harus berurutan hari/bulan/tahun` };
    return { nilai: `${y}-${dua(bln)}-${dua(h)}T${dua(jam)}:${dua(mnt)}:00+07:00` };
  }

  return { galat: `tanggal "${t}" tidak dikenali (pakai 02/11/2026 atau 2026-11-02)` };
}

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

function gayaJudul(baris) {
  baris.font = { bold: true, color: { argb: "FFFFFFFF" } };
  baris.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  baris.alignment = { vertical: "middle" };
}

// =========================================================
// TEMPLATE
// =========================================================

export async function unduhTemplate(daftarBarang) {
  const ExcelJS = await muatExcel();
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("Mutasi");
  ws.columns = TEMPLATE_KOLOM;
  gayaJudul(ws.getRow(1));

  ws.addRow({
    tanggal: "02/11/2026 09:00",
    id_barang: daftarBarang[0]?.id || "ATK-001",
    nama_barang: daftarBarang[0]?.nama || "",
    jenis: "Masuk",
    jumlah: 10,
    keterangan: "Contoh: pembelian dari penyedia — hapus baris ini",
  });
  ws.addRow({
    tanggal: "03/11/2026",
    id_barang: daftarBarang[1]?.id || "ELK-001",
    nama_barang: daftarBarang[1]?.nama || "",
    jenis: "Keluar",
    jumlah: 2,
    pihak: "Nama Pegawai",
    unit: "Bagian Umum",
    keterangan: "Contoh: diambil pegawai — hapus baris ini",
  });

  // Daftar pilihan jenis, supaya isian tidak salah eja sejak awal.
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Masuk,Keluar,Koreksi"'],
    };
  }

  const petunjuk = wb.addWorksheet("Petunjuk");
  petunjuk.columns = [{ width: 110 }];
  [
    "CARA MENGISI",
    "",
    "• Satu baris = satu kejadian. Kolom wajib: Tanggal, Kode Barang (atau Nama Barang persis), Jenis, Jumlah.",
    "• Tanggal ditulis hari/bulan/tahun, boleh dengan jam: 02/11/2026 atau 02/11/2026 09:30. Jam dibaca sebagai WIB.",
    "• Jenis: Masuk (barang baru dibeli), Keluar (diambil pegawai), atau Koreksi (hasil stock opname).",
    "• Jumlah selalu positif. Hanya Koreksi (hasil stock opname) yang boleh minus, mis. -2 bila fisik kurang 2.",
    "• Setiap baris LANGSUNG mengubah stok barang. Keluar yang melebihi stok akan ditolak.",
    "• Import bersifat semua-atau-tidak: bila satu baris salah, tidak ada yang tersimpan. Perbaiki lalu import ulang.",
    "",
    "DAFTAR KODE BARANG",
    ...daftarBarang.map((b) => `${b.id}    ${b.nama}    (${b.satuan || "Pcs"}, stok ${b.stok})`),
  ].forEach((t, i) => {
    const row = petunjuk.addRow([t]);
    if (i === 0 || t === "DAFTAR KODE BARANG") row.font = { bold: true };
  });

  unduhBlob(await wb.xlsx.writeBuffer(), "template-import-rekap-barang.xlsx");
}

// =========================================================
// IMPORT
// =========================================================

// Membaca berkas dan memeriksa setiap baris di browser lebih dulu, supaya
// operator melihat semua kesalahannya sekaligus di pratinjau — bukan satu
// per satu dari server. Server tetap memeriksa ulang di dalam transaksi.
export async function bacaBerkasImpor(berkas, daftarBarang) {
  const ExcelJS = await muatExcel();
  const wb = new ExcelJS.Workbook();

  const nama = berkas.name.toLowerCase();
  const isi = await berkas.arrayBuffer();

  if (nama.endsWith(".csv")) {
    // ExcelJS membaca CSV dari stream Node, bukan buffer browser, jadi CSV
    // diurai sendiri: pemisah koma atau titik koma (Excel berbahasa
    // Indonesia menyimpan CSV dengan titik koma).
    const teks = new TextDecoder("utf-8").decode(isi).replace(/^\uFEFF/, "");
    const ws = wb.addWorksheet("csv");
    const pemisah = (teks.split(/\r?\n/)[0].match(/;/g) || []).length >
      (teks.split(/\r?\n/)[0].match(/,/g) || []).length ? ";" : ",";
    for (const baris of uraiCsv(teks, pemisah)) ws.addRow(baris);
  } else if (nama.endsWith(".xlsx")) {
    await wb.xlsx.load(isi);
  } else {
    throw new Error("Format berkas harus .xlsx atau .csv. Berkas .xls lama: simpan ulang sebagai .xlsx dulu.");
  }

  // Lembar pertama yang punya judul kolom yang dikenali — berkas hasil
  // export punya lembar Ringkasan juga, dan itu harus dilewati.
  let ws = null;
  let peta = null;
  let barisJudul = 0;

  for (const lembar of wb.worksheets) {
    for (let r = 1; r <= Math.min(10, lembar.rowCount); r++) {
      const p = petaKolom(lembar.getRow(r));
      if (p.jenis && p.jumlah && (p.id_barang || p.nama_barang)) {
        ws = lembar;
        peta = p;
        barisJudul = r;
        break;
      }
    }
    if (ws) break;
  }

  if (!ws) {
    throw new Error(
      "Judul kolom tidak ditemukan. Minimal harus ada kolom Jenis, Jumlah, dan Kode Barang (atau Nama Barang). Unduh template untuk contohnya.",
    );
  }

  const perKode = new Map(daftarBarang.map((b) => [normal(b.id), b]));
  const perNama = new Map(daftarBarang.map((b) => [normal(b.nama), b]));

  const hasil = [];

  for (let r = barisJudul + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ambil = (k) => (peta[k] ? nilaiSel(row.getCell(peta[k]).value) : "");

    const mentah = Object.fromEntries(Object.keys(ALIAS_KOLOM).map((k) => [k, ambil(k)]));

    // Baris kosong (sering ada di ujung berkas) dilewati diam-diam.
    if (Object.values(mentah).every((v) => String(v).trim() === "")) continue;

    // Baris contoh di template sengaja diberi tanda supaya tidak ikut masuk.
    if (/hapus baris ini/i.test(String(mentah.keterangan))) continue;

    const galat = [];

    const kode = normal(mentah.id_barang);
    const barang = (kode && perKode.get(kode)) || perNama.get(normal(mentah.nama_barang));

    if (!barang) {
      galat.push(
        kode
          ? `kode barang "${mentah.id_barang}" tidak ada di katalog`
          : `nama barang "${mentah.nama_barang}" tidak ada di katalog`,
      );
    }

    const jenis = ALIAS_JENIS[normal(mentah.jenis)];
    if (!jenis) galat.push(`jenis "${mentah.jenis}" tidak dikenal`);

    const jumlah = Number(String(mentah.jumlah).replace(/\s/g, "").replace(",", "."));
    if (!Number.isInteger(jumlah) || jumlah === 0) galat.push(`jumlah "${mentah.jumlah}" harus bilangan bulat bukan nol`);
    else if (jenis && jenis !== "koreksi" && jumlah < 0) galat.push("jumlah minus hanya boleh untuk Koreksi");

    const tgl = keIsoWib(mentah.tanggal);
    if (tgl.galat) galat.push(tgl.galat);
    else if (!tgl.nilai) galat.push("tanggal kosong");

    hasil.push({
      baris_excel: r,
      tanggal: tgl.nilai || "",
      id_barang: barang?.id || String(mentah.id_barang || ""),
      nama_barang: barang?.nama || String(mentah.nama_barang || ""),
      satuan: barang?.satuan || "",
      jenis: jenis || String(mentah.jenis || ""),
      jumlah,
      pihak: String(mentah.pihak || "").trim(),
      unit: String(mentah.unit || "").trim(),
      keterangan: String(mentah.keterangan || "").trim(),
      galat,
    });
  }

  return hasil;
}

function petaKolom(row) {
  const peta = {};

  row.eachCell((cell, kolom) => {
    const judul = normal(nilaiSel(cell.value));
    for (const [kunci, alias] of Object.entries(ALIAS_KOLOM)) {
      if (!peta[kunci] && alias.includes(judul)) peta[kunci] = kolom;
    }
  });

  return peta;
}

// Pengurai CSV kecil yang paham tanda kutip ("Kertas A4, 80gr").
function uraiCsv(teks, pemisah) {
  const baris = [];
  let kini = [];
  let sel = "";
  let dalamKutip = false;

  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];

    if (dalamKutip) {
      if (c === '"' && teks[i + 1] === '"') {
        sel += '"';
        i++;
      } else if (c === '"') dalamKutip = false;
      else sel += c;
    } else if (c === '"') dalamKutip = true;
    else if (c === pemisah) {
      kini.push(sel);
      sel = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && teks[i + 1] === "\n") i++;
      kini.push(sel);
      baris.push(kini);
      kini = [];
      sel = "";
    } else sel += c;
  }

  if (sel || kini.length) {
    kini.push(sel);
    baris.push(kini);
  }

  return baris;
}

// =========================================================
// EXPORT
// =========================================================

const keSelWib = (nilai) => (nilai ? new Date(new Date(nilai).getTime() + WIB) : null);

export async function exportRekapExcel(baris, ringkasan, { dari, sampai } = {}) {
  const ExcelJS = await muatExcel();
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ws = wb.addWorksheet("Mutasi");
  ws.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Tanggal", key: "tanggal", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    { header: "Kode Barang", key: "id_barang", width: 13 },
    { header: "Nama Barang", key: "nama_barang", width: 30 },
    { header: "Jenis", key: "jenis", width: 10 },
    { header: "Jumlah", key: "jumlah", width: 9 },
    { header: "Satuan", key: "satuan", width: 9 },
    { header: "Stok Sesudah", key: "stok_sesudah", width: 12 },
    { header: "Pegawai", key: "pihak", width: 24 },
    { header: "Unit", key: "unit", width: 22 },
    { header: "Keterangan", key: "keterangan", width: 36 },
    { header: "Sumber", key: "sumber", width: 11 },
    { header: "Dicatat Oleh", key: "dicatat_oleh", width: 18 },
  ];
  gayaJudul(ws.getRow(1));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Diurutkan dari yang terlama, seperti buku gudang.
  [...baris].reverse().forEach((b, i) => {
    ws.addRow({
      ...b,
      no: i + 1,
      tanggal: keSelWib(b.tanggal),
      jenis: LABEL_JENIS[b.jenis] || b.jenis,
    });
  });
  ws.autoFilter = { from: "A1", to: "M1" };

  const wr = wb.addWorksheet("Ringkasan");
  wr.columns = [
    { header: "Kode Barang", key: "id_barang", width: 13 },
    { header: "Nama Barang", key: "nama_barang", width: 30 },
    { header: "Satuan", key: "satuan", width: 9 },
    { header: "Masuk", key: "masuk", width: 9 },
    { header: "Keluar", key: "keluar", width: 9 },
    { header: "Koreksi", key: "koreksi", width: 9 },
  ];
  gayaJudul(wr.getRow(1));
  ringkasan.forEach((r) => wr.addRow(r));

  const periode = `${dari || "awal"}_${sampai || "kini"}`;
  unduhBlob(await wb.xlsx.writeBuffer(), `rekap-barang_${periode}.xlsx`);
}
