const mongoose = require('mongoose');

const riwayatLemburSchema = new mongoose.Schema({
    nip: String,
    nama: String,
    gol: String,
    jabatan: String,
    tanggal: String,
    kegiatan: String,
    atasan: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RiwayatLembur', riwayatLemburSchema, 'riwayat_lembur');