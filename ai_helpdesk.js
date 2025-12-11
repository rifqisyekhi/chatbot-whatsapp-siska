const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// =========================================================
// KONFIGURASI API GEMINI
// =========================================================
// Ganti dengan API Key Anda yang valid
const MODEL_API_KEY = "MASUKKAN_API_KEY_GEMINI_DISINI"; 

const genAI = new GoogleGenerativeAI(MODEL_API_KEY);

// Model untuk mengubah teks jadi angka (Embedding)
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Model untuk menjawab chat (Chat Completion)
const chatModel = genAI.getGenerativeModel({ model: "gemini-pro" });

// Variabel untuk menyimpan "Otak" sementara
let vectorStore = [];

// Lokasi folder data latih (file .txt)
const DATA_DIR = path.join(__dirname, 'data_latih');

// =========================================================
// FUNGSI MATEMATIKA (COSINE SIMILARITY)
// =========================================================
// Fungsi ini menghitung kemiripan antara pertanyaan user vs data kita
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    if (!vecA || !vecB) return 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

// =========================================================
// FUNGSI PELATIHAN (INIT)
// =========================================================
async function initKnowledgeBase() {
    console.log("[AI-INIT] 🚀 Memulai proses membaca data lokal...");

    // 1. Cek apakah folder 'data_latih' ada?
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
        console.log(`[AI-INFO] 📁 Folder '${DATA_DIR}' baru saja dibuat.`);
        console.log("[AI-INFO] ⚠️ Silakan isi file .txt (Notepad) di dalam folder tersebut agar bot pintar!");
        return;
    }

    // 2. Baca semua file .txt di folder tersebut
    const files = fs.readdirSync(DATA_DIR);
    let rawTexts = [];

    for (const file of files) {
        if (file.endsWith('.txt')) {
            const filePath = path.join(DATA_DIR, file);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                
                // Pecah teks berdasarkan baris kosong (double newline)
                // Ini asumsinya di notepad Anda memisahkan topik dengan Enter 2x
                const chunks = content.split(/\n\s*\n/);
                
                chunks.forEach(chunk => {
                    const bersih = chunk.trim();
                    if (bersih.length > 20) { // Hanya ambil teks yang cukup panjang
                        rawTexts.push(bersih);
                    }
                });
                console.log(`[AI-READ] ✅ Berhasil membaca file: ${file}`);
            } catch (err) {
                console.error(`[AI-ERROR] Gagal baca ${file}:`, err.message);
            }
        }
    }

    if (rawTexts.length === 0) {
        console.log("[AI-WARN] ⚠️ Tidak ada data teks yang ditemukan. Bot belum punya pengetahuan.");
        return;
    }

    console.log(`[AI-PROCESS] 🧠 Sedang mempelajari ${rawTexts.length} potong informasi...`);

    // 3. Proses Embedding (Ubah teks jadi Vector)
    vectorStore = []; // Reset memori
    
    for (let i = 0; i < rawTexts.length; i++) {
        const text = rawTexts[i];
        try {
            const result = await embeddingModel.embedContent(text);
            const vector = result.embedding.values;
            
            if (vector) {
                vectorStore.push({ text, vector });
                // Tampilkan progress bar sederhana
                process.stdout.write("."); 
            }
            
            // Jeda sedikit agar tidak kena limit API Google (Rate Limit)
            await new Promise(r => setTimeout(r, 500)); 

        } catch (e) {
            console.error(`x`); // Tanda gagal per item
        }
    }

    console.log(`\n[AI-READY] ✅ Selesai! Bot sudah hafal ${vectorStore.length} informasi SOP.`);
}

// =========================================================
// FUNGSI MENJAWAB PERTANYAAN
// =========================================================
async function tanyaAI(pertanyaanUser) {
    // Cek dulu apakah bot punya otak
    if (vectorStore.length === 0) {
        return "Maaf, database pengetahuan saya masih kosong. Admin belum mengisi file data latih.";
    }

    try {
        // 1. Ubah pertanyaan user jadi angka (Vector)
        const qResult = await embeddingModel.embedContent(pertanyaanUser);
        const qVector = qResult.embedding.values;

        // 2. Bandingkan pertanyaan user dengan semua data di memori
        const matches = vectorStore.map(item => ({
            text: item.text,
            score: cosineSimilarity(qVector, item.vector)
        }));

        // 3. Urutkan dari nilai kemiripan tertinggi
        matches.sort((a, b) => b.score - a.score);

        // Ambil 3 potong informasi teratas yang paling relevan
        const context = matches.slice(0, 3).map(m => m.text).join("\n\n---\n\n");
        const bestScore = matches[0].score;

        console.log(`[AI-SEARCH] Query: "${pertanyaanUser}" | Score: ${bestScore.toFixed(2)}`);

        // 4. Cek Ambang Batas (Threshold)
        // Jika skor di bawah 0.45, artinya tidak ada info yang nyambung di Notepad
        if (bestScore < 0.45) {
            return "Maaf, saya tidak menemukan informasi yang relevan di dokumen SOP/Aturan Internal kami. Apakah Anda ingin disambungkan ke Admin Manusia?";
        }

        // 5. Rakit Prompt untuk Gemini
        const prompt = `
            Anda adalah "SisKA", Asisten Helpdesk Biro Keuangan.
            Tugas Anda adalah menjawab pertanyaan user berdasarkan KONTEKS DATA di bawah ini.
            
            KONTEKS DATA (SUMBER KEBENARAN):
            --------------------------------
            ${context}
            --------------------------------
            
            PERTANYAAN USER: "${pertanyaanUser}"
            
            INSTRUKSI:
            1. Jawablah hanya berdasarkan Konteks Data di atas.
            2. Gunakan bahasa Indonesia yang sopan dan formal namun ramah.
            3. Jika informasinya ada, jelaskan dengan ringkas.
            4. Jangan mengarang jawaban di luar data tersebut.
        `;

        // 6. Kirim ke Gemini Chat
        const result = await chatModel.generateContent(prompt);
        const response = await result.response;
        return response.text();

    } catch (error) {
        console.error("[AI-ERROR] Gagal menjawab:", error.message);
        return "Maaf, sistem AI sedang mengalami gangguan koneksi.";
    }
}

module.exports = { tanyaAI, initKnowledgeBase };