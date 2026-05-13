const mongoose = require('mongoose');

const KendaraanSchema = new mongoose.Schema({
    id: String,
    nama: String,
    plat: String,
    jenis: String,
    status: { 
        type: String, 
        default: "TERSEDIA"
    },
    peminjam_saat_ini: { 
        type: String, 
        default: null
    },
    waktu_pinjam: { 
        type: String, 
        default: null 
    },
    tujuan_aktif: { 
        type: String, 
        default: null 
    }
});

module.exports = mongoose.model('Kendaraan', KendaraanSchema, 'kendaraan');