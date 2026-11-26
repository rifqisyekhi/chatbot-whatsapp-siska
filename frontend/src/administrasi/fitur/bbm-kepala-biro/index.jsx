// =========================================================
// FITUR BBM KEPALA BIRO — DIKERJAKAN ANAK MAGANG (branch magang/bbm-kepala-biro)
// =========================================================
//
// Halaman ini sudah tersambung ke menu sidebar "BBM Kepala Biro" dan alamat
// /administrasi/bbm-kepala-biro/... . Kerjakan SEMUA tampilan fitur ini di folder
// ini saja (frontend/src/administrasi/fitur/bbm-kepala-biro/), dan API-nya di
// features/fitur/bbm-kepala-biro/. Panduan lengkap: PANDUAN-MAGANG.pdf
//
// Props `sesi` berisi `operator` — operator.peran: "operator" |
// "bendahara" | "admin", operator.bidang: "BMN" | "PTUK" | "TU" | ...
// Bendahara hanya boleh melihat (sembunyikan tombol ubah/hapus).
//
// Sub-halaman diatur dengan <Routes> RELATIF terhadap /administrasi/bbm-kepala-biro:
//   index  → daftar        "baru" → form baru        ":id" → ubah
//
// Contoh lengkap yang sudah jadi: ../perjalanan-dinas (KwitansiDashboard
// dan KwitansiPerdin di frontend/src/).
//
// TODO (hapus komentar ini setelah dikerjakan):
//   1. Buat komponen DaftarBbm.jsx dan FormBbm.jsx di folder ini.
//   2. Panggil API lewat apiKwitansi (services/sesiKwitansi), mis.
//        apiKwitansi({ url: "api/kwitansi/bbm-kepala-biro/status" })
//   3. PDF (SPBY + kwitansi) dibuka dengan bukaPdf({ url: ... }).

import { Routes, Route } from "react-router-dom";
import { Fuel } from "lucide-react";
import SegeraHadir from "../../SegeraHadir";

export default function BbmKepalaBiro(sesi) {
  void sesi; // dipakai nanti oleh halaman daftar/form
  return (
    <Routes>
      <Route
        index
        element={<SegeraHadir judul="BBM Kepala Biro" Ikon={Fuel} keterangan="SPBY dan kwitansi pembelian bahan bakar kendaraan Kepala Biro." />}
      />
    </Routes>
  );
}
