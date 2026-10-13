const mongoose = require("mongoose");

const riwayatCutiSchema = new mongoose.Schema(
  {
    nip: { type: String, default: "-" },
    nama: { type: String, required: true },
    jabatan: { type: String, default: "-" },
    sub_unit: { type: String, default: "-" },
    jenis_cuti: { type: String, required: true },
    alasan: { type: String, default: "" },
    lama_cuti: { type: String, default: "" },
    alamat_cuti: { type: String, default: "" },
    kontak_cuti: { type: String, default: "" },
    atasan: { type: String, default: "-" },
    status: {
      type: String,
      enum: ["DISETUJUI", "DITOLAK", "MENUNGGU"],
      default: "DISETUJUI",
    },
    createdAt: { type: Date, default: Date.now },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("RiwayatCuti", riwayatCutiSchema, "riwayat_cuti");

