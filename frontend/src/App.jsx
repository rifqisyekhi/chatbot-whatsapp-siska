import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import InventoryTaking from './InventoryTaking'
import AdminMasterDataTU from './MasterDataTU'
import DashboardBarang from './DashboardBarang'

// Ketiga halaman sengaja BERDIRI SENDIRI, tanpa navigasi bersama.
//
// Operator dashboard barang tidak berkepentingan — dan tidak berkenan —
// membaca data pribadi pegawai, jadi tidak boleh ada tautan yang menuntun ke
// sana. Begitu pula katalog: dibuka pegawai dari link WhatsApp (menu 5), jadi
// tidak boleh menampilkan pintu ke halaman admin mana pun.
//
// Perlu dicatat dengan jujur: ini pemisahan TAMPILAN, bukan penjagaan akses.
// Selama tidak ada login, siapa pun yang mengetik alamatnya secara manual
// tetap bisa membuka halaman lain. Penjagaan sungguhan butuh login berperan
// atau pembatasan di sisi jaringan.
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Katalog pengambilan barang untuk pegawai, dibuka dari chat menu 5.
            Tetap di root karena LINK_WEB_KATALOG mengarah ke alamat root. */}
        <Route path="/" element={<InventoryTaking />} />

        {/* Dashboard pegawai & kendaraan — untuk petugas TU */}
        <Route path="/admin" element={<AdminMasterDataTU />} />

        {/* Dashboard barang — untuk operator persediaan.
            /admin/barang dipertahankan sebagai alias supaya tautan yang
            terlanjur tersebar tidak mati. */}
        <Route path="/barang" element={<DashboardBarang />} />
        <Route path="/admin/barang" element={<Navigate to="/barang" replace />} />

        {/* Alamat asing dikembalikan ke katalog, bukan halaman kosong. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
