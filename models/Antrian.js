const mongoose = require('mongoose');

const AntrianSchema = new mongoose.Schema({
    msgId: { type: String, required: true, unique: true },
    tipe: String, // Penanda, isinya: "ATASAN" atau "GUDANG"
    data: { type: mongoose.Schema.Types.Mixed } // Nyimpen seluruh object data pesanannya
});

module.exports = mongoose.model('Antrian', AntrianSchema, 'antrian');