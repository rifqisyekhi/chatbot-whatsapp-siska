require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Kendaraan = require('./models/Kendaraan'); // Panggil modelnya

const uri = process.env.MONGO_URI;

async function runMigrasi() {
    try {
        console.log("Menghubungkan ke MongoDB...");
        await mongoose.connect(uri);
        console.log("✅ Terhubung!");

        // 1. Baca file JSON kendaraan lu
        const jsonPath = path.join(__dirname, 'database', 'status_kendaraan.json');
        if (!fs.existsSync(jsonPath)) {
            console.log("❌ File status_kendaraan.json gak ketemu!");
            return;
        }

        const dataMentah = fs.readFileSync(jsonPath, 'utf8');
        const listKendaraan = JSON.parse(dataMentah);

        console.log(`Membaca ${listKendaraan.length} kendaraan dari file lokal...`);

        // 2. Bersihin collection lama biar gak dobel datanya
        await Kendaraan.deleteMany({});
        console.log("Membersihkan collection kendaraan lama...");

        // 3. Masukin data massal
        await Kendaraan.insertMany(listKendaraan);
        console.log("🚀 BOOM! Data kendaraan berhasil pindah ke MongoDB Atlas!");

    } catch (err) {
        console.error("❌ Waduh error brad:", err);
    } finally {
        mongoose.connection.close();
        console.log("Koneksi ditutup.");
    }
}

runMigrasi();