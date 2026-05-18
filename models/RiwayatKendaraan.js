const mongoose = require('mongoose');

const riwayatKendaraanSchema = new mongoose.Schema({
    tanggal: String,
    nama_pegawai: String,
    nip: String,
    kendaraan: String,
    tujuan: String,
    kondisi: String,
    lama_pakai: String,
    jam_pinjam: String,
    jam_akhir: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RiwayatKendaraan', riwayatKendaraanSchema, 'riwayat_kendaraan');