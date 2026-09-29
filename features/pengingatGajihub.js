// =========================================================
// PENGINGAT ABSEN ASN — pesan GRUP per unit, dari Gajihub.
//
// BEDA DARI `pindaiPengingatPulang()` di index.js, dan bedanya
// bukan sekadar sumber data:
//
//   pengingat Non-ASN          pengingat ASN (berkas ini)
//   -----------------          --------------------------
//   japri ke tiap orang        satu pesan ke GRUP unit
//   hanya absen pulang         checkin DAN checkout
//   tiap jam, maksimal 4x      sekali per jadwal, per hari
//   API presensi Non-ASN       Gajihub /api/pengingat-absen
//
// KONSEKUENSI YANG MEMBEDAKAN KEDUANYA: pesan ini MENYEBUT NAMA
// di depan seluruh unit. Japri yang terkirim dua kali cuma
// mengganggu satu orang; pesan grup yang terkirim dua kali
// mengganggu puluhan orang sekaligus — dan yang salah sebut nama
// tidak bisa ditarik kembali. Itu sebabnya berkas ini jauh lebih
// pelit mengirim daripada tetangganya.
//
// SELURUH KEPUTUSAN "SIAPA YANG DIINGATKAN" ADA DI GAJIHUB, bukan
// di sini. Bot ini tidak menghitung apa pun: ia menerima
// `pesanCheckin`/`pesanCheckout` yang sudah jadi, dan tugasnya
// cuma memutuskan KAPAN mengirim. Jangan pindahkan aturan jam
// kerja ke berkas ini — di Gajihub rumusnya sudah diadu ke berkas
// hitung petugas, di sini tidak ada yang mengadunya.
// =========================================================

// index.js memanggil require("dotenv").config() setelah modul ini
// di-require, jadi dipanggil sendiri di sini — kalau tidak,
// seluruh GAJIHUB_* terbaca undefined.
require("dotenv").config();

const axios = require("axios");

// =========================================================
// FUNGSI MURNI — bisa diuji tanpa WhatsApp maupun jaringan
// =========================================================

// "08.35" atau "08:35" → menit sejak tengah malam. Bentuk titik
// dipakai karena itu yang sudah dipakai PENGINGAT_BATAS_JAM di
// index.js; bentuk titik dua ikut diterima supaya orang yang
// menulis jam dengan cara lazim tidak mendapat fitur yang diam.
//
// Disalin dari index.js dengan sadar: modul di features/ tidak
// bisa me-require index.js (itu titik masuk aplikasi, jadi
// melingkar), dan menyalin enam baris lebih murah daripada
// memindahkan fungsi milik fitur lain.
function menitDariJam(nilai) {
  const cocok = /^(\d{1,2})[.:](\d{2})$/.exec(String(nilai || "").trim());

  if (!cocok) return null;

  const jam = Number(cocok[1]);
  const menit = Number(cocok[2]);

  if (jam > 23 || menit > 59) return null;

  return jam * 60 + menit;
}

// "16.15,17.15" → [975, 1035]. Nilai ngawur DIBUANG, bukan
// dijadikan 0 — jadwal 00:00 berarti mengirim daftar nama pegawai
// ke grup pada tengah malam.
function uraiJadwal(teks) {
  return String(teks || "")
    .split(",")
    .map((b) => menitDariJam(b))
    .filter((m) => m !== null)
    .sort((a, b) => a - b);
}

function jamTeks(menit) {
  return (
    `${String(Math.floor(menit / 60)).padStart(2, "0")}.` +
    `${String(menit % 60).padStart(2, "0")}`
  );
}

// Apakah jadwal ini sudah waktunya dikirim.
//
// JENDELA, BUKAN SEKADAR "sudah lewat". Ini pembeda terpenting
// dari pengingat Non-ASN: catatan "sudah terkirim" hidup di
// memori dan hilang saat bot restart. Dengan aturan "sudah
// lewat", restart pukul 14:00 akan mengirim ULANG pesan checkin
// pukul 08.35 — ke grup, lengkap dengan nama orang, enam jam
// basi. Dengan jendela, jadwal yang sudah jauh terlewat dilewati
// diam-diam, dan itu perilaku yang benar.
//
// pm2 me-restart bot ini tiap tengah malam (cron_restart di
// ecosystem.config.js), jadi restart bukan kejadian langka.
function saatnyaKirim({ sekarang, jadwal, sudahTerkirim, jendela }) {
  if (sekarang === null || jadwal === null) return false;

  if (sudahTerkirim) return false;

  return sekarang >= jadwal && sekarang - jadwal <= jendela;
}

// =========================================================
// KONFIGURASI
// =========================================================

// Bawaannya localhost VPS, BUKAN alamat publik. Botnya satu mesin
// dengan Gajihub, jadi permintaannya tidak perlu keluar lewat
// proxy Pusdatik sama sekali — dan daftar nama pegawai tidak
// perlu melewati internet untuk sampai ke tetangga sebelah.
const GAJIHUB_URL = (
  process.env.GAJIHUB_URL || "http://127.0.0.1:3002"
).replace(/\/+$/, "");

const GAJIHUB_SECRET = process.env.GAJIHUB_SECRET || "";

// Nama unit HARUS PERSIS seperti di data pegawai Gajihub —
// dicocokkan sama dengan, bukan "mengandung". Salah satu huruf
// berarti 404, dan itu memang yang diinginkan: lebih baik gagal
// terang-terangan daripada mengirim daftar nama unit lain.
const GAJIHUB_SATKER = process.env.GAJIHUB_SATKER || "";

// Grup TUJUAN. Sengaja variabel sendiri, TIDAK menumpang
// HELPDESK_GROUP_ID: grup helpdesk isinya tim pendukung, bukan
// pegawai unit — daftar nama yang belum absen salah alamat di
// sana, dan pesan WhatsApp tidak bisa ditarik kembali.
const GAJIHUB_GRUP_ID = process.env.GAJIHUB_GRUP_ID || "";

// Jadwal kirim, boleh lebih dari satu, dipisah koma.
//
// KENAPA CHECKOUT PERLU LEBIH DARI SATU JADWAL: jam boleh pulang
// BERGESER mengikuti jam kedatangan (masuk 07:30 boleh pulang
// 16:00, masuk 09:10 baru 17:00). Gajihub sudah menyaring yang
// belum boleh pulang, jadi satu kali kirim pukul 16.15 akan
// melewatkan seluruh orang yang datang siang — bukan karena
// mereka sudah tap, tapi karena giliran mereka belum tiba.
const JADWAL_CHECKIN = uraiJadwal(process.env.GAJIHUB_JAM_CHECKIN || "08.35");
const JADWAL_CHECKOUT = uraiJadwal(
  process.env.GAJIHUB_JAM_CHECKOUT || "16.15,17.15",
);

const SCAN_MENIT = Number(process.env.GAJIHUB_SCAN_MENIT || 5);

// Fitur MATI kalau salah satu dari tiga ini kosong. Tidak ada
// nilai cadangan untuk rahasia maupun grup tujuan — bot yang
// menebak ke mana daftar nama orang dikirim adalah bot yang salah
// kirim.
const AKTIF =
  process.env.GAJIHUB_PENGINGAT !== "0" &&
  Boolean(GAJIHUB_SECRET && GAJIHUB_SATKER && GAJIHUB_GRUP_ID);

// =========================================================
// PENGAMBILAN DATA
// =========================================================

async function ambilPengingat() {
  const alamat = `${GAJIHUB_URL}/api/pengingat-absen`;

  let res;

  try {
    res = await axios.get(alamat, {
      params: { satker: GAJIHUB_SATKER },
      headers: { "x-gajihub-secret": GAJIHUB_SECRET },
      // Permintaan ini menyentuh tiga database (Gajihub, SIAP,
      // e-Presensi) lewat rantai pemetaan NIP, jadi bukan
      // permintaan yang selesai dalam sekejap.
      timeout: 60000,
    });
  } catch (err) {
    const kode = err?.response?.status;

    // Pesan galat yang MENYEBUT TINDAKANNYA, bukan cuma kodenya.
    // Ketiga kegagalan ini punya perbaikan yang sama sekali
    // berbeda, dan yang membacanya pukul enam pagi tidak sedang
    // ingin menebak-nebak.
    if (kode === 401) {
      throw new Error(
        "401 — GAJIHUB_SECRET di bot tidak sama dengan " +
          "PENGINGAT_ABSEN_SECRET di .env Gajihub.",
      );
    }

    if (kode === 503) {
      throw new Error(
        "503 — PENGINGAT_ABSEN_SECRET belum diisi di .env Gajihub. " +
          "Isi dulu, lalu pm2 restart gajihub.",
      );
    }

    if (kode === 404) {
      throw new Error(
        `404 — tidak ada pegawai AKTIF dengan satuan kerja ` +
          `"${GAJIHUB_SATKER}". Namanya harus PERSIS seperti di data ` +
          `pegawai Gajihub.`,
      );
    }

    throw new Error(`Gagal menghubungi ${alamat}: ${err?.message || err}`);
  }

  // BALASAN BUKAN JSON = HALAMAN LOGIN, dan ini kegagalan yang
  // paling sulit ditelusuri kalau tidak ditangkap di sini:
  // middleware Gajihub mengalihkan permintaan tanpa sesi ke
  // /login, axios mengikuti pengalihannya, dan yang diterima bot
  // adalah HTML berstatus 200 — terlihat persis seperti berhasil.
  if (typeof res.data !== "object" || res.data === null) {
    throw new Error(
      "Balasan bukan JSON — hampir pasti halaman login. Versi Gajihub " +
        "yang ter-deploy belum memuat /api/pengingat-absen di RUTE_MESIN " +
        "(src/middleware.ts). Deploy dulu, lalu pastikan panggilan tanpa " +
        "header rahasia membalas 401, bukan 307.",
    );
  }

  return res.data;
}

// =========================================================
// PEMINDAIAN
// =========================================================

// Kunci: "<tanggal>|<jenis>|<jadwal>" → true.
//
// Tanggalnya TANGGAL SERVER e-PRESENSI yang ikut di balasan,
// bukan tanggal mesin bot — keduanya bisa berbeda zona waktu, dan
// kunci bertanggal salah berarti pesan yang sama terkirim dua
// kali atau tidak terkirim sama sekali.
const sudahDikirim = new Map();

// `kirim` disuntikkan dari index.js, bukan di-require dari sana —
// supaya berkas ini tidak melingkar ke titik masuk aplikasi dan
// tetap bisa dijalankan tanpa WhatsApp saat diperiksa.
async function pindaiPengingatGajihub({ kirim, sekarangMenit }) {
  if (!AKTIF) return;

  const sekarang =
    sekarangMenit !== undefined
      ? sekarangMenit
      : new Date().getHours() * 60 + new Date().getMinutes();

  const jendela = Math.max(SCAN_MENIT, 5);

  // Semua jadwal masih jauh — jangan bangunkan Gajihub, apalagi
  // SIAP dan e-Presensi yang dua-duanya sistem produksi yang
  // sedang melayani pegawai.
  const adaYangDekat = [...JADWAL_CHECKIN, ...JADWAL_CHECKOUT].some(
    (j) => sekarang >= j && sekarang - j <= jendela,
  );

  if (!adaYangDekat) return;

  let data;

  try {
    data = await ambilPengingat();
  } catch (err) {
    console.error("[GAJIHUB]", err?.message || err);
    return;
  }

  const tanggal = data.tanggal;

  // Buang catatan hari sebelumnya supaya Map tidak tumbuh terus
  // selama bot hidup berminggu-minggu.
  for (const kunci of sudahDikirim.keys()) {
    if (!kunci.startsWith(`${tanggal}|`)) sudahDikirim.delete(kunci);
  }

  // Gajihub sudah mengosongkan kedua pesan pada hari libur. Ini
  // cuma supaya sebabnya terbaca di log — orang yang mengira
  // botnya mati akan mencarinya di situ.
  if (data.hariLibur) {
    console.log(
      `[GAJIHUB] ${tanggal} hari libur (${data.hariLibur.keterangan}) — ` +
        `tidak ada pengingat.`,
    );
    return;
  }

  const tugas = [
    { jenis: "checkin", jadwal: JADWAL_CHECKIN, teks: data.pesanCheckin },
    { jenis: "checkout", jadwal: JADWAL_CHECKOUT, teks: data.pesanCheckout },
  ];

  for (const { jenis, jadwal, teks } of tugas) {
    for (const j of jadwal) {
      const kunci = `${tanggal}|${jenis}|${j}`;

      if (
        !saatnyaKirim({
          sekarang,
          jadwal: j,
          sudahTerkirim: sudahDikirim.get(kunci) === true,
          jendela,
        })
      ) {
        continue;
      }

      // Ditandai terkirim SEBELUM dikirim, dan itu disengaja:
      // percobaan ulang otomatis ke grup berisiko mengirim dua
      // kali kalau ternyata pesan pertama sebenarnya sampai.
      // Untuk pesan berisi nama orang, terlewat sekali lebih
      // ringan akibatnya daripada terkirim dua kali.
      sudahDikirim.set(kunci, true);

      // null = tidak ada yang perlu diingatkan. Pesan berisi
      // daftar kosong mengajari orang mengabaikan pengingat ini.
      if (!teks) {
        console.log(`[GAJIHUB] ${tanggal} ${jenis}: nihil, tidak dikirim.`);
        continue;
      }

      try {
        await kirim(GAJIHUB_GRUP_ID, teks);

        console.log(
          `[GAJIHUB] ${tanggal} ${jenis} terkirim — belum checkin ` +
            `${data.ringkasan.belumCheckin}, belum checkout ` +
            `${data.ringkasan.belumCheckout}, dari ${data.ringkasan.totalAktif} ` +
            `pegawai aktif.`,
        );
      } catch (err) {
        console.error(
          `[GAJIHUB] Gagal mengirim ${jenis}:`,
          err?.message || err,
        );
      }
    }
  }
}

let timer = null;

function mulaiPengingatGajihub({ kirim }) {
  if (timer) return;

  if (!AKTIF) {
    console.log(
      "[GAJIHUB] Pengingat ASN nonaktif — GAJIHUB_SECRET, GAJIHUB_SATKER, " +
        "atau GAJIHUB_GRUP_ID belum diisi di .env.",
    );
    return;
  }

  console.log(
    `[GAJIHUB] Pengingat ASN aktif — unit "${GAJIHUB_SATKER}", checkin ` +
      `${JADWAL_CHECKIN.map(jamTeks).join(", ")}, checkout ` +
      `${JADWAL_CHECKOUT.map(jamTeks).join(", ")}, pindai tiap ` +
      `${SCAN_MENIT} menit.`,
  );

  timer = setInterval(() => {
    pindaiPengingatGajihub({ kirim }).catch((err) =>
      console.error("[GAJIHUB] Kesalahan tak tertangani:", err),
    );
  }, SCAN_MENIT * 60 * 1000);
}

module.exports = {
  AKTIF,
  GAJIHUB_URL,
  GAJIHUB_SATKER,
  JADWAL_CHECKIN,
  JADWAL_CHECKOUT,
  menitDariJam,
  uraiJadwal,
  jamTeks,
  saatnyaKirim,
  ambilPengingat,
  pindaiPengingatGajihub,
  mulaiPengingatGajihub,
};
