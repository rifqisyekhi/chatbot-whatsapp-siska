const mongoose = require('mongoose');

const PegawaiSchema = new mongoose.Schema({
    "Nama Pegawai": String,
    "No. HP (WA) aktif": String,
    "id_wa_alternatif": String,
    nip: String,
    NIP: String,
    Jabatan: String,
    JABATAN: String,
    "Unit Kerja": String,
    SUBUNIT: String,
    Subbagian: String,
    Unit: String,
    "NO HP ATASAN": String,
    kategori_pegawai: String
}, { strict: false });

module.exports = mongoose.model('Pegawai', PegawaiSchema, 'pegawai');