/* ===== NOTULEN RAPAT LEWAT WHATSAPP =======================================

   Pegawai mengetik "notulen", bot menampilkan daftar rapat yang notulennya
   sudah jadi, pegawai membalas nomornya, bot mengirim PDF-nya.

   PDF-nya TIDAK dibuat di sini. Backend rapat yang membuatnya — datanya ada
   di sana, dan modul ini cukup menerima berkas jadi. Lihat
   backend/src/services/notulen-pdf.service.js di repo meeting-room-display.

   Yang dijaga backend, bukan di sini:
   - rapat non-BIASA ditolak 403, jadi notulen rapat Rahasia tidak pernah bisa
     keluar lewat jalur ini walau ada kesalahan di modul ini;
   - rapat yang belum punya notulen ditolak 404.

   Yang dijaga di sini: hanya nomor yang terdaftar di master data pegawai yang
   boleh meminta. Nomor tak dikenal ditolak sebelum backend dihubungi.
*/
const axios = require("axios");

let dep = null;

/* dep yang harus disediakan index.js:
     kirim(chatId, teks)
     kirimDokumenB64(chatId, base64, namaBerkas, caption)
     cariPegawaiByWa(chatId)   -> pegawai | null
     baseUrl                   -> http://127.0.0.1:3003
     token                     -> isi header x-bot-token
*/
function pasang(dependensi) {
  dep = dependensi;
}

const AWALAN = "notulen-";
const MAKS_DAFTAR = 10;

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function tanggalPendek(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return String(iso || "-");
  return `${d} ${BULAN[m - 1]} ${y}`;
}

function http() {
  return axios.create({
    baseURL: `${String(dep.baseUrl || "").replace(/\/+$/, "")}/api/bot-telegram`,
    headers: { "x-bot-token": dep.token || "" },
    timeout: 30000,
  });
}

/* Pesan galat yang dilihat pengguna sengaja tidak memuat detail teknis:
   pegawai tidak bisa berbuat apa-apa dengan "ECONNREFUSED 127.0.0.1:3003",
   dan itu hanya membuat mereka mengira dirinya salah ketik. */
function pesanGalat(err) {
  const status = err?.response?.status;
  if (status === 403) return "Rapat itu bukan klasifikasi Biasa, notulennya tidak bisa dikirim lewat WhatsApp.";
  if (status === 404) return "Notulen rapat itu belum ada.";
  console.error("[NOTULEN WA]", err?.message || err);
  return "Sistem notulen sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.";
}

/* Dipanggil saat pegawai mengetik "notulen" atau "notulen <kata kunci>". */
async function mulai({ chatId, flow, kataKunci = "" }) {
  const pegawai = await dep.cariPegawaiByWa(chatId);
  if (!pegawai) {
    await dep.kirim(chatId,
      "Nomor Anda belum terdaftar sebagai pegawai, jadi notulen rapat tidak bisa dikirim.\n\n"
      + "Hubungi admin Biro Keuangan dan BMN untuk didaftarkan.");
    return;
  }

  let daftar;
  try {
    const r = await http().get("/notulen", {
      params: { limit: MAKS_DAFTAR, q: kataKunci || undefined },
    });
    daftar = r.data?.notulen || [];
  } catch (err) {
    await dep.kirim(chatId, pesanGalat(err));
    return;
  }

  if (!daftar.length) {
    await dep.kirim(chatId, kataKunci
      ? `Tidak ada notulen rapat yang judulnya memuat "${kataKunci}".`
      : "Belum ada notulen rapat yang siap diunduh.");
    return;
  }

  // Daftar disimpan di flow, bukan diminta ulang saat pengguna membalas
  // nomornya. Kalau diminta ulang, urutannya bisa sudah berubah karena ada
  // notulen baru — dan pengguna mengunduh rapat yang bukan dipilihnya.
  flow.step = `${AWALAN}pilih`;
  flow.notulenDaftar = daftar.map((n) => ({
    meetingId: n.meetingId, title: n.title, date: n.date,
  }));

  const baris = daftar.map((n, i) =>
    `${i + 1}. ${n.title} — ${tanggalPendek(n.date)}`).join("\n");

  await dep.kirim(chatId,
    `📄 *Notulen rapat tersedia*\n\n${baris}\n\n`
    + "Balas *nomornya* untuk mengunduh PDF.\n"
    + "Ketik *batal* untuk berhenti.");
}

async function kirimPdf({ chatId, pilihan }) {
  let r;
  try {
    r = await http().get(
      `/meetings/${encodeURIComponent(pilihan.meetingId)}/minutes.pdf`,
      { responseType: "arraybuffer" },
    );
  } catch (err) {
    await dep.kirim(chatId, pesanGalat(err));
    return;
  }

  const nama = `Notulen - ${String(pilihan.title).replace(/[^\w\s-]/g, "").trim()} - ${pilihan.date}.pdf`;
  // Dikirim sebagai base64, bukan lewat berkas sementara: tidak ada sisa di
  // disk kalau pengirimannya gagal di tengah jalan.
  await dep.kirimDokumenB64(
    chatId,
    Buffer.from(r.data).toString("base64"),
    nama.replace(/\s+/g, " "),
    `📄 ${pilihan.title}\n${tanggalPendek(pilihan.date)}\n\n`
    + "_Notulen disusun otomatis dari rekaman rapat dan belum diperiksa manusia._",
  );
}

/* Dipanggil index.js saat flow.step berawalan "notulen-". */
async function tangani({ chatId, flow, bodyLower }) {
  const isi = String(bodyLower || "").trim();

  if (isi === "batal" || isi === "selesai") {
    flow.step = null;
    flow.notulenDaftar = null;
    await dep.kirim(chatId, "Baik, dibatalkan.");
    return;
  }

  const daftar = Array.isArray(flow.notulenDaftar) ? flow.notulenDaftar : [];
  const nomor = Number(isi);

  if (!Number.isInteger(nomor) || nomor < 1 || nomor > daftar.length) {
    await dep.kirim(chatId,
      `Balas dengan angka 1–${daftar.length || 1}, atau ketik *batal*.`);
    return;
  }

  const pilihan = daftar[nomor - 1];
  flow.step = null;
  flow.notulenDaftar = null;

  await dep.kirim(chatId, `Menyiapkan notulen "${pilihan.title}"...`);
  await kirimPdf({ chatId, pilihan });
}

/* Dipakai index.js untuk mengenali perintahnya tanpa menyalin pola di sana. */
function cocokPerintah(bodyLower) {
  const m = String(bodyLower || "").trim().match(/^notulen(?:\s+(.*))?$/);
  return m ? { kataKunci: (m[1] || "").trim() } : null;
}

module.exports = { pasang, mulai, tangani, cocokPerintah, AWALAN };
