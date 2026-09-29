// =========================================================
// TEMPAT PENYIMPANAN PDF LAPORAN
// =========================================================
//
// Sebelum ini semua PDF ditumpuk di satu folder `reports/`, dan
// nama berkasnya disusun dari data yang berulang tiap hari —
// nama pegawai, NIP, substansi. Akibatnya berkas lama ditimpa
// berkas baru tanpa peringatan apa pun:
//
//   Laporan WFH Budi 25 September  →  Budi_1990xxxx_TU.pdf
//   Laporan WFH Budi 26 September  →  Budi_1990xxxx_TU.pdf  (menimpa)
//
// Yang paling parah laporan WFH/WFA: namanya tidak memuat tanggal
// sama sekali, jadi satu pegawai hanya pernah punya SATU berkas
// laporan yang tersimpan — semua laporan sebelumnya hilang.
//
// DUA HAL YANG DIPERBAIKI, DAN KEDUANYA DIBUTUHKAN
//
// 1. Folder per jenis, lalu per pegawai:
//
//      reports/laporan-wfh/Budi_Santoso/...
//      reports/lembur/Budi_Santoso/...
//      reports/kendaraan/Budi_Santoso/...
//
// 2. Cap waktu di nama berkas.
//
// Folder saja TIDAK menutup masalahnya: folder pegawai disusun
// dari nama yang sama persis dengan yang dipakai nama berkas,
// jadi laporan besok tetap mendarat di folder yang sama dengan
// nama berkas yang sama. Yang benar-benar memisahkan berkas satu
// hari dari hari lain adalah cap waktunya.
//
// Sebaliknya, cap waktu saja juga tidak cukup — satu folder berisi
// ribuan PDF campur aduk tidak bisa ditelusuri orang. Keduanya
// saling melengkapi.

const fs = require("fs");
const path = require("path");

const AKAR_LAPORAN = path.join(__dirname, "..", "reports");

// Kunci dipakai kode, nilainya jadi nama folder. Dipisah supaya
// mengganti nama folder tidak berarti menyisir seluruh kode.
const JENIS = {
  lembur: "lembur",
  kendaraan: "kendaraan",
  wfh: "laporan-wfh",
  wfa: "laporan-wfa",

  // Surat serah terima barang, disimpan atas nama pemohonnya —
  // dialah yang memegang surat itu sebagai bukti peminjaman.
  barang: "barang",
};

// =========================================================
// PEMBERSIH NAMA
// =========================================================

// Untuk nama FOLDER. Aturannya disamakan dengan amankanNamaFolder
// di index.js dan utils/simpanFoto.js di backend, supaya folder
// PDF seorang pegawai bernama sama persis dengan folder fotonya —
// satu nama untuk satu orang di seluruh sistem.
function namaAman(nilai, cadangan = "Tanpa_Nama") {
  const bersih = String(nilai || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .slice(0, 80);

  return bersih || cadangan;
}

// Untuk nama BERKAS. Spasi dibiarkan: nama berkas yang sudah ada
// memakainya ("Laporan Lembur_Budi_...pdf") dan orang membacanya
// langsung di WhatsApp. Yang dibuang hanya yang berbahaya di path
// atau ditolak Windows.
function berkasAman(nilai, cadangan = "laporan.pdf") {
  const bersih = String(nilai || "")
    .replace(/[/\\]/g, "_")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 150);

  return bersih || cadangan;
}

// =========================================================
// CAP WAKTU
// =========================================================

// "20260929-1435". Urut secara abjad sekaligus secara waktu, jadi
// isi folder terbaca berurutan tanpa perlu menyortir apa pun.
//
// Zona waktu dikunci ke WIB: servernya boleh berjalan di UTC, tapi
// yang membaca nama berkasnya duduk di Jakarta — dan laporan jam
// 08.00 yang tertulis 01.00 akan membingungkan selamanya.
function capWaktu(tanggal = new Date()) {
  const bagian = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",

    // h23, bukan hour12:false — beberapa versi ICU menjawab "24"
    // untuk tengah malam kalau memakai hour12.
    hourCycle: "h23",
  }).formatToParts(tanggal);

  const p = {};

  for (const b of bagian) p[b.type] = b.value;

  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

// Menyisipkan cap waktu sebelum ekstensi, bukan menempelkannya di
// ujung — "laporan-20260929-1435.pdf", bukan "laporan.pdf-2026…".
function denganCapWaktu(namaFile, tanggal = new Date()) {
  const nama = String(namaFile || "");

  const ekstensi = path.extname(nama);
  const pokok = ekstensi ? nama.slice(0, -ekstensi.length) : nama;

  return `${pokok}_${capWaktu(tanggal)}${ekstensi || ".pdf"}`;
}

// =========================================================
// MENYIAPKAN TUJUAN
// =========================================================

function folderJenis(jenis) {
  const nama = JENIS[jenis];

  if (!nama) throw new Error(`Jenis laporan tidak dikenali: ${jenis}`);

  return path.join(AKAR_LAPORAN, nama);
}

// Mengembalikan path lengkap berkas yang siap ditulis, sesudah
// seluruh folder di atasnya dibuat.
//
// `pemilik` yang kosong tidak menggagalkan apa pun — berkasnya
// mendarat di folder "Tanpa_Nama". Laporan yang sudah selesai
// dibuat lebih baik tersimpan di tempat yang aneh daripada hilang
// karena satu medan nama tidak terisi.
async function siapkanTujuan({ jenis, pemilik, namaFile, tanggal = new Date() }) {
  const folder = path.join(folderJenis(jenis), namaAman(pemilik));

  await fs.promises.mkdir(folder, { recursive: true });

  return path.join(folder, berkasAman(denganCapWaktu(namaFile, tanggal)));
}

// Memilih folder WFH atau WFA dari data laporannya. Satu fungsi
// pembuat PDF melayani keduanya, dan pembedanya cuma satu medan.
function jenisLaporanKinerja(jenisLaporan) {
  return String(jenisLaporan || "").trim().toUpperCase() === "WFA"
    ? "wfa"
    : "wfh";
}

// =========================================================
// MENGHAPUS MILIK SATU ORANG
// =========================================================

// Dipakai fitur reset data pengujian. Sebelum ada struktur folder,
// penghapusan dilakukan dengan menyisir satu folder datar dan
// mencocokkan nama pegawai di dalam nama berkas — cara yang ikut
// menghapus berkas milik "Budi" saat yang dimaksud "Budi Santoso".
//
// Sekarang cukup membuang folder orangnya di setiap jenis, jadi
// tidak ada lagi pencocokan nama yang bisa salah sasaran.
async function hapusMilik(nama) {
  const folder = namaAman(nama, "");

  if (!folder) return 0;

  let jumlah = 0;

  for (const jenis of Object.keys(JENIS)) {
    const target = path.join(folderJenis(jenis), folder);

    try {
      const isi = await fs.promises.readdir(target);

      await fs.promises.rm(target, { recursive: true, force: true });

      jumlah += isi.length;
    } catch (err) {
      // Folder yang tidak pernah ada bukan kegagalan: pegawai itu
      // memang belum pernah membuat laporan jenis tersebut.
      if (err?.code !== "ENOENT") throw err;
    }
  }

  return jumlah;
}

module.exports = {
  AKAR_LAPORAN,
  JENIS,
  namaAman,
  berkasAman,
  capWaktu,
  denganCapWaktu,
  folderJenis,
  siapkanTujuan,
  jenisLaporanKinerja,
  hapusMilik,
};
