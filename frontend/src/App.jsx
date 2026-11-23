import { BrowserRouter, Routes, Route, Navigate, Outlet, useOutletContext, useParams } from 'react-router-dom'
import InventoryTaking from './InventoryTaking'
import AdminMasterDataTU from './MasterDataTU'
import DashboardBarang from './DashboardBarang'
import RekapServis from './RekapServis'
import KwitansiMasuk from './KwitansiMasuk'
import KerangkaTataUsaha from './tataUsaha/Kerangka'
import { MENU_TU } from './tataUsaha/menu'
import { DASAR, jalur } from './tataUsaha/jalur'

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
//   Dashboard Tata Usaha      /tata-usaha/<fitur>/...    8005
//     (perjalanan dinas, langganan aplikasi, fotokopi, BBM Kepala Biro,
//      konsumsi — daftar fitur di tataUsaha/menu.js)
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

        {/* ---------- Dashboard Tata Usaha Rokeu (login, sidebar) ----------
            Satu login dan satu sidebar untuk semua fitur; tiap fitur mengatur
            sub-halamannya sendiri di tataUsaha/fitur/<slug>/. Di VPS :8005. */}
        <Route path={DASAR} element={<LayoutTataUsaha />}>
          <Route index element={<Navigate to={MENU_TU[0].slug} replace />} />
          {MENU_TU.map((m) => (
            <Route key={m.slug} path={`${m.slug}/*`} element={<Halaman komponen={m.Halaman} />} />
          ))}
        </Route>

        {/* ---------- Alamat lama → alamat baru ----------
            Supaya tautan dan bookmark yang terlanjur tersebar tidak mati. */}
        <Route path="/barang" element={<Navigate to="/atk/kelola" replace />} />
        <Route path="/admin/barang" element={<Navigate to="/atk/kelola" replace />} />
        <Route path="/admin" element={<Navigate to="/pegawai" replace />} />
        <Route path="/admin/servis-kendaraan" element={<Navigate to="/kendaraan/pemeliharaan" replace />} />
        <Route path="/perjalanan-dinas" element={<Navigate to={jalur('perjalanan-dinas')} replace />} />
        <Route path="/perjalanan-dinas/:id" element={<AliasPerjalanan />} />
        <Route path="/admin/kwitansi" element={<Navigate to={jalur('perjalanan-dinas')} replace />} />
        <Route path="/admin/kwitansi/:id" element={<AliasPerjalanan />} />

        <Route path="*" element={<TidakDitemukan />} />
      </Routes>
    </BrowserRouter>
  )
}

// Login sekali, lalu sidebar membungkus halaman mana pun di modul ini.
function LayoutTataUsaha() {
  return (
    <KwitansiMasuk>
      {(sesi) => (
        <KerangkaTataUsaha {...sesi}>
          <Outlet context={sesi} />
        </KerangkaTataUsaha>
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
  return <Navigate to={jalur('perjalanan-dinas', id)} replace />
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
