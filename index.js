console.log("[INIT] Memulai bot SisKA...");

// I. IMPORTS & KONFIGURASI
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

const { jawabHelpdeskAI, simpanDataBaru } = require("./features/ai_helpdesk");
const { buatLaporanLemburDenganFotoAsync, buatLaporanWFAAsync, buatPDFRekapBulanan, calculateDuration } = require("./features/pdf_generator");
const { HELPDESK_GROUP_ID, FORM_CUTI_URL } = require("./config/config");

// --- DATABASE MOBIL ---
const MOBIL_PATH = path.join(__dirname, "database", "status_mobil.json");
const RIWAYAT_MOBIL_PATH = path.join(__dirname, "database", "riwayat_peminjaman_mobil.json");
const RIWAYAT_PATH = path.join(__dirname, "database", "riwayat_lembur.json");

async function getStatusMobil() {
  try {
    const data = await fsPromises.readFile(MOBIL_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// Write Queue Logic
let isWritingDB = false;
const dbWriteQueue = [];

async function processWriteQueue() {
  if (isWritingDB || dbWriteQueue.length === 0) return;

  isWritingDB = true;
  const { data, filePath, resolve, reject, customWrite, content } = dbWriteQueue.shift();

  try {
    if (customWrite) {
      await fsPromises.writeFile(filePath, JSON.stringify(content, null, 2));
    } else {
      let currentData = [];
      try {
        const fileContent = await fsPromises.readFile(filePath, "utf8");
        currentData = JSON.parse(fileContent);
      } catch (e) {}

      currentData.push(data);
      await fsPromises.writeFile(filePath, JSON.stringify(currentData, null, 2));
    }
    resolve(true);
  } catch (err) {
    reject(err);
  } finally {
    isWritingDB = false;
    processWriteQueue();
  }
}

async function updateStatusMobilAsync(newData) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({ data: null, customWrite: true, content: newData, filePath: MOBIL_PATH, resolve, reject });
    processWriteQueue();
  });
}

async function simpanRiwayatMobilAsync(data) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({ data, filePath: RIWAYAT_MOBIL_PATH, resolve, reject });
    processWriteQueue();
  });
}

function simpanRiwayatLemburAsync(data) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({ data, filePath: RIWAYAT_PATH, resolve, reject });
    processWriteQueue();
  });
}

const ID_BU_DIAN = "628158791647@c.us";
const ID_PAK_ALPHA = "6285156151128@c.us";
const TIMEOUT_MENIT = 30;

// II. STATE MANAGEMENT
let dbPegawai = [];
const pengajuanBySender = {};
const pengajuanByAtasanMsgId = {};
const helpdeskQueue = {};
const helpdeskInstruksiMap = {};

// III. UTILITAS & LOGGING
const LOGS_DIR = path.join(__dirname, "logs");
const UPLOADS_DIR = path.join(__dirname, "uploads");

function ts() {
  return new Date().toISOString();
}

async function ensureDirAsync(p) {
  try {
    await fsPromises.mkdir(p, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

async function logToFileAsync(numberOrName, type, text) {
  try {
    await ensureDirAsync(LOGS_DIR);
    const cleanName = String(numberOrName).replace(/[^a-zA-Z0-9@._-]/g, "_");
    const logFile = path.join(LOGS_DIR, `${cleanName}.log`);
    const line = `[${ts()}] [${type}] ${text}\n`;
    await fsPromises.appendFile(logFile, line);
  } catch (err) {
    console.error(`[LOG ERROR] ${err.message}`);
  }
}

function logToFile(numberOrName, type, text) {
  logToFileAsync(numberOrName, type, text).catch(() => {});
}

function logIn(chatId, body) {
  console.log(`[MASUK] ${ts()} | Dari: ${chatId} | Pesan: ${body}`);
  logToFileAsync(chatId, "MASUK", body);
}

function logOut(chatId, body) {
  console.log(`[KELUAR] ${ts()} | Ke: ${chatId} | Pesan: ${body}`);
  logToFileAsync(chatId, "KELUAR", body);
}

function hanyaAngka(id) {
  return (id || "").replace(/[^0-9]/g, "");
}

function isApprovalYes(text) {
  const t = (text || "").trim().toLowerCase();
  return (t === "1" || t === "setuju" || t === "ya" || t === "y" || t.includes("setuju") || t.includes("approve"));
}

function isApprovalNo(text) {
  const t = (text || "").trim().toLowerCase();
  return (t === "2" || t === "tidak" || t === "ga" || t === "gak" || t.includes("tolak") || t.includes("reject"));
}

// IV. DATABASE & API HELPER
function loadDatabase() {
  try {
    const dbPath = path.join(__dirname, "database", "DatabasePegawaiBiroKeuangan.json");
    if (!fs.existsSync(dbPath)) {
      console.error("[CRITICAL] File database Pegawai Biro keuangan.json tidak ditemukan.");
      return [];
    }
    const raw = fs.readFileSync(dbPath, "utf8");
    const parsed = JSON.parse(raw);

    const InternalList = parsed.Internal || [];
    const ppnpnList = parsed.PPNPN || [];
    const magangList = parsed.magang || [];

    return InternalList.concat(ppnpnList, magangList);

  } catch (err) {
    console.error("[CRITICAL] Gagal membaca database pegawai:", err.message);
    return [];
  }
}

dbPegawai = loadDatabase();
console.log(`[INIT] Berhasil memuat ${dbPegawai.length} data pegawai.`);

function formatNomorId(hp) {
  let str = String(hp || "").trim().replace(/[^0-9]/g, "");
  if (str.startsWith("08")) {
    str = "62" + str.slice(1);
  }
  return str;
}

function cariPegawaiByWa(rawId) {
  if (!Array.isArray(dbPegawai)) return null;
  const incomingDigits = hanyaAngka(rawId);

  return (
    dbPegawai.find((p) => {
      if (!p) return false;
      const noHpUtama = formatNomorId(p["No. HP (WA) aktif"]);
      const idAlternatif = formatNomorId(p["id_wa_alternatif"]);
      return noHpUtama === incomingDigits || idAlternatif === incomingDigits;
    }) || null
  );
}

function cariAtasanPegawai(pegawai) {
  if (!pegawai) return null;

  return (
    dbPegawai.find((p) => {
      if (!p) return false;
      const nomorDiDb = String(p["No. HP (WA) aktif"] || "").trim();
      const targetAtasan = String(pegawai["NO HP ATASAN"] || "").trim();
      return nomorDiDb === targetAtasan;
    }) || null
  );
}

// V. WHATSAPP CLIENT HELPER
async function kirimDenganTyping(client, chatId, text) {
  try {
    try {
      const chat = await client.getChatById(chatId);
      await chat.sendStateTyping();
      const delay = Math.floor(Math.random() * 1000) + 500;
      await new Promise((r) => setTimeout(r, delay));
      await chat.clearState();
    } catch (ignoreErr) {}

    const msg = await client.sendMessage(chatId, text);
    logOut(chatId, text);
    return msg;
  } catch (e) {
    console.error(`[ERROR FATAL] Gagal kirim pesan ke ${chatId}:`, e.message);
    return null;
  }
}

// VI. WHATSAPP CLIENT INIT & EVENT HANDLERS
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
    ],
  },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("[QR] Tersedia. Scan ya brad.");
});

client.on("ready", () => console.log("[READY] Bot SisKA siap!"));
client.on("authenticated", () => console.log("[WA] Authenticated!"));
client.on("auth_failure", (msg) => console.error("[WA] Auth failure:", msg));
client.on("disconnected", (reason) => console.log(`[WA] Bot disconnect: ${reason}`));

// VII. MESSAGE HANDLER
client.on("message", async (message) => {

  // --- FILTER PESAN (MENCEGAH DUPLIKAT) ---
  if (message.from === "status@broadcast") return;
  if (message.type === "e2e_notification" || message.type === "protocol" || message.type === "call_log") return;
  if (message.type === "revoked") return;
  if (message.type !== "chat" && message.type !== "image" && message.type !== "document" && message.type !== "video" && message.type !== "audio") {
      return;
  }
  // ----------------------------------------

  let chatId = message.from;

  if (chatId.includes("@lid")) {
    try {
      const contact = await message.getContact();
      if (contact && contact.id && contact.id._serialized) {
        chatId = contact.id._serialized;
      }
    } catch (e) {}
  }

  logIn(chatId, message.body);

  try {
    const isGroup = chatId.endsWith("@g.us");
    const digits = hanyaAngka(chatId);
    const pegawai = cariPegawaiByWa(digits);
    
    let bodyLower = (message.body || "").trim().toLowerCase();
    if (bodyLower.startsWith("!")) bodyLower = bodyLower.replace(/^!+/, "");

    const flow = pengajuanBySender[chatId];

    // ==========================================
    // 1. HANDLER PERINTAH REKAP (KHUSUS TU)
    // ==========================================
    if (bodyLower.startsWith("rekap")) {
      if (!pegawai) {
        await kirimDenganTyping(client, chatId, "Anda tidak terdaftar dalam database pegawai.");
        return;
      }

      const unit = (pegawai["Unit"] || pegawai["Subbagian"] || pegawai["Unit Kerja"] || pegawai["SUBUNIT"] || "").toUpperCase();
      const jabatan = (pegawai["Jabatan"] || "").toUpperCase();
      const isAnakTU = unit.includes("TU") || unit.includes("TATA USAHA") || jabatan.includes("TATA USAHA");

      if (!isAnakTU) {
        await kirimDenganTyping(client, chatId, "*AKSES DITOLAK*\nFitur !rekap hanya dapat diakses oleh Subunit Tata Usaha (TU).");
        return;
      }

      const args = bodyLower.split(" ");
      const now = new Date();
      const bulanInput = args[1] ? parseInt(args[1]) : now.getMonth() + 1;
      const tahunInput = args[2] ? parseInt(args[2]) : now.getFullYear();

      await kirimDenganTyping(client, chatId, `Memproses Rekap SPK Bulan ${bulanInput}-${tahunInput}...`);

      let riwayat = [];
      if (fs.existsSync(RIWAYAT_PATH)) {
        riwayat = JSON.parse(fs.readFileSync(RIWAYAT_PATH, "utf8"));
      }

      const dataBulanIni = riwayat.filter((row) => {
        const d = new Date(row.tanggal);
        return d.getMonth() + 1 === bulanInput && d.getFullYear() === tahunInput;
      });

      if (dataBulanIni.length === 0) {
        await kirimDenganTyping(client, chatId, "Belum ada data lembur di periode tersebut.");
        return;
      }

      function groupDataByNIP(dataMentah) {
        const rekap = {};
        dataMentah.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
        dataMentah.forEach((row) => {
          if (!rekap[row.nip]) {
            rekap[row.nip] = { nama: row.nama, nip: row.nip, gol: row.gol || "-", jabatan: row.jabatan, tanggal: new Set(), kegiatan: [] };
          }
          const tgl = row.tanggal.split("-")[2].replace(/^0+/, "");
          rekap[row.nip].tanggal.add(tgl);
          rekap[row.nip].kegiatan.push(row.kegiatan);
        });
        return Object.values(rekap).map((item) => {
          item.tanggal = Array.from(item.tanggal).sort((a, b) => a - b);
          return item;
        });
      }

      const dataGrouped = groupDataByNIP(dataBulanIni);
      const namaBulan = new Date(tahunInput, bulanInput - 1).toLocaleString("id-ID", { month: "long", year: "numeric" });

      try {
        await buatPDFRekapBulanan(dataGrouped, namaBulan, chatId, client);
      } catch (e) {
        console.error("Gagal membuat rekap PDF:", e);
        await kirimDenganTyping(client, chatId, "Gagal membuat PDF. Cek log.");
      }
      return;
    }

    // ==========================================
    // 2. HANDLER UPLOAD FOTO (LEMBUR)
    // ==========================================
    if (flow?.step === "upload-foto") {
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        await ensureDirAsync(UPLOADS_DIR);

        const extension = media.mimetype.split("/").pop().replace("jpeg", "jpg");
        const fotoPath = path.join(UPLOADS_DIR, `foto_${hanyaAngka(chatId)}_${Date.now()}.${extension}`);
        await fsPromises.writeFile(fotoPath, media.data, "base64");

        if (!flow.fotoList) flow.fotoList = [];
        flow.fotoList.push(fotoPath);

        const jumlahFoto = flow.fotoList.length;

        if (jumlahFoto < 3) {
          let pesanBalasan = "";
          if (jumlahFoto === 1) pesanBalasan = "Foto Hasil Lembur sudah diterima.\n\nSelanjutnya, silakan upload *Foto Pegawai di Tempat Lembur*.";
          else if (jumlahFoto === 2) pesanBalasan = "Foto Pegawai di Tempat Lembur sudah diterima.\n\nTerakhir, silakan upload *Screenshot Approval*.";
          if (pesanBalasan) await kirimDenganTyping(client, chatId, pesanBalasan);
        } else {
          await kirimDenganTyping(client, chatId, "Screenshot Approval sudah diterima.\nSemua data lengkap, sedang membuat laporan PDF...");

          const atasanObj = flow.atasan || {};
          let targetAtasan = null;
          if (atasanObj["No. HP (WA) aktif"]) targetAtasan = hanyaAngka(atasanObj["No. HP (WA) aktif"]) + "@c.us";

          const unitKerjaAtauSubstansi = flow.pegawai["Unit Kerja"] || flow.pegawai["SUBUNIT"] || flow.pegawai["Subbagian"] || flow.pegawai["Unit"] || "TU";

          const dataLembur = {
            nama: flow.pegawai["Nama Pegawai"],
            nip: flow.pegawai["nip"],
            jabatan: flow.pegawai["Jabatan"],
            tanggal: new Date().toISOString().split("T")[0],
            kegiatan: flow.alasan || "",
            jamMasuk: flow.jamMasuk,
            jamKeluar: flow.jamKeluar,
            substansi: unitKerjaAtauSubstansi,
            atasan_nama: atasanObj["Nama Pegawai"] || "Nama Atasan",
            atasan_nip: atasanObj["nip"] || "-",
            atasan_jabatan: atasanObj["Jabatan"] || "Jabatan Atasan",
          };

          try {
            const recordLembur = {
              nip: dataLembur.nip,
              nama: dataLembur.nama,
              gol: flow.pegawai["Golongan"] || flow.pegawai["Gol"] || "-",
              jabatan: dataLembur.jabatan,
              tanggal: dataLembur.tanggal,
              kegiatan: dataLembur.kegiatan,
              atasan: dataLembur.atasan_nama,
            };
            await simpanRiwayatLemburAsync(recordLembur);
          } catch (dbErr) {}

          try {
            await buatLaporanLemburDenganFotoAsync(dataLembur, flow.fotoList, chatId, targetAtasan, client);
          } catch (pdfErr) {
            console.error("Gagal buat PDF lembur:", pdfErr);
            await kirimDenganTyping(client, chatId, "Gagal membuat PDF, tapi data riwayat sudah tersimpan.");
          }

          delete pengajuanBySender[chatId];
        }
      } else if (bodyLower !== "") {
        await kirimDenganTyping(client, chatId, "Mohon kirimkan *foto* untuk dokumentasi, bukan pesan teks.");
      }
      return;
    }

    // ==========================================
    // 3. HANDLER GRUP (HELPDESK ADMIN)
    // ==========================================
    if (isGroup) {
      if (chatId === HELPDESK_GROUP_ID && message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        const key = quoted.id._serialized;
        const targetUser = helpdeskInstruksiMap[key];

        if (targetUser) {
          try {
            const originalBody = quoted.body;
            const jawabanAdmin = message.body.trim();

            if (originalBody.includes("Pertanyaan:")) {
              const potongDepan = originalBody.split("Pertanyaan:")[1];
              const pertanyaanBersih = potongDepan.split("_AI")[0].trim();

              if (pertanyaanBersih && pertanyaanBersih.length > 2) {
                simpanDataBaru(pertanyaanBersih, jawabanAdmin);
              }
            }
          } catch (errLearn) {}

          const balasan = `Halo, berikut jawaban dari Helpdesk Biro Keuangan:\n\n*${message.body}*`;
          await kirimDenganTyping(client, targetUser, balasan);

          const followup = `Apakah jawaban dari Helpdesk sudah membantu?\n\nKetik *selesai* jika sudah.\nAtau pilih:\n1. Ajukan pertanyaan lanjutan\n2. Jadwalkan konsultasi`;
          await kirimDenganTyping(client, targetUser, followup);

          if (helpdeskQueue[targetUser]) {
            helpdeskQueue[targetUser].step = "followup";
          } else {
            helpdeskQueue[targetUser] = { step: "followup" };
          }

          let namaTujuan = "User";
          let nipTujuan = "-";
          const noWaTujuan = targetUser.split("@")[0];

          const pegawaiTujuan = cariPegawaiByWa(targetUser);
          if (pegawaiTujuan) {
            namaTujuan = pegawaiTujuan["Nama Pegawai"] || "User";
            nipTujuan = pegawaiTujuan["nip"] || pegawaiTujuan["NIP"] || "-";
          }

          const notifKonfirmasi = `[STATUS HELPDESK: TERJAWAB]\n\nJawaban Anda telah berhasil diteruskan kepada:\nNama  : ${namaTujuan}\nNIP   : ${nipTujuan}\nNo WA : ${noWaTujuan}\n\nCatatan: Q&A ini telah otomatis disimpan ke Database AI untuk pembelajaran.`;
          await kirimDenganTyping(client, HELPDESK_GROUP_ID, notifKonfirmasi);

          delete helpdeskInstruksiMap[key];
          return;
        }
      }
      return;
    }

    // ==========================================
    // 4. HANDLER APPROVAL ATASAN (DM)
    // ==========================================
    if (message.hasQuotedMsg) {
      const quoted = await message.getQuotedMessage();
      const qid = quoted.id._serialized;
      const pengajuan = pengajuanByAtasanMsgId[qid];

      if (pengajuan) {
        const { sender: pemohonId, jenis, pegawai: p, alasan, jamMasuk, jamKeluar, isForwarded } = pengajuan;

        if (pengajuanBySender[pemohonId] && pengajuanBySender[pemohonId].timerId) {
          clearTimeout(pengajuanBySender[pemohonId].timerId);
        }

        if (isApprovalYes(message.body)) {
          let pesanPegawai = `Pengajuan *${jenis}* Anda telah *DISETUJUI* oleh atasan.`;
          if (jenis === "Lembur") {
            pesanPegawai += `\n\nMohon upload *3 foto* dokumentasi lembur Anda sebagai bukti:\n1. Foto hasil lembur\n2. Foto Anda di tempat lembur\n3. Screenshot approval dari atasan (pesan ini).\n\n⚠️ *PENTING: Harap kirimkan foto SATU PER SATU secara berurutan, jangan dikirim sekaligus.*`;
            pengajuanBySender[pemohonId] = { step: "upload-foto", pegawai: p, atasan: pengajuan.atasan, alasan, jamMasuk, jamKeluar, fotoList: [] };

            if (isForwarded) {
              const notifDian = `*INFO APPROVAL*\n\nPengajuan lembur atas nama *${p["Nama Pegawai"]}* telah disetujui oleh *Pak Alpha* (karena timeout 30 menit).`;
              await client.sendMessage(ID_BU_DIAN, notifDian);
            }
          } else if (jenis === "Cuti") {
            pesanPegawai += `\n\nSilakan lanjutkan mengisi form pengajuan cuti di link berikut:\n${FORM_CUTI_URL}`;
            delete pengajuanBySender[pemohonId];
          }

          await kirimDenganTyping(client, pemohonId, pesanPegawai);
          await kirimDenganTyping(client, chatId, `[APPROVAL] Disetujui untuk ${p["Nama Pegawai"]}`);
        } else if (isApprovalNo(message.body)) {
          await kirimDenganTyping(client, pemohonId, `Pengajuan *${jenis}* Anda *DITOLAK* oleh atasan.`);
          await kirimDenganTyping(client, chatId, `[APPROVAL] Ditolak untuk ${p["Nama Pegawai"]}`);
          delete pengajuanBySender[pemohonId];
        }

        delete pengajuanByAtasanMsgId[qid];
        return;
      }
    }

    // ==========================================
    // 5. HANDLER EKSTERNAL & HELPDESK
    // ==========================================
    if (!pegawai || helpdeskQueue[chatId]) {
      if (helpdeskQueue[chatId]) {
        if (bodyLower === "menu") {
          delete helpdeskQueue[chatId];
          if (pegawai) {
            const menu = `Halo *${pegawai["Nama Pegawai"]}*!\nAda yang bisa kami bantu hari ini?\n\nSilakan pilih menu (ketik *angka* pilihan):\n1. Pengajuan Lembur\n2. Pengajuan Cuti\n3. Chat Helpdesk\n4. Layanan Kendaraan\n5. Formulir Pengambilan Persediaan\n6. Peminjaman Data Arsip\n7. Laporan WFA`;
            await kirimDenganTyping(client, chatId, menu);
            pengajuanBySender[chatId] = { step: "menu", pegawai };
          } else {
            await kirimDenganTyping(client, chatId, "Sesi Helpdesk dibatalkan. Silahkan ketik pesan apapun untuk memulai kembali.");
          }
          return;
        }

        const state = helpdeskQueue[chatId];

        if (state.step === "identitas") {
          state.identitas = message.body.trim();
          await kirimDenganTyping(client, chatId, "Terima kasih. Silakan tuliskan pertanyaan Anda.");
          state.step = "pertanyaan";
          return;
        }

        if (state.step === "followup") {
          if (bodyLower.includes("selesai")) {
            await kirimDenganTyping(client, chatId, "Terima kasih telah menggunakan layanan BOT SisKA. Sampai jumpa!");
            delete helpdeskQueue[chatId];
            return;
          }
          if (bodyLower === "jadwal" || bodyLower === "2") {
            await kirimDenganTyping(client, chatId, "Silakan tuliskan waktu/jadwal yang Anda inginkan untuk konsultasi.");
            state.step = "jadwal";
            return;
          }
          state.step = "pertanyaan";
        }

        if (state.step === "jadwal") {
          await kirimDenganTyping(client, chatId, "Terima kasih, permintaan jadwal Anda sudah kami terima.");
          let namaDisplay = state.identitas || "User";
          let nipDisplay = "-";
          const noWaDisplay = chatId.split("@")[0];

          if (pegawai) {
            namaDisplay = pegawai["Nama Pegawai"];
            nipDisplay = pegawai["nip"] || pegawai["NIP"] || "-";
          }

          const notif = `[PERMINTAAN KONSULTASI HELPDESK]\n\nNama   : ${namaDisplay}\nNIP    : ${nipDisplay}\nNo WA  : ${noWaDisplay}\nJadwal : *${message.body.trim()}*\n\nMohon tim Helpdesk bersiap menindaklanjuti.`;
          await kirimDenganTyping(client, HELPDESK_GROUP_ID, notif);
          delete helpdeskQueue[chatId];
          return;
        }

        if (state.step === "menunggu-jawaban") {
          await kirimDenganTyping(client, chatId, "Mohon tunggu sebentar, tim Helpdesk masih memproses pertanyaan Anda. Untuk kembali ke menu utama ketik *menu*.");
          return;
        }

        if (state.step === "pertanyaan") {
          const pertanyaanUser = message.body;
          const identitasUser = state.identitas || `${message._data.notifyName || "User"} (${chatId})`;

          await kirimDenganTyping(client, chatId, "Sedang memproses pertanyaan Anda...");
          const jawabanAI = await jawabHelpdeskAI(pertanyaanUser);

          if (jawabanAI.includes("UNKNOWN_ESKALASI")) {
            let namaDisplay = identitasUser;
            let nipDisplay = "-";
            if (pegawai) {
              namaDisplay = pegawai["Nama Pegawai"];
              nipDisplay = pegawai["nip"] || pegawai["NIP"] || "-";
            }

            const pesanEskalasi = `[HELPDESK - PERTANYAAN BELUM TERJAWAB]\n\nIdentitas : ${namaDisplay}\nNIP       : ${nipDisplay}\nPertanyaan: ${pertanyaanUser}\n\n_AI tidak dapat menjawab pertanyaan ini._\n\n*Balas Pesan ini (QUOTE REPLY) Untuk Menjawab*`;
            const sentMsg = await client.sendMessage(HELPDESK_GROUP_ID, pesanEskalasi);
            logOut(HELPDESK_GROUP_ID, pesanEskalasi);

            helpdeskInstruksiMap[sentMsg.id._serialized] = chatId;
            await kirimDenganTyping(client, chatId, "Pertanyaan Anda sedang diteruskan ke staf ahli kami karena spesifik. Mohon tunggu jawaban dari kami.");
            state.step = "menunggu-jawaban";
            return;
          } else {
            const jawabanFinal = `${jawabanAI}\n\n────────────────\n_Ada lagi yang bisa dibantu?_\n_Ketik *selesai* untuk menutup sesi._`;
            await kirimDenganTyping(client, chatId, jawabanFinal);
            state.step = "followup";
            return;
          }
        }
      } else if (!pegawai) {
        const welcome = `Halo, terima kasih sudah menghubungi Helpdesk Biro Keuangan dan BMN.\n\nMohon sebutkan identitas Anda:\n*1. Nama Lengkap*\n*2. Jabatan*\n*3. Unit Kerja*`;
        await kirimDenganTyping(client, chatId, welcome);
        helpdeskQueue[chatId] = { step: "identitas" };
        return;
      }
    }

    // ==========================================
    // 6. HANDLER MENU UTAMA & RESET
    // ==========================================
    if (!flow || bodyLower === "menu") {
      if (helpdeskQueue[chatId]) return;

      const menu = `Halo *${pegawai["Nama Pegawai"]}*!\nAda yang bisa kami bantu hari ini?\n\nSilakan pilih menu (ketik *angka* pilihan):\n1. Pengajuan Lembur\n2. Pengajuan Cuti\n3. Chat Helpdesk\n4. Layanan Kendaraan\n5. Formulir Pengambilan Persediaan\n6. Peminjaman Data Arsip\n7. Laporan WFA`;

      await kirimDenganTyping(client, chatId, menu);
      pengajuanBySender[chatId] = { step: "menu", pegawai };
      return;
    }

    // ==========================================
    // 7. ROUTING MENU UTAMA
    // ==========================================
    if (flow.step === "menu") {
      if (bodyLower === "1") {
        await kirimDenganTyping(client, chatId, "Silakan tuliskan *alasan/tujuan lembur* Anda.");
        pengajuanBySender[chatId] = { ...flow, step: "alasan-lembur", jenis: "Lembur" };
        return;
      }
      if (bodyLower === "2") {
        await kirimDenganTyping(client, chatId, "Silakan tuliskan *alasan pengajuan cuti* Anda.");
        pengajuanBySender[chatId] = { ...flow, step: "alasan-cuti", jenis: "Cuti" };
        return;
      }
      if (bodyLower === "3") {
        await kirimDenganTyping(client, chatId, "Silakan tuliskan pertanyaan Anda untuk Helpdesk Biro Keuangan.");
        helpdeskQueue[chatId] = { step: "pertanyaan", identitas: `${pegawai["Nama Pegawai"]} (Internal, NIP: ${pegawai["nip"] || pegawai["NIP"]})` };
        delete pengajuanBySender[chatId];
        return;
      }
      if (bodyLower === "4") {
        await kirimDenganTyping(
          client,
          chatId,
          "*Layanan Kendaraan Dinas*\n\nSilakan pilih:\n1. Pinjam Mobil\n2. Kembalikan Mobil",
        );
        pengajuanBySender[chatId] = { step: "menu-mobil", pegawai };
        return;
      }
      if (bodyLower === "5") {
        const linkGForm = "https://docs.google.com/forms/d/e/1FAIpQLSfC8aa3eGzNCjB4B_okAFxmkmbttPTraqgNeKGR0wJ1bPc1HA/viewform";
        await kirimDenganTyping(client, chatId, `*Formulir Pengambilan Persediaan*\n\nSilakan isi daftar permintaan barang melalui link berikut:\n${linkGForm}`);
        delete pengajuanBySender[chatId];
        return;
      }
      if (bodyLower === "6") {
        const linkArsip = "https://docs.google.com/forms/d/e/1FAIpQLSfC8aa3eGzNCjB4B_okAFxmkmbttPTraqgNeKGR0wJ1bPc1HA/viewform";
        await kirimDenganTyping(client, chatId, `*Peminjaman Data Arsip*\n\nSilakan isi formulir peminjaman arsip melalui link berikut:\n${linkArsip}`);
        delete pengajuanBySender[chatId];
        return;
      }
      if (bodyLower === "7") {
        await kirimDenganTyping(client, chatId, "Silakan ketik *Hari dan Tanggal* pelaksanaan WFA Anda.\n\nContoh: *Jumat, 3 April 2026*");
        pengajuanBySender[chatId] = { step: "wfa-tanggal", pegawai, jenis: "WFA", wfaList: [] };
        return;
      }

      await kirimDenganTyping(client, chatId, "Pilihan tidak valid. Ketik angka 1 - 7. Atau ketik *menu* untuk kembali.");
      return;
    }

    // ==========================================
    // 8. STATE MACHINE (PROSES ALUR SEMUA MENU)
    // ==========================================

    // --- ALUR WFA ---
    if (flow.step === "wfa-tanggal") {
      pengajuanBySender[chatId].tanggalWFA = message.body.trim();
      pengajuanBySender[chatId].step = "wfa-kegiatan";
      await kirimDenganTyping(client, chatId, `Tanggal WFA: *${message.body.trim()}*.\n\nSilakan tuliskan *Kegiatan* yang Anda lakukan.`);
      return;
    }

    if (flow.step === "wfa-kegiatan") {
      pengajuanBySender[chatId].kegiatan = message.body.trim();
      pengajuanBySender[chatId].step = "wfa-output";
      await kirimDenganTyping(client, chatId, "Tuliskan *Output* dari kegiatan tersebut.");
      return;
    }

    if (flow.step === "wfa-output") {
      pengajuanBySender[chatId].output = message.body.trim();
      pengajuanBySender[chatId].step = "wfa-capaian";
      await kirimDenganTyping(client, chatId, "Tuliskan *Capaian Kinerja*.");
      return;
    }

    if (flow.step === "wfa-capaian") {
      pengajuanBySender[chatId].capaian = message.body.trim();
      pengajuanBySender[chatId].step = "wfa-satuan";
      await kirimDenganTyping(client, chatId, "Tuliskan *Satuan* (misal: Dokumen, Kegiatan, Laporan).");
      return;
    }

    if (flow.step === "wfa-satuan") {
      pengajuanBySender[chatId].satuan = message.body.trim();
      pengajuanBySender[chatId].step = "wfa-keterangan";
      await kirimDenganTyping(client, chatId, "Silakan tuliskan *Keterangan / Tautan (Link)* bukti dukung Anda (misal: Link Google Drive).\n\nJika *TIDAK ADA*, cukup ketik tanda strip *-*");
      return;
    }

    if (flow.step === "wfa-keterangan") {
      let ket = message.body.trim();
      if (ket === "-" || ket.toLowerCase() === "tidak ada") ket = "";
      pengajuanBySender[chatId].keterangan = ket;
      
      pengajuanBySender[chatId].step = "wfa-foto-1";
      await kirimDenganTyping(client, chatId, "Silakan kirimkan *Foto Pertama (1)* untuk bukti dukung kegiatan ini.");
      return;
    }

    if (flow.step === "wfa-foto-1") {
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        await ensureDirAsync(UPLOADS_DIR);
        const extension = media.mimetype.split("/").pop().replace("jpeg", "jpg");
        const fotoPath = path.join(UPLOADS_DIR, `wfa1_${hanyaAngka(chatId)}_${Date.now()}.${extension}`);
        await fsPromises.writeFile(fotoPath, media.data, "base64");

        pengajuanBySender[chatId].fotoPath1 = fotoPath;
        pengajuanBySender[chatId].step = "wfa-foto-2";
        await kirimDenganTyping(client, chatId, "Foto pertama diterima!\n\nJika ada *Foto Kedua (2)*, silakan kirimkan sekarang.\nJika *TIDAK ADA*, cukup ketik kata *lanjut* atau *skip*.");

      } else if (bodyLower !== "") {
        await kirimDenganTyping(client, chatId, "Mohon kirimkan *foto* (gambar) untuk bukti dukung WFA, bukan pesan teks.");
      }
      return;
    }

    if (flow.step === "wfa-foto-2") {
      let fotoPath2 = null;

      if (message.hasMedia) {
        const media = await message.downloadMedia();
        await ensureDirAsync(UPLOADS_DIR);
        const extension = media.mimetype.split("/").pop().replace("jpeg", "jpg");
        fotoPath2 = path.join(UPLOADS_DIR, `wfa2_${hanyaAngka(chatId)}_${Date.now()}.${extension}`);
        await fsPromises.writeFile(fotoPath2, media.data, "base64");
      } else {
        // Jika user mengetik pesan teks (seperti "lanjut", "skip", dll), kita anggap skip foto ke-2.
        const text = bodyLower.trim();
        if (text !== "lanjut" && text !== "skip" && text !== "-" && text !== "tidak") {
          // Tetap kita proses skip meskipun kata-katanya beda agar user tidak nyangkut (opsional)
        }
      }

      pengajuanBySender[chatId].wfaList.push({
        kegiatan: flow.kegiatan,
        output: flow.output,
        capaian: flow.capaian,
        satuan: flow.satuan,
        keterangan: flow.keterangan,
        fotoPath1: flow.fotoPath1,
        fotoPath2: fotoPath2
      });

      pengajuanBySender[chatId].step = "wfa-konfirmasi-tambah";
      await kirimDenganTyping(client, chatId, "Kegiatan berhasil ditambahkan!\n\nApakah ada kegiatan lain yang ingin Anda laporkan untuk tanggal ini?\n*1.* Ya, tambah kegiatan lagi\n*2.* Tidak, cetak laporan sekarang");
      return;
    }

    if (flow.step === "wfa-konfirmasi-tambah") {
      if (bodyLower === "1" || bodyLower === "ya") {
        pengajuanBySender[chatId].step = "wfa-kegiatan";
        await kirimDenganTyping(client, chatId, "Silakan tuliskan *Kegiatan* selanjutnya yang Anda lakukan.");
        return;
      } else if (bodyLower === "2" || bodyLower === "tidak") {
        await kirimDenganTyping(client, chatId, "Sedang menyusun dan merapikan Laporan Kinerja Harian WFA Anda...");

        let atasan = cariAtasanPegawai(flow.pegawai);
        if (!atasan || !atasan["No. HP (WA) aktif"]) {
          atasan = {
            "Nama Pegawai": "Dian Kresnadjati",
            "No. HP (WA) aktif": "628158791647",
            nip: "197202111998032002",
          };
        }

        const unitKerjaAtauSubstansi = flow.pegawai["Unit Kerja"] || flow.pegawai["SUBUNIT"] || flow.pegawai["Subbagian"] || flow.pegawai["Unit"] || "TU";

        const dataWFA = {
          nama: flow.pegawai["Nama Pegawai"],
          nip: flow.pegawai["nip"],
          jabatan: flow.pegawai["Jabatan"] || flow.pegawai["JABATAN"],
          unitKerja: "Sekretariat Jenderal",
          unitOrganisasi: unitKerjaAtauSubstansi,
          tanggalWFA: flow.tanggalWFA,
          substansi: unitKerjaAtauSubstansi,
          atasan_nama: atasan["Nama Pegawai"] || "Nama Atasan",
          atasan_nip: atasan["nip"] || "-",
          atasan_jabatan: atasan["Jabatan"] || "Jabatan Atasan",
          wfaList: flow.wfaList 
        };

        try {
          await buatLaporanWFAAsync(dataWFA, chatId, client); // Pengiriman ke atasan dihapus
        } catch (e) {
          console.error("Gagal eksekusi buatLaporanWFAAsync:", e);
          await kirimDenganTyping(client, chatId, `Gagal membuat PDF WFA. Cek log error server.\nInfo: ${e.message}`);
        }

        delete pengajuanBySender[chatId];
        return;
      } else {
        await kirimDenganTyping(client, chatId, "Pilihan tidak valid. Ketik *1* untuk tambah kegiatan, atau *2* untuk selesai.");
        return;
      }
    }

    // --- ALUR LEMBUR ---
    if (flow.step === "alasan-lembur") {
      if (message.body.trim().length < 5) {
        await kirimDenganTyping(client, chatId, "Mohon berikan alasan lembur yang lebih detail.");
        return;
      }
      pengajuanBySender[chatId].alasan = message.body.trim();
      pengajuanBySender[chatId].step = "tanya-jam-masuk";
      await kirimDenganTyping(client, chatId, "Baik, sekarang masukkan *jam mulai lembur* Anda (format 24 jam, contoh: 17:00).");
      return;
    }

    if (flow.step === "tanya-jam-masuk") {
      const jamMasuk = message.body.trim();
      if (!/\d{1,2}:\d{2}/.test(jamMasuk)) {
        await kirimDenganTyping(client, chatId, "Format jam tidak valid. Mohon gunakan format HH:MM (contoh: 17:00).");
        return;
      }
      pengajuanBySender[chatId].jamMasuk = jamMasuk;
      pengajuanBySender[chatId].step = "tanya-jam-keluar";
      await kirimDenganTyping(client, chatId, "Oke, terakhir masukkan *jam selesai lembur* Anda (format 24 jam, contoh: 20:00).");
      return;
    }

    if (flow.step === "tanya-jam-keluar") {
      const jamKeluar = message.body.trim();
      if (!/\d{1,2}:\d{2}/.test(jamKeluar)) {
        await kirimDenganTyping(client, chatId, "Format jam tidak valid. Mohon gunakan format HH:MM (contoh: 20:00).");
        return;
      }

      pengajuanBySender[chatId].jamKeluar = jamKeluar;
      let atasan = cariAtasanPegawai(flow.pegawai);

      // --- LOGIKA AUTO-APPROVE PIMPINAN ---
      const isPimpinan = !flow.pegawai["NO HP ATASAN"] || flow.pegawai["NO HP ATASAN"].trim() === "";

      if (isPimpinan) {
        let pesanPegawai = `*Pengajuan Lembur OTOMATIS DISETUJUI* karena Anda terdeteksi sebagai Pimpinan.\n\nMohon upload *3 foto* dokumentasi lembur Anda sebagai bukti:\n1. Foto hasil lembur\n2. Foto Anda di tempat lembur\n3. Screenshot approval dari atasan (pesan ini).\n\n⚠️ *PENTING: Harap kirimkan foto SATU PER SATU secara berurutan, jangan dikirim sekaligus.*`;
        
        const selfAsAtasan = {
            "Nama Pegawai": flow.pegawai["Nama Pegawai"],
            "nip": flow.pegawai["nip"] || "-",
            "Jabatan": flow.pegawai["Jabatan"] || "Pimpinan"
        };
        
        pengajuanBySender[chatId] = { step: "upload-foto", pegawai: flow.pegawai, atasan: selfAsAtasan, alasan: flow.alasan, jamMasuk: flow.jamMasuk, jamKeluar: jamKeluar, fotoList: [] };
        
        await kirimDenganTyping(client, chatId, pesanPegawai);
        return;
      }

      if (!atasan || !atasan["No. HP (WA) aktif"]) {
        atasan = {
          "Nama Pegawai": "Dian Kresnadjati",
          "No. HP (WA) aktif": "628158791647",
          nip: "197202111998032002",
        };
      }

      const { alasan, jamMasuk } = flow;
      pengajuanBySender[chatId] = { ...flow, step: "menunggu-persetujuan", atasan, jamKeluar };

      const nomorAtasan = atasan["No. HP (WA) aktif"] + "@c.us";
      const teksPengajuan = `*Pengajuan Lembur* dari ${flow.pegawai["Nama Pegawai"]}\nAlasan: ${alasan}\nJam: ${jamMasuk} - ${jamKeluar} (${calculateDuration(jamMasuk, jamKeluar)})\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju\n2. Tidak Setuju`;

      const sentToAtasan = await client.sendMessage(nomorAtasan, teksPengajuan);

      pengajuanByAtasanMsgId[sentToAtasan.id._serialized] = {
        sender: chatId, jenis: flow.jenis, pegawai: flow.pegawai, atasan, alasan, jamMasuk, jamKeluar, isForwarded: false,
      };

      await kirimDenganTyping(client, chatId, `Pengajuan Lembur Anda sudah diteruskan ke atasan (${atasan["Nama Pegawai"]}) untuk persetujuan.`);

      if (nomorAtasan === ID_BU_DIAN) {
        const timerId = setTimeout(async () => {
          const currentStatus = pengajuanBySender[chatId];
          if (currentStatus && currentStatus.step === "menunggu-persetujuan") {
            const teksForward = `*FORWARD APPROVAL (TIMEOUT)*\n\nBu Dian belum merespon dalam ${TIMEOUT_MENIT} menit.\nMohon persetujuan Pak Alpha untuk:\n\n${teksPengajuan}`;
            const sentToAlpha = await client.sendMessage(ID_PAK_ALPHA, teksForward);

            pengajuanByAtasanMsgId[sentToAlpha.id._serialized] = {
              sender: chatId, jenis: flow.jenis, pegawai: flow.pegawai, atasan: { "Nama Pegawai": "ALPHA SANDRO (Backup)" }, alasan, jamMasuk, jamKeluar, isForwarded: true,
            };
          }
        }, TIMEOUT_MENIT * 60 * 1000);
        pengajuanBySender[chatId].timerId = timerId;
      }
      return;
    }

    // --- ALUR CUTI ---
    if (flow.step === "alasan-cuti") {
      const alasan = message.body.trim();

      // --- LOGIKA AUTO-APPROVE PIMPINAN ---
      const isPimpinan = !flow.pegawai["NO HP ATASAN"] || flow.pegawai["NO HP ATASAN"].trim() === "";

      if (isPimpinan) {
        let pesanPegawai = `*Pengajuan Cuti OTOMATIS DISETUJUI* karena Anda terdeteksi sebagai Pimpinan.\n\nSilakan lanjutkan mengisi form pengajuan cuti di link berikut:\n${FORM_CUTI_URL}`;
        await kirimDenganTyping(client, chatId, pesanPegawai);
        delete pengajuanBySender[chatId];
        return;
      }

      const atasan = cariAtasanPegawai(flow.pegawai);
      if (!atasan || !atasan["No. HP (WA) aktif"]) {
        await kirimDenganTyping(client, chatId, "Maaf, data atasan Anda tidak ditemukan atau nomor WA tidak valid. Hubungi admin.");
        delete pengajuanBySender[chatId];
        return;
      }
      const nomorAtasan = atasan["No. HP (WA) aktif"] + "@c.us";
      const teksAtasan = `*Pengajuan Cuti* dari ${flow.pegawai["Nama Pegawai"]}\nAlasan: ${alasan}\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju\n2. Tidak Setuju`;
      const sentToAtasan = await client.sendMessage(nomorAtasan, teksAtasan);

      pengajuanByAtasanMsgId[sentToAtasan.id._serialized] = { sender: chatId, jenis: flow.jenis, pegawai: flow.pegawai, atasan, alasan };
      pengajuanBySender[chatId] = { ...flow, step: "menunggu-persetujuan", alasan, atasan };
      await kirimDenganTyping(client, chatId, `Pengajuan Cuti Anda sudah diteruskan ke atasan (${atasan["Nama Pegawai"]}) untuk persetujuan.`);
      return;
    }

    // --- ALUR KENDARAAN ---
    if (flow.step === "menu-mobil") {
      if (bodyLower === "1") {
        const mobilList = await getStatusMobil();
        const alreadyBorrowed = mobilList.find((m) => m.peminjam_saat_ini === pegawai["nip"]);

        if (alreadyBorrowed) {
          await kirimDenganTyping(
            client,
            chatId,
            `Anda saat ini sudah meminjam mobil *${alreadyBorrowed.nama}* (${alreadyBorrowed.plat}).\n\nHarap kembalikan mobil tersebut terlebih dahulu sebelum meminjam yang lain.`,
          );
          delete pengajuanBySender[chatId];
          return;
        }

        const tersedia = mobilList.filter((m) => m.status === "TERSEDIA");
        const dipakai = mobilList.filter((m) => m.status === "DIPAKAI");

        let text = "*DAFTAR ARMADA KANTOR*\n\n*MOBIL TERSEDIA*\n_Ketik angka ID untuk meminjam:_\n";
        if (tersedia.length > 0) {
          tersedia.forEach((m) => {
            text += `\n*${m.id}. ${m.nama}* (${m.plat})`;
          });
        } else {
          text += "\n_(Tidak ada mobil tersedia saat ini)_";
        }

        text += "\n\n*SEDANG DIPAKAI*\n_(Tidak bisa dipilih)_\n";
        if (dipakai.length > 0) {
          dipakai.forEach((m) => {
            let namaPeminjam = m.peminjam_saat_ini;
            const peg = dbPegawai.find((p) => {
              const nipDb = String(p.nip || p.NIP || "").trim();
              const nipPinjam = String(m.peminjam_saat_ini || "").trim();
              return nipDb === nipPinjam;
            });
            if (peg && peg["Nama Pegawai"]) namaPeminjam = peg["Nama Pegawai"];

            text += `\n~${m.nama} (${m.plat})~`;
            text += `\n   └ Dipakai: ${namaPeminjam}`;
          });
        } else {
          text += "\n_(Tidak ada mobil yang sedang keluar)_";
        }

        if (tersedia.length === 0) {
          text += "\n\n*Semua mobil sedang dipakai.* Silakan hubungi admin jika mendesak.";
          await kirimDenganTyping(client, chatId, text);
          delete pengajuanBySender[chatId];
          return;
        }

        await kirimDenganTyping(client, chatId, text);
        pengajuanBySender[chatId] = { ...flow, step: "pilih-mobil-pinjam", listMobil: tersedia };
        return;

      } else if (bodyLower === "2") {
        const mobilList = await getStatusMobil();
        const mobilDipakai = mobilList.find((m) => m.peminjam_saat_ini === pegawai["nip"]);

        if (!mobilDipakai) {
          await kirimDenganTyping(client, chatId, "Sistem mencatat Anda tidak sedang meminjam mobil apapun.");
          delete pengajuanBySender[chatId];
          return;
        }

        pengajuanBySender[chatId] = {
          ...flow,
          step: "lapor-kondisi",
          mobilId: mobilDipakai.id,
          namaMobil: mobilDipakai.nama
        };
        await kirimDenganTyping(client, chatId, "Bagaimana *Kondisi Mobil* saat ini? (misal: Aman, Lecet dikit, Ban kempes)");
        return;
      }
    }

    if (flow.step === "pilih-mobil-pinjam") {
      const pilihanId = parseInt(bodyLower);
      const mobilDipilih = flow.listMobil.find((m) => m.id === pilihanId);

      if (!mobilDipilih) {
        await kirimDenganTyping(client, chatId, "Pilihan salah. Ketik angka ID mobil yang tersedia.");
        return;
      }

      const allMobil = await getStatusMobil();
      const currentCheck = allMobil.find((m) => m.id === pilihanId);
      if (currentCheck.status !== "TERSEDIA") {
        await kirimDenganTyping(client, chatId, "Maaf, mobil ini baru saja dipinjam orang lain. Silakan pilih menu ulang.");
        delete pengajuanBySender[chatId];
        return;
      }

      pengajuanBySender[chatId] = {
        ...flow,
        step: "isi-tujuan",
        mobilId: pilihanId,
        namaMobil: mobilDipilih.nama,
      };
      await kirimDenganTyping(client, chatId, "Baik. Silakan tuliskan *Tujuan & Keperluan* pemakaian mobil.");
      return;
    }

    if (flow.step === "isi-tujuan") {
      const tujuan = message.body.trim();
      const allMobil = await getStatusMobil();
      const index = allMobil.findIndex((m) => m.id === flow.mobilId);

      if (index !== -1) {
        allMobil[index].status = "DIPAKAI";
        allMobil[index].peminjam_saat_ini = pegawai["nip"];
        allMobil[index].waktu_pinjam = new Date().toISOString();
        allMobil[index].tujuan_aktif = tujuan;

        await updateStatusMobilAsync(allMobil);

        await kirimDenganTyping(
          client,
          chatId,
          `*Peminjaman Berhasil!*\n\nUnit: ${flow.namaMobil}\nTujuan: ${tujuan}\n\nSelamat jalan, hati-hati! Jangan lupa ketik/pilih *MENU* -> 'Kembalikan Mobil' setelah selesai.`,
        );
      }

      delete pengajuanBySender[chatId];
      return;
    }

    if (flow.step === "lapor-kondisi") {
      pengajuanBySender[chatId].kondisi = message.body.trim();
      pengajuanBySender[chatId].step = "lapor-lama";
      await kirimDenganTyping(client, chatId, "Terakhir, berapa *Lama Pemakaian*? (misal: 2 jam, 1 hari)");
      return;
    }

    if (flow.step === "lapor-lama") {
      const lamaPakai = message.body.trim();
      const { mobilId, kondisi } = pengajuanBySender[chatId];

      const allMobil = await getStatusMobil();
      const index = allMobil.findIndex((m) => m.id === mobilId);

      if (index !== -1) {
        const mobil = allMobil[index];
        const waktuPinjamRaw = mobil.waktu_pinjam ? new Date(mobil.waktu_pinjam) : new Date();
        const waktuAkhirRaw = new Date();

        const strJamPinjam = waktuPinjamRaw.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        const strJamAkhir = waktuAkhirRaw.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        const tujuanAwal = mobil.tujuan_aktif;

        mobil.status = "TERSEDIA";
        mobil.peminjam_saat_ini = null;
        mobil.waktu_pinjam = null;
        mobil.tujuan_aktif = null;

        await updateStatusMobilAsync(allMobil);

        const logData = {
          tanggal: strJamAkhir,
          nama_pegawai: pegawai["Nama Pegawai"],
          nip: pegawai["nip"],
          mobil: mobil.nama,
          tujuan: tujuanAwal || "-",
          kondisi: kondisi,
          lama_pakai: lamaPakai,
          jam_pinjam: strJamPinjam,
          jam_akhir: strJamAkhir,
        };

        await simpanRiwayatMobilAsync(logData);

        await kirimDenganTyping(
          client,
          chatId,
          `*Pengembalian Selesai!*\n\nUnit *${mobil.nama}* telah dikembalikan ke sistem.\nKondisi: ${kondisi}\nTerima kasih.`,
        );
      }

      delete pengajuanBySender[chatId];
      return;
    }

    // --- ALUR MENUNGGU PERSETUJUAN (UMUM UNTUK LEMBUR & CUTI) ---
    if (flow.step === "menunggu-persetujuan") {
      await kirimDenganTyping(client, chatId, `Pengajuan ${flow.jenis} Anda sedang diproses oleh atasan. Mohon tunggu. Ketik *menu* untuk batal.`);
      if (bodyLower === "menu") {
        delete pengajuanBySender[chatId];
        await kirimDenganTyping(client, chatId, `Pengajuan ${flow.jenis} dibatalkan. Kembali ke menu utama.`);
      }
      return;
    }

    // --- JIKA TIDAK ADA YANG COCOK ---
    await kirimDenganTyping(client, chatId, "Perintah tidak dikenali dalam alur saat ini. Ketik *menu* untuk kembali ke menu utama.");

  } catch (err) {
    console.error("[ERROR] Terjadi kesalahan saat memproses pesan:", err.stack || err.message);
    try {
      await kirimDenganTyping(client, chatId, "Maaf, terjadi kesalahan pada sistem. Silakan coba lagi atau ketik *menu*.");
      delete pengajuanBySender[chatId];
      delete helpdeskQueue[chatId];
    } catch {}
  }
});

// VIII. GLOBAL ERROR HANDLERS & START
process.on("unhandledRejection", (reason, p) => {
  console.error("[UNHANDLED REJECTION]", reason);
  logToFile("error", "UNHANDLED", String(reason));
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
  logToFile("error", "UNCAUGHT", err.stack || String(err));
});

client.initialize();