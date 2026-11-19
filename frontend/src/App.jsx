import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import InventoryTaking from './InventoryTaking'
import AdminMasterDataTU from './MasterDataTU'
import DashboardBarang from './DashboardBarang'
import RekapServis from './RekapServis'
import KwitansiPerdin from './KwitansiPerdin'
import KwitansiDashboard from './KwitansiDashboard'
import KwitansiMasuk from './KwitansiMasuk'

// =========================================================
// SATU PATH PER MODUL
// =========================================================
//
// Tiap modul berdiri sendiri di path-nya, tanpa navigasi bersama:
//
//   Modul                     Path                       Port VPS (nginx)
//   Stok ATK (katalog)        /atk, /atk/kelola          8002
//   Master Data Pegawai       /pegawai                   8003
//   Kendaraan Dinas           /kendaraan, /kendaraan/... 8004
//   Perjalanan Dinas          /perjalanan-dinas/...      8005
//   (Presensi non ASN: aplikasi terpisah di 8001)
//
// Di lokal semuanya dibuka dari satu alamat (localhost:3000/<modul>). Di VPS
// tiap port hanya meneruskan halaman dan API modulnya sendiri — lihat
// deploy/nginx/ — jadi pemisahannya bukan sekadar tampilan: halaman pegawai
// tidak bisa dibuka dari port perjalanan dinas walau alamatnya diketik.
//
// Modul baru: tambah path /<modul> di sini dan berkas nginx port berikutnya.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ---------- Stok ATK ---------- */}
        {/* Katalog pengambilan barang untuk pegawai, dibuka dari chat menu 5.
            Root tetap mengarah ke sini karena LINK_WEB_KATALOG yang sudah
            terkirim ke WhatsApp menunjuk alamat root. */}
        <Route path="/" element={<Navigate to="/atk" replace />} />
        <Route path="/atk" element={<InventoryTaking />} />
        <Route path="/atk/kelola" element={<DashboardBarang />} />

        {/* ---------- Master Data Pegawai ---------- */}
        <Route path="/pegawai" element={<AdminMasterDataTU modul="pegawai" />} />

        {/* ---------- Kendaraan Dinas ---------- */}
        <Route path="/kendaraan" element={<AdminMasterDataTU modul="kendaraan" />} />
        <Route path="/kendaraan/pemeliharaan" element={<RekapServis />} />

        {/* ---------- Perjalanan Dinas (login operator per bidang) ---------- */}
        <Route
          path="/perjalanan-dinas"
          element={<KwitansiMasuk>{(s) => <KwitansiDashboard {...s} />}</KwitansiMasuk>}
        />
        <Route
          path="/perjalanan-dinas/:id"
          element={<KwitansiMasuk>{(s) => <KwitansiPerdin {...s} />}</KwitansiMasuk>}
        />

        {/* ---------- Alamat lama → alamat baru ----------
            Supaya tautan dan bookmark yang terlanjur tersebar tidak mati. */}
        <Route path="/barang" element={<Navigate to="/atk/kelola" replace />} />
        <Route path="/admin/barang" element={<Navigate to="/atk/kelola" replace />} />
        <Route path="/admin" element={<Navigate to="/pegawai" replace />} />
        <Route path="/admin/servis-kendaraan" element={<Navigate to="/kendaraan/pemeliharaan" replace />} />
        <Route path="/admin/kwitansi" element={<Navigate to="/perjalanan-dinas" replace />} />
        <Route path="/admin/kwitansi/:id" element={<AliasPerjalanan />} />

        <Route path="*" element={<TidakDitemukan />} />
      </Routes>
    </BrowserRouter>
  )
}

function AliasPerjalanan() {
  const { id } = useParams()
  return <Navigate to={`/perjalanan-dinas/${id}`} replace />
}

// Alamat asing: halaman sederhana, bukan dialihkan ke modul lain (di VPS
// modul lain memang tidak bisa dibuka dari port ini).
function TidakDitemukan() {
  return (
    <div className="min-h-screen bg-paper font-sans text-navy flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-5xl font-black text-brand">404</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">Halaman tidak ditemukan.</p>
      </div>
    </div>
  )
}

export default App
