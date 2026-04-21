require("dotenv").config();
const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DATA_FILE = "data_helpdesk.txt";

const groq = new Groq({ apiKey: GROQ_API_KEY });

// --- FUNGSI 1: Membaca Database Pengetahuan (TXT) ---
function bacaDataHelpdesk() {
  try {
    const filePath = path.join(__dirname, "..", "data", DATA_FILE);
    
    if (!fs.existsSync(filePath)) {
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(filePath, "", "utf-8");
      return "";
    }
    
    const data = fs.readFileSync(filePath, "utf-8");
    return data;
  } catch (err) {
    console.error("[FILE ERROR] Gagal membaca data:", err);
    return "";
  }
}

// --- FUNGSI 2: Menyimpan Pelajaran Baru ---
function simpanDataBaru(pertanyaan, jawaban) {
  try {
    const filePath = path.join(__dirname, "..", "data", DATA_FILE);
    
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

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
    const knowledgeBase = bacaDataHelpdesk();
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `
PERAN UTAMA:
Kamu adalah "SisKA", staf admin wanita muda di Biro Keuangan & BMN.
Kamu divisualisasikan sebagai wanita berhijab biru, berkemeja putih, yang cerdas, rapi, ramah, dan sangat helpful.

DATA PENGETAHUAN (SUMBER KEBENARAN SATU-SATUNYA):
"""
${knowledgeBase}
"""

ATURAN GAYA BICARA (PERSONA):
1. **Sopan & Profesional:** Gunakan sapaan "Bapak/Ibu" untuk menghormati penanya.
2. **Ramah & Humanis:** Jangan kaku seperti robot. Gunakan bahasa Indonesia yang baik tapi luwes (seperti Customer Service profesional).
3. **Tanpa Emoji:** DILARANG KERAS menggunakan simbol emoji atau emoticon apapun di dalam seluruh teks balasanmu.
4. **Sigap:** Jawab langsung pada intinya, jangan bertele-tele.
5. **JANGAN ROBOTIK:** DILARANG menggunakan kalimat pembuka klise seperti "Berdasarkan data yang saya miliki..." atau "Menurut informasi...". Langsung saja jawab seolah kamu tahu dari ingatanmu sendiri.

INSTRUKSI TEKNIS SUPER KETAT:
1. Kamu HANYA BOLEH menjawab berdasarkan informasi yang secara eksplisit tertulis di dalam "DATA PENGETAHUAN" di atas.
2. DILARANG KERAS menggunakan pengetahuan umum (general knowledge) dari luar, meskipun kamu tahu jawabannya secara logis.
3. Jika pertanyaan pengguna TIDAK ADA atau TIDAK DITEMUKAN jawabannya di dalam "DATA PENGETAHUAN", kamu DILARANG mengarang, DILARANG menebak, dan DILARANG memberikan saran umum. Kamu WAJIB langsung merespons hanya dengan kata kunci ini: UNKNOWN_ESKALASI
`,
        },
        {
          role: "user",
          content: pertanyaan,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 800,
    });

    const jawaban = completion.choices[0]?.message?.content || "";

    if (jawaban.includes("UNKNOWN_ESKALASI")) {
      return "UNKNOWN_ESKALASI";
    }

    return jawaban;
  } catch (error) {
    console.error("[GROQ ERROR]", error.message);
    return "UNKNOWN_ESKALASI"; 
  }
}

module.exports = { jawabHelpdeskAI, simpanDataBaru };