require('dotenv').config();
const mongoose = require('mongoose');
const Pegawai = require('./models/Pegawai'); 

const uri = process.env.MONGO_URI;

async function migrasiLangsung() {
    try {
        console.log("Menghubungkan ke MongoDB Atlas...");
        await mongoose.connect(uri);
        console.log("✅ Terhubung!");

        // 1. Ambil SEMUA data dari database saat ini
        console.log("Membaca data dari database...");
        const dataLama = await Pegawai.find({}).lean();
        
        if (dataLama.length === 0) {
            console.log("❌ Data kosong, tidak ada yang bisa dimigrasi.");
            return;
        }

        // Helper untuk normalisasi nomor HP
        const normalizePhone = (phone) => {
            if (!phone) return "";
            let clean = String(phone).replace(/[^0-9]/g, '');
            if (clean.startsWith('08')) clean = '62' + clean.slice(1);
            if (clean.startsWith('8')) clean = '62' + clean;
            return clean;
        };

        // 2. Bikin Map NIP berdasarkan NO WA (Untuk pencarian atasan)
        const phoneToNipMap = {};
        dataLama.forEach(p => {
            // Sesuaikan dengan nama field di DB lama lu
            const wa = p["No. HP (WA) aktif"] || p.no_wa; 
            if (wa) phoneToNipMap[normalizePhone(wa)] = p.nip || p.NIP || "";
        });

        // 3. Transformasi ke struktur baru
        const dataBaru = dataLama.map(p => {
            const waAtasanRaw = p["NO HP ATASAN"] || ""; 
            const noWaAtasan = normalizePhone(waAtasanRaw);
            
            return {
                nama: (p["Nama Pegawai"] || p.nama || "").trim(),
                nip: (p["nip"] || p["NIP"] || "").trim(),
                no_wa: normalizePhone(p["No. HP (WA) aktif"] || p.no_wa || ""),
                jabatan: (p["Jabatan"] || p.jabatan || "").trim(),
                sub_unit: (p["SUBUNIT"] || p["Unit Kerja"] || p.sub_unit || "").trim(),
                email: (p["E-mail aktif"] || p.email || "").trim(),
                atasan_nip: phoneToNipMap[noWaAtasan] || null,
                kategori_pegawai: p.kategori_pegawai || "Internal"
            };
        });

        // 4. Hapus data lama (Hati-hati!)
        await Pegawai.deleteMany({});
        console.log("🧹 Collection dibersihkan.");

        // 5. Masukkan data baru
        await Pegawai.insertMany(dataBaru);
        console.log(`🚀 MIGRASI SUKSES! ${dataBaru.length} data pegawai sudah rapi.`);

    } catch (error) {
        console.error("❌ Waduh, error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Koneksi ditutup.");
    }
}

migrasiLangsung();