// PLACEHOLDER — menunggu kode dashboard barang dari Rifqi.
//
// Route /admin/barang sudah terpasang di App.jsx, jadi begitu kodenya datang
// cukup ganti isi berkas ini; tidak perlu menyentuh routing lagi. Syarat
// satu-satunya: tetap `export default` sebuah komponen React.
//
// Backend-nya sudah siap penuh, tinggal dipakai lewat apiTU dari
// ./services/ApiTU (lihat MasterDataTU.jsx sebagai contoh pemakaian):
//   GET    api/barang              -> daftar barang
//   POST   api/barang              -> tambah barang
//   PUT    api/barang/:id_barang   -> ubah barang
//   DELETE api/barang/:id_barang   -> hapus barang
//
// Perhatikan: endpoint barang memakai :id_barang, BUKAN _id seperti pegawai
// dan kendaraan (lihat index.js:363 dan index.js:378).

export default function DashboardBarang() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center">
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          Dashboard Barang belum terpasang
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Route <code className="px-1.5 py-0.5 bg-slate-100 rounded">/admin/barang</code> sudah
          aktif dan menunggu kodenya. Ganti isi berkas
          <code className="px-1.5 py-0.5 bg-slate-100 rounded ml-1">src/DashboardBarang.jsx</code>{' '}
          untuk mengisi halaman ini.
        </p>
      </div>
    </div>
  )
}
