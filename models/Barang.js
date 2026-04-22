const mongoose = require('mongoose');

const barangSchema = new mongoose.Schema({
  id_barang: { type: String, required: true, unique: true },
  nama: { type: String, required: true },
  stok: { type: Number, required: true, default: 0 },
  satuan: { type: String },
  img: { type: String }
});

module.exports = mongoose.model('Barang', barangSchema, 'barang');