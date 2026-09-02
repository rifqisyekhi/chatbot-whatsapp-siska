const mongoose = require('mongoose');

// Tidak ada field yang wajib.
//
// Alasannya bukan kelonggaran, tapi kenyataan data: PPNPN dan
// anak magang tidak punya NIP — mereka memakai NIK — sehingga
// `nip: { required: true }` membuat mereka mustahil ditambahkan
// lewat Master Data. Petugas TU yang cuma ingin membetulkan
// sub_unit pun ikut terhalang.
//
// Yang benar-benar dibutuhkan sistem adalah `no_wa`: itu kunci
// login aplikasi presensi, kunci pencarian pegawai di bot, dan
// yang tercatat di setiap dokumen absensi. Dokumen tanpa no_wa
// tidak akan bisa dipakai siapa pun — tidak merusak apa-apa,
// hanya tidak berguna.
const PegawaiSchema = new mongoose.Schema({
    nama: String,
    nip: String,
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

// NIP tetap harus unik — pencarian atasan (atasan_nip) dan
// penanda peminjam kendaraan sama-sama memakainya sebagai
// kunci, jadi dua orang ber-NIP sama akan saling tertukar.
//
// Tapi keunikannya HANYA berlaku untuk nilai yang terisi.
// Index unik biasa akan menolak pegawai kedua yang nip-nya
// kosong, padahal seluruh PPNPN dan magang memang begitu.
// partialFilterExpression membuat dokumen ber-nip kosong atau
// tanpa field nip sama sekali tidak ikut diindeks.
//
// CATATAN: index unik lama (nip_1) tidak hilang sendiri saat
// baris ini berubah. Jalankan scripts/perbaiki-index-nip.js
// sekali di server untuk menggantinya.
PegawaiSchema.index(
    { nip: 1 },
    {
        unique: true,
        partialFilterExpression: { nip: { $gt: '' } },
        name: 'nip_unik_jika_terisi'
    }
);

module.exports = mongoose.model('Pegawai', PegawaiSchema, 'pegawai');
