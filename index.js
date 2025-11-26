// index.js (Main Bot File)

console.log("[INIT] Memulai bot SisKA...");

// =========================================================================
// I. IMPORTS & KONFIGURASI
// =========================================================================

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const PDFDocument = require("pdfkit");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");
const axios = require("axios");
const {
  HELPDESK_GROUP_ID,
  FORM_LEMBUR_URL,
  FORM_CUTI_URL,
} = require("./config"); // Pastikan file config.js tersedia

// =========================================================================
// II. STATE MANAGEMENT
// =========================================================================

let dbPegawai = [];
// { senderId: { step, jenis, alasan, pegawai, atasan, jamMasuk, jamKeluar, fotoList } }
const pengajuanBySender = {};
// { quotedMsgId: { sender, jenis, pegawai, atasan, alasan, jamMasuk, jamKeluar } }
const pengajuanByAtasanMsgId = {};
// { senderId: { step, namaUnit? } }
const helpdeskQueue = {};
// { quotedMsgId: targetUserId }
const helpdeskInstruksiMap = {};

// =========================================================================
// III. UTILITAS & LOGGING (Dianggap sebagai 'utils.js')
// =========================================================================

const LOGS_DIR = path.join(__dirname, "logs");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const REPORTS_DIR = path.join(__dirname, "reports");

function ts() {
  return new Date().toISOString();
}

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function logToFile(numberOrName, type, text) {
  ensureDir(LOGS_DIR);
  const logFile = path.join(LOGS_DIR, `${numberOrName}.log`);
  const line = `[${ts()}] [${type}] ${text}\n`;
  fs.appendFileSync(logFile, line);
}

function logIn(chatId, body) {
  console.log(`[MASUK] ${ts()} | Dari: ${chatId} | Pesan: ${body}`);
  logToFile(chatId, "MASUK", body);
}

function logOut(chatId, body) {
  console.log(`[KELUAR] ${ts()} | Ke: ${chatId} | Pesan: ${body}`);
  logToFile(chatId, "KELUAR", body);
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

    // Handle overnight case, assume if end is before start, it's the next day
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

// =========================================================================
// IV. DATABASE & API HELPER (Dianggap sebagai 'db.js' dan 'api.js')
// =========================================================================

function loadDatabase() {
  try {
    const dbPath = path.join(__dirname, "database Pegawai Biro keuangan.json");
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

function cariPegawaiByWa(waNumberDigits) {
  if (!Array.isArray(dbPegawai)) return null;
  // DB menyimpan nomor seperti 6285xxxx tanpa @c.us
  return (
    dbPegawai.find((p) => (p["No. HP (WA) aktif"] || "") === waNumberDigits) ||
    null
  );
}

function cariAtasanPegawai(pegawai) {
  if (!pegawai) return null;
  return (
    dbPegawai.find((p) => p["No. HP (WA) aktif"] === pegawai["NO HP ATASAN"]) ||
    null
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
    // console.error("[WARN] Gagal ambil dummy signature:", e.message); // Jangan terlalu banyak log warning
    return null;
  }
}

// =========================================================================
// V. WHATSAPP CLIENT HELPER
// =========================================================================

async function kirimDenganTyping(client, chatId, text) {
  try {
    const chat = await client.getChatById(chatId);
    await chat.sendStateTyping(); // Indikator "Typing..."
    const delay = Math.floor(Math.random() * 2000) + 1000; // Delay 1–3s
    await new Promise((r) => setTimeout(r, delay));
    await chat.clearState(); // Hapus indikator "Typing..."
    const msg = await client.sendMessage(chatId, text);
    logOut(chatId, text);
    return msg; // Mengembalikan objek pesan yang terkirim
  } catch (e) {
    console.error(`[ERROR] Gagal kirim pesan ke ${chatId}:`, e.message);
    throw e; // Lemparkan error agar ditangkap di atas
  }
}

// =========================================================================
// VI. PDF GENERATOR (Dianggap sebagai 'pdfGenerator.js')
// =========================================================================

async function buatLaporanLemburDenganFoto(data, fotoPaths, chatId, client) {
  ensureDir(REPORTS_DIR);
  ensureDir(UPLOADS_DIR); // Pastikan dir uploads sudah ada sebelum cleanup

  const tanggalLaporan = new Date().toISOString().split("T")[0];
  const filePath = path.join(
    REPORTS_DIR,
    `Laporan_Lembur_${data.nama.replace(/\s/g, "_")}_${tanggalLaporan}.pdf`
  );

  const doc = new PDFDocument({
    margins: { top: 57, bottom: 57, left: 57, right: 57 },
  });

  // Pastikan font tersedia
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

  try {
    // ========== HEADER ==========
    doc
      .font("TMR-Bold")
      .fontSize(14)
      .text("KEMENTERIAN KETENAGAKERJAAN RI", { align: "center" });
    doc.text("SEKRETARIAT JENDERAL - BIRO KEUANGAN DAN BMN", {
      align: "center",
    });
    doc.moveDown(2);

    // ========== JUDUL ==========
    doc
      .font("TMR-Bold")
      .fontSize(13)
      .text("LAPORAN LEMBUR", { align: "center" });
    doc.moveDown(2);

    // ========== IDENTITAS ==========
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
    doc.x = doc.page.margins.left; // Reset posisi X

    // ========== DOKUMENTASI ==========
    doc
      .font("TMR-Bold")
      .fontSize(12)
      .text("Dokumentasi Hasil Lembur", { align: "center" });
    doc.font("TMR").moveDown();

    const addImageBlock = (title, imgPath) => {
      doc.fontSize(11).text(`${title}:`);
      doc.moveDown(0.5);

      if (imgPath && fs.existsSync(imgPath)) {
        try {
          const buffer = fs.readFileSync(imgPath);
          const dimensions = imageSize(buffer);

          if (!dimensions || !dimensions.width || !dimensions.height) {
            doc.text("(Tidak bisa membaca dimensi gambar)", {
              align: "center",
            });
          } else {
            const imgWidth = dimensions.width;
            const imgHeight = dimensions.height;
            const maxWidth = 250;
            const maxHeight = 160;

            const aspectRatio = imgWidth / imgHeight;
            let finalWidth = maxWidth;
            let finalHeight = Math.round(maxWidth / aspectRatio);

            if (finalHeight > maxHeight) {
              finalHeight = maxHeight;
              finalWidth = Math.round(maxHeight * aspectRatio);
            }

            // Pindah halaman jika tidak cukup ruang
            const remainingSpace =
              doc.page.height - doc.y - doc.page.margins.bottom;
            if (finalHeight + 20 > remainingSpace) {
              doc.addPage();
            }

            doc.image(imgPath, {
              width: finalWidth,
              height: finalHeight,
              align: "center",
            });
          }
        } catch (err) {
          console.error(`[ERROR] Gagal render gambar ${imgPath}:`, err.message);
          doc.text("(Gagal membaca atau render gambar)", { align: "center" });
        }
      } else {
        doc.text("(Tidak ada gambar)", { align: "center" });
      }

      doc.moveDown(2);
    };

    addImageBlock("1. Foto Hasil Lembur", fotoPaths[0]);

    doc.addPage();
    doc.moveDown(1);

    addImageBlock("2. Foto Pegawai di Tempat Lembur", fotoPaths[1]);
    addImageBlock("3. Screenshot Approval", fotoPaths[2]);

    // Pindah halaman jika tidak cukup ruang untuk tanda tangan
    const signatureHeight = 120; // Estimasi tinggi block tanda tangan
    const remainingSpaceForSignature =
      doc.page.height - doc.y - doc.page.margins.bottom;
    if (signatureHeight > remainingSpaceForSignature) {
      doc.addPage();
    }

    // ========== TANDA TANGAN ==========
    doc.moveDown(5);

    const startY = doc.y;

    doc
      .fontSize(11)
      .text(
        "Mengetahui,\nKepala Sub Bagian TU Biro Keuangan dan BMN",
        50,
        startY
      );

    doc.text(`Dilaksanakan Oleh,\n${data.jabatan || ""}`, 330, startY);

    // Ambil tanda tangan secara paralel
    const [ttdKepalaBuffer, ttdPegawaiBuffer] = await Promise.all([
      getDummySignature("198703232015031002"), // NIP kepala statis
      getDummySignature(data.nip), // NIP pegawai
    ]);

    const ttdY = startY + 40;
    const ttdWidth = 120;
    const ttdPegX = 330;
    const ttdKepX = 50;

    // Render TTD Kepala
    if (ttdKepalaBuffer) {
      try {
        doc.image(ttdKepalaBuffer, ttdKepX, ttdY, { width: ttdWidth });
      } catch (e) {
        doc.fontSize(10).text("(TTD Kepala tidak tersedia)", ttdKepX, ttdY);
      }
    } else {
      doc.fontSize(10).text("(TTD Kepala tidak tersedia)", ttdKepX, ttdY);
    }

    // Render TTD Pegawai
    if (ttdPegawaiBuffer) {
      try {
        doc.image(ttdPegawaiBuffer, ttdPegX, ttdY, { width: ttdWidth });
      } catch (e) {
        doc.fontSize(10).text("(TTD Pegawai tidak tersedia)", ttdPegX, ttdY);
      }
    } else {
      doc.fontSize(10).text("(TTD Pegawai tidak tersedia)", ttdPegX, ttdY);
    }

    const yNama = ttdY + 70;
    const yNIP = yNama + 14;

    // Nama dan NIP Kepala
    doc.fontSize(11).text("ALPHA SANDRO ADITTHYASWARA, S.Sos", ttdKepX, yNama);
    doc.text("NIP. 198703232015031002", ttdKepX, yNIP);

    // Nama dan NIP Pegawai
    doc.text(`${data.nama}`, ttdPegX, yNama);
    doc.text(`NIP. ${data.nip}`, ttdPegX, yNIP);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          const media = MessageMedia.fromFilePath(filePath);
          await client.sendMessage(chatId, media, {
            caption: "Berikut laporan lembur final Anda 📑✅",
          });

          // Hapus semua file foto setelah berhasil dikirim
          for (const fotoPath of fotoPaths) {
            try {
              fs.unlinkSync(fotoPath);
              // console.log(`[CLEANUP] Berhasil hapus file: ${fotoPath}`);
            } catch (e) {
              console.error(
                `[CLEANUP ERROR] Gagal hapus file ${fotoPath}:`,
                e.message
              );
            }
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  } catch (err) {
    // Pastikan doc.end() dipanggil meskipun ada error
    doc.end();
    console.error("[ERROR] Gagal dalam proses pembuatan PDF:", err.message);
    throw new Error("Gagal membuat atau mengirim PDF.");
  }
}

// =========================================================================
// VII. WHATSAPP CLIENT INIT & EVENT HANDLERS
// =========================================================================

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

// =========================================================================
// VIII. MESSAGE HANDLER (Dianggap sebagai 'messageHandler.js')
// =========================================================================

client.on("message", async (message) => {
  const chatId = message.from;
  logIn(chatId, message.body);

  try {
    const isGroup = chatId.endsWith("@g.us");
    const digits = hanyaAngka(chatId);
    const pegawai = cariPegawaiByWa(digits);
    const flow = pengajuanBySender[chatId];
    const bodyLower = (message.body || "").trim().toLowerCase();

    // ---------------------------------------------------
    // A. Handler Upload Foto Dokumentasi Lembur
    // ---------------------------------------------------
    if (flow?.step === "upload-foto") {
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        ensureDir(UPLOADS_DIR);
        // Gunakan ekstensi berdasarkan MIME type untuk keamanan dan kompatibilitas
        const extension = media.mimetype
          .split("/")
          .pop()
          .replace("jpeg", "jpg");
        const fotoPath = path.join(
          UPLOADS_DIR,
          `foto_${chatId}_${Date.now()}.${extension}`
        );

        // Simpan file
        fs.writeFileSync(fotoPath, media.data, "base64");

        if (!flow.fotoList) flow.fotoList = [];
        flow.fotoList.push(fotoPath);

        if (flow.fotoList.length < 3) {
          await kirimDenganTyping(
            client,
            chatId,
            `Foto ${
              flow.fotoList.length
            } sudah diterima ✅. Silakan upload foto ke-${
              flow.fotoList.length + 1
            } (total 3 foto).`
          );
        } else {
          await kirimDenganTyping(
            client,
            chatId,
            "Semua foto sudah diterima, sedang membuat laporan PDF..."
          );

          const dataLembur = {
            nama: flow.pegawai["Nama Pegawai"],
            nip: flow.pegawai["nip"] || flow.pegawai["NIP"] || "-",
            tanggal: new Date().toISOString().split("T")[0],
            kegiatan: flow.alasan || "",
            jamMasuk: flow.jamMasuk,
            jamKeluar: flow.jamKeluar,
            jabatan: flow.pegawai["Jabatan"] || "",
          };

          await buatLaporanLemburDenganFoto(
            dataLembur,
            flow.fotoList,
            chatId,
            client
          );

          delete pengajuanBySender[chatId];
          console.log("[DEBUG] State upload-foto selesai dan dihapus:", chatId);
        }
      } else if (bodyLower !== "") {
        await kirimDenganTyping(
          client,
          chatId,
          "Mohon kirimkan *foto* untuk dokumentasi, bukan pesan teks."
        );
      }
      return;
    }

    // ---------------------------------------------------
    // B. Handler Grup (Helpdesk Reply & Approval)
    // ---------------------------------------------------
    if (isGroup) {
      // 1. Helpdesk reply oleh tim via quote pada INSTRUKSI
      if (chatId === HELPDESK_GROUP_ID && message.hasQuotedMsg) {
        const quoted = await message.getQuotedMessage();
        const key = quoted.id._serialized;
        const targetUser = helpdeskInstruksiMap[key];

        if (targetUser) {
          const balasan = `Halo, berikut jawaban dari Helpdesk Biro Keuangan:\n\n*${message.body}*`;
          await kirimDenganTyping(client, targetUser, balasan);

          const followup =
            `Apakah jawaban dari Helpdesk sudah membantu?\n\n` +
            `Ketik *selesai* jika sudah.\n` +
            `Atau pilih:\n1. Ajukan pertanyaan lanjutan\n2. Jadwalkan konsultasi di Biro Keuangan dan BMN`;
          await kirimDenganTyping(client, targetUser, followup);

          // Masuk ke state followup
          helpdeskQueue[targetUser] = { step: "followup" };

          await kirimDenganTyping(
            client,
            HELPDESK_GROUP_ID,
            `✅ Jawaban sudah diteruskan ke ${targetUser}`
          );
          delete helpdeskInstruksiMap[key]; // Bersihkan map instruksi
          return;
        }
      }
      return; // Abaikan pesan grup lainnya
    }

    // ---------------------------------------------------
    // C. Handler Approval Atasan (Quote Reply di DM)
    // ---------------------------------------------------
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
        } = pengajuan;

        if (isApprovalYes(message.body)) {
          let pesanPegawai = `✅ Pengajuan *${jenis}* Anda telah *DISETUJUI* oleh atasan.`;

          if (jenis === "Lembur") {
            pesanPegawai += `\n\nMohon upload *3 foto* dokumentasi lembur Anda sebagai bukti:\n1. Foto hasil lembur\n2. Foto Anda di tempat lembur\n3. Screenshot approval dari atasan (pesan ini).`;

            // Set state upload foto
            pengajuanBySender[pemohonId] = {
              step: "upload-foto",
              pegawai: p,
              alasan,
              jamMasuk,
              jamKeluar,
              fotoList: [],
            };
            console.log("[DEBUG] Set upload-foto state untuk", pemohonId);
          } else if (jenis === "Cuti") {
            pesanPegawai += `\n\nSilakan lanjutkan mengisi form pengajuan cuti di link berikut:\n${FORM_CUTI_URL}`;
            delete pengajuanBySender[pemohonId]; // Hapus state pemohon jika ada
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
          delete pengajuanBySender[pemohonId]; // Hapus state pemohon jika ada
        } else {
          await kirimDenganTyping(
            client,
            chatId,
            "Balas dengan *1 (Setuju)* atau *2 (Tidak Setuju)* ya."
          );
          return; // Jangan hapus state approval agar bisa coba lagi
        }

        delete pengajuanByAtasanMsgId[qid];
        return;
      }
    }

    // ---------------------------------------------------
    // D. Handler Eksternal & Helpdesk (Internal/Eksternal)
    // ---------------------------------------------------
    if (!pegawai || helpdeskQueue[chatId]) {
      // Jika ada state helpdesk, proses alur helpdesk
      if (helpdeskQueue[chatId]) {
        const state = helpdeskQueue[chatId];

        if (state.step === "identitas") {
          // Simpan identitas
          state.identitas = message.body.trim();
          await kirimDenganTyping(
            client,
            chatId,
            "Terima kasih. Silakan tuliskan pertanyaan Anda."
          );
          state.step = "pertanyaan";
          return;
        }

        if (state.step === "pertanyaan") {
          const identitasUser =
            state.identitas ||
            `${message._data.notifyName || "User"} (${chatId})`;
          const pertanyaan = `📢 [HELPDESK] Pertanyaan dari User:\nIdentitas: *${identitasUser}*\nPertanyaan: ${message.body}`;

          // Kirim pertanyaan ke grup helpdesk
          await kirimDenganTyping(client, HELPDESK_GROUP_ID, pertanyaan);

          const instruksi = `*Balas pertanyaan di atas dengan QUOTE REPLY pesan ini*.\nBot akan meneruskan jawaban Anda ke ${chatId}.`;
          const instruksiMsg = await client.sendMessage(
            HELPDESK_GROUP_ID,
            instruksi
          );
          logOut(HELPDESK_GROUP_ID, instruksi);

          helpdeskInstruksiMap[instruksiMsg.id._serialized] = chatId;

          await kirimDenganTyping(
            client,
            chatId,
            "Pertanyaan Anda sudah diteruskan ke tim Helpdesk. Mohon tunggu jawaban dari kami."
          );
          state.step = "menunggu-jawaban";
          return;
        }

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
              "Silakan tuliskan pertanyaan lanjutan Anda untuk Helpdesk."
            );
            state.step = "pertanyaan";
            return;
          }
          if (bodyLower === "2") {
            await kirimDenganTyping(
              client,
              chatId,
              "Silakan tuliskan waktu/jadwal yang Anda inginkan untuk konsultasi. Tim kami akan segera menghubungi Anda."
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

        if (state.step === "jadwal") {
          await kirimDenganTyping(
            client,
            chatId,
            "Terima kasih, permintaan jadwal Anda sudah kami terima. Tim kami akan segera menghubungi Anda."
          );
          const notif = `📅 Permintaan jadwal konsultasi dari ${chatId} (${
            state.identitas || "User"
          }):\n*${message.body}*`;
          await kirimDenganTyping(client, HELPDESK_GROUP_ID, notif);
          delete helpdeskQueue[chatId];
          return;
        }

        if (state.step === "menunggu-jawaban") {
          await kirimDenganTyping(
            client,
            chatId,
            "Mohon tunggu sebentar, tim Helpdesk masih memproses pertanyaan Anda. Untuk kembali ke menu utama ketik *menu*."
          );
          return;
        }
      } else if (!pegawai) {
        // Pengguna baru/eksternal yang belum masuk Helpdesk
        const welcome =
          `Halo, terima kasih sudah menghubungi Helpdesk Biro Keuangan dan BMN. 🙏\n\n` +
          `Mohon sebutkan identitas Anda:\n*1. Nama Lengkap*\n*2. Jabatan*\n*3. Unit Kerja*\n(Cukup diketik dalam satu pesan)`;
        await kirimDenganTyping(client, chatId, welcome);
        helpdeskQueue[chatId] = { step: "identitas" };
        return;
      }

      // Jika eksternal dan sudah diproses
      return;
    }

    // ---------------------------------------------------
    // E. Handler Internal (Menu & Alur Pengajuan)
    // ---------------------------------------------------

    // 1. Tampilkan Menu Utama
    if (!flow || bodyLower === "menu") {
      if (helpdeskQueue[chatId]) return; // Jangan tampilkan menu jika user sedang di alur helpdesk

      const menu =
        `Halo *${pegawai["Nama Pegawai"]}*! 👋\nAda yang bisa kami bantu hari ini?\n\n` +
        `Silakan pilih menu (ketik *angka* pilihan):\n` +
        `1. Pengajuan Lembur\n` +
        `2. Pengajuan Cuti\n` +
        `3. Chat Helpdesk`;
      await kirimDenganTyping(client, chatId, menu);
      pengajuanBySender[chatId] = { step: "menu", pegawai };
      return;
    }

    // 2. Pemilihan Menu
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
        // Pindah ke helpdesk mode (tanpa identitas karena sudah internal)
        helpdeskQueue[chatId] = {
          step: "pertanyaan",
          identitas: `${pegawai["Nama Pegawai"]} (Internal, NIP: ${
            pegawai["nip"] || pegawai["NIP"]
          })`,
        };
        delete pengajuanBySender[chatId];
        return;
      }
      await kirimDenganTyping(
        client,
        chatId,
        "Pilihan tidak valid. Ketik 1, 2, atau 3. Atau ketik *menu* untuk kembali."
      );
      return;
    }

    // 3. Alur Pengajuan Cuti
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
      const teksAtasan =
        `📢 *Pengajuan Cuti* dari ${flow.pegawai["Nama Pegawai"]}\n` +
        `Alasan: ${alasan}\n\n` +
        `*Balas pesan ini (QUOTE REPLY) dengan angka:*\n` +
        `1. Setuju ✅\n2. Tidak Setuju ❌`;

      const sentToAtasan = await client.sendMessage(nomorAtasan, teksAtasan);
      logOut(nomorAtasan, teksAtasan);

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

    // 4. Alur Pengajuan Lembur - Alasan
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

    // 5. Alur Pengajuan Lembur - Jam Masuk
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

    // 6. Alur Pengajuan Lembur - Jam Keluar
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

      const { alasan, jamMasuk } = flow;
      pengajuanBySender[chatId] = {
        ...flow,
        step: "menunggu-persetujuan",
        atasan,
        jamKeluar, // Pastikan jamKeluar tersimpan di flow state
      };

      const nomorAtasan = atasan["No. HP (WA) aktif"] + "@c.us";
      const teksAtasan =
        `📢 *Pengajuan Lembur* dari ${flow.pegawai["Nama Pegawai"]}\n` +
        `Alasan: ${alasan}\n` +
        `Jam: ${jamMasuk} - ${jamKeluar} (${calculateDuration(
          jamMasuk,
          jamKeluar
        )})\n\n` +
        `*Balas pesan ini (QUOTE REPLY) dengan angka:*\n` +
        `1. Setuju ✅\n2. Tidak Setuju ❌`;

      const sentToAtasan = await client.sendMessage(nomorAtasan, teksAtasan);
      logOut(nomorAtasan, teksAtasan);

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
        `Pengajuan Lembur Anda sudah diteruskan ke atasan (${atasan["Nama Pegawai"]}) untuk persetujuan.`
      );
      return;
    }

    // 7. Fallback untuk Internal User yang tidak sesuai alur
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
        // Selanjutnya akan masuk ke flow Menu Utama di awal handler
        return;
      }
      return;
    }

    // Fallback umum jika ada flow tapi tidak di langkah yang sesuai
    await kirimDenganTyping(
      client,
      chatId,
      "Perintah tidak dikenali dalam alur saat ini. Ketik *menu* untuk kembali ke menu utama."
    );
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
      delete pengajuanBySender[chatId]; // Coba reset flow
      delete helpdeskQueue[chatId];
    } catch {}
  }
});

// =========================================================================
// IX. GLOBAL ERROR HANDLERS & START
// =========================================================================

process.on("unhandledRejection", (reason, p) => {
  console.error("[UNHANDLED REJECTION]", reason);
  logToFile("error", "UNHANDLED", String(reason));
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
  logToFile("error", "UNCAUGHT", err.stack || String(err));
  // Non-graceful exit untuk uncaught, agar segera restart
  // process.exit(1);
});

client.initialize();
