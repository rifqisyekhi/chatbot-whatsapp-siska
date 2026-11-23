import { BrowserRouter, Routes, Route, Navigate, Outlet, useOutletContext, useParams } from 'react-router-dom'
import InventoryTaking from './InventoryTaking'
import AdminMasterDataTU from './MasterDataTU'
import DashboardBarang from './DashboardBarang'
import RekapServis from './RekapServis'
import KwitansiPerdin from './KwitansiPerdin'
import KwitansiDashboard from './KwitansiDashboard'
import KwitansiMasuk from './KwitansiMasuk'
import KeuanganShell, { SegeraHadir } from './KeuanganShell'
import { MENU_KEUANGAN } from './menuKeuangan'

// =========================================================
// SATU PATH PER MODUL
// =========================================================
//
// Tiap modul berdiri sendiri di path-nya, tanpa navigasi bersama:
//
//   Modul                     Path                       Port VPS (nginx)
//   Stok ATK (katalog)        /atk, /atk/kelola          8002
//   Master Data Pegawai       /pegawai                   8006
//   Kendaraan Dinas           /kendaraan, /kendaraan/... 8004
//   SPBY & Kwitansi           /perjalanan-dinas, /langganan-aplikasi,
//                             /fotokopi, /bbm-kepala-biro, /konsumsi  8005
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

        {/* ---------- SPBY & Kwitansi (login operator/bendahara, sidebar) ----------
            Satu login dan satu sidebar untuk semua jenis pengeluaran; di VPS
            semuanya di port 8005. */}
        <Route element={<LayoutKeuangan />}>
          <Route path="/perjalanan-dinas" element={<Halaman komponen={KwitansiDashboard} />} />
          <Route path="/perjalanan-dinas/:id" element={<Halaman komponen={KwitansiPerdin} />} />
          {MENU_KEUANGAN.filter((m) => m.path !== "/perjalanan-dinas").map((m) => (
            <Route key={m.path} path={m.path} element={<SegeraHadir path={m.path} />} />
          ))}
        </Route>

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

// Login sekali, lalu sidebar membungkus halaman mana pun di modul ini.
function LayoutKeuangan() {
  return (
    <KwitansiMasuk>
      {(sesi) => (
        <KeuanganShell {...sesi}>
          <Outlet context={sesi} />
        </KeuanganShell>
      )}
    </KwitansiMasuk>
  )
}

function Halaman({ komponen: Komponen }) {
  const sesi = useOutletContext()
  return <Komponen {...sesi} />
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
