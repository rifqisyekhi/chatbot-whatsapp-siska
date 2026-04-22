require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const Barang = require('./models/Barang'); // Panggil cetakan yang tadi dibuat

// 1. Konek ke MongoDB pakai URL dari .env
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ Berhasil nyambung ke MongoDB Atlas!");

    try {
      // 2. Baca file JSON lokal lu
      const jsonData = fs.readFileSync('./stok_barang.json', 'utf-8');
      const dataBarang = JSON.parse(jsonData);

      // 3. Format ulang sedikit (ubah 'id' jadi 'id_barang')
      const dataSiapMasuk = dataBarang.map(item => ({
        id_barang: item.id,
        nama: item.nama,
        stok: item.stok,
        satuan: item.satuan,
        img: item.img
      }));

      // 4. Bersihkan koleksi barang (opsional, biar kalau di-run ulang ga dobel)
      await Barang.deleteMany({});
      console.log("🧹 Koleksi barang dibersihkan...");

      // 5. Masukkan semua data sekaligus (Bulk Insert)
      await Barang.insertMany(dataSiapMasuk);
      console.log(`🚀 Sukses! ${dataSiapMasuk.length} data barang berhasil dipindah ke MongoDB.`);

      // 6. Putus koneksi kalau udah selesai
      process.exit();
    } catch (error) {
      console.error("❌ Waduh, ada error pas migrasi:", error);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error("❌ Gagal nyambung ke database:", err);
  });