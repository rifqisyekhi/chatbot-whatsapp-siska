console.log("[INIT] Memulai bot SisKA...");

// I. IMPORTS & KONFIGURASI
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const express = require('express');
const cors = require('cors');

const { jawabHelpdeskAI, simpanDataBaru } = require("./features/ai_helpdesk");
const {
  buatLaporanLemburDenganFotoAsync,
  buatLaporanWFAAsync,
  buatSuratIzinMobilAwalAsync,
  buatSuratIzinMobilAkhirAsync,
  calculateDuration,
} = require("./features/pdf_generator");

const { 
  HELPDESK_GROUP_ID, 
  FORM_CUTI_URL, 
  NO_PAK_ALPHA, 
  NO_ADMIN_SAKEH,
  NIP_PAK_ALPHA,
  NAMA_PAK_ALPHA,
  JABATAN_PAK_ALPHA,
  PORT_WEB,
  LINK_WEB_KATALOG
} = require("./config/config");

// Connect Database MongoDB
const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI;

mongoose.connect(uri)
  .then(() => console.log('Sip! Bot SisKA udah nyambung ke MongoDB Atlas'))
  .catch(err => console.error('Waduh, koneksi gagal:', err));

const Barang = require('./models/Barang'); 

// ==========================================
// II. SERVER WEB UNTUK KATALOG BARANG 
// ==========================================
const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// --- RUTE API: AMBIL SEMUA BARANG (GET) ---
app.get('/api/barang', async (req, res) => {
    try {
        const dataDB = await Barang.find({});
        const dataSiapKirim = dataDB.map(item => ({
            id: item.id_barang,
            nama: item.nama,
            stok: item.stok,
            kategori: item.kategori || "Belum ada kategori",
            satuan: item.satuan || "Pcs",
            img: item.img
        }));
        res.json(dataSiapKirim);
    } catch (err) {
        console.error("Gagal membaca database barang:", err);
        res.status(500).json({ error: "Gagal memuat data persediaan" });
    }
});

// --- RUTE API: TAMBAH BARANG BARU (POST) ---
app.post('/api/barang', async (req, res) => {
    try {
        // 1. Tangkap data dari Front-End (Gak ada id_barang lagi!)
        const { nama, kategori, stok, img } = req.body;

        // 2. Validasi
        if (!nama || stok == null || !kategori) {
            return res.status(400).json({ 
                error: "Data kurang lengkap! Pastikan Nama, Kategori, dan Stok terisi." 
            });
        }

        // 3. LOGIKA AUTO-GENERATE KODE BARANG (SKU)
        // Tentukan awalan (prefix) berdasarkan kategori
        let prefix = kategori === 'ATK' ? 'ATK-' : 'ELK-';

        // Tarik semua barang di database yang kategorinya sama untuk nyari angka terbesarnya
        const barangSejenis = await Barang.find({ kategori: kategori }, 'id_barang');
        
        let angkaTertinggi = 0;
        
        // Loop satu-satu buat nyari angka paling gede
        barangSejenis.forEach(barang => {
            // Misalnya kode "ATK-040", kita belah dua berdasarkan tanda "-"
            const bagian = barang.id_barang.split('-');
            if (bagian.length === 2) {
                // Ambil angka di belakangnya (040 -> 40)
                const angka = parseInt(bagian[1], 10);
                if (!isNaN(angka) && angka > angkaTertinggi) {
                    angkaTertinggi = angka;
                }
            }
        });

        // Tambah 1 dari angka tertinggi yang ditemuin
        const angkaBaru = angkaTertinggi + 1;
        const id_barang_baru = `${prefix}${angkaBaru.toString().padStart(3, '0')}`;
        const barangBaru = new Barang({
            id_barang: id_barang_baru,
            nama: nama,
            kategori: kategori,
            stok: Number(stok),
            img: img || ""
        });

        // 5. Simpan ke MongoDB
        await barangBaru.save();
        console.log(`[DATABASE] Barang baru auto-SKU: ${nama} [${id_barang_baru}]`);

        // 6. Respon sukses
        res.status(201).json({ 
            message: `Barang berhasil ditambah dengan kode ${id_barang_baru}!`, 
            data: barangBaru 
        });

    } catch (err) {
        console.error("[ERROR API] Gagal menambah barang:", err);
        res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// --- RUTE API: EDIT BARANG (PUT) ---
app.put('/api/barang/:id_barang', async (req, res) => {
    try {
        const targetId = req.params.id_barang; 
        
        const { nama, kategori, stok, img } = req.body; 

        const barangDiupdate = await Barang.findOneAndUpdate(
            { id_barang: targetId },
            { 
                nama: nama, 
                kategori: kategori, 
                stok: Number(stok),
                img: img || ""
            },
            { returnDocument: 'after' }
        );

        if (!barangDiupdate) {
            return res.status(404).json({ error: "Barang tidak ditemukan di database!" });
        }

        console.log(`[DATABASE] Barang di-edit: ${nama} [${targetId}]`);
        res.json({ message: "Barang berhasil di-update!", data: barangDiupdate });

    } catch (err) {
        console.error("[ERROR API] Gagal edit barang:", err);
        res.status(500).json({ error: "Terjadi kesalahan server saat update data." });
    }
});

app.listen(PORT_WEB, '0.0.0.0', () => {
  console.log(`[WEB SERVER] API & Katalog aktif di port ${PORT_WEB}`);
});

// --- DATABASE KENDARAAN ---
const KENDARAAN_PATH = path.join(
  __dirname,
  "database",
  "status_kendaraan.json",
);
const RIWAYAT_KENDARAAN_PATH = path.join(
  __dirname,
  "database",
  "riwayat_peminjaman_kendaraan.json",
);
const RIWAYAT_PATH = path.join(__dirname, "database", "riwayat_lembur.json");

async function getStatusKendaraan() {
  try {
    const data = await fsPromises.readFile(KENDARAAN_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

let isWritingDB = false;
const dbWriteQueue = [];

async function processWriteQueue() {
  if (isWritingDB || dbWriteQueue.length === 0) return;

  isWritingDB = true;
  const { data, filePath, resolve, reject, customWrite, content } =
    dbWriteQueue.shift();

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
      await fsPromises.writeFile(
        filePath,
        JSON.stringify(currentData, null, 2),
      );
    }
    resolve(true);
  } catch (err) {
    reject(err);
  } finally {
    isWritingDB = false;
    processWriteQueue();
  }
}

async function updateStatusKendaraanAsync(newData) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({
      data: null,
      customWrite: true,
      content: newData,
      filePath: KENDARAAN_PATH,
      resolve,
      reject,
    });
    processWriteQueue();
  });
}

async function simpanRiwayatKendaraanAsync(data) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({
      data,
      filePath: RIWAYAT_KENDARAAN_PATH,
      resolve,
      reject,
    });
    processWriteQueue();
  });
}

function simpanRiwayatLemburAsync(data) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({ data, filePath: RIWAYAT_PATH, resolve, reject });
    processWriteQueue();
  });
}

// ==================================
// FORMAT DATA PENANGGUNG JAWAB (DARI CONFIG)
// ==================================
const DATA_PAK_ALPHA = {
  "Nama Pegawai": NAMA_PAK_ALPHA,
  "No. HP (WA) aktif": NO_PAK_ALPHA ? NO_PAK_ALPHA.split('@')[0] : "",
  nip: NIP_PAK_ALPHA,
  Jabatan: JABATAN_PAK_ALPHA
};

// III. STATE MANAGEMENT
let dbPegawai = [];
const pengajuanBySender = {};
const pengajuanByAtasanMsgId = {};
const orderGudangMsgId = {};
const helpdeskQueue = {};
const helpdeskInstruksiMap = {};

// IV. UTILITAS & LOGGING
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
  return (
    t === "1" ||
    t === "setuju" ||
    t === "ya" ||
    t === "y" ||
    t.includes("setuju") ||
    t.includes("approve")
  );
}

function isApprovalNo(text) {
  const t = (text || "").trim().toLowerCase();
  return (
    t === "2" ||
    t === "tidak" ||
    t === "ga" ||
    t === "gak" ||
    t.includes("tolak") ||
    t.includes("reject")
  );
}

// V. DATABASE & API HELPER
function loadDatabase() {
  try {
    const dbPath = path.join(
      __dirname,
      "database",
      "DatabasePegawaiBiroKeuangan.json",
    );
    if (!fs.existsSync(dbPath)) {
      console.error(
        "[CRITICAL] File database Pegawai Biro keuangan.json tidak ditemukan.",
      );
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

let dbTimGudang = [];
try {
  const rawData = fs.readFileSync(path.join(__dirname, "database", "DatabasePegawaiBiroKeuangan.json"), "utf8");
  dbTimGudang = JSON.parse(rawData).TimGudang || [];
} catch (err) {
  console.log("Tim Gudang belum di-set di JSON.");
}

function formatNomorId(hp) {
  let str = String(hp || "")
    .trim()
    .replace(/[^0-9]/g, "");
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

// VI. WHATSAPP CLIENT HELPER
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

// VII. WHATSAPP CLIENT INIT & EVENT HANDLERS
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
client.on("disconnected", (reason) =>
  console.log(`[WA] Bot disconnect: ${reason}`),
);

// VIII. MESSAGE HANDLER
client.on("message", async (message) => {

  // 1. Buang update status WA dulu biar enteng
  if (message.from === "status@broadcast") return;

  // 2. FILTER ANTI-SPAM (Pesan basi saat bot mati)
  const waktuSekarang = Math.floor(Date.now() / 1000);
  if (waktuSekarang - message.timestamp > 60) {
    console.log(`[ABAIKAN] Pesan lama tertahan dari ${message.from}`);
    return;
  }
  
  // 3. FILTER TIPE PESAN LAINNYA
  if (
    message.type === "e2e_notification" ||
    message.type === "protocol" ||
    message.type === "call_log"
  )
    return;
  if (message.type === "revoked") return;
  if (
    message.type !== "chat" &&
    message.type !== "image" &&
    message.type !== "document" &&
    message.type !== "video" &&
    message.type !== "audio"
  ) {
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

    // ===========
    // FITUR ADMIN
    // ===========
    const daftarAdmin = NO_ADMIN_SAKEH ? [NO_ADMIN_SAKEH] : [];

    if (daftarAdmin.includes(chatId) && message.body.startsWith("!JAPRI")) {
      const teksTengah = message.body.replace("!JAPRI", "").trim();

      const spasiPertama = teksTengah.indexOf(" ");
      
      if (spasiPertama === -1) {
        await kirimDenganTyping(client, chatId, "❌ Format salah bos!\nContoh ketik: *!JAPRI 08123456789 Isi pesannya disini*");
        return;
      }

      const nomorMentah = teksTengah.substring(0, spasiPertama).trim();
      const isiPesan = teksTengah.substring(spasiPertama + 1).trim();

      let nomorTujuan = hanyaAngka(nomorMentah);
      if (nomorTujuan.startsWith("08")) {
        nomorTujuan = "62" + nomorTujuan.slice(1);
      }
      const targetId = nomorTujuan + "@c.us";

      try {
        await client.sendMessage(targetId, isiPesan);
        await kirimDenganTyping(client, chatId, `✅ *JAPRI SUKSES*\n\nPesan rahasia berhasil dikirim ke: ${nomorMentah}\n*Isi:* ${isiPesan}`);
      } catch (err) {
        await kirimDenganTyping(client, chatId, `❌ *GAGAL*\nNomor ${nomorMentah} tidak terdaftar di WhatsApp atau bot sedang error.`);
      }
      
      delete pengajuanBySender[chatId];
      return;
    }

    // ==========================================
    // 1. PENANGKAP ORDER PERSEDIAAN DARI WEB (BARU)
    // ==========================================
    if (message.body.startsWith("!ORDER_BARANG")) {
      const pesananClean = message.body.replace("!ORDER_BARANG", "").trim();
      const namaPemesan = pegawai ? pegawai["Nama Pegawai"] : "Pegawai (Tidak ada di DB)";
      
      await kirimDenganTyping(
        client, 
        chatId, 
        "✅ *Pesanan Diterima!*\n\nPermintaan persediaan Anda telah kami catat dan sedang dikirim ke Penanggung Jawab untuk proses persetujuan."
      );

      const teksPengajuan = `*Pengajuan Persediaan Barang* dari ${namaPemesan}\n\n*Detail Pesanan:*\n${pesananClean}\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju\n2. Tidak Setuju`;

      if(NO_PAK_ALPHA) {
        const sentToPJ = await client.sendMessage(NO_PAK_ALPHA, teksPengajuan);

        pengajuanByAtasanMsgId[sentToPJ.id._serialized] = {
          sender: chatId,
          jenis: "Persediaan",
          pegawai: pegawai,
          atasan: DATA_PAK_ALPHA,
          pesanan: pesananClean,
        };
      }

      delete pengajuanBySender[chatId];
      return;
    }

    // ==========================================
    // 3. HANDLER UPLOAD FOTO (LEMBUR)
    // ==========================================
    if (flow?.step === "upload-foto") {
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        await ensureDirAsync(UPLOADS_DIR);

        const extension = media.mimetype
          .split("/")
          .pop()
          .replace("jpeg", "jpg");
        const fotoPath = path.join(
          UPLOADS_DIR,
          `foto_${hanyaAngka(chatId)}_${Date.now()}.${extension}`,
        );
        await fsPromises.writeFile(fotoPath, media.data, "base64");

        if (!flow.fotoList) flow.fotoList = [];
        flow.fotoList.push(fotoPath);

        const jumlahFoto = flow.fotoList.length;

        if (jumlahFoto < 3) {
          let pesanBalasan = "";
          if (jumlahFoto === 1)
            pesanBalasan =
              "Foto Hasil Lembur sudah diterima.\n\nSelanjutnya, silakan upload *Foto Pegawai di Tempat Lembur*.";
          else if (jumlahFoto === 2)
            pesanBalasan =
              "Foto Pegawai di Tempat Lembur sudah diterima.\n\nTerakhir, silakan upload *Screenshot Approval*.";
          if (pesanBalasan)
            await kirimDenganTyping(client, chatId, pesanBalasan);
        } else {
          await kirimDenganTyping(
            client,
            chatId,
            "Screenshot Approval sudah diterima.\nSemua data lengkap, sedang membuat laporan PDF...",
          );

          const atasanObj = flow.atasan || {};
          let targetAtasan = null;
          if (atasanObj["No. HP (WA) aktif"])
            targetAtasan = hanyaAngka(atasanObj["No. HP (WA) aktif"]) + "@c.us";

          const unitKerjaAtauSubstansi =
            flow.pegawai["Unit Kerja"] ||
            flow.pegawai["SUBUNIT"] ||
            flow.pegawai["Subbagian"] ||
            flow.pegawai["Unit"] ||
            "TU";

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
            await buatLaporanLemburDenganFotoAsync(
              dataLembur,
              flow.fotoList,
              chatId,
              targetAtasan,
              client,
            );
          } catch (pdfErr) {
            console.error("Gagal buat PDF lembur:", pdfErr);
            await kirimDenganTyping(
              client,
              chatId,
              "Gagal membuat PDF, tapi data riwayat sudah tersimpan.",
            );
          }

          delete pengajuanBySender[chatId];
        }
      } else if (bodyLower !== "") {
        await kirimDenganTyping(
          client,
          chatId,
          "Mohon kirimkan *foto* untuk dokumentasi, bukan pesan teks.",
        );
      }
      return;
    }

    // ==========================================
    // 4. HANDLER GRUP (HELPDESK ADMIN)
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

          if (message.hasMedia) {
            const media = await message.downloadMedia();
            await client.sendMessage(targetUser, media, { caption: message.body || "" });
          } else {
            const balasan = `Halo, berikut jawaban dari Helpdesk Biro Keuangan:\n\n*${message.body}*`;
            await kirimDenganTyping(client, targetUser, balasan);
          }

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
    // 5. HANDLER APPROVAL ATASAN (DM)
    // ==========================================
    if (message.hasQuotedMsg) {
      const quoted = await message.getQuotedMessage();
      const qid = quoted.id._serialized;
      const pengajuan = pengajuanByAtasanMsgId[qid];
      const orderGudang = orderGudangMsgId[qid];

      if (orderGudang) {
        const { pemohonId, namaPemohon, pesanan } = orderGudang;

        if (isApprovalYes(message.body)) {
          await kirimDenganTyping(client, pemohonId, `🔔 *BARANG SIAP DIAMBIL*\n\nHalo ${namaPemohon}, pesanan persediaan Anda sudah disiapkan oleh Tim Gudang.\n\nSilakan datang ke ruangan penyimpanan/gudang untuk mengambil barangnya. Terima kasih!`);
          await kirimDenganTyping(client, chatId, `✅ Notifikasi pengambilan telah dikirim ke ${namaPemohon}.`);

          for (let key in orderGudangMsgId) {
            if (orderGudangMsgId[key].pemohonId === pemohonId) {
              delete orderGudangMsgId[key];
            }
          }

        } else if (isApprovalNo(message.body)) {
          await kirimDenganTyping(client, pemohonId, `❌ *BARANG KENDALA / KOSONG*\n\nMohon maaf ${namaPemohon}, meskipun sudah disetujui pimpinan, ternyata fisik barang saat ini sedang kosong atau ada kendala di gudang.\n\nSilakan hubungi Tim Gudang untuk informasi lebih lanjut.`);
          await kirimDenganTyping(client, chatId, `❌ Notifikasi barang kosong telah dikirim ke ${namaPemohon}. Stok di sistem sedang di-rollback (dikembalikan).`);

          const regexKasir = /\[(.*?)\](?:.*?)?\((\d+)/g;
          let hasilBedah;
          while ((hasilBedah = regexKasir.exec(pesanan)) !== null) {
            const idBarangTarget = hasilBedah[1];
            const jumlahDiambil = parseInt(hasilBedah[2], 10);
            if (idBarangTarget && !isNaN(jumlahDiambil)) {
              try {
                await Barang.findOneAndUpdate(
                  { id_barang: idBarangTarget },
                  { $inc: { stok: +jumlahDiambil } }
                );
                console.log(`[STOK ROLLBACK] ${idBarangTarget} dikembalikan ${jumlahDiambil}`);
              } catch (dbErr) {
                console.error(`[STOK ERROR] Gagal rollback stok`, dbErr);
              }
            }
          }

          for (let key in orderGudangMsgId) {
            if (orderGudangMsgId[key].pemohonId === pemohonId) {
              delete orderGudangMsgId[key];
            }
          }
        }
        return;
      }
      
      // --- HANDLER APPROVAL ATASAN ---
      if (pengajuan) {
        const { sender: pemohonId, jenis, pegawai: p, alasan, jamMasuk, jamKeluar } = pengajuan;

        if (isApprovalYes(message.body)) {
          let pesanPegawai = "";
          
          if (jenis === "Lembur") {
            pesanPegawai = `Pengajuan *${jenis}* Anda telah *DISETUJUI* oleh atasan.\n\nMohon upload *3 foto* dokumentasi lembur Anda sebagai bukti:\n1. Foto hasil lembur\n2. Foto Anda di tempat lembur\n3. Screenshot approval dari atasan (pesan ini).\n\n⚠️ *PENTING: Harap kirimkan foto SATU PER SATU secara berurutan, jangan dikirim sekaligus.*`;
            pengajuanBySender[pemohonId] = { step: "upload-foto", pegawai: p, atasan: pengajuan.atasan, alasan, jamMasuk, jamKeluar, fotoList: [] };
          } else if (jenis === "Cuti") {
            pesanPegawai = `Pengajuan *${jenis}* Anda telah *DISETUJUI* oleh atasan.\n\nSilakan lanjutkan mengisi form pengajuan cuti di link berikut:\n${FORM_CUTI_URL}`;
            delete pengajuanBySender[pemohonId];
          } else if (jenis === "Kendaraan") {
            const allKendaraan = await getStatusKendaraan();
            const index = allKendaraan.findIndex((m) => m.id === pengajuan.kendaraanId);

            if (index !== -1 && allKendaraan[index].status === "TERSEDIA") {
              allKendaraan[index].status = "DIPAKAI";
              allKendaraan[index].peminjam_saat_ini = p["nip"];
              allKendaraan[index].waktu_pinjam = new Date().toISOString();
              allKendaraan[index].tujuan_aktif = pengajuan.alasan;

              await updateStatusKendaraanAsync(allKendaraan);

              pesanPegawai = `Pengajuan peminjaman kendaraan *${pengajuan.namaKendaraan}* Anda telah *DISETUJUI* oleh Penanggung Jawab.\n\nSedang menyiapkan PDF Surat Izin Kendaraan untuk syarat serah terima kunci...`;
              
              await kirimDenganTyping(client, pemohonId, pesanPegawai);
              await kirimDenganTyping(client, chatId, `[APPROVAL] Disetujui untuk ${p["Nama Pegawai"]}`);

              try {
                const dataPDFMobil = {
                  penanggungJawab: {
                    nama: DATA_PAK_ALPHA["Nama Pegawai"],
                    nip: DATA_PAK_ALPHA.nip,
                    jabatan: DATA_PAK_ALPHA.Jabatan,
                  },
                  pemakai: {
                    nama: p["Nama Pegawai"] || "Nama Pemakai",
                    nip: p["nip"] || p["NIP"] || "-",
                    jabatan: p["Jabatan"] || "-",
                  },
                  kendaraan: {
                    merek: allKendaraan[index].nama || "-",
                    tnkb: allKendaraan[index].plat || "-",
                    keperluan: pengajuan.alasan || "-",
                    tanggalMulai: new Date().toLocaleDateString("id-ID"),
                    tanggalSelesai: "-",
                  },
                  pengembalian: {
                    kondisi: "-",
                  },
                };
                await buatSuratIzinMobilAwalAsync(dataPDFMobil, pemohonId, client);
              } catch (pdfErr) {
                console.error("Gagal buat PDF Surat Izin Mobil:", pdfErr);
              }
              pesanPegawai = null;
            } else {
              pesanPegawai = `Pengajuan peminjaman *${pengajuan.namaKendaraan}* disetujui oleh Penanggung Jawab, namun sayangnya kendaraan tersebut baru saja dipinjam orang lain atau tidak tersedia di sistem.`;
            }
            delete pengajuanBySender[pemohonId];
          } else if (jenis === "Persediaan") {
            // 1. Kasih tau pemohon kalau pimpinan udah setuju
            pesanPegawai = `✅ *ORDER DISETUJUI*\n\nTim Persediaan sedang mengecek fisik dan menyiapkan pesanan Anda. Mohon tunggu instruksi pengambilan.`;
            
            // 2. Modif teks buat Tim Gudang (tambah opsi balas 1 atau 2)
            const notifTim = `📦 *ORDER PERSEDIAAN DISETUJUI* 📦\n\n*Pemohon:* ${p ? p["Nama Pegawai"] : "User"}\n*Unit:* ${p ? (p["Unit Kerja"] || p["SUBUNIT"] || "-") : "-"}\n\n*Detail Pesanan:*\n${pengajuan.pesanan}\n\n_Mohon Tim Persediaan segera menyiapkan pesanan tersebut._\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Siap Diambil\n2. Fisik Kosong / Rusak`;
            
            // 3. Siapin data buat dilempar ke memori Gudang
            const dataOrder = {
              pemohonId: pemohonId,
              namaPemohon: p ? p["Nama Pegawai"] : "User",
              pesanan: pengajuan.pesanan
            };

            // 4. Kirim ke semua orang di Tim Gudang dan simpan ID pesannya
            if (dbTimGudang && dbTimGudang.length > 0) {
              for (const staf of dbTimGudang) {
                const noWaStaf = staf["No. HP (WA) aktif"];
                if (noWaStaf) {
                  const targetStaf = formatNomorId(noWaStaf) + "@c.us";
                  const sentMsg = await client.sendMessage(targetStaf, notifTim);
                  orderGudangMsgId[sentMsg.id._serialized] = dataOrder; 
                  await new Promise((r) => setTimeout(r, 1000));
                }
              }
            } else {
               console.log("[WARNING] Array TimGudang kosong atau tidak ditemukan di JSON!");
            }

            // 5. Potong stok otomatis kayak biasa
            const regexKasir = /\[(.*?)\](?:.*?)?\((\d+)/g;
            let hasilBedah;
            while ((hasilBedah = regexKasir.exec(pengajuan.pesanan)) !== null) {
              const idBarangTarget = hasilBedah[1]; 
              const jumlahDiambil = parseInt(hasilBedah[2], 10); 
              if (idBarangTarget && !isNaN(jumlahDiambil)) {
                try {
                  await Barang.findOneAndUpdate(
                    { id_barang: idBarangTarget },
                    { $inc: { stok: -jumlahDiambil } } 
                  );
                } catch (dbErr) {
                  console.error(`[STOK ERROR] Gagal ngurangin stok ${idBarangTarget}`, dbErr);
                }
              }
            }

            delete pengajuanBySender[pemohonId];
          }

          if (pesanPegawai) {
            await kirimDenganTyping(client, pemohonId, pesanPegawai);
            await kirimDenganTyping(client, chatId, `[APPROVAL] Disetujui untuk ${p ? p["Nama Pegawai"] : "User"}`);
          }
          
        } else if (isApprovalNo(message.body)) {
          await kirimDenganTyping(client, pemohonId, `Pengajuan *${jenis}* Anda *DITOLAK* oleh atasan/penanggung jawab.`);
          await kirimDenganTyping(client, chatId, `[APPROVAL] Ditolak untuk ${p ? p["Nama Pegawai"] : "User"}`);
          delete pengajuanBySender[pemohonId];
        }

        delete pengajuanByAtasanMsgId[qid];
        return;
      }
    }

    // ==========================================
    // 6. HANDLER EKSTERNAL & HELPDESK
    // ==========================================
    if (!pegawai || helpdeskQueue[chatId]) {
      if (helpdeskQueue[chatId]) {
        if (bodyLower === "menu") {
          delete helpdeskQueue[chatId];
          if (pegawai) {
            const menu = `Halo *${pegawai["Nama Pegawai"]}*!\nAda yang bisa kami bantu hari ini?\n\nSilakan pilih menu (ketik *angka* pilihan):\n1. Pengajuan Lembur\n2. Pengajuan Cuti\n3. Chat Helpdesk\n4. Layanan Kendaraan\n5. Pengambilan Persediaan\n6. Peminjaman Data Arsip\n7. Laporan WFH`;
            await kirimDenganTyping(client, chatId, menu);
            pengajuanBySender[chatId] = { step: "menu", pegawai };
          } else {
            await kirimDenganTyping(
              client,
              chatId,
              "Sesi Helpdesk dibatalkan. Silahkan ketik pesan apapun untuk memulai kembali.",
            );
          }
          return;
        }

        const state = helpdeskQueue[chatId];

        if (state.step === "identitas") {
          state.identitas = message.body.trim();
          await kirimDenganTyping(
            client,
            chatId,
            "Terima kasih. Silakan tuliskan pertanyaan Anda.",
          );
          state.step = "pertanyaan";
          return;
        }

        if (state.step === "followup") {
          if (bodyLower.includes("selesai")) {
            await kirimDenganTyping(
              client,
              chatId,
              "Terima kasih telah menggunakan layanan BOT SisKA. Sampai jumpa!",
            );
            delete helpdeskQueue[chatId];
            return;
          }
          if (bodyLower === "jadwal" || bodyLower === "2") {
            await kirimDenganTyping(
              client,
              chatId,
              "Silakan tuliskan waktu/jadwal yang Anda inginkan untuk konsultasi.",
            );
            state.step = "jadwal";
            return;
          }
          state.step = "pertanyaan";
        }

        if (state.step === "jadwal") {
          await kirimDenganTyping(
            client,
            chatId,
            "Terima kasih, permintaan jadwal Anda sudah kami terima.",
          );
          let namaDisplay = state.identitas || "User";
          let nipDisplay = "-";
          const noWaDisplay = chatId.split("@")[0];

          if (pegawai) {
            namaDisplay = pegawai["Nama Pegawai"];
            nipDisplay = pegawai["nip"] || pegawai["NIP"] || "-";
          }

          const notif = `[PERMINTAAN KONSULTASI HELPDESK]\n\nNama  : ${namaDisplay}\nNIP   : ${nipDisplay}\nNo WA : ${noWaDisplay}\nJadwal : *${message.body.trim()}*\n\nMohon tim Helpdesk bersiap menindaklanjuti.`;
          if(HELPDESK_GROUP_ID) {
            await kirimDenganTyping(client, HELPDESK_GROUP_ID, notif);
          }
          delete helpdeskQueue[chatId];
          return;
        }

        if (state.step === "menunggu-jawaban") {
          await kirimDenganTyping(
            client,
            chatId,
            "Mohon tunggu sebentar, tim Helpdesk masih memproses pertanyaan Anda. Untuk kembali ke menu utama ketik *menu*.",
          );
          return;
        }

        if (state.step === "pertanyaan") {
          const pertanyaanUser = message.body;
          const identitasUser =
            state.identitas ||
            `${message._data.notifyName || "User"} (${chatId})`;

          await kirimDenganTyping(
            client,
            chatId,
            "Sedang memproses pertanyaan Anda...",
          );
          const jawabanAI = await jawabHelpdeskAI(pertanyaanUser);

          if (jawabanAI.includes("UNKNOWN_ESKALASI")) {
            let namaDisplay = identitasUser;
            let nipDisplay = "-";
            if (pegawai) {
              namaDisplay = pegawai["Nama Pegawai"];
              nipDisplay = pegawai["NIP"] || pegawai["NIP"] || "-";
            }

            const pesanEskalasi = `[HELPDESK - PERTANYAAN BELUM TERJAWAB]\n\nIdentitas : ${namaDisplay}\nNIP       : ${nipDisplay}\nPertanyaan: ${pertanyaanUser}\n\n_AI tidak dapat menjawab pertanyaan ini._\n\n*Balas Pesan ini (QUOTE REPLY) Untuk Menjawab*`;
            
            if(HELPDESK_GROUP_ID) {
              const sentMsg = await client.sendMessage(
                HELPDESK_GROUP_ID,
                pesanEskalasi,
              );
              logOut(HELPDESK_GROUP_ID, pesanEskalasi);
              helpdeskInstruksiMap[sentMsg.id._serialized] = chatId;
            }

            await kirimDenganTyping(
              client,
              chatId,
              "Pertanyaan Anda sedang diteruskan ke staf ahli kami karena spesifik. Mohon tunggu jawaban dari kami.",
            );
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
    // 7. HANDLER MENU UTAMA & RESET
    // ==========================================
    if (!flow || bodyLower === "menu") {
      if (helpdeskQueue[chatId]) return;

      const menu = `Halo *${pegawai["Nama Pegawai"]}*!\nAda yang bisa kami bantu hari ini?\n\nSilakan pilih menu (ketik *angka* pilihan):\n1. Pengajuan Lembur\n2. Pengajuan Cuti\n3. Chat Helpdesk\n4. Layanan Kendaraan\n5. Formulir Pengambilan Persediaan\n6. Peminjaman Data Arsip\n7. Laporan WFH`;

      await kirimDenganTyping(client, chatId, menu);
      pengajuanBySender[chatId] = { step: "menu", pegawai };
      return;
    }

    // ==========================================
    // 8. ROUTING MENU UTAMA
    // ==========================================
    if (flow.step === "menu") {
      if (bodyLower === "1") {
        await kirimDenganTyping(
          client,
          chatId,
          "Silakan tuliskan *alasan/tujuan lembur* Anda.",
        );
        pengajuanBySender[chatId] = {
          ...flow,
          step: "alasan-lembur",
          jenis: "Lembur",
        };
        return;
      }
      if (bodyLower === "2") {
        await kirimDenganTyping(
          client,
          chatId,
          "Silakan tuliskan *alasan pengajuan cuti* Anda.",
        );
        pengajuanBySender[chatId] = {
          ...flow,
          step: "alasan-cuti",
          jenis: "Cuti",
        };
        return;
      }
      if (bodyLower === "3") {
        await kirimDenganTyping(
          client,
          chatId,
          "Silakan tuliskan pertanyaan Anda untuk Helpdesk Biro Keuangan.",
        );
        helpdeskQueue[chatId] = {
          step: "pertanyaan",
          identitas: `${pegawai["Nama Pegawai"]} (Internal, NIP: ${pegawai["nip"] || pegawai["NIP"]})`,
        };
        delete pengajuanBySender[chatId];
        return;
      }
      if (bodyLower === "4") {
        await kirimDenganTyping(
          client,
          chatId,
          "*Layanan Kendaraan Dinas Biro Keuangan & BMN*\n\nSilakan pilih menu:\n1. Pinjam Mobil 🚗\n2. Pinjam Motor 🏍️\n3. Kembalikan Kendaraan 🔄",
        );
        pengajuanBySender[chatId] = { step: "menu-kendaraan", pegawai };
        return;
      }
      if (bodyLower === "5") {
        await kirimDenganTyping(
          client,
          chatId,
          `*Pengambilan Persediaan*\n\nSilakan buka link katalog di bawah ini melalui HP Anda untuk memilih barang:\n${LINK_WEB_KATALOG}`,
        );
        delete pengajuanBySender[chatId];
        return;
      }
      if (bodyLower === "6") {
        const linkArsip =
          "https://docs.google.com/forms/d/e/1FAIpQLSfC8aa3eGzNCjB4B_okAFxmkmbttPTraqgNeKGR0wJ1bPc1HA/viewform";
        await kirimDenganTyping(
          client,
          chatId,
          `*Peminjaman Data Arsip*\n\nSilakan isi formulir peminjaman arsip melalui link berikut:\n${linkArsip}`,
        );
        delete pengajuanBySender[chatId];
        return;
      }
      if (bodyLower === "7") {
        await kirimDenganTyping(
          client,
          chatId,
          "Silakan ketik *Hari dan Tanggal* pelaksanaan WFH Anda.\n\nContoh: *Jumat, 3 April 2026*",
        );
        pengajuanBySender[chatId] = {
          step: "wfa-tanggal",
          pegawai,
          jenis: "WFA",
          wfaList: [],
        };
        return;
      }

      await kirimDenganTyping(
        client,
        chatId,
        "Pilihan tidak valid. Ketik angka 1 - 7. Atau ketik *menu* untuk kembali.",
      );
      return;
    }

    // ==========================================
    // 9. STATE MACHINE (PROSES ALUR SEMUA MENU)
    // ==========================================

    // --- ALUR WFH (SISTEM FIXED LOOP) ---
    if (flow.step === "wfa-tanggal") {
      pengajuanBySender[chatId].tanggalWFA = message.body.trim();
      pengajuanBySender[chatId].step = "wfa-jumlah";
      await kirimDenganTyping(
        client,
        chatId,
        `Tanggal WFH: *${message.body.trim()}*.\n\nAda *berapa banyak kegiatan* yang ingin Anda laporkan hari ini? (Ketik angka saja, contoh: 2)`
      );
      return;
    }

    if (flow.step === "wfa-jumlah") {
      const jumlah = parseInt(message.body.trim(), 10);
      if (isNaN(jumlah) || jumlah <= 0) {
        await kirimDenganTyping(client, chatId, "❌ Harap masukkan angka yang valid (contoh: 1, 2, atau 3).");
        return;
      }
      pengajuanBySender[chatId].totalKegiatan = jumlah;
      pengajuanBySender[chatId].step = "wfa-kegiatan";
      await kirimDenganTyping(
        client,
        chatId,
        `Baik, sistem mencatat target *${jumlah} Kegiatan*.\n\nSilakan tuliskan *Kegiatan ke-1* yang Anda lakukan hari ini.`
      );
      return;
    }

    if (flow.step === "wfa-kegiatan") {
      const teks = message.body.trim();
      const maxKata = 50;
      const jumlahKata = teks.split(/\s+/).filter(w => w.length > 0).length;

      if (jumlahKata > maxKata) {
        await kirimDenganTyping(
          client,
          chatId,
          `❌ Teks terlalu panjang! (Saat ini: ${jumlahKata} kata).\n\nMaksimal *${maxKata} kata*. Silakan ringkas dan kirimkan kembali *Kegiatan* Anda.`
        );
        return;
      }

      pengajuanBySender[chatId].kegiatan = teks;
      pengajuanBySender[chatId].step = "wfa-output";
      await kirimDenganTyping(client, chatId, "Tuliskan *Output* dari kegiatan tersebut.");
      return;
    }

    if (flow.step === "wfa-output") {
      const teks = message.body.trim();
      const maxKata = 50;
      const jumlahKata = teks.split(/\s+/).filter(w => w.length > 0).length;

      if (jumlahKata > maxKata) {
        await kirimDenganTyping(
          client,
          chatId,
          `❌ Teks terlalu panjang! (Saat ini: ${jumlahKata} kata).\n\nMaksimal *${maxKata} kata*. Silakan ringkas dan kirimkan kembali *Output* Anda.`
        );
        return;
      }

      pengajuanBySender[chatId].output = teks;
      pengajuanBySender[chatId].step = "wfa-capaian";
      await kirimDenganTyping(client, chatId, "Tuliskan *Capaian Kinerja*.");
      return;
    }

    if (flow.step === "wfa-capaian") {
      const teks = message.body.trim();
      const maxKata = 50;
      const jumlahKata = teks.split(/\s+/).filter(w => w.length > 0).length;

      if (jumlahKata > maxKata) {
        await kirimDenganTyping(
          client,
          chatId,
          `❌ Teks terlalu panjang! (Saat ini: ${jumlahKata} kata).\n\nMaksimal *${maxKata} kata* agar format tabel tidak rusak. Silakan ringkas dan kirimkan kembali *Capaian Kinerja* Anda.`
        );
        return;
      }

      pengajuanBySender[chatId].capaian = teks;
      pengajuanBySender[chatId].step = "wfa-satuan";
      await kirimDenganTyping(client, chatId, "Tuliskan *Satuan* (misal: Dokumen, Kegiatan, Laporan).");
      return;
    }

    if (flow.step === "wfa-satuan") {
      const teks = message.body.trim();
      const maxKata = 50;
      const jumlahKata = teks.split(/\s+/).filter(w => w.length > 0).length;

      if (jumlahKata > maxKata) {
        await kirimDenganTyping(
          client,
          chatId,
          `❌ Teks terlalu panjang! (Saat ini: ${jumlahKata} kata).\n\nMaksimal *${maxKata} kata*. Silakan ringkas dan kirimkan kembali *Satuan* Anda.`
        );
        return;
      }

      pengajuanBySender[chatId].satuan = teks;
      pengajuanBySender[chatId].step = "wfa-keterangan";
      await kirimDenganTyping(
        client,
        chatId,
        "Silakan tuliskan *Keterangan / Tautan (Link)* bukti dukung Anda (misal: Link Google Drive).\n\nJika *TIDAK ADA*, cukup ketik tanda strip *-*"
      );
      return;
    }

    if (flow.step === "wfa-keterangan") {
      let ket = message.body.trim();
      if (ket === "-" || ket.toLowerCase() === "tidak ada") ket = "";
      pengajuanBySender[chatId].keterangan = ket;
      pengajuanBySender[chatId].step = "wfa-foto-1";
      
      const urutan = flow.wfaList.length + 1;

      await kirimDenganTyping(
        client,
        chatId,
        `Silakan kirimkan *Foto Bukti (Wajib)* untuk kegiatan ke-${urutan}.`
      );
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
        await kirimDenganTyping(
          client,
          chatId,
          "✅ Foto bukti pertama diterima!\n\nJika ada *Foto Tambahan (Opsional)*, silakan kirimkan sekarang.\nJika *TIDAK ADA*, cukup ketik kata *lanjut* atau *skip*."
        );
      } else {
        await kirimDenganTyping(
          client,
          chatId,
          "❌ Laporan WFH wajib menyertakan bukti! Mohon kirimkan *foto/gambar*, bukan pesan teks biasa."
        );
      }
      return;
    }

    // LOGIKA PENENTUAN: LOOPING ATAU CETAK PDF
    if (flow.step === "wfa-foto-2") {
      let fotoPath2 = null;

      if (message.hasMedia) {
        const media = await message.downloadMedia();
        await ensureDirAsync(UPLOADS_DIR);
        const extension = media.mimetype.split("/").pop().replace("jpeg", "jpg");
        fotoPath2 = path.join(UPLOADS_DIR, `wfa2_${hanyaAngka(chatId)}_${Date.now()}.${extension}`);
        await fsPromises.writeFile(fotoPath2, media.data, "base64");
      }

      pengajuanBySender[chatId].wfaList.push({
        kegiatan: flow.kegiatan,
        output: flow.output,
        capaian: flow.capaian,
        satuan: flow.satuan,
        keterangan: flow.keterangan,
        fotoPath1: flow.fotoPath1,
        fotoPath2: fotoPath2,
      });

      const urutanSelesai = pengajuanBySender[chatId].wfaList.length;
      const target = flow.totalKegiatan;

      if (urutanSelesai < target) {
        pengajuanBySender[chatId].step = "wfa-kegiatan";
        await kirimDenganTyping(
          client,
          chatId,
          `✅ Kegiatan ke-${urutanSelesai} berhasil disimpan!\n\nMari lanjutkan, silakan tuliskan *Kegiatan ke-${urutanSelesai + 1}* Anda.`
        );
        return;
      } else {
        await kirimDenganTyping(
          client,
          chatId,
          `✅ Semua ${target} kegiatan berhasil direkap!\n\nSedang menyusun dan merapikan Laporan Kinerja Harian WFH Anda menjadi PDF...`
        );

        let atasan = cariAtasanPegawai(flow.pegawai);
        
        if (!atasan || !atasan["No. HP (WA) aktif"]) {
          atasan = DATA_PAK_ALPHA;
        }

        const jabatanUser = (flow.pegawai["Jabatan"] || flow.pegawai["JABATAN"] || flow.pegawai["SUBUNIT"] || "").toUpperCase();
        
        if (jabatanUser.includes("KOOR") && !jabatanUser.includes("KEPALA BIRO")) {
          const dataKepalaBiro = dbPegawai.find(p => {
            const jab = (p["Jabatan"] || p["JABATAN"] || "").toUpperCase();
            return jab.includes("KEPALA BIRO"); 
          });

          if (dataKepalaBiro) {
            atasan = {
              "Nama Pegawai": dataKepalaBiro["Nama Pegawai"],
              nip: dataKepalaBiro["nip"] || dataKepalaBiro["NIP"] || "-",
              Jabatan: dataKepalaBiro["Jabatan"] || "Kepala Biro"
            };
          } else {
            atasan = {
              "Nama Pegawai": "KEPALA BIRO (Data belum ada di Database)", 
              nip: "-",
              Jabatan: "Kepala Biro"
            };
          }
        }

        const unitKerjaAtauSubstansi =
          flow.pegawai["Unit Kerja"] ||
          flow.pegawai["SUBUNIT"] ||
          flow.pegawai["Subbagian"] ||
          flow.pegawai["Unit"] ||
          "TU";

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
          wfaList: flow.wfaList,
        };

        try {
          await buatLaporanWFAAsync(dataWFA, chatId, client);
        } catch (e) {
          console.error("Gagal eksekusi buatLaporanWFAAsync:", e);
          await kirimDenganTyping(
            client,
            chatId,
            `Gagal membuat PDF WFH. Cek log error server.\nInfo: ${e.message}`,
          );
        }

        delete pengajuanBySender[chatId];
        return;
      }
    }

    // --- ALUR LEMBUR ---
    if (flow.step === "alasan-lembur") {
      if (message.body.trim().length < 5) {
        await kirimDenganTyping(
          client,
          chatId,
          "Mohon berikan alasan lembur yang lebih detail.",
        );
        return;
      }
      pengajuanBySender[chatId].alasan = message.body.trim();
      pengajuanBySender[chatId].step = "tanya-jam-masuk";
      await kirimDenganTyping(
        client,
        chatId,
        "Baik, sekarang masukkan *jam mulai lembur* Anda (format 24 jam, contoh: 17:00).",
      );
      return;
    }

    if (flow.step === "tanya-jam-masuk") {
      const jamMasuk = message.body.trim();
      if (!/\d{1,2}:\d{2}/.test(jamMasuk)) {
        await kirimDenganTyping(
          client,
          chatId,
          "Format jam tidak valid. Mohon gunakan format HH:MM (contoh: 17:00).",
        );
        return;
      }
      pengajuanBySender[chatId].jamMasuk = jamMasuk;
      pengajuanBySender[chatId].step = "tanya-jam-keluar";
      await kirimDenganTyping(
        client,
        chatId,
        "Oke, terakhir masukkan *jam selesai lembur* Anda (format 24 jam, contoh: 20:00).",
      );
      return;
    }

    if (flow.step === "tanya-jam-keluar") {
      const jamKeluar = message.body.trim();
      if (!/\d{1,2}:\d{2}/.test(jamKeluar)) {
        await kirimDenganTyping(
          client,
          chatId,
          "Format jam tidak valid. Mohon gunakan format HH:MM (contoh: 20:00).",
        );
        return;
      }

      pengajuanBySender[chatId].jamKeluar = jamKeluar;
      let atasan = cariAtasanPegawai(flow.pegawai);

      // --- LOGIKA AUTO-APPROVE PIMPINAN ---
      const isPimpinan =
        !flow.pegawai["NO HP ATASAN"] ||
        flow.pegawai["NO HP ATASAN"].trim() === "";

      if (isPimpinan) {
        let pesanPegawai = `*Pengajuan Lembur OTOMATIS DISETUJUI* karena Anda terdeteksi sebagai Pimpinan.\n\nMohon upload *3 foto* dokumentasi lembur Anda sebagai bukti:\n1. Foto hasil lembur\n2. Foto Anda di tempat lembur\n3. Screenshot approval dari atasan (pesan ini).\n\n⚠️ *PENTING: Harap kirimkan foto SATU PER SATU secara berurutan, jangan dikirim sekaligus.*`;

        const selfAsAtasan = {
          "Nama Pegawai": flow.pegawai["Nama Pegawai"],
          nip: flow.pegawai["nip"] || "-",
          Jabatan: flow.pegawai["Jabatan"] || "Pimpinan",
        };

        pengajuanBySender[chatId] = {
          step: "upload-foto",
          pegawai: flow.pegawai,
          atasan: selfAsAtasan,
          alasan: flow.alasan,
          jamMasuk: flow.jamMasuk,
          jamKeluar: jamKeluar,
          fotoList: [],
        };

        await kirimDenganTyping(client, chatId, pesanPegawai);
        return;
      }

      if (!atasan || !atasan["No. HP (WA) aktif"]) {
        await kirimDenganTyping(
          client,
          chatId,
          "Maaf, data atasan Anda tidak ditemukan atau nomor WA tidak valid. Hubungi admin.",
        );
        delete pengajuanBySender[chatId];
        return;
      }

      const { alasan, jamMasuk } = flow;
      pengajuanBySender[chatId] = {
        ...flow,
        step: "menunggu-persetujuan",
        atasan,
        jamKeluar,
      };

      const nomorAtasan = atasan["No. HP (WA) aktif"] + "@c.us";
      const teksPengajuan = `*Pengajuan Lembur* dari ${flow.pegawai["Nama Pegawai"]}\nAlasan: ${alasan}\nJam: ${jamMasuk} - ${jamKeluar} (${calculateDuration(jamMasuk, jamKeluar)})\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju\n2. Tidak Setuju`;

      const sentToAtasan = await client.sendMessage(nomorAtasan, teksPengajuan);

      pengajuanByAtasanMsgId[sentToAtasan.id._serialized] = {
        sender: chatId,
        jenis: flow.jenis,
        pegawai: flow.pegawai,
        atasan,
        alasan,
        jamMasuk,
        jamKeluar,
      };

      await kirimDenganTyping(
        client,
        chatId,
        `Pengajuan Lembur Anda sudah diteruskan ke atasan (${atasan["Nama Pegawai"]}) untuk persetujuan.`,
      );

      return;
    }

    // --- ALUR CUTI ---
    if (flow.step === "alasan-cuti") {
      const alasan = message.body.trim();

      const isPimpinan =
        !flow.pegawai["NO HP ATASAN"] ||
        flow.pegawai["NO HP ATASAN"].trim() === "";

      if (isPimpinan) {
        let pesanPegawai = `*Pengajuan Cuti OTOMATIS DISETUJU* karena Anda terdeteksi sebagai Pimpinan.\n\nSilakan lanjutkan mengisi form pengajuan cuti di link berikut:\n${FORM_CUTI_URL}`;
        await kirimDenganTyping(client, chatId, pesanPegawai);
        delete pengajuanBySender[chatId];
        return;
      }

      const atasan = cariAtasanPegawai(flow.pegawai);
      if (!atasan || !atasan["No. HP (WA) aktif"]) {
        await kirimDenganTyping(
          client,
          chatId,
          "Maaf, data atasan Anda tidak ditemukan atau nomor WA tidak valid. Hubungi admin.",
        );
        delete pengajuanBySender[chatId];
        return;
      }
      const nomorAtasan = atasan["No. HP (WA) aktif"] + "@c.us";
      const teksAtasan = `*Pengajuan Cuti* dari ${flow.pegawai["Nama Pegawai"]}\nAlasan: ${alasan}\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju\n2. Tidak Setuju`;
      const sentToAtasan = await client.sendMessage(nomorAtasan, teksAtasan);

      pengajuanByAtasanMsgId[sentToAtasan.id._serialized] = {
        sender: chatId,
        jenis: flow.jenis,
        pegawai: flow.pegawai,
        atasan,
        alasan,
      };
      pengajuanBySender[chatId] = {
        ...flow,
        step: "menunggu-persetujuan",
        alasan,
        atasan,
      };
      await kirimDenganTyping(
        client,
        chatId,
        `Pengajuan Cuti Anda sudah diteruskan ke atasan (${atasan["Nama Pegawai"]}) untuk persetujuan.`,
      );
      return;
    }

    // --- ALUR KENDARAAN (CERDAS: MOBIL & MOTOR) ---
    if (flow.step === "menu-kendaraan") {
      const listKendaraan = await getStatusKendaraan();
      const alreadyBorrowed = listKendaraan.find(
        (m) => m.peminjam_saat_ini === pegawai["nip"],
      );

      if (bodyLower === "1" || bodyLower === "2") {
        if (alreadyBorrowed) {
          await kirimDenganTyping(
            client,
            chatId,
            `Anda saat ini sudah meminjam *${alreadyBorrowed.nama}* (${alreadyBorrowed.plat}).\n\nHarap kembalikan kendaraan tersebut terlebih dahulu sebelum meminjam yang lain (Pilih menu no 3: Kembalikan Kendaraan).`,
          );
          delete pengajuanBySender[chatId];
          return;
        }

        const jenisFilter = bodyLower === "1" ? "Mobil" : "Motor";
        const tersedia = listKendaraan.filter(
          (m) => m.status === "TERSEDIA" && m.jenis === jenisFilter,
        );
        const dipakai = listKendaraan.filter(
          (m) => m.status === "DIPAKAI" && m.jenis === jenisFilter,
        );

        let text = `*DAFTAR ${jenisFilter.toUpperCase()} KANTOR*\n\n*TERSEDIA*\n_Ketik angka urutan (1, 2, 3...) untuk meminjam:_\n`;
        if (tersedia.length > 0) {
          tersedia.forEach((m, index) => {
            text += `\n*${index + 1}. ${m.nama}* (${m.plat})`;
          });
        } else {
          text += `\n_(Tidak ada ${jenisFilter.toLowerCase()} tersedia saat ini)_`;
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

            text += `\n~- ${m.nama} (${m.plat})~`;
            text += `\n   └ Dipakai: ${namaPeminjam}`;
          });
        } else {
          text += `\n_(Tidak ada ${jenisFilter.toLowerCase()} yang sedang keluar)_`;
        }

        if (tersedia.length === 0) {
          text += `\n\n*Semua ${jenisFilter.toLowerCase()} sedang dipakai.* Silakan hubungi admin jika mendesak.`;
          await kirimDenganTyping(client, chatId, text);
          delete pengajuanBySender[chatId];
          return;
        }

        await kirimDenganTyping(client, chatId, text);
        pengajuanBySender[chatId] = {
          ...flow,
          step: "pilih-kendaraan-pinjam",
          listKendaraan: tersedia,
        };
        return;
      } else if (bodyLower === "3") {
        if (!alreadyBorrowed) {
          await kirimDenganTyping(
            client,
            chatId,
            "Sistem mencatat Anda tidak sedang meminjam kendaraan apapun saat ini.",
          );
          delete pengajuanBySender[chatId];
          return;
        }

        pengajuanBySender[chatId] = {
          ...flow,
          step: "lapor-kondisi",
          kendaraanId: alreadyBorrowed.id,
          namaKendaraan: alreadyBorrowed.nama,
        };
        await kirimDenganTyping(
          client,
          chatId,
          `Sistem mencatat Anda sedang meminjam:\n*${alreadyBorrowed.nama}* (${alreadyBorrowed.plat})\n\nBagaimana *Kondisi Kendaraan* saat ini? (misal: Aman, Lecet dikit, Ban kempes)`,
        );
        return;
      } else {
        await kirimDenganTyping(
          client,
          chatId,
          "Pilihan salah. Silakan ketik angka 1, 2, atau 3.",
        );
        return;
      }
    }

    if (flow.step === "pilih-kendaraan-pinjam") {
      const pilihanAngka = parseInt(bodyLower);
      const indexPilihan = pilihanAngka - 1;

      const kendaraanDipilih = flow.listKendaraan[indexPilihan];

      if (!kendaraanDipilih || isNaN(pilihanAngka)) {
        await kirimDenganTyping(
          client,
          chatId,
          "Pilihan salah. Ketik *angka urutan* (1, 2, 3...) kendaraan yang tersedia.",
        );
        return;
      }

      const pilihanId = kendaraanDipilih.id; // Ambil ID asli JSON
      const allKendaraan = await getStatusKendaraan();
      const currentCheck = allKendaraan.find((m) => m.id === pilihanId);
      
      if (currentCheck.status !== "TERSEDIA") {
        await kirimDenganTyping(
          client,
          chatId,
          "Maaf, kendaraan ini baru saja dipinjam orang lain. Silakan pilih menu ulang.",
        );
        delete pengajuanBySender[chatId];
        return;
      }

      pengajuanBySender[chatId] = {
        ...flow,
        step: "isi-tujuan",
        kendaraanId: pilihanId,
        namaKendaraan: kendaraanDipilih.nama,
      };
      await kirimDenganTyping(
        client,
        chatId,
        `Baik. Silakan tuliskan *Tujuan & Keperluan* pemakaian kendaraan.`,
      );
      return;
    }

    if (flow.step === "isi-tujuan") {
      const tujuan = message.body.trim();
      const isPimpinan =
        !flow.pegawai["NO HP ATASAN"] ||
        flow.pegawai["NO HP ATASAN"].trim() === "" ||
        chatId === (NO_PAK_ALPHA ? `${NO_PAK_ALPHA}@c.us` : null); 

      if (isPimpinan) {
        const allKendaraan = await getStatusKendaraan();
        const index = allKendaraan.findIndex((m) => m.id === flow.kendaraanId);

        if (index !== -1 && allKendaraan[index].status === "TERSEDIA") {
          allKendaraan[index].status = "DIPAKAI";
          allKendaraan[index].peminjam_saat_ini = pegawai["nip"];
          allKendaraan[index].waktu_pinjam = new Date().toISOString();
          allKendaraan[index].tujuan_aktif = tujuan;

          await updateStatusKendaraanAsync(allKendaraan);

          await kirimDenganTyping(
            client,
            chatId,
            `*Peminjaman OTOMATIS DISETUJU* karena Anda terdeteksi sebagai Pimpinan/Penanggung Jawab.\n\nUnit: ${flow.namaKendaraan}\nTujuan: ${tujuan}\n\nSedang menyiapkan PDF Surat Izin Kendaraan untuk syarat serah terima kunci...`,
          );

          try {
            const dataPDFMobil = {
              penanggungJawab: {
                nama: DATA_PAK_ALPHA["Nama Pegawai"],
                nip: DATA_PAK_ALPHA.nip,
                jabatan: DATA_PAK_ALPHA.Jabatan,
              },
              pemakai: {
                nama: pegawai["Nama Pegawai"] || "Nama Pemakai",
                nip: pegawai["nip"] || pegawai["NIP"] || "-",
                jabatan: pegawai["Jabatan"] || "-",
              },
              kendaraan: {
                merek: allKendaraan[index].nama || "-",
                tnkb: allKendaraan[index].plat || "-",
                keperluan: tujuan || "-",
                tanggalMulai: new Date().toLocaleDateString("id-ID"),
                tanggalSelesai: "-",
              },
              pengembalian: {
                kondisi: "-",
              },
            };
            await buatSuratIzinMobilAwalAsync(dataPDFMobil, chatId, client);
            await kirimDenganTyping(client, chatId, "Selamat jalan, hati-hati! Jangan lupa ketik/pilih *MENU* -> 'Kembalikan Kendaraan' setelah selesai.");
          } catch (pdfErr) {
            console.error("Gagal buat PDF Surat Izin Mobil:", pdfErr);
          }
        } else {
          await kirimDenganTyping(
            client,
            chatId,
            "Maaf, kendaraan tersebut baru saja dipinjam atau sudah tidak tersedia di sistem.",
          );
        }
        delete pengajuanBySender[chatId];
        return;
      }

      const teksPengajuan = `*Pengajuan Peminjaman Kendaraan* dari ${flow.pegawai["Nama Pegawai"]}\nUnit: ${flow.namaKendaraan}\nTujuan: ${tujuan}\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju\n2. Tidak Setuju`;

      if(NO_PAK_ALPHA) {
        const sentToPJ = await client.sendMessage(`${NO_PAK_ALPHA}@c.us`, teksPengajuan);

        pengajuanByAtasanMsgId[sentToPJ.id._serialized] = {
          sender: chatId,
          jenis: "Kendaraan",
          pegawai: flow.pegawai,
          atasan: DATA_PAK_ALPHA,
          alasan: tujuan,
          kendaraanId: flow.kendaraanId,
          namaKendaraan: flow.namaKendaraan,
        };
      }

      pengajuanBySender[chatId] = {
        ...flow,
        step: "menunggu-persetujuan",
        jenis: "Kendaraan",
        alasan: tujuan,
        atasan: DATA_PAK_ALPHA,
      };
      await kirimDenganTyping(
        client,
        chatId,
        `Pengajuan Peminjaman Kendaraan Anda sudah diteruskan ke Penanggung Jawab (${DATA_PAK_ALPHA["Nama Pegawai"]}) untuk persetujuan.`,
      );
      return;
    }

    // --- ALUR PELAPORAN KONDISI & WAKTU ---
    if (flow.step === "lapor-kondisi") {
      pengajuanBySender[chatId].kondisi = message.body.trim();
      pengajuanBySender[chatId].step = "lapor-waktu-awal";
      await kirimDenganTyping(
        client,
        chatId,
        "Silakan tuliskan *Tanggal dan Jam Awal* pemakaian. (misal: 2 April 2026 pukul 08.00)",
      );
      return;
    }

    if (flow.step === "lapor-waktu-awal") {
      pengajuanBySender[chatId].waktuAwal = message.body.trim();
      pengajuanBySender[chatId].step = "lapor-waktu-akhir";
      await kirimDenganTyping(
        client,
        chatId,
        "Silakan tuliskan *Tanggal dan Jam Selesai* pemakaian. (misal: 2 April 2026 pukul 16.00)",
      );
      return;
    }

    if (flow.step === "lapor-waktu-akhir") {
      const waktuAkhir = message.body.trim();
      const { kendaraanId, kondisi, waktuAwal } = pengajuanBySender[chatId];

      const allKendaraan = await getStatusKendaraan();
      const index = allKendaraan.findIndex((m) => m.id === kendaraanId);

      if (index !== -1) {
        const mobil = allKendaraan[index];
        const tujuanAwal = mobil.tujuan_aktif;

        mobil.status = "TERSEDIA";
        mobil.peminjam_saat_ini = null;
        mobil.waktu_pinjam = null;
        mobil.tujuan_aktif = null;

        await updateStatusKendaraanAsync(allKendaraan);

        const logData = {
          tanggal: new Date().toISOString(),
          nama_pegawai: pegawai["Nama Pegawai"],
          nip: pegawai["nip"],
          kendaraan: mobil.nama,
          tujuan: tujuanAwal || "-",
          kondisi: kondisi,
          lama_pakai: `${waktuAwal} s.d. ${waktuAkhir}`,
          jam_pinjam: waktuAwal,
          jam_akhir: waktuAkhir,
        };

        await simpanRiwayatKendaraanAsync(logData);

        await kirimDenganTyping(
          client,
          chatId,
          `*Pengembalian Selesai!*\n\nUnit *${mobil.nama}* telah dikembalikan ke sistem.\nKondisi: ${kondisi}\nTerima kasih. Laporan pengembalian telah dicatat di sistem.`,
        );

        try {
          const dataPDFMobil = {
            penanggungJawab: {
              nama: DATA_PAK_ALPHA["Nama Pegawai"],
              nip: DATA_PAK_ALPHA.nip,
              jabatan: DATA_PAK_ALPHA.Jabatan,
            },
            pemakai: {
              nama: pegawai["Nama Pegawai"] || "Nama Pemakai",
              nip: pegawai["nip"] || pegawai["NIP"] || "-",
              jabatan: pegawai["Jabatan"] || "-",
            },
            kendaraan: {
              merek: mobil.nama || "-",
              tnkb: mobil.plat || "-",
              keperluan: tujuanAwal || "-",
              tanggalMulai: waktuAwal,
              tanggalSelesai: waktuAkhir,
            },
            pengembalian: {
              kondisi: kondisi,
            },
          };
          await buatSuratIzinMobilAkhirAsync(dataPDFMobil, chatId, client);
        } catch (pdfErr) {
          console.error("Gagal buat PDF Surat Izin Mobil Akhir:", pdfErr);
        }
      }

      delete pengajuanBySender[chatId];
      return;
    }

    // --- ALUR MENUNGGU PERSETUJUAN ---
    if (flow.step === "menunggu-persetujuan") {
      await kirimDenganTyping(
        client,
        chatId,
        `Pengajuan ${flow.jenis} Anda sedang diproses oleh atasan. Mohon tunggu. Ketik *menu* untuk batal.`,
      );
      if (bodyLower === "menu") {
        delete pengajuanBySender[chatId];
        await kirimDenganTyping(
          client,
          chatId,
          `Pengajuan ${flow.jenis} dibatalkan. Kembali ke menu utama.`,
        );
      }
      return;
    }

    // --- JIKA TIDAK ADA YANG COCOK ---
    await kirimDenganTyping(
      client,
      chatId,
      "Perintah tidak dikenali dalam alur saat ini. Ketik *menu* untuk kembali ke menu utama.",
    );
  } catch (err) {
    console.error(
      "[ERROR] Terjadi kesalahan saat memproses pesan:",
      err.stack || err.message,
    );
    try {
      await kirimDenganTyping(
        client,
        chatId,
        "Maaf, terjadi kesalahan pada sistem. Silakan coba lagi atau ketik *menu*.",
      );
      delete pengajuanBySender[chatId];
      delete helpdeskQueue[chatId];
    } catch {}
  }
});

// IX. GLOBAL ERROR HANDLERS & START
process.on("unhandledRejection", (reason, p) => {
  console.error("[UNHANDLED REJECTION]", reason);
  logToFile("error", "UNHANDLED", String(reason));
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
  logToFile("error", "UNCAUGHT", err.stack || String(err));
});

process.on('SIGINT', async () => {
  console.log('[(SIGINT)] Mematikan bot SisKA dengan aman...');
  try {
    await client.destroy();
  } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[(SIGTERM)] Mematikan bot SisKA dengan aman (PM2 Restart)...');
  try {
    await client.destroy();
  } catch (e) {}
  process.exit(0);
});

client.initialize();