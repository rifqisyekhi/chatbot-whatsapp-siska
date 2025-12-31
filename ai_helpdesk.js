const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");

// Konfigurasi API Key Groq
const GROQ_API_KEY = "";
const DATA_FILE = "data_helpdesk.txt";

const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- FUNGSI 1: Membaca Database Pengetahuan (TXT) ---
function bacaDataHelpdesk() {
  try {
    const filePath = path.join(__dirname, DATA_FILE);
    
    // Jika file belum ada, buat file kosong
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "", "utf-8");
      return "";
    }
    
    // Baca isi file
    const data = fs.readFileSync(filePath, "utf-8");
    return data;
  } catch (err) {
    console.error("[FILE ERROR] Gagal membaca data:", err);
    return "";
  }
}

// --- FUNGSI 2: Menyimpan Pelajaran Baru ---
// Dipanggil oleh index.js saat Admin menjawab di Grup
function simpanDataBaru(pertanyaan, jawaban) {
  try {
    const filePath = path.join(__dirname, DATA_FILE);
    
    // Format penyimpanan yang mudah dibaca AI
    // Kita tambahkan timestamp agar terlihat rapi
    const tanggal = new Date().toLocaleString("id-ID");
    const entriBaru = `\n\n=== PELAJARAN BARU (${tanggal}) ===\nTANYA: ${pertanyaan}\nJAWAB: ${jawaban}\n================================`;

    fs.appendFileSync(filePath, entriBaru);
    console.log(`[LEARNING] Sukses menyimpan pengetahuan baru: "${pertanyaan}"`);
    return true;
  } catch (err) {
    console.error("[LEARNING ERROR] Gagal menyimpan data baru:", err);
    return false;
  }
}

// --- FUNGSI 3: Otak AI (Menjawab Pertanyaan) ---
async function jawabHelpdeskAI(pertanyaan) {
  try {
    // 1. Ambil semua pengetahuan dari file txt
    const knowledgeBase = bacaDataHelpdesk();

    // 2. Kirim ke Groq (Llama-3.3)
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `
PERAN UTAMA:
Kamu adalah "SisKA", staf admin wanita muda di Biro Keuangan & BMN.
Kamu divisualisasikan sebagai wanita berhijab biru, berkemeja putih, yang cerdas, rapi, ramah, dan sangat helpful.

DATA PENGETAHUAN (SUMBER KEBENARAN):
"""
${knowledgeBase}
"""

ATURAN GAYA BICARA (PERSONA):
1. **Sopan & Profesional:** Gunakan sapaan "Bapak/Ibu" untuk menghormati penanya.
2. **Ramah & Humanis:** Jangan kaku seperti robot. Gunakan bahasa Indonesia yang baik tapi luwes (seperti Customer Service profesional).
3. **Emoticon:** Gunakan sedikit emoticon yang relevan (seperti 😊, 🙏, ✅) untuk menunjukkan keramahan, tapi jangan berlebihan (jangan alay).
4. **Sigap:** Jawab langsung pada intinya, jangan bertele-tele.
5. **JANGAN ROBOTIK:** DILARANG menggunakan kalimat pembuka klise seperti "Berdasarkan data yang saya miliki..." atau "Menurut informasi...". Langsung saja jawab seolah kamu tahu dari ingatanmu sendiri.

INSTRUKSI TEKNIS:
1. Jawab HANYA berdasarkan "DATA PENGETAHUAN".
2. Jika jawaban TIDAK ADA di data, JANGAN MENGARANG. Jawab persis: "UNKNOWN_ESKALASI"
`,
        },
        {
          role: "user",
          content: pertanyaan,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0, // Rendah agar tidak halusinasi
      max_tokens: 800,
    });

    const jawaban = completion.choices[0]?.message?.content || "";

    // 3. Cek apakah AI menyerah
    if (jawaban.includes("UNKNOWN_ESKALASI")) {
      return "UNKNOWN_ESKALASI";
    }

    return jawaban;
  } catch (error) {
    console.error("[GROQ ERROR]", error.message);
    // Jika API Error, kita anggap unknown biar dilempar ke admin
    return "UNKNOWN_ESKALASI"; 
  }
}

module.exports = { jawabHelpdeskAI, simpanDataBaru };