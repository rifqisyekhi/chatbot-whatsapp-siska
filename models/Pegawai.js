const mongoose = require('mongoose');

const PegawaiSchema = new mongoose.Schema({
    nama: { type: String, required: true },
    nip: { type: String, required: true, unique: true },
    no_wa: String,
    jabatan: String,
    sub_unit: String,
    email: String,
    atasan_nip: String,
    kategori_pegawai: String
}, { 
    versionKey: false,
    strict: true
});

module.exports = mongoose.model('Pegawai', PegawaiSchema, 'pegawai');