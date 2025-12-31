console.log("[INIT] Memulai bot SisKA...");

// I. IMPORTS & KONFIGURASI

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const PDFDocument = require("pdfkit");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const imageSize = require("image-size");
const axios = require("axios");
const { inputJamLemburKeSheet } = require("./sheets_helper");
const { inputLogMobilKeSheet } = require("./kendaraan_helper");
const { cariJawabanFAQ } = require("./faq_helpdesk");
const { jawabHelpdeskAI, simpanDataBaru } = require("./ai_helpdesk");
const {
  HELPDESK_GROUP_ID,
  FORM_LEMBUR_URL,
  FORM_CUTI_URL,
} = require("./config");

const MOBIL_PATH = path.join(__dirname, "status_mobil.json");
const RIWAYAT_MOBIL_PATH = path.join(
  __dirname,
  "riwayat_peminjaman_mobil.json"
);

async function getStatusMobil() {
  try {
    const data = await fsPromises.readFile(MOBIL_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function updateStatusMobilAsync(newData) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({
      data: null,
      customWrite: true,
      content: newData,
      filePath: MOBIL_PATH,
      resolve,
      reject,
    });
    processWriteQueue();
  });
}

async function simpanRiwayatMobilAsync(data) {
  return new Promise((resolve, reject) => {
    dbWriteQueue.push({ data, filePath: RIWAYAT_MOBIL_PATH, resolve, reject });
    processWriteQueue();
  });
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
        JSON.stringify(currentData, null, 2)
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

// III. UTILITAS & LOGGING (Dianggap sebagai 'utils.js')

const LOGS_DIR = path.join(__dirname, "logs");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const REPORTS_DIR = path.join(__dirname, "reports");

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

// Synchronous helpers used by some legacy calls (safe wrappers)
function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      // ignore
    }
  }
}

function logToFile(numberOrName, type, text) {
  // non-blocking wrapper to async logger to avoid throwing in global handlers
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

function calculateDuration(startStr, endStr) {
  if (!startStr || !endStr || !startStr.includes(":") || !endStr.includes(":"))
    return "N/A";
  try {
    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);

    const startDate = new Date(0, 0, 0, startH, startM, 0);
    let endDate = new Date(0, 0, 0, endH, endM, 0);

    if (endDate < startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }

    const diffMs = endDate - startDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${diffHours} jam ${diffMins} menit`;
  } catch (e) {
    console.error("Error calculating duration:", e);
    return "Error";
  }
}

// IV. DATABASE & API HELPER

function loadDatabase() {
  try {
    const dbPath = path.join(__dirname, "DatabasePegawaiBiroKeuangan.json");
    if (!fs.existsSync(dbPath)) {
      console.error(
        "[CRITICAL] File database Pegawai Biro keuangan.json tidak ditemukan."
      );
      return [];
    }
    const raw = fs.readFileSync(dbPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed.Internal || [];
  } catch (err) {
    console.error("[CRITICAL] Gagal membaca database pegawai:", err.message);
    console.error(
      "Pastikan file JSON dan struktur key sudah benar (Internal[...])."
    );
    return [];
  }
}

dbPegawai = loadDatabase();
console.log(`[INIT] Berhasil memuat ${dbPegawai.length} data pegawai.`);

// Helper Format Nomor
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
      // Normalisasi nomor di database agar sama-sama jadi format 62...
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

async function getDummySignature(nip) {
  const url =
    "https://raw.githubusercontent.com/sandro4132017/dummy-signature-api/main/signature1.png";
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 7000,
    });
    return Buffer.from(res.data);
  } catch (e) {
    return null;
  }
}

// V. WHATSAPP CLIENT HELPER

async function kirimDenganTyping(client, chatId, text) {
  try {
    // 1. Coba ambil chat & typing (dibungkus try-catch sendiri biar gak fatal)
    try {
      const chat = await client.getChatById(chatId);
      await chat.sendStateTyping();
      const delay = Math.floor(Math.random() * 1000) + 500;
      await new Promise((r) => setTimeout(r, delay));
      await chat.clearState();
    } catch (ignoreErr) {
      // Kalau gagal typing, biarkan saja. Lanjut kirim pesan.
    }

    // 2. Kirim Pesan (Ini yang utama)
    const msg = await client.sendMessage(chatId, text);
    logOut(chatId, text);
    return msg;
  } catch (e) {
    // Fallback terakhir kalau sendMessage gagal total
    console.error(`[ERROR FATAL] Gagal kirim pesan ke ${chatId}:`, e.message);
    return null;
  }
}

// VI. PDF GENERATOR
async function buatLaporanLemburDenganFotoAsync(
  data,
  fotoPaths,
  chatId,
  targetAtasan,
  client
) {
  // 1. Pastikan direktori ada (Async)
  await ensureDirAsync(REPORTS_DIR);
  await ensureDirAsync(UPLOADS_DIR);

  const timestamp = Date.now();
  const tanggalLaporan = new Date().toISOString().split("T")[0];

  const filePath = path.join(
    REPORTS_DIR,
    `Laporan_Lembur_${data.nama.replace(
      /\s/g,
      "_"
    )}_${tanggalLaporan}_${timestamp}.pdf`
  );

  const doc = new PDFDocument({
    margins: { top: 57, bottom: 57, left: 57, right: 57 },
  });

  try {
    const fontDir = path.join(__dirname, "fonts");
    try {
      doc.registerFont("TMR", path.join(fontDir, "times.ttf"));
      doc.registerFont("TMR-Bold", path.join(fontDir, "times-bold.ttf"));
      doc.font("TMR");
    } catch (e) {
      console.error(
        "[WARN] Font Times New Roman tidak ditemukan. Menggunakan default."
      );
      doc.font("Helvetica");
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // A. PRE-LOAD GAMBAR (OPTIMASI PARALEL)

    const loadedImages = await Promise.all(
      fotoPaths.map(async (p) => {
        try {
          const buf = await fsPromises.readFile(p);
          const dim = imageSize(buf);
          return { path: p, buffer: buf, dimensions: dim, valid: true };
        } catch (e) {
          console.error(`[IMG ERROR] Gagal load gambar ${p}:`, e.message);
          return { path: p, valid: false };
        }
      })
    );

    doc
      .font("TMR-Bold")
      .fontSize(14)
      .text("KEMENTERIAN KETENAGAKERJAAN RI", { align: "center" });
    doc.text("SEKRETARIAT JENDERAL - BIRO KEUANGAN DAN BMN", {
      align: "center",
    });
    doc.moveDown(2);

    doc
      .font("TMR-Bold")
      .fontSize(13)
      .text("LAPORAN LEMBUR", { align: "center" });
    doc.moveDown(2);

    doc.font("TMR").fontSize(11);
    const identitas = [
      ["Nama", data.nama],
      ["NIP", data.nip],
      ["Tanggal", tanggalLaporan],
      ["Jam Mulai", data.jamMasuk],
      ["Jam Selesai", data.jamKeluar],
      ["Total Jam Lembur", calculateDuration(data.jamMasuk, data.jamKeluar)],
      ["Uraian Kegiatan", data.kegiatan],
    ];

    const labelX = doc.x;
    const valueX = doc.x + 150;

    identitas.forEach(([label, value]) => {
      const y = doc.y;
      doc.text(label, labelX, y);
      doc.text(`: ${value}`, valueX, y);
      doc.moveDown(1);
    });

    doc.moveDown(2);
    doc.x = doc.page.margins.left;

    doc
      .font("TMR-Bold")
      .fontSize(12)
      .text("Dokumentasi Hasil Lembur", { align: "center" });
    doc.font("TMR").moveDown();

    const addImageBlockMemory = (title, imgData) => {
      doc.fontSize(11).text(`${title}:`);
      doc.moveDown(0.5);

      if (imgData && imgData.valid) {
        const imgWidth = imgData.dimensions.width;
        const imgHeight = imgData.dimensions.height;
        const maxWidth = 250;
        const maxHeight = 160;
        const aspectRatio = imgWidth / imgHeight;
        let finalWidth = maxWidth;
        let finalHeight = Math.round(maxWidth / aspectRatio);

        if (finalHeight > maxHeight) {
          finalHeight = maxHeight;
          finalWidth = Math.round(maxHeight * aspectRatio);
        }

        const remainingSpace =
          doc.page.height - doc.y - doc.page.margins.bottom;
        if (finalHeight + 20 > remainingSpace) {
          doc.addPage();
        }

        try {
          doc.image(imgData.buffer, {
            width: finalWidth,
            height: finalHeight,
            align: "center",
            layout: "landscape",
          });
        } catch (renderErr) {
          doc.text("(Gagal render gambar corrupt)", { align: "center" });
        }
      } else {
        doc.text("(Gambar tidak dapat dimuat/rusak)", { align: "center" });
      }
      doc.moveDown(2);
    };

    addImageBlockMemory("1. Foto Hasil Lembur", loadedImages[0]);
    doc.addPage();
    doc.moveDown(1);
    addImageBlockMemory("2. Foto Pegawai di Tempat Lembur", loadedImages[1]);
    addImageBlockMemory("3. Screenshot Approval", loadedImages[2]);

    // ========== TANDA TANGAN ==========
    const signatureHeight = 120;
    const remainingSpaceForSignature =
      doc.page.height - doc.y - doc.page.margins.bottom;
    if (signatureHeight > remainingSpaceForSignature) {
      doc.addPage();
    }

    doc.moveDown(4);
    const startY = doc.y;

    doc.fontSize(11).text(`Mengetahui,\n${data.atasan_jabatan}`, 50, startY);
    doc.text(`Dilaksanakan Oleh,\n${data.jabatan}`, 330, startY);

    const [ttdKepalaBuffer, ttdPegawaiBuffer] = await Promise.all([
      getDummySignature(data.atasan_nip),
      getDummySignature(data.nip),
    ]);

    const ttdY = startY + 40;
    const ttdWidth = 120;
    const ttdPegX = 330;
    const ttdKepX = 50;
    const fallbackImgPath = path.join(__dirname, "assets", "contoh-ttd.png");

    const renderTTD = (buffer, x, y) => {
      if (buffer) {
        try {
          doc.image(buffer, x, y, { width: ttdWidth });
        } catch (e) {
          doc.fontSize(10).text("(TTD Error)", x, y);
        }
      } else {
        if (fs.existsSync(fallbackImgPath)) {
          try {
            doc.image(fallbackImgPath, x, y, { width: ttdWidth });
          } catch (e) {}
        } else {
          doc.fontSize(10).text("(TTD Tidak Tersedia)", x, y);
        }
      }
    };

    renderTTD(ttdKepalaBuffer, ttdKepX, ttdY);
    renderTTD(ttdPegawaiBuffer, ttdPegX, ttdY);

    const yNama = ttdY + 70;
    const yNIP = yNama + 14;

    doc.fontSize(11).text(`${data.atasan_nama}`, ttdKepX, yNama);
    doc.text(`NIP. ${data.atasan_nip}`, ttdKepX, yNIP);

    doc.text(`${data.nama}`, ttdPegX, yNama);
    doc.text(`NIP. ${data.nip}`, ttdPegX, yNIP);

    doc.end();

    // B. FINALIZE & CLEANUP (OPTIMASI)

    return new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          const media = MessageMedia.fromFilePath(filePath);

          // 1. Kirim ke Pegawai
          await client.sendMessage(chatId, media, {
            caption: "Berikut laporan lembur final Anda 📑✅",
          });
          console.log(`[PDF] Laporan terkirim ke: ${chatId}`);

          // 2. Kirim ke Atasan
          if (targetAtasan) {
            await client.sendMessage(targetAtasan, media, {
              caption: `📑 Laporan Lembur dari:\n*${data.nama}*\nTanggal: ${data.tanggal}`,
            });
            console.log(`[PDF] Terkirim ke atasan: ${targetAtasan}`);
          }

          // 3. [OPTIMASI] Cleanup Foto secara Async & Paralel
          await Promise.all(
            fotoPaths.map((p) =>
              fsPromises
                .unlink(p)
                .catch((e) =>
                  console.error(`[CLEANUP ERROR] Gagal hapus ${p}:`, e.message)
                )
            )
          );

          resolve();
        } catch (err) {
          reject(err);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  } catch (err) {
    doc.end();
    console.error("[PDF BUILD ERROR]", err.message);
    throw new Error("Gagal menyusun PDF.");
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

client.on("ready", () => console.log("✅ [READY] Bot SisKA siap Broer! 🚀"));
client.on("authenticated", () => console.log("[WA] Authenticated!"));
client.on("auth_failure", (msg) => console.error("[WA] Auth failure:", msg));
client.on("disconnected", (reason) =>
  console.log(`[WA] Bot disconnect: ${reason}`)
);

// VIII. MESSAGE HANDLER

client.on("message", async (message) => {
  // 1. Ambil ID awal (Gunakan 'let' agar bisa diubah)
  let chatId = message.from;

  if (chatId === "status@broadcast") {
    return;
  }

  if (chatId.includes("@lid")) {
    try {
      const contact = await message.getContact();
      if (contact && contact.id && contact.id._serialized) {
        chatId = contact.id._serialized;
      }
    } catch (e) {
      console.error("[LID FIX ERROR]", e);
    }
  }

  logIn(chatId, message.body);

  try {
    const isGroup = chatId.endsWith("@g.us");

    const digits = hanyaAngka(chatId);

    const pegawai = cariPegawaiByWa(digits);
    console.log(
      `[DEBUG] pegawai lookup for ${digits}: ${
        pegawai ? pegawai["Nama Pegawai"] : "NOT_FOUND"
      }`
    );

    const flow = pengajuanBySender[chatId];
    let bodyLower = (message.body || "").trim().toLowerCase();

    if (bodyLower.startsWith("!")) bodyLower = bodyLower.replace(/^!+/, "");

    if (bodyLower.startsWith("rekap")) {
      if (!pegawai) {
        await kirimDenganTyping(
          client,
          chatId,
          "Anda tidak terdaftar dalam database pegawai."
        );
        console.log(
          `[DEBUG] Early return: rekap requested but pegawai NOT_FOUND for ${chatId}`
        );
        return;
      }

      const unit = (
        pegawai["Unit"] ||
        pegawai["Subbagian"] ||
        pegawai["Unit Kerja"] ||
        pegawai["SUBUNIT"] ||
        ""
      ).toUpperCase();

      const jabatan = (pegawai["Jabatan"] || "").toUpperCase();

      const isAnakTU =
        unit.includes("TU") ||
        unit.includes("TATA USAHA") ||
        jabatan.includes("TATA USAHA");

      if (!isAnakTU) {
        await kirimDenganTyping(
          client,
          chatId,
          "*AKSES DITOLAK*\nFitur !rekap hanya dapat diakses oleh Subunit Tata Usaha (TU)."
        );
        return;
      }

      const args = bodyLower.split(" ");
      const now = new Date();
      const bulanInput = args[1] ? parseInt(args[1]) : now.getMonth() + 1;
      const tahunInput = args[2] ? parseInt(args[2]) : now.getFullYear();

      await kirimDenganTyping(
        client,
        chatId,
        `Memproses Rekap SPK Bulan ${bulanInput}-${tahunInput}...`
      );

      let riwayat = [];
      if (fs.existsSync(RIWAYAT_PATH)) {
        riwayat = JSON.parse(fs.readFileSync(RIWAYAT_PATH, "utf8"));
      }

      const dataBulanIni = riwayat.filter((row) => {
        const d = new Date(row.tanggal);
        return (
          d.getMonth() + 1 === bulanInput && d.getFullYear() === tahunInput
        );
      });

      if (dataBulanIni.length === 0) {
        await kirimDenganTyping(
          client,
          chatId,
          "Belum ada data lembur di periode tersebut."
        );
        return;
      }

      const dataGrouped = groupDataByNIP(dataBulanIni);
      const namaBulan = new Date(tahunInput, bulanInput - 1).toLocaleString(
        "id-ID",
        { month: "long", year: "numeric" }
      );

      try {
        await buatPDFRekapBulanan(dataGrouped, namaBulan, chatId, client);
        console.log(`[REKAP] PDF terkirim ke ${chatId} (User TU)`);
      } catch (e) {
        console.error("[REKAP ERROR]", e);
        await kirimDenganTyping(client, chatId, "Gagal membuat PDF. Cek log.");
      }
      return;
    }

    // A. Handler Upload Foto Dokumentasi Lembur
    if (flow?.step === "upload-foto") {
      if (message.hasMedia) {
        const media = await message.downloadMedia();

        // 1. Pastikan folder ada (Async)
        await ensureDirAsync(UPLOADS_DIR);

        const extension = media.mimetype
          .split("/")
          .pop()
          .replace("jpeg", "jpg");

        // 2. Buat nama file & path
        const fotoPath = path.join(
          UPLOADS_DIR,
          `foto_${hanyaAngka(chatId)}_${Date.now()}.${extension}`
        );

        // 3. [FIX] Tulis file secara ASYNC agar tidak memblokir bot
        await fsPromises.writeFile(fotoPath, media.data, "base64");

        if (!flow.fotoList) flow.fotoList = [];
        flow.fotoList.push(fotoPath);

        const jumlahFoto = flow.fotoList.length;

        if (jumlahFoto < 3) {
          let pesanBalasan = "";
          if (jumlahFoto === 1) {
            pesanBalasan =
              "✅ *Foto Hasil Lembur* sudah diterima.\n\nSelanjutnya, silakan upload *Foto Pegawai di Tempat Lembur*.";
          } else if (jumlahFoto === 2) {
            pesanBalasan =
              "✅ *Foto Pegawai di Tempat Lembur* sudah diterima.\n\nTerakhir, silakan upload *Screenshot Approval*.";
          }
          if (pesanBalasan)
            await kirimDenganTyping(client, chatId, pesanBalasan);
        } else {
          await kirimDenganTyping(
            client,
            chatId,
            "✅ *Screenshot Approval* sudah diterima.\nSemua data lengkap, sedang membuat laporan PDF..."
          );

          const atasanObj = flow.atasan || {};
          let targetAtasan = null;
          if (atasanObj["No. HP (WA) aktif"]) {
            targetAtasan = hanyaAngka(atasanObj["No. HP (WA) aktif"]) + "@c.us";
          }

          const dataLembur = {
            nama: flow.pegawai["Nama Pegawai"],
            nip: flow.pegawai["nip"],
            jabatan: flow.pegawai["Jabatan"],
            tanggal: new Date().toISOString().split("T")[0],
            kegiatan: flow.alasan || "",
            jamMasuk: flow.jamMasuk,
            jamKeluar: flow.jamKeluar,
            atasan_nama: atasanObj["Nama Pegawai"] || "Nama Atasan",
            atasan_nip: atasanObj["nip"] || "-",
            atasan_jabatan: atasanObj["Jabatan"] || "Jabatan Atasan",
          };

          // 4. [FIX] Simpan ke Database JSON secara ASYNC (Lewat Queue)
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
            console.log(
              `[DB] Riwayat lembur ${dataLembur.nama} berhasil disimpan.`
            );
          } catch (dbErr) {
            console.error("[DB ERROR] Gagal simpan riwayat:", dbErr.message);
          }

          // 5. Buat Laporan Harian (PDF)
          try {
            await buatLaporanLemburDenganFotoAsync(
              dataLembur,
              flow.fotoList,
              chatId,
              targetAtasan,
              client
            );
          } catch (pdfErr) {
            console.error("[PDF ERROR]", pdfErr);
            await kirimDenganTyping(
              client,
              chatId,
              "⚠️ Gagal membuat PDF, tapi data riwayat sudah tersimpan."
            );
          }

          // 6. Input Otomatis ke Google Sheet
          await kirimDenganTyping(
            client,
            chatId,
            "⏳ Sedang menginput data ke Spreadsheet..."
          );

          try {
            await inputJamLemburKeSheet(
              { nip: dataLembur.nip },
              dataLembur.tanggal,
              dataLembur.jamMasuk,
              dataLembur.jamKeluar
            );
            await kirimDenganTyping(
              client,
              chatId,
              "✅ Data berhasil masuk ke Spreadsheet."
            );
          } catch (sheetErr) {
            console.error("[SHEET ERROR]", sheetErr);
            await kirimDenganTyping(
              client,
              chatId,
              "⚠️ Gagal input ke Spreadsheet. Hubungi admin."
            );
          }

          // 7. Bersihkan Sesi
          delete pengajuanBySender[chatId];
          console.log("[DEBUG] Laporan selesai, dikirim ke User & Atasan.");
        }
      } else if (bodyLower !== "") {
        await kirimDenganTyping(
          client,
          chatId,
          "Mohon kirimkan *foto* untuk dokumentasi, bukan pesan teks."
        );
      }
      console.log(`[DEBUG] Early return: upload-foto handler for ${chatId}`);
      return;
    }

    // B. Handler Grup (Helpdesk Reply & Approval)
    if (isGroup) {
      if (chatId === HELPDESK_GROUP_ID && message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        const key = quoted.id._serialized;

        // Ambil ID User asli dari Map instruksi
        const targetUser = helpdeskInstruksiMap[key];

        if (targetUser) {
          // --- 1. LOGIKA LEARNING (SIMPAN KE KNOWLEDGE BASE) ---
          try {
            const originalBody = quoted.body;
            const jawabanAdmin = message.body.trim();

            if (originalBody.includes("Pertanyaan:")) {
              const potongDepan = originalBody.split("Pertanyaan:")[1];
              const pertanyaanBersih = potongDepan.split("_AI")[0].trim();

              if (pertanyaanBersih && pertanyaanBersih.length > 2) {
                console.log(
                  `[LEARNING] ✅ SUKSES! Pertanyaan: "${pertanyaanBersih}"`
                );
                console.log(`[LEARNING] ✅ Jawaban: "${jawabanAdmin}"`);

                simpanDataBaru(pertanyaanBersih, jawabanAdmin);
              } else {
                console.log(
                  "[LEARNING] ❌ Gagal: Pertanyaan kosong setelah dibersihkan."
                );
              }
            } else {
              console.log(
                "[LEARNING] ❌ Gagal: Tidak ditemukan kata 'Pertanyaan:' pada pesan."
              );
            }
          } catch (errLearn) {
            console.error("[LEARNING ERROR]", errLearn);
          }

          // --- 2. LOGIKA REPLY KE USER ---
          const balasan = `Halo, berikut jawaban dari Helpdesk Biro Keuangan:\n\n*${message.body}*`;
          await kirimDenganTyping(client, targetUser, balasan);

          const followup = `Apakah jawaban dari Helpdesk sudah membantu?\n\nKetik *selesai* jika sudah.\nAtau pilih:\n1. Ajukan pertanyaan lanjutan\n2. Jadwalkan konsultasi`;
          await kirimDenganTyping(client, targetUser, followup);

          // Update state user agar bot tahu langkah selanjutnya adalah followup
          helpdeskQueue[targetUser] = { step: "followup" };

          // --- 3. KONFIRMASI KE ADMIN ---
          await kirimDenganTyping(
            client,
            HELPDESK_GROUP_ID,
            `✅ Jawaban sudah diteruskan ke ${targetUser} & disimpan ke Database AI.`
          );

          // Bersihkan map instruksi agar hemat memori
          delete helpdeskInstruksiMap[key];

          console.log(
            `[DEBUG] Early return: handled quoted reply in helpdesk group for ${chatId}`
          );
          return;
        }
      }
      console.log(
        `[DEBUG] Early return: exiting isGroup handler for ${chatId}`
      );
      return;
    }

    // C. Handler Approval Atasan (Quote Reply di DM)
    if (message.hasQuotedMsg) {
      const quoted = await message.getQuotedMessage();
      const qid = quoted.id._serialized;
      const pengajuan = pengajuanByAtasanMsgId[qid];

      if (pengajuan) {
        const {
          sender: pemohonId,
          jenis,
          pegawai: p,
          alasan,
          jamMasuk,
          jamKeluar,
          isForwarded,
        } = pengajuan;

        if (
          pengajuanBySender[pemohonId] &&
          pengajuanBySender[pemohonId].timerId
        ) {
          clearTimeout(pengajuanBySender[pemohonId].timerId);
          console.log(
            `[TIMER] Timer approval untuk ${p["Nama Pegawai"]} dimatikan (Atasan sudah merespon).`
          );
        }

        if (isApprovalYes(message.body)) {
          let pesanPegawai = `✅ Pengajuan *${jenis}* Anda telah *DISETUJUI* oleh atasan.`;
          if (jenis === "Lembur") {
            pesanPegawai += `\n\nMohon upload *3 foto* dokumentasi lembur Anda sebagai bukti:\n1. Foto hasil lembur\n2. Foto Anda di tempat lembur\n3. Screenshot approval dari atasan (pesan ini).`;

            pengajuanBySender[pemohonId] = {
              step: "upload-foto",
              pegawai: p,
              atasan: pengajuan.atasan,
              alasan,
              jamMasuk,
              jamKeluar,
              fotoList: [],
            };
            console.log(
              `[DEBUG] Handled quoted approval for atasan response to ${pemohonId}`
            );

            if (isForwarded) {
              const notifDian = `ℹ️ *INFO APPROVAL*\n\nPengajuan lembur atas nama *${p["Nama Pegawai"]}* telah disetujui oleh *Pak Alpha* (karena timeout 30 menit).`;
              await client.sendMessage(ID_BU_DIAN, notifDian);
            }
          } else if (jenis === "Cuti") {
            pesanPegawai += `\n\nSilakan lanjutkan mengisi form pengajuan cuti di link berikut:\n${FORM_CUTI_URL}`;
            delete pengajuanBySender[pemohonId];
          }

          await kirimDenganTyping(client, pemohonId, pesanPegawai);
          await kirimDenganTyping(
            client,
            chatId,
            `[APPROVAL] ✅ Disetujui untuk ${p["Nama Pegawai"]}`
          );
        } else if (isApprovalNo(message.body)) {
          await kirimDenganTyping(
            client,
            pemohonId,
            `❌ Pengajuan *${jenis}* Anda *DITOLAK* oleh atasan.`
          );
          await kirimDenganTyping(
            client,
            chatId,
            `[APPROVAL] ❌ Ditolak untuk ${p["Nama Pegawai"]}`
          );
          delete pengajuanBySender[pemohonId];
        }

        delete pengajuanByAtasanMsgId[qid];
        return;
      }
    }

    // D. Handler Eksternal & Helpdesk
    if (!pegawai || helpdeskQueue[chatId]) {
      console.log(
        `[TRACE] Entering EXTERNAL/HELPDESK handler for ${chatId} | helpdeskQueue=${
          helpdeskQueue[chatId] ? JSON.stringify(helpdeskQueue[chatId]) : "no"
        }`
      );

      if (helpdeskQueue[chatId]) {
        // 1. Cek jika user ingin reset/menu
        if (bodyLower === "menu") {
          delete helpdeskQueue[chatId];

          if (pegawai) {
            const menu = `Halo *${pegawai["Nama Pegawai"]}*! 👋\nAda yang bisa kami bantu hari ini?\n\nSilakan pilih menu (ketik *angka* pilihan):\n1. Pengajuan Lembur\n2. Pengajuan Cuti\n3. Chat Helpdesk\n4. Layanan Kendaraan`;

            await kirimDenganTyping(client, chatId, menu);
            pengajuanBySender[chatId] = { step: "menu", pegawai };
          } else {
            await kirimDenganTyping(
              client,
              chatId,
              "Sesi Helpdesk dibatalkan. Silahkan ketik pesan apapun untuk memulai kembali."
            );
          }
          return;
        }

        const state = helpdeskQueue[chatId];

        // 2. Step: Identitas (Khusus Eksternal)
        if (state.step === "identitas") {
          state.identitas = message.body.trim();
          await kirimDenganTyping(
            client,
            chatId,
            "Terima kasih. Silakan tuliskan pertanyaan Anda."
          );
          state.step = "pertanyaan";
          return;
        }

        // 3. Step: Followup (Setelah jawaban diberikan) -> PINDAH KE ATAS AGAR TIDAK TERTABRAK
        if (state.step === "followup") {
          if (bodyLower.includes("selesai")) {
            await kirimDenganTyping(
              client,
              chatId,
              "Terima kasih telah menggunakan layanan BOT SisKA. Sampai jumpa!"
            );
            delete helpdeskQueue[chatId];
            return;
          }
          if (bodyLower === "1") {
            await kirimDenganTyping(
              client,
              chatId,
              "Silakan tuliskan pertanyaan lanjutan Anda."
            );
            state.step = "pertanyaan";
            return;
          }
          if (bodyLower === "2") {
            await kirimDenganTyping(
              client,
              chatId,
              "Silakan tuliskan waktu/jadwal yang Anda inginkan untuk konsultasi."
            );
            state.step = "jadwal";
            return;
          }
          await kirimDenganTyping(
            client,
            chatId,
            "Pilihan tidak valid. Ketik *selesai* atau pilih: 1. Pertanyaan lanjutan 2. Jadwalkan konsultasi"
          );
          return;
        }

        // 4. Step: Jadwal
        if (state.step === "jadwal") {
          await kirimDenganTyping(
            client,
            chatId,
            "Terima kasih, permintaan jadwal Anda sudah kami terima."
          );
          const notif = `📅 Permintaan jadwal konsultasi dari ${chatId} (${
            state.identitas || "User"
          }):\n*${message.body}*`;
          await kirimDenganTyping(client, HELPDESK_GROUP_ID, notif);
          delete helpdeskQueue[chatId];
          return;
        }

        // 5. Step: Menunggu Jawaban Manual
        if (state.step === "menunggu-jawaban") {
          await kirimDenganTyping(
            client,
            chatId,
            "Mohon tunggu sebentar, tim Helpdesk masih memproses pertanyaan Anda. Untuk kembali ke menu utama ketik *menu*."
          );
          return;
        }

        // 6. Step: Pertanyaan (Core Logic)
        if (state.step === "pertanyaan") {
          const pertanyaanUser = message.body;
          const identitasUser =
            state.identitas ||
            `${message._data.notifyName || "User"} (${chatId})`;

          await kirimDenganTyping(
            client,
            chatId,
            "⏳ Sedang memproses pertanyaan Anda..."
          );

          // A. CEK FAQ DULU (PALING CEPAT)
          const jawabanFAQ = cariJawabanFAQ(pertanyaanUser);
          if (jawabanFAQ) {
            await kirimDenganTyping(
              client,
              chatId,
              `📘 *Informasi Helpdesk*\n\n${jawabanFAQ}\n\nJika masih membutuhkan bantuan, balas dengan:\n1️⃣ Pertanyaan lanjutan\n2️⃣ Jadwalkan konsultasi\natau ketik *selesai*.`
            );
            state.step = "followup";
            return;
          }

          // B. TANYA AI
          const jawabanAI = await jawabHelpdeskAI(pertanyaanUser);
          console.log("[DEBUG AI RAW]", jawabanAI);

          // C. AI TIDAK TAHU -> ESKALASI MANUAL
          if (jawabanAI.includes("UNKNOWN_ESKALASI")) {

            let namaDisplay = identitasUser;
            let nipDisplay = "-";

            if (pegawai) {
              namaDisplay = pegawai["Nama Pegawai"];
              nipDisplay = pegawai["nip"] || pegawai["NIP"] || "-";
            }

            const pesanEskalasi =
`📢 [HELPDESK - PERTANYAAN BELUM TERJAWAB]

Identitas : ${namaDisplay}
NIP       : ${nipDisplay}
Pertanyaan: ${pertanyaanUser}

_AI tidak dapat menjawab pertanyaan ini._

*Balas Pesan ini (QUOTE REPLY) Untuk Menjawab*`;

            const sentMsg = await client.sendMessage(
              HELPDESK_GROUP_ID,
              pesanEskalasi
            );
            logOut(HELPDESK_GROUP_ID, pesanEskalasi);

            helpdeskInstruksiMap[sentMsg.id._serialized] = chatId;

            await kirimDenganTyping(
              client,
              chatId,
              "Pertanyaan Anda sedang diteruskan ke staf ahli kami karena spesifik. Mohon tunggu jawaban dari kami. ⏳"
            );

            state.step = "menunggu-jawaban";
            return;
          } else {
            // D. AI TAHU -> JAWAB LANGSUNG

            const jawabanFinal =
`${jawabanAI}

────────────────
_Ada lagi yang bisa dibantu?_
_Ketik *selesai* untuk menutup sesi._`;

            await kirimDenganTyping(client, chatId, jawabanFinal);
            
            state.step = "followup";
            return;
          }
        }
      } else if (!pegawai) {
        // Jika bukan pegawai dan belum masuk antrian helpdesk
        const welcome = `Halo, terima kasih sudah menghubungi Helpdesk Biro Keuangan dan BMN. 🙏\n\nMohon sebutkan identitas Anda:\n*1. Nama Lengkap*\n*2. Jabatan*\n*3. Unit Kerja*`;
        await kirimDenganTyping(client, chatId, welcome);
        helpdeskQueue[chatId] = { step: "identitas" };
        return;
      }
    }

    // DEBUG: state before E handler
    console.log(
      `[DEBUG] Before E handler: pegawai=${
        pegawai ? pegawai["Nama Pegawai"] || "HAS_NAME" : "NOT_FOUND"
      } | helpdeskQueue=${
        helpdeskQueue[chatId] ? JSON.stringify(helpdeskQueue[chatId]) : "no"
      } | flow=${flow ? flow.step : "none"} | body='${bodyLower}'`
    );

    // E. Handler Internal (Menu & Alur Pengajuan)
    if (!flow || bodyLower === "menu") {
      if (helpdeskQueue[chatId]) return;

      const menu = `Halo *${pegawai["Nama Pegawai"]}*! 👋\nAda yang bisa kami bantu hari ini?\n\nSilakan pilih menu (ketik *angka* pilihan):\n1. Pengajuan Lembur\n2. Pengajuan Cuti\n3. Chat Helpdesk\n4. Layanan Kendaraan\n5. Formulir Pengambilan Persediaan\n6. Peminjaman Data Arsip`;

      console.log(
        `[DEBUG] Sending MENU to ${chatId} (pegawai=${
          pegawai ? pegawai["Nama Pegawai"] : "NOT_FOUND"
        })`
      );
      await kirimDenganTyping(client, chatId, menu);
      pengajuanBySender[chatId] = { step: "menu", pegawai };
      return;
    }

    if (flow.step === "menu") {
      if (bodyLower === "1") {
        await kirimDenganTyping(
          client,
          chatId,
          "Silakan tuliskan *alasan/tujuan lembur* Anda."
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
          "Silakan tuliskan *alasan pengajuan cuti* Anda."
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
          "Silakan tuliskan pertanyaan Anda untuk Helpdesk Biro Keuangan."
        );
        helpdeskQueue[chatId] = {
          step: "pertanyaan",
          identitas: `${pegawai["Nama Pegawai"]} (Internal, NIP: ${
            pegawai["nip"] || pegawai["NIP"]
          })`,
        };
        delete pengajuanBySender[chatId];
        return;
      }
      if (bodyLower === "4") {
        await kirimDenganTyping(
          client,
          chatId,
          "🚗 *Layanan Kendaraan Dinas*\n\nSilakan pilih:\n1. 🔑 Pinjam Mobil (Isi Form Awal)\n2. ↩️ Kembalikan Mobil (Lapor Selesai)"
        );
        pengajuanBySender[chatId] = { step: "menu-mobil", pegawai };
        return;
      }
      if (bodyLower === "5") {
        const linkGForm =
          "https://docs.google.com/forms/d/e/1FAIpQLSfC8aa3eGzNCjB4B_okAFxmkmbttPTraqgNeKGR0wJ1bPc1HA/viewform";

        await kirimDenganTyping(
          client,
          chatId,
          `📦 *Formulir Pengambilan Persediaan*\n\nSilakan isi daftar permintaan barang melalui link berikut:\n${linkGForm}`
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
          `🗂️ *Peminjaman Data Arsip*\n\nSilakan isi formulir peminjaman arsip melalui link berikut:\n${linkArsip}`
        );

        delete pengajuanBySender[chatId];
        return;
      }

      await kirimDenganTyping(
        client,
        chatId,
        "Pilihan tidak valid. Ketik 1, 2, 3, 4, 5, 6. Atau ketik *menu* untuk kembali."
      );
      return;
    }

    if (flow.step === "alasan-cuti") {
      const alasan = message.body.trim();
      const atasan = cariAtasanPegawai(flow.pegawai);
      if (!atasan || !atasan["No. HP (WA) aktif"]) {
        await kirimDenganTyping(
          client,
          chatId,
          "Maaf, data atasan Anda tidak ditemukan atau nomor WA tidak valid. Hubungi admin."
        );
        delete pengajuanBySender[chatId];
        return;
      }
      const nomorAtasan = atasan["No. HP (WA) aktif"] + "@c.us";
      const teksAtasan = `📢 *Pengajuan Cuti* dari ${flow.pegawai["Nama Pegawai"]}\nAlasan: ${alasan}\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju ✅\n2. Tidak Setuju ❌`;
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
        `Pengajuan Cuti Anda sudah diteruskan ke atasan (${atasan["Nama Pegawai"]}) untuk persetujuan.`
      );
      return;
    }

    if (flow.step === "alasan-lembur") {
      if (message.body.trim().length < 5) {
        await kirimDenganTyping(
          client,
          chatId,
          "Mohon berikan alasan lembur yang lebih detail."
        );
        return;
      }
      pengajuanBySender[chatId].alasan = message.body.trim();
      pengajuanBySender[chatId].step = "tanya-jam-masuk";
      await kirimDenganTyping(
        client,
        chatId,
        "Baik, sekarang masukkan *jam mulai lembur* Anda (format 24 jam, contoh: 17:00)."
      );
      return;
    }

    if (flow.step === "tanya-jam-masuk") {
      const jamMasuk = message.body.trim();
      if (!/\d{1,2}:\d{2}/.test(jamMasuk)) {
        await kirimDenganTyping(
          client,
          chatId,
          "Format jam tidak valid. Mohon gunakan format HH:MM (contoh: 17:00)."
        );
        return;
      }
      pengajuanBySender[chatId].jamMasuk = jamMasuk;
      pengajuanBySender[chatId].step = "tanya-jam-keluar";
      await kirimDenganTyping(
        client,
        chatId,
        "Oke, terakhir masukkan *jam selesai lembur* Anda (format 24 jam, contoh: 20:00)."
      );
      return;
    }

    if (flow.step === "tanya-jam-keluar") {
      const jamKeluar = message.body.trim();
      if (!/\d{1,2}:\d{2}/.test(jamKeluar)) {
        await kirimDenganTyping(
          client,
          chatId,
          "Format jam tidak valid. Mohon gunakan format HH:MM (contoh: 20:00)."
        );
        return;
      }

      pengajuanBySender[chatId].jamKeluar = jamKeluar;

      let atasan = cariAtasanPegawai(flow.pegawai);

      if (!atasan || !atasan["No. HP (WA) aktif"]) {
        atasan = {
          "Nama Pegawai": "Dian Kresnadjati",
          "No. HP (WA) aktif": "628158791647",
          nip: "197202111998032002",
        };
      }

      const { alasan, jamMasuk } = flow;

      pengajuanBySender[chatId] = {
        ...flow,
        step: "menunggu-persetujuan",
        atasan,
        jamKeluar,
      };

      const nomorAtasan = atasan["No. HP (WA) aktif"] + "@c.us";
      const teksPengajuan = `📢 *Pengajuan Lembur* dari ${
        flow.pegawai["Nama Pegawai"]
      }\nAlasan: ${alasan}\nJam: ${jamMasuk} - ${jamKeluar} (${calculateDuration(
        jamMasuk,
        jamKeluar
      )})\n\n*Balas pesan ini (QUOTE REPLY) dengan angka:*\n1. Setuju ✅\n2. Tidak Setuju ❌`;

      const sentToAtasan = await client.sendMessage(nomorAtasan, teksPengajuan);

      pengajuanByAtasanMsgId[sentToAtasan.id._serialized] = {
        sender: chatId,
        jenis: flow.jenis,
        pegawai: flow.pegawai,
        atasan,
        alasan,
        jamMasuk,
        jamKeluar,
        isForwarded: false,
      };

      await kirimDenganTyping(
        client,
        chatId,
        `Pengajuan Lembur Anda sudah diteruskan ke atasan (${atasan["Nama Pegawai"]}) untuk persetujuan.`
      );

      // --- LOGIKA TIMEOUT 30 MENIT (KHUSUS JIKA ATASAN = BU DIAN) ---
      if (nomorAtasan === ID_BU_DIAN) {
        console.log(
          `[TIMER] Menyalakan timer ${TIMEOUT_MENIT} menit untuk approval Bu Dian...`
        );

        const timerId = setTimeout(async () => {
          const currentStatus = pengajuanBySender[chatId];

          if (currentStatus && currentStatus.step === "menunggu-persetujuan") {
            console.log(
              `[TIMER] TImeout! Mengalihkan approval ${flow.pegawai["Nama Pegawai"]} ke Pak Alpha.`
            );

            // 1. Kirim Pesan ke Pak Alpha
            const teksForward = `⚠️ *FORWARD APPROVAL (TIMEOUT)*\n\nBu Dian belum merespon dalam ${TIMEOUT_MENIT} menit.\nMohon persetujuan Pak Alpha untuk:\n\n${teksPengajuan}`;
            const sentToAlpha = await client.sendMessage(
              ID_PAK_ALPHA,
              teksForward
            );

            // 2. Register Msg ID Pak Alpha agar beliau bisa Reply "1"
            pengajuanByAtasanMsgId[sentToAlpha.id._serialized] = {
              sender: chatId,
              jenis: flow.jenis,
              pegawai: flow.pegawai,
              atasan: { "Nama Pegawai": "ALPHA SANDRO (Backup)" },
              alasan,
              jamMasuk,
              jamKeluar,
              isForwarded: true,
            };
          }
        }, TIMEOUT_MENIT * 60 * 1000);

        pengajuanBySender[chatId].timerId = timerId;
      }

      return;
    }

    // F. FITUR PEMINJAMAN MOBIL

    if (flow.step === "menu-mobil") {
      if (bodyLower === "1") {
        const mobilList = await getStatusMobil();

        const alreadyBorrowed = mobilList.find(
          (m) => m.peminjam_saat_ini === pegawai["nip"]
        );

        if (alreadyBorrowed) {
          await kirimDenganTyping(
            client,
            chatId,
            `❌ Anda saat ini sudah meminjam mobil *${alreadyBorrowed.nama}* (${alreadyBorrowed.plat}).\n\nHarap kembalikan mobil tersebut terlebih dahulu (Pilih ↩️ Kembalikan Mobil) sebelum meminjam yang lain.`
          );
          delete pengajuanBySender[chatId];
          return;
        }

        const tersedia = mobilList.filter((m) => m.status === "TERSEDIA");
        const dipakai = mobilList.filter((m) => m.status === "DIPAKAI");

        let text = "📋 *DAFTAR ARMADA KANTOR*\n";

        text += "\n✅ *MOBIL TERSEDIA*\n_Ketik angka ID untuk meminjam:_\n";
        if (tersedia.length > 0) {
          tersedia.forEach((m) => {
            text += `\n*${m.id}. ${m.nama}* (${m.plat})`;
            text += `\n   └ KM: ${m.km_terakhir} | BBM: ${m.bbm_bar} Bar`;
          });
        } else {
          text += "\n_(Tidak ada mobil tersedia saat ini)_";
        }

        text += "\n\n❌ *SEDANG DIPAKAI*\n_(Tidak bisa dipilih)_\n";
        if (dipakai.length > 0) {
          dipakai.forEach((m) => {
            let namaPeminjam = m.peminjam_saat_ini;

            const peg = dbPegawai.find((p) => {
              const nipDb = String(p.nip || p.NIP || "").trim();
              const nipPinjam = String(m.peminjam_saat_ini || "").trim();
              return nipDb === nipPinjam;
            });

            if (peg && peg["Nama Pegawai"]) {
              namaPeminjam = peg["Nama Pegawai"];
            }

            text += `\n~${m.nama} (${m.plat})~`;
            text += `\n   └ 👤 *Dipakai:* ${namaPeminjam}`;
            if (m.tujuan_aktif) {
              text += `\n   └ 📍 *Tujuan:* ${m.tujuan_aktif}`;
            }
          });
        } else {
          text += "\n_(Tidak ada mobil yang sedang keluar)_";
        }

        if (tersedia.length === 0) {
          text +=
            "\n\n⚠️ *Semua mobil sedang dipakai.* Silakan hubungi peminjam jika mendesak.";
          await kirimDenganTyping(client, chatId, text);
          delete pengajuanBySender[chatId];
          return;
        }

        await kirimDenganTyping(client, chatId, text);

        pengajuanBySender[chatId] = {
          ...flow,
          step: "pilih-mobil-pinjam",
          listMobil: tersedia,
        };
        return;
      } else if (bodyLower === "2") {
        const mobilList = await getStatusMobil();
        const mobilDipakai = mobilList.find(
          (m) => m.peminjam_saat_ini === pegawai["nip"]
        );

        if (!mobilDipakai) {
          await kirimDenganTyping(
            client,
            chatId,
            "❌ Sistem mencatat Anda tidak sedang meminjam mobil apapun."
          );
          delete pengajuanBySender[chatId];
          return;
        }

        const waktuPinjamRaw = mobilDipakai.waktu_pinjam
          ? new Date(mobilDipakai.waktu_pinjam)
          : new Date();
        const strJamPinjam = waktuPinjamRaw.toLocaleString("id-ID", {
          timezone: "Asia/Jakarta",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

        const infoAwal =
          `🚙 *PENGEMBALIAN KENDARAAN*\n\n` +
          `Unit: *${mobilDipakai.nama}* (${mobilDipakai.plat})\n` +
          `------------------------------\n` +
          `📋 *Data Peminjaman Awal:*\n` +
          `🕒 Waktu: ${strJamPinjam}\n` +
          `📍 Tujuan: ${mobilDipakai.tujuan_aktif || "-"}\n` +
          `🔢 KM Awal: ${mobilDipakai.km_terakhir}\n` +
          `⛽ BBM Awal: ${mobilDipakai.bbm_bar} Bar\n` +
          `------------------------------\n\n` +
          `Silakan masukkan *KM Sesudah* pemakaian (Angka saja):`;

        await kirimDenganTyping(client, chatId, infoAwal);

        pengajuanBySender[chatId] = {
          ...flow,
          step: "lapor-km-balik",
          mobilId: mobilDipakai.id,
          kmAwal: mobilDipakai.km_terakhir,
        };
        return;
      }
    }

    // --- STEP 1: PILIH MOBIL PINJAM ---
    if (flow.step === "pilih-mobil-pinjam") {
      const pilihanId = parseInt(bodyLower);
      const mobilDipilih = flow.listMobil.find((m) => m.id === pilihanId);

      if (!mobilDipilih) {
        await kirimDenganTyping(
          client,
          chatId,
          "Pilihan salah. Ketik angka ID mobil yang tersedia."
        );
        return;
      }

      const allMobil = await getStatusMobil();
      const currentCheck = allMobil.find((m) => m.id === pilihanId);
      if (currentCheck.status !== "TERSEDIA") {
        await kirimDenganTyping(
          client,
          chatId,
          "⚠️ Maaf, mobil ini baru saja dipinjam orang lain. Silakan pilih menu ulang."
        );
        delete pengajuanBySender[chatId];
        return;
      }

      pengajuanBySender[chatId] = {
        ...flow,
        step: "isi-tujuan",
        mobilId: pilihanId,
        namaMobil: mobilDipilih.nama,
      };
      await kirimDenganTyping(
        client,
        chatId,
        "Baik. Silakan tuliskan *Tujuan & Keperluan* pemakaian mobil."
      );
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

        const jamPinjamIndo = new Date().toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
        });

        const m = allMobil[index];

        const infoLengkap =
          `✅ *PEMINJAMAN BERHASIL*\n` +
          `------------------------------\n` +
          `🚘 *Unit:* ${m.nama}\n` +
          `🔢 *Plat:* ${m.plat}\n` +
          `🏁 *KM Awal:* ${m.km_terakhir}\n` +
          `⛽ *BBM:* ${m.bbm_bar} Bar\n` +
          `🕒 *Jam:* ${jamPinjamIndo}\n` +
          `📍 *Tujuan:* ${tujuan}\n` +
          `------------------------------\n\n` +
          `_Selamat bertugas! Hati-hati di jalan._\n` +
          `_Jangan lupa pilih menu "Kembalikan Mobil" setelah selesai._`;

        await kirimDenganTyping(
          client,
          chatId,
          `✅ *Peminjaman Berhasil!*\n\nUnit: ${flow.namaMobil}\nTujuan: ${tujuan}\n\nSelamat jalan, hati-hati! Jangan lupa ketik/pilih *MENU* 'Kembalikan Mobil' setelah selesai.`
        );
      }

      delete pengajuanBySender[chatId];
      return;
    }

    // --- STEP 2: LAPOR KEMBALI ---
    if (flow.step === "lapor-km-balik") {
      const kmAkhir = parseInt(hanyaAngka(message.body));

      if (isNaN(kmAkhir) || kmAkhir <= flow.kmAwal) {
        await kirimDenganTyping(
          client,
          chatId,
          `⚠️ KM tidak valid. KM Akhir (${kmAkhir}) harus lebih besar dari KM Awal (${flow.kmAwal}). Masukkan angka yang benar.`
        );
        return;
      }

      pengajuanBySender[chatId].kmAkhir = kmAkhir;
      pengajuanBySender[chatId].step = "lapor-bbm";
      await kirimDenganTyping(
        client,
        chatId,
        "Oke. Sekarang masukkan sisa *BBM Bar* (Angka 1-8):"
      );
      return;
    }

    if (flow.step === "lapor-bbm") {
      const bbm = parseInt(hanyaAngka(message.body));
      if (isNaN(bbm)) {
        await kirimDenganTyping(client, chatId, "Mohon masukkan angka.");
        return;
      }

      pengajuanBySender[chatId].bbmAkhir = bbm;
      pengajuanBySender[chatId].step = "lapor-kondisi";
      await kirimDenganTyping(
        client,
        chatId,
        "Bagaimana *Kondisi Mobil*? (misal: Aman, Lecet dikit, Ban kempes)"
      );
      return;
    }

    if (flow.step === "lapor-kondisi") {
      pengajuanBySender[chatId].kondisi = message.body.trim();
      pengajuanBySender[chatId].step = "lapor-lama";
      await kirimDenganTyping(
        client,
        chatId,
        "Terakhir, berapa *Lama Pemakaian*? (misal: 2 jam, 1 hari)"
      );
      return;
    }

    if (flow.step === "lapor-lama") {
      const lamaPakaiManual = message.body.trim();
      const { mobilId, kmAkhir, bbmAkhir, kondisi } = pengajuanBySender[chatId];

      const allMobil = await getStatusMobil();
      const index = allMobil.findIndex((m) => m.id === mobilId);

      if (index !== -1) {
        const mobil = allMobil[index];
        const kmAwal = mobil.km_terakhir;

        const waktuPinjamRaw = mobil.waktu_pinjam
          ? new Date(mobil.waktu_pinjam)
          : new Date();
        const waktuAkhirRaw = new Date();

        const strJamPinjam = waktuPinjamRaw.toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
        });
        const strJamAkhir = waktuAkhirRaw.toLocaleString("id-ID", {
          timeZone: "Asia/Jakarta",
        });

        // 1. Update Status Mobil
        mobil.status = "TERSEDIA";
        mobil.km_terakhir = kmAkhir;
        mobil.bbm_bar = bbmAkhir;
        mobil.peminjam_saat_ini = null;
        mobil.waktu_pinjam = null;

        await updateStatusMobilAsync(allMobil);

        // 2. Simpan Log
        const logData = {
          tanggal: strJamAkhir,
          nama_pegawai: pegawai["Nama Pegawai"],
          nip: pegawai["nip"],
          mobil: mobil.nama,
          km_awal: kmAwal,
          km_akhir: kmAkhir,
          jarak: kmAkhir - kmAwal,
          bbm_akhir: bbmAkhir,
          kondisi: kondisi,
          lama_pakai: lamaPakaiManual,
          jam_pinjam: strJamPinjam,
          jam_akhir: strJamAkhir,
        };

        await simpanRiwayatMobilAsync(logData);

        await kirimDenganTyping(
          client,
          chatId,
          "⏳ Menyimpan data ke Spreadsheet..."
        );

        try {
          await inputLogMobilKeSheet(logData);

          await kirimDenganTyping(client, chatId, "✅ Data tercatat lengkap.");
          await kirimDenganTyping(
            client,
            chatId,
            `✅ *Pengembalian Selesai!*\n\nDetail:\n- Unit: ${
              mobil.nama
            }\n- Durasi: ${strJamPinjam} s.d ${
              strJamAkhir.split(" ")[1]
            }\n- KM Baru: ${kmAkhir}\n\nTerima kasih!`
          );
        } catch (err) {
          console.error("[SHEET ERROR]", err);

          await kirimDenganTyping(
            client,
            chatId,
            "⚠️ Data tersimpan di log lokal, TAPI gagal masuk Excel. Mohon lapor admin.\nError: " +
              err.message
          );
        }
      }

      delete pengajuanBySender[chatId];
      return;
    }

    if (flow.step === "menunggu-persetujuan") {
      await kirimDenganTyping(
        client,
        chatId,
        `Pengajuan ${flow.jenis} Anda sedang diproses oleh atasan. Mohon tunggu. Ketik *menu* untuk batal.`
      );
      if (bodyLower === "menu") {
        delete pengajuanBySender[chatId];
        await kirimDenganTyping(
          client,
          chatId,
          `Pengajuan ${flow.jenis} dibatalkan. Kembali ke menu utama.`
        );
        return;
      }
      return;
    }

    await kirimDenganTyping(
      client,
      chatId,
      "Perintah tidak dikenali dalam alur saat ini. Ketik *menu* untuk kembali ke menu utama."
    );

    // [FIX] CATCH DIPINDAH KE SINI AGAR PEGAWAI TERBACA DI SCOPE TRY
  } catch (err) {
    console.error(
      "[ERROR] Terjadi kesalahan saat memproses pesan:",
      err.stack || err.message
    );
    try {
      await kirimDenganTyping(
        client,
        chatId,
        "Maaf, terjadi kesalahan pada sistem. Silakan coba lagi atau ketik *menu*."
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

// X. FITUR REKAP & DATABASE

const RIWAYAT_PATH = path.join(__dirname, "riwayat_lembur.json");

// 1. Fungsi Simpan Riwayat Harian
function simpanRiwayatLembur(data) {
  try {
    let riwayat = [];
    if (fs.existsSync(RIWAYAT_PATH)) {
      const raw = fs.readFileSync(RIWAYAT_PATH, "utf8");
      riwayat = JSON.parse(raw);
    }
    riwayat.push(data);
    fs.writeFileSync(RIWAYAT_PATH, JSON.stringify(riwayat, null, 2));
    console.log(`[DB] Riwayat lembur ${data.nama} disimpan.`);
  } catch (err) {
    console.log("[DB ERROR] Gagal simpan riwayat:", err.message);
  }
}

// 2. Fungsi Grouping Data
function groupDataByNIP(dataMentah) {
  const rekap = {};

  dataMentah.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

  dataMentah.forEach((row) => {
    if (!rekap[row.nip]) {
      rekap[row.nip] = {
        nama: row.nama,
        nip: row.nip,
        gol: row.gol || "-",
        jabatan: row.jabatan,
        tanggal: new Set(),
        kegiatan: [],
      };
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

// 3. Generator PDF Rekap Bulanan
async function buatPDFRekapBulanan(dataRekap, bulanTahun, chatId, client) {
  ensureDir(REPORTS_DIR);
  const timestamp = Date.now();
  const outputFilename = path.join(
    REPORTS_DIR,
    `REKAP_SPK_${bulanTahun.replace(/\s/g, "_")}_${timestamp}.pdf`
  );

  // --- 1. SETUP PDF: LANDSCAPE ---
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 30, bottom: 30, left: 30, right: 30 },
  });

  const stream = fs.createWriteStream(outputFilename);
  doc.pipe(stream);

  const fontDir = path.join(__dirname, "fonts");
  try {
    doc.registerFont("TMR", path.join(fontDir, "times.ttf"));
    doc.registerFont("TMR-Bold", path.join(fontDir, "times-bold.ttf"));
    doc.font("TMR");
  } catch (e) {
    doc.font("Helvetica");
  }

  // ================= 2. HEADER SURAT =================
  const startY = 30;
  const leftMargin = 30;

  doc.fontSize(10);

  doc.text("Lampiran", leftMargin, startY);
  doc.text(":", 90, startY);
  doc.text("Surat Perintah Kerja Lembur Pejabat Pembuat Komitmen", 100, startY);
  doc.text(
    "Biro Keuangan dan BMN, Biro Keuangan dan BMN Sekretariat Jenderal",
    100,
    startY + 12
  );
  doc.text(`Kemnaker Bulan ${bulanTahun}`, 100, startY + 24);

  doc.text("Nomor", leftMargin, startY + 40);
  doc.text(": _________________________", 90, startY + 40);

  doc.text("Tanggal", leftMargin, startY + 54);
  const tglStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`: ${tglStr}`, 90, startY + 54);

  doc.moveDown(3);

  doc.font("TMR-Bold").fontSize(11);
  doc.text("PEJABAT/PEGAWAI YANG MELAKSANAKAN PERINTAH KERJA LEMBUR", {
    align: "center",
  });

  doc.moveDown(1.5);

  // ================= 3. KONFIGURASI TABEL =================
  const startX = 30;
  const colWidths = [30, 180, 40, 140, 110, 240];
  const headers = [
    "NO",
    "NAMA / NIP",
    "GOL",
    "JABATAN",
    `TANGGAL`,
    "KETERANGAN",
  ];

  function drawHeader(y) {
    let x = startX;
    doc.font("TMR-Bold").fontSize(9);
    headers.forEach((h, i) => {
      doc.rect(x, y, colWidths[i], 25).stroke();
      doc.text(h, x, y + 8, { width: colWidths[i], align: "center" });
      x += colWidths[i];
    });
    return y + 25;
  }

  let currentY = drawHeader(doc.y);

  // ================= 4. ISI TABEL =================
  doc.font("TMR").fontSize(9);

  for (let i = 0; i < dataRekap.length; i++) {
    const p = dataRekap[i];

    const strTanggal = p.tanggal.join(", ");
    const strKegiatan = p.kegiatan
      .map((k, idx) => `${idx + 1}. ${k}`)
      .join("\n");

    // --- A. Hitung Tinggi Baris Otomatis ---
    const hNama = doc.heightOfString(p.nama, { width: colWidths[1] - 6 });
    const hNip = doc.heightOfString(`NIP. ${p.nip}`, {
      width: colWidths[1] - 6,
    });
    const hJabatan = doc.heightOfString(p.jabatan, { width: colWidths[3] - 6 });
    const hKegiatan = doc.heightOfString(strKegiatan, {
      width: colWidths[5] - 6,
    });
    const hTanggal = doc.heightOfString(strTanggal, {
      width: colWidths[4] - 6,
    });

    const hColNama = hNama + hNip + 15;

    let rowHeight = Math.max(hColNama, hJabatan, hKegiatan, hTanggal) + 10;
    if (rowHeight < 40) rowHeight = 40;

    // --- B. Cek Halaman Baru ---
    if (currentY + rowHeight > doc.page.height - 50) {
      doc.addPage({
        size: "A4",
        layout: "landscape",
        margins: { top: 30, bottom: 30, left: 30, right: 30 },
      });
      currentY = 30;
      currentY = drawHeader(currentY);
    }

    let currentX = startX;

    // --- C. Render Kolom ---

    // 1. NO
    doc.rect(currentX, currentY, colWidths[0], rowHeight).stroke();
    doc.text((i + 1).toString(), currentX, currentY + 5, {
      width: colWidths[0],
      align: "center",
    });
    currentX += colWidths[0];

    // 2. NAMA / NIP
    doc.rect(currentX, currentY, colWidths[1], rowHeight).stroke();

    doc
      .font("TMR-Bold")
      .text(p.nama.toUpperCase(), currentX + 3, currentY + 5, {
        width: colWidths[1] - 6,
        align: "left",
      });

    const lineY = currentY + hNama + 8;
    doc
      .moveTo(currentX, lineY)
      .lineTo(currentX + colWidths[1], lineY)
      .stroke();

    doc.font("TMR").text(p.nip, currentX + 3, lineY + 3, {
      width: colWidths[1] - 6,
      align: "left",
    });
    currentX += colWidths[1];

    // 3. GOL
    doc.rect(currentX, currentY, colWidths[2], rowHeight).stroke();
    doc.text(p.gol, currentX, currentY + 5, {
      width: colWidths[2],
      align: "center",
    });
    currentX += colWidths[2];

    // 4. JABATAN
    doc.rect(currentX, currentY, colWidths[3], rowHeight).stroke();
    const yJab = currentY + (rowHeight - hJabatan) / 2;
    doc.text(p.jabatan, currentX + 3, yJab > currentY ? yJab : currentY + 5, {
      width: colWidths[3] - 6,
      align: "center",
    });
    currentX += colWidths[3];

    // 5. TANGGAL
    doc.rect(currentX, currentY, colWidths[4], rowHeight).stroke();
    doc.text(strTanggal, currentX + 3, currentY + 5, {
      width: colWidths[4] - 6,
      align: "center",
    });
    currentX += colWidths[4];

    // 6. KETERANGAN
    doc.rect(currentX, currentY, colWidths[5], rowHeight).stroke();
    doc.text(strKegiatan, currentX + 3, currentY + 5, {
      width: colWidths[5] - 6,
      align: "left",
    });
    currentX += colWidths[5];

    currentY += rowHeight;
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", async () => {
      try {
        const media = MessageMedia.fromFilePath(outputFilename);
        await client.sendMessage(chatId, media, {
          caption: `✅ Berikut Rekap SPK Lembur (Format Dinas) bulan ${bulanTahun}`,
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    stream.on("error", reject);
  });
}

client.initialize();
