const mongoose = require('mongoose');

const BarangSchema = new mongoose.Schema({
    id_barang: { type: String, required: true, unique: true },
    nama: { type: String, required: true },
    kategori: { type: String, default: 'ATK' },
    stok: { type: Number, required: true, default: 0 },
    satuan: { type: String, default: 'Pcs' },
    img: { type: String, default: '' }
});

module.exports = mongoose.model('Barang', BarangSchema, 'barang');