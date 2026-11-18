// =========================================================
// TARIF PERJALANAN DINAS DALAM NEGERI — PMK 32 TAHUN 2025
// (Standar Biaya Masukan TA 2026) + PERHITUNGAN KWITANSI
// =========================================================
//
// Semua angka di sini disalin dari lampiran PMK 32/2025:
//   28.1  Uang harian perjalanan dinas dalam negeri
//   28.2  Uang representasi
//   30    Penginapan
//   II.3  Transpor kegiatan dalam kabupaten/kota PP
//   II.16 Transportasi dari/ke terminal/bandara (taksi)
//
// Angka-angka itu dicocokkan dengan dua lembar NOMI yang dipakai TU
// (Balai K3 Jakarta 13 Okt 2026 dan luar kota Bali Mei 2026):
// DKI dalam kota Rp210.000, Bali Rp480.000, hotel Bali gol III
// Rp1.138.000, taksi Jakarta Rp250.000 dan Bali Rp219.000 sekali jalan,
// transpor dalam kota Rp170.000 — semuanya sama.
//
// Tarif PMK adalah BATAS ATAS. Penginapan, taksi, dan tiket boleh
// dibayar lebih rendah sesuai riil, karena itu form menyediakan
// isian pengganti untuk ketiganya.

// [nama, uang harian luar kota, uang harian dalam kota >8 jam,
//  hotel eselon I, hotel eselon II, hotel eselon III/gol IV,
//  hotel eselon IV/gol III/II/I, taksi sekali jalan]
//
// Taksi null = provinsi belum ada di tabel PMK (empat provinsi Papua
// pemekaran) — dibayar riil, diisi tangan.
const DATA_PROVINSI = [
  ["Aceh", 360000, 140000, 5109000, 3526000, 1578000, 770000, 123000],
  ["Sumatera Utara", 370000, 150000, 4960000, 2195000, 1188000, 699000, 278000],
  ["Riau", 370000, 150000, 3820000, 3119000, 1650000, 852000, 99000],
  ["Kepulauan Riau", 370000, 150000, 6177000, 2481000, 1388000, 792000, 159000],
  ["Jambi", 370000, 150000, 5004000, 4102000, 1252000, 580000, 133000],
  ["Sumatera Barat", 380000, 150000, 5603000, 3373000, 1353000, 701000, 171000],
  ["Sumatera Selatan", 380000, 150000, 6298000, 3134000, 1966000, 861000, 162000],
  ["Lampung", 380000, 150000, 4806000, 2663000, 1539000, 621000, 162000],
  ["Bengkulu", 380000, 150000, 2140000, 1628000, 1546000, 692000, 106000],
  ["Bangka Belitung", 410000, 160000, 4424000, 2838000, 1957000, 724000, 94000],
  ["Banten", 370000, 150000, 5725000, 2373000, 1301000, 775000, 300000],
  ["Jawa Barat", 430000, 170000, 5812000, 2755000, 1366000, 735000, 180000],
  ["DKI Jakarta", 530000, 210000, 9331000, 2084000, 1062000, 730000, 250000],
  ["Jawa Tengah", 370000, 150000, 6129000, 2138000, 1286000, 810000, 105000],
  ["DI Yogyakarta", 420000, 170000, 5100000, 2695000, 1600000, 845000, 258000],
  ["Jawa Timur", 410000, 160000, 4449000, 2007000, 1234000, 814000, 225000],
  ["Bali", 480000, 190000, 7328000, 2433000, 1754000, 1138000, 219000],
  ["Nusa Tenggara Barat", 440000, 180000, 4682000, 2648000, 1418000, 907000, 224000],
  ["Nusa Tenggara Timur", 430000, 170000, 4013000, 2283000, 1450000, 737000, 105000],
  ["Kalimantan Barat", 380000, 150000, 2654000, 1923000, 1125000, 576000, 165000],
  ["Kalimantan Tengah", 360000, 140000, 4901000, 3391000, 1189000, 706000, 130000],
  ["Kalimantan Selatan", 380000, 150000, 4797000, 3316000, 1500000, 746000, 174000],
  ["Kalimantan Timur", 430000, 170000, 4000000, 2342000, 1507000, 804000, 300000],
  ["Kalimantan Utara", 430000, 170000, 4000000, 2854000, 1507000, 904000, 211000],
  ["Sulawesi Utara", 370000, 150000, 5264000, 2290000, 1270000, 978000, 134000],
  ["Gorontalo", 370000, 150000, 4168000, 3107000, 1606000, 955000, 256000],
  ["Sulawesi Barat", 410000, 160000, 4076000, 3098000, 1344000, 704000, 283000],
  ["Sulawesi Selatan", 430000, 170000, 4820000, 1938000, 1423000, 745000, 181000],
  ["Sulawesi Tengah", 370000, 150000, 2309000, 2166000, 1679000, 951000, 149000],
  ["Sulawesi Tenggara", 380000, 150000, 3089000, 2755000, 1297000, 786000, 154000],
  ["Maluku", 380000, 150000, 3467000, 3240000, 1059000, 667000, 279000],
  ["Maluku Utara", 430000, 170000, 4612000, 3843000, 1160000, 654000, 208000],
  ["Papua", 580000, 230000, 3859000, 3318000, 2521000, 1038000, 462000],
  ["Papua Barat", 480000, 190000, 3872000, 3575000, 2056000, 967000, 228000],
  ["Papua Barat Daya", 480000, 190000, 3872000, 3575000, 2056000, 967000, null],
  ["Papua Tengah", 580000, 230000, 3859000, 3318000, 2521000, 1038000, null],
  ["Papua Selatan", 580000, 230000, 5673000, 4877000, 3706000, 1526000, null],
  ["Papua Pegunungan", 580000, 230000, 5711000, 4911000, 3731000, 1536000, null],
];

const PROVINSI = DATA_PROVINSI.map(([nama, uhLuar, uhDalam, h1, h2, h3, h4, taksi]) => ({
  nama,
  uangHarian: { luarKota: uhLuar, dalamKota: uhDalam },
  hotel: { es1: h1, es2: h2, es3: h3, es4: h4 },
  taksi,
}));

// Tingkat pegawai untuk tarif hotel dan uang representasi.
// Uang representasi HANYA untuk pejabat eselon I dan II (PMK 28.2).
const TINGKAT = [
  { kode: "es1", label: "Eselon I", representasi: { luarKota: 200000, dalamKota: 100000 }, tingkatBiaya: "B" },
  { kode: "es2", label: "Eselon II", representasi: { luarKota: 150000, dalamKota: 75000 }, tingkatBiaya: "C" },
  { kode: "es3", label: "Eselon III / Golongan IV", representasi: null, tingkatBiaya: "C" },
  { kode: "es4", label: "Eselon IV / Golongan III, II, I", representasi: null, tingkatBiaya: "C" },
];

const TRANSPOR_DALAM_KOTA = 170000; // PP, per orang per kali
const KOTA_ASAL = "Jakarta";
const PROVINSI_ASAL = "DKI Jakarta";

// DAFTAR AKUN — SEMENTARA DUMMY.
//
// Kode lengkap berasal dari DIPA/POK satker, bukan dari PMK. Dua yang
// pertama terlihat di lembar NOMI; dua sisanya contoh. Ganti dengan
// daftar dari POK begitu tersedia.
const AKUN = [
  { kode: "026.01.WA.2158.EBA.994.002.A.524111", uraian: "Belanja Perjalanan Dinas Biasa (luar kota)", jenis: "luar" },
  { kode: "026.01.WA.2158.EBA.994.002.A.524113", uraian: "Belanja Perjalanan Dinas Dalam Kota", jenis: "dalam" },
  { kode: "026.01.WA.2158.EBA.994.002.A.524114", uraian: "Belanja Perjalanan Dinas Paket Meeting Dalam Kota (contoh)", jenis: "dalam" },
  { kode: "026.01.WA.2158.EBA.994.002.A.524119", uraian: "Belanja Perjalanan Dinas Paket Meeting Luar Kota (contoh)", jenis: "luar" },
];

// Penandatangan tetap. Bisa diganti lewat .env tanpa ubah kode.
function pejabat() {
  return {
    ppk: {
      nama: process.env.KWITANSI_PPK_NAMA || "Alpha Sandro Adithyaswara, S.Sos., M.M.",
      nip: process.env.KWITANSI_PPK_NIP || "19870323 201503 1 002",
    },
    bendahara: {
      nama: process.env.KWITANSI_BENDAHARA_NAMA || "Prasetyo Muhammad Sidqi",
      nip: process.env.KWITANSI_BENDAHARA_NIP || "19961127 201812 1 001",
    },
  };
}

// =========================================================
// PERHITUNGAN
// =========================================================

class GalatKwitansi extends Error {}

function tanggalSah(teks) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

// Isian angka opsional: kosong/null → null (pakai tarif PMK).
function angkaOpsional(v, nama) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[^\d]/g, ""));
  if (!Number.isSafeInteger(n) || n < 0) throw new GalatKwitansi(`${nama} tidak sah.`);
  return n;
}

const teks = (v) => String(v ?? "").trim();

// Menerima isian form apa adanya, mengembalikan kegiatan yang sudah
// dihitung lengkap. Satu-satunya tempat aturan PMK diterapkan: dipakai
// pratinjau di dashboard dan PDF, jadi keduanya tidak mungkin berbeda.
function hitungKegiatan(input = {}) {
  const jenis = input.jenis === "luar" ? "luar" : "dalam";
  const provinsi = PROVINSI.find((p) => p.nama === (jenis === "dalam" ? PROVINSI_ASAL : input.provinsi));
  if (!provinsi) throw new GalatKwitansi("Pilih provinsi tujuan.");

  const akun = AKUN.find((a) => a.kode === input.akun);
  if (!akun) throw new GalatKwitansi("Pilih akun.");

  const berangkat = tanggalSah(input.tanggal_berangkat);
  const kembali = tanggalSah(input.tanggal_kembali) || berangkat;
  if (!berangkat) throw new GalatKwitansi("Tanggal berangkat wajib diisi.");
  if (kembali < berangkat) throw new GalatKwitansi("Tanggal kembali tidak boleh sebelum tanggal berangkat.");
  // Dalam kota boleh lebih dari sehari (kegiatan berturut-turut):
  // dihitung per hari, tanpa penginapan.
  const hari = Math.round((kembali - berangkat) / 86400000) + 1;
  if (hari > 60) throw new GalatKwitansi("Lama perjalanan lebih dari 60 hari — periksa tanggalnya.");

  const daftar = Array.isArray(input.peserta) ? input.peserta : [];
  if (!daftar.length) throw new GalatKwitansi("Tambahkan minimal satu peserta.");

  const taksiAsal = PROVINSI.find((p) => p.nama === PROVINSI_ASAL).taksi;

  const peserta = daftar.map((p, i) => {
    const nama = teks(p.nama);
    if (!nama) throw new GalatKwitansi(`Nama peserta ke-${i + 1} kosong.`);
    const tingkat = TINGKAT.find((t) => t.kode === p.tingkat) || TINGKAT[3];
    const kunciKota = jenis === "luar" ? "luarKota" : "dalamKota";

    const rincian = [];

    // Uang harian
    const tarifUh = provinsi.uangHarian[kunciKota];
    rincian.push({ kunci: "harian", uraian: "Uang Harian", volume: hari, satuan: "Hari", tarif: tarifUh, jumlah: hari * tarifUh });

    // Uang representasi — hanya eselon I/II
    if (tingkat.representasi) {
      const t = tingkat.representasi[kunciKota];
      rincian.push({ kunci: "representasi", uraian: "Uang Representasi", volume: hari, satuan: "Hari", tarif: t, jumlah: hari * t });
    }

    if (jenis === "luar") {
      // Penginapan: bawaan (hari − 1) malam × tarif PMK; keduanya bisa diganti riil.
      const malam = angkaOpsional(p.malam, `Jumlah malam ${nama}`) ?? Math.max(0, hari - 1);
      const tarifPmk = provinsi.hotel[tingkat.kode];
      const tarifHotel = angkaOpsional(p.tarif_hotel, `Tarif hotel ${nama}`) ?? tarifPmk;
      if (malam > 0) {
        rincian.push({
          kunci: "penginapan", uraian: "Penginapan", volume: malam, satuan: "Malam",
          tarif: tarifHotel, jumlah: malam * tarifHotel, batasPmk: tarifPmk,
        });
      }

      // Tiket pesawat/kereta: riil, diisi tangan.
      const tiket = angkaOpsional(p.tiket, `Tiket ${nama}`) ?? 0;
      if (tiket > 0) {
        rincian.push({ kunci: "tiket", uraian: "Transport", keterangan: `${KOTA_ASAL} - ${teks(input.kota_tujuan) || provinsi.nama} PP`, volume: 1, satuan: "PP", tarif: tiket, jumlah: tiket });
      }

      // Taksi: PP di kota asal + PP di kota tujuan = 2 × tarif masing-masing.
      const taksiJkt = angkaOpsional(p.taksi_asal, `Taksi Jakarta ${nama}`) ?? 2 * taksiAsal;
      const taksiTujuan = angkaOpsional(p.taksi_tujuan, `Taksi tujuan ${nama}`) ?? (provinsi.taksi ? 2 * provinsi.taksi : 0);
      if (taksiJkt > 0) rincian.push({ kunci: "taksiAsal", uraian: "Taksi", keterangan: `${KOTA_ASAL} PP`, volume: 1, satuan: "PP", tarif: taksiJkt, jumlah: taksiJkt });
      if (taksiTujuan > 0) rincian.push({ kunci: "taksiTujuan", uraian: "Taksi", keterangan: `${teks(input.kota_tujuan) || provinsi.nama} PP`, volume: 1, satuan: "PP", tarif: taksiTujuan, jumlah: taksiTujuan });
    } else {
      // Transpor dalam kota PP per hari, bisa dinolkan (mis. ikut kendaraan dinas).
      const tr = angkaOpsional(p.transport, `Transport ${nama}`) ?? TRANSPOR_DALAM_KOTA;
      if (tr > 0) rincian.push({ kunci: "transport", uraian: "Transport", keterangan: `${KOTA_ASAL} PP`, volume: hari, satuan: "Kali", tarif: tr, jumlah: hari * tr });
    }

    return {
      nama,
      nip: teks(p.nip),
      jabatan: teks(p.jabatan),
      golongan: teks(p.golongan),
      tingkat: tingkat.kode,
      tingkatLabel: tingkat.label,
      tingkatBiaya: teks(p.tingkat_biaya) || tingkat.tingkatBiaya,
      rincian,
      total: rincian.reduce((a, r) => a + r.jumlah, 0),
    };
  });

  return {
    jenis,
    akun,
    maksud: teks(input.maksud),
    provinsi: provinsi.nama,
    kotaTujuan: teks(input.kota_tujuan) || (jenis === "dalam" ? KOTA_ASAL : provinsi.nama),
    tempat: teks(input.tempat),
    kotaAsal: KOTA_ASAL,
    alatAngkut: teks(input.alat_angkut) || (jenis === "luar" ? "Pesawat / Kendaraan Umum" : "Kendaraan Umum"),
    nomorSpd: teks(input.nomor_spd),
    noBku: teks(input.no_bku),
    tanggalSpd: tanggalSah(input.tanggal_spd) ? input.tanggal_spd : input.tanggal_berangkat,
    tanggalBerangkat: input.tanggal_berangkat,
    tanggalKembali: input.tanggal_kembali || input.tanggal_berangkat,
    hari,
    tahunAnggaran: String(input.tanggal_berangkat).slice(0, 4),
    peserta,
    total: peserta.reduce((a, p) => a + p.total, 0),
    pejabat: pejabat(),
  };
}

function referensi() {
  return {
    provinsi: PROVINSI,
    tingkat: TINGKAT,
    akun: AKUN,
    transporDalamKota: TRANSPOR_DALAM_KOTA,
    kotaAsal: KOTA_ASAL,
    provinsiAsal: PROVINSI_ASAL,
    pejabat: pejabat(),
    sumber: "PMK 32 Tahun 2025 (SBM TA 2026)",
  };
}

module.exports = { PROVINSI, TINGKAT, AKUN, hitungKegiatan, referensi, GalatKwitansi };
