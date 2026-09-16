// =========================================================
// PERAWATAN PROFIL CHROMIUM MILIK SESI WHATSAPP
// =========================================================
//
// LocalAuth({ clientId: "siska" }) memakai `.wwebjs_auth/session-siska`
// sebagai userDataDir Chromium (LocalAuth.js:33-53). Jadi folder itu
// bukan sekadar "file sesi": ia profil browser utuh — cache, service
// worker, IndexedDB, cookie, semuanya.
//
// Kredensial WhatsApp-nya sendiri ada di IndexedDB. Itu sebabnya
// menghapus seluruh folder selalu menyembuhkan bot yang mentok di
// antara AUTHENTICATED dan READY, tetapi menghapus sesinya sekaligus
// sehingga harus scan QR lagi.
//
// Berkas ini memisahkan dua hal yang selama ini terhapus bersamaan:
//
//   - Yang boleh dibuang: cache, service worker, shader — semuanya
//     dibangun ulang sendiri oleh Chromium. Di sinilah kerusakan yang
//     membuat halaman WhatsApp Web tidak pernah selesai memuat.
//   - Yang tidak boleh disentuh: IndexedDB, Local Storage, Session
//     Storage, dan Cookies. Di situlah sesinya. Sekali hilang,
//     QR wajib diulang.

const fs = require("fs/promises");
const path = require("path");

// Sisa penanda proses Chromium yang mati tanpa sempat bersih-bersih —
// misalnya saat pm2 membunuh paksa. Chromium berikutnya bisa menolak
// memakai profilnya selama berkas ini masih ada.
const BERKAS_KUNCI = [
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
  "DevToolsActivePort",
];

// Aman dibuang: semuanya cache yang dibangun ulang otomatis.
const FOLDER_CACHE = [
  "Default/Service Worker",
  "Default/Cache",
  "Default/Code Cache",
  "Default/GPUCache",
  "Default/DawnCache",
  "Default/DawnGraphiteCache",
  "Default/DawnWebGPUCache",
  "GrShaderCache",
  "ShaderCache",
  "GraphiteDawnCache",
];

// JANGAN PERNAH dihapus otomatis — di sinilah sesi WhatsApp-nya.
// Didaftar di sini bukan untuk dipakai kode, tapi supaya siapa pun yang
// menambah nama ke FOLDER_CACHE tahu batasnya di mana.
const JANGAN_DISENTUH = [
  "Default/IndexedDB",
  "Default/Local Storage",
  "Default/Session Storage",
  "Default/Cookies",
  "Default/Preferences",
];

function folderSesi(clientId = "siska", dataPath = ".wwebjs_auth") {
  return path.resolve(dataPath, `session-${clientId}`);
}

async function ada(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

// Membuang sisa kunci proses. Selalu aman dipanggil, termasuk saat
// profilnya belum pernah dibuat.
async function hapusKunci(sesi = folderSesi()) {
  const terhapus = [];

  for (const nama of BERKAS_KUNCI) {
    const target = path.join(sesi, nama);

    if (!(await ada(target))) continue;

    try {
      await fs.rm(target, { force: true, recursive: true });
      terhapus.push(nama);
    } catch (err) {
      console.error(`[PROFIL WA] Gagal menghapus ${nama}:`, err?.message || err);
    }
  }

  return terhapus;
}

// Membuang cache dan service worker, TANPA menyentuh sesi.
// Mengembalikan daftar folder yang benar-benar ada dan terhapus.
async function hapusCache(sesi = folderSesi(), { hanyaLihat = false } = {}) {
  const terhapus = [];

  for (const nama of FOLDER_CACHE) {
    const target = path.join(sesi, nama);

    if (!(await ada(target))) continue;

    if (hanyaLihat) {
      terhapus.push(nama);
      continue;
    }

    try {
      await fs.rm(target, { recursive: true, force: true });
      terhapus.push(nama);
    } catch (err) {
      console.error(`[PROFIL WA] Gagal menghapus ${nama}:`, err?.message || err);
    }
  }

  return terhapus;
}

// =========================================================
// PENGHITUNG GAGAL START
// =========================================================
//
// Watchdog menjatuhkan proses ketika READY tak kunjung datang, lalu PM2
// menyalakannya kembali — proses baru, memori kosong. Supaya bot bisa
// tahu "ini sudah kali keberapa saya gagal", hitungannya harus tinggal
// di disk, bukan di memori.

const BERKAS_HITUNG = "gagal-ready.json";

async function bacaGagal(sesi = folderSesi()) {
  try {
    const isi = JSON.parse(await fs.readFile(path.join(sesi, BERKAS_HITUNG), "utf8"));
    return Number(isi?.jumlah) || 0;
  } catch {
    return 0;
  }
}

async function tulisGagal(jumlah, sesi = folderSesi()) {
  try {
    await fs.mkdir(sesi, { recursive: true });
    await fs.writeFile(
      path.join(sesi, BERKAS_HITUNG),
      JSON.stringify({ jumlah, diperbarui: new Date().toISOString() }),
    );
  } catch (err) {
    console.error("[PROFIL WA] Gagal menulis penghitung:", err?.message || err);
  }
}

module.exports = {
  BERKAS_KUNCI,
  FOLDER_CACHE,
  JANGAN_DISENTUH,
  folderSesi,
  hapusKunci,
  hapusCache,
  bacaGagal,
  tulisGagal,
};
