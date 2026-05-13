require('dotenv').config();
const mongoose = require('mongoose');
const Pegawai = require('./models/Pegawai'); // Pastikan path modelnya benar

const uri = process.env.MONGO_URI;

async function perbaikiDatabase() {
    try {
        console.log("Menghubungkan ke MongoDB Atlas...");
        await mongoose.connect(uri);
        console.log("✅ Terhubung!");

        // Perintah sakti untuk mengganti nama kolom di semua data
        const hasil = await Pegawai.updateMany(
            {}, 
            { $rename: { "No. HP (WA) aktif": "no_wa" } }
        );

        console.log(`🚀 Selesai! Berhasil mengupdate ${hasil.modifiedCount} data pegawai.`);

    } catch (error) {
        console.error("❌ Waduh, ada error:", error);
    } finally {
        mongoose.connection.close();
        console.log("Koneksi ditutup.");
    }
}

perbaikiDatabase();