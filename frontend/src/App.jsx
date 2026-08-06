import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import InventoryTaking from './InventoryTaking'
import AdminMasterDataTU from './MasterDataTU'
import DashboardBarang from './DashboardBarang'

// Halaman admin berbagi navigasi ini. Katalog user SENGAJA tidak memakainya:
// halaman itu dibuka pegawai dari link WhatsApp (menu 5), jadi tidak boleh
// menampilkan pintu ke halaman admin sama sekali.
function AdminLayout({ children }) {
  const tab = ({ isActive }) =>
    `px-4 py-2 rounded-xl font-semibold text-sm transition ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    }`

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">SisKA Dashboard</h1>
            <p className="text-sm text-slate-500">Panel administrasi Biro Keuangan dan BMN</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <NavLink to="/admin" end className={tab}>
              Pegawai &amp; Kendaraan
            </NavLink>
            <NavLink to="/admin/barang" className={tab}>
              Data Barang
            </NavLink>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Katalog pengambilan barang untuk pegawai, dibuka dari chat menu 5.
            Tetap di root karena LINK_WEB_KATALOG mengarah ke alamat root. */}
        <Route path="/" element={<InventoryTaking />} />

        <Route
          path="/admin"
          element={
            <AdminLayout>
              <AdminMasterDataTU />
            </AdminLayout>
          }
        />
        <Route
          path="/admin/barang"
          element={
            <AdminLayout>
              <DashboardBarang />
            </AdminLayout>
          }
        />

        {/* Alamat asing dikembalikan ke katalog, bukan halaman kosong. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
