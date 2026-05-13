require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Pegawai = require('./models/Pegawai'); 

const uri = process.env.MONGO_URI;

async function migrasiData() {
    try {
        console.log("Menghubungkan ke MongoDB Atlas...");
        await mongoose.connect(uri);
        console.log("✅ Terhubung!");

        // 1. Baca file JSON lokal
        const dbPath = path.join(__dirname, 'database', 'DatabasePegawaiBiroKeuangan.json');
        if (!fs.existsSync(dbPath)) {
            console.error("❌ File JSON tidak ditemukan di:", dbPath);
            return;
        }
        const rawData = fs.readFileSync(dbPath, 'utf8');
        const parsedData = JSON.parse(rawData);

        const semuaPegawaiRaw = [];

        // 2. Kumpulin data mentah dan kasih tag kategori
        if (parsedData.Internal) {
            parsedData.Internal.forEach(p => semuaPegawaiRaw.push({ ...p, kategori_pegawai: 'Internal' }));
        }
        if (parsedData.PPNPN) {
            parsedData.PPNPN.forEach(p => semuaPegawaiRaw.push({ ...p, kategori_pegawai: 'PPNPN' }));
        }
        if (parsedData.magang) {
            parsedData.magang.forEach(p => semuaPegawaiRaw.push({ ...p, kategori_pegawai: 'Magang' }));
        }
        if (parsedData.TimGudang) {
            parsedData.TimGudang.forEach(p => semuaPegawaiRaw.push({ ...p, kategori_pegawai: 'TimGudang' }));
        }

        console.log(`Membaca ${semuaPegawaiRaw.length} data pegawai mentah dari JSON...`);

        // 3. PROSES PEMBERSIHAN (Hapus variabel "," dan mapping ke field yang benar)
        const dataBersih = semuaPegawaiRaw.map(p => {
            return {
                "nip": p["nip"] || p["NIP"] || "",
                "Nama Pegawai": p["Nama Pegawai"] || "",
                "SUBUNIT": p["SUBUNIT"] || p["Unit Kerja"] || "",
                "Jabatan": p["Jabatan"] || "",
                "No. HP (WA) aktif": p["No. HP (WA) aktif"] || "",
                "E-mail aktif": p["E-mail aktif"] || "",
                "ATASAN": p["ATASAN"] || "",
                "NO HP ATASAN": p["NO HP ATASAN"] || "",
                "EMAIL ATASAN": p["EMAIL ATASAN"] || "",
                "kategori_pegawai": p["kategori_pegawai"]
            };
        });

        // 4. Bersihin database lama (biar gak duplikat)
        await Pegawai.deleteMany({});
        console.log("Membersihkan collection pegawai lama...");

        // 5. Suntikkin data massal ke MongoDB
        await Pegawai.insertMany(dataBersih);
        console.log("🚀 MIGRASI SUKSES! Data sudah bersih dari variabel sampah dan masuk ke Atlas!");

    } catch (error) {
        console.error("❌ Waduh, ada error brad:", error);
    } finally {
        mongoose.connection.close();
        console.log("Koneksi database ditutup.");
    }
}

migrasiData();