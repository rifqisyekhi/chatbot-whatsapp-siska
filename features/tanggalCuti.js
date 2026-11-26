// =========================================================
// TANGGAL CUTI DARI TEKS "LAMA CUTI"
// =========================================================
//
// Tabel riwayat_cuti tidak punya kolom tanggal. Bot SisKA hanya
// menyimpan jawaban pegawai apa adanya di kolom lama_cuti,
// contohnya "2 hari (20 - 21 Oktober 2026)".
//
// Tanpa tanggal, rekap tidak tahu hari mana pegawai sedang cuti,
// sehingga hari itu tetap tampil sebagai Alpha (dilaporkan
// 23 November 2026). Modul ini membaca tanggal dari teks itu.
//
// Bentuk yang dikenali (huruf besar/kecil bebas, bulan boleh
// disingkat):
//   20 Oktober 2026
//   20 - 21 Oktober 2026 / 20 s.d. 21 Oktober / 20 sampai 21 Okt
//   30 Oktober - 2 November 2026
//   20, 21 dan 23 Oktober 2026
//   20/10/2026 - 21/10/2026 / 2026-10-20
//
// Teks yang tidak bisa dibaca menghasilkan daftar kosong — lebih
// baik tetap Alpha daripada menandai cuti di hari yang salah.
//
// SALINAN dari presensi-non-asn/backend/utils/tanggalCuti.js.
// Bot memakainya untuk menolak jawaban "lama cuti" yang tanggalnya
// tidak terbaca, supaya rekap presensi pasti bisa membacanya.
// Kalau aturan bacanya diubah, ubah KEDUA berkas.

const BULAN = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, pebruari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nopember: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

// Cuti terpanjang (melahirkan / besar) sekitar tiga bulan.
// Rentang yang jauh lebih panjang hampir pasti salah baca.
const MAKS_HARI_RENTANG = 200;

function iso(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));

  // Menolak 31 November dan sejenisnya.
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;

  return t.toISOString().slice(0, 10);
}

function tokenkan(teks) {
  let s = ` ${String(teks || "").toLowerCase()} `;

  // "2 hari", "3 hari kerja" adalah jumlah, bukan tanggal.
  // Juga "2 (dua) hari".
  s = s.replace(/\b\d+\s*(\(\s*[a-z]+\s*\)\s*)?hari/g, " ");

  // Tanggal angka diubah jadi bentuk "20 okt 2026" supaya cukup
  // satu jalur pembacaan.
  s = s.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, " $3 #b$2 $1 ");
  s = s.replace(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g, " $1 #b$2 $3 ");
  s = s.replace(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})\b/g, " $1 #b$2 20$3 ");

  // Penghubung rentang.
  s = s.replace(/s\s*[./]?\s*d\s*\.?|\bsampai\b|\bhingga\b|\bsd\b|[–—~]|-/g, " ~ ");

  const hasil = [];

  for (const kata of s.match(/#b\d{1,2}|\d+|[a-z]+|~|,|&/g) || []) {
    if (kata === "~") hasil.push({ jenis: "rentang" });
    else if (kata.startsWith("#b")) hasil.push({ jenis: "bulan", nilai: Number(kata.slice(2)) });
    else if (/^\d{4}$/.test(kata)) hasil.push({ jenis: "tahun", nilai: Number(kata) });
    else if (/^\d{1,2}$/.test(kata)) hasil.push({ jenis: "hari", nilai: Number(kata) });
    else if (BULAN[kata]) hasil.push({ jenis: "bulan", nilai: BULAN[kata] });
  }

  return hasil;
}

// Mengembalikan daftar tanggal ISO (urut, tanpa duplikat).
// `acuan` = kapan pengajuan dibuat; dipakai untuk tahun yang tidak
// ditulis ("20 - 21 Oktober").
function tanggalDariLamaCuti(teks, acuan = new Date()) {
  const token = tokenkan(teks);

  // Titik tanggal beserta apakah ia tersambung rentang ke titik
  // sebelumnya.
  const titik = [];
  let sambungRentang = false;

  for (const t of token) {
    if (t.jenis === "rentang") {
      if (titik.length) sambungRentang = true;
      continue;
    }

    if (t.jenis === "hari") {
      if (t.nilai < 1 || t.nilai > 31) continue;
      titik.push({ d: t.nilai, m: null, y: null, rentang: sambungRentang });
      sambungRentang = false;
      continue;
    }

    // Bulan dan tahun ditulis di belakang hari, dan berlaku untuk
    // semua hari sebelumnya yang belum punya — "20, 21 Oktober".
    const kunci = t.jenis === "bulan" ? "m" : "y";
    for (let i = titik.length - 1; i >= 0 && titik[i][kunci] === null; i--) {
      titik[i][kunci] = t.nilai;
    }
  }

  const acuanTgl = acuan instanceof Date && !isNaN(acuan) ? acuan : new Date();
  const tahunAcuan = acuanTgl.getUTCFullYear();
  const acuanIso = acuanTgl.toISOString().slice(0, 10);

  // Tanpa tahun: tahun pengajuan. Kalau hasilnya jauh sebelum
  // pengajuan (diajukan Desember untuk Januari), tahun berikutnya.
  const lengkap = [];
  for (const p of titik) {
    if (p.m === null) continue;

    let y = p.y ?? tahunAcuan;
    let tgl = iso(y, p.m, p.d);

    if (tgl && p.y === null) {
      const selisih = (Date.parse(acuanIso) - Date.parse(tgl)) / 86400000;
      if (selisih > 60) tgl = iso(++y, p.m, p.d);
    }

    if (tgl) lengkap.push({ tgl, rentang: p.rentang });
  }

  const semua = new Set();

  for (let i = 0; i < lengkap.length; i++) {
    const { tgl, rentang } = lengkap[i];

    if (rentang && i > 0) {
      const awal = Date.parse(lengkap[i - 1].tgl);
      const akhir = Date.parse(tgl);
      const hari = (akhir - awal) / 86400000;

      if (hari >= 0 && hari <= MAKS_HARI_RENTANG) {
        for (let t = awal; t <= akhir; t += 86400000) {
          semua.add(new Date(t).toISOString().slice(0, 10));
        }
        continue;
      }
    }

    semua.add(tgl);
  }

  return [...semua].sort();
}

const NAMA_BULAN = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
  "Agustus", "September", "Oktober", "November", "Desember",
];

// "20 Oktober 2026", "20 – 21 Oktober 2026", atau beberapa potong
// dipisah koma kalau tanggalnya tidak berurutan.
function ringkasTanggalCuti(daftar) {
  if (!daftar.length) return "";

  const teks = (t) => {
    const [y, m, d] = t.split("-").map(Number);
    return { d, m, y, panjang: `${d} ${NAMA_BULAN[m]} ${y}` };
  };

  const potong = [];
  let awal = daftar[0];
  let akhir = daftar[0];

  const tutup = () => {
    const a = teks(awal);
    const b = teks(akhir);
    if (awal === akhir) potong.push(a.panjang);
    else if (a.y === b.y && a.m === b.m) potong.push(`${a.d} – ${b.panjang}`);
    else if (a.y === b.y) potong.push(`${a.d} ${NAMA_BULAN[a.m]} – ${b.panjang}`);
    else potong.push(`${a.panjang} – ${b.panjang}`);
  };

  for (const t of daftar.slice(1)) {
    if (Date.parse(t) - Date.parse(akhir) === 86400000) {
      akhir = t;
      continue;
    }
    tutup();
    awal = akhir = t;
  }
  tutup();

  return potong.join(", ");
}

module.exports = { tanggalDariLamaCuti, ringkasTanggalCuti };
