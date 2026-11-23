// =========================================================
// FITUR KONSUMSI — DIKERJAKAN ANAK MAGANG (branch magang/konsumsi)
// =========================================================
//
// Halaman ini sudah tersambung ke menu sidebar "Konsumsi" dan alamat
// /administrasi/konsumsi/... . Kerjakan SEMUA tampilan fitur ini di folder
// ini saja (frontend/src/administrasi/fitur/konsumsi/), dan API-nya di
// features/fitur/konsumsi/. Panduan lengkap: PANDUAN-MAGANG.pdf
//
// Props `sesi` berisi `operator` — operator.peran: "operator" |
// "bendahara" | "admin", operator.bidang: "BMN" | "PTUK" | "TU" | ...
// Bendahara hanya boleh melihat (sembunyikan tombol ubah/hapus).
//
// Sub-halaman diatur dengan <Routes> RELATIF terhadap /administrasi/konsumsi:
//   index  → daftar        "baru" → form baru        ":id" → ubah
//
// Contoh lengkap yang sudah jadi: ../perjalanan-dinas (KwitansiDashboard
// dan KwitansiPerdin di frontend/src/).
//
// TODO (hapus komentar ini setelah dikerjakan):
//   1. Buat komponen DaftarKonsumsi.jsx dan FormKonsumsi.jsx di folder ini.
//   2. Panggil API lewat apiKwitansi (services/sesiKwitansi), mis.
//        apiKwitansi({ url: "api/kwitansi/konsumsi/status" })
//   3. PDF (SPBY + kwitansi) dibuka dengan bukaPdf({ url: ... }).

import { Routes, Route } from "react-router-dom";
import { Coffee } from "lucide-react";
import SegeraHadir from "../../SegeraHadir";

export default function Konsumsi(sesi) {
  void sesi; // dipakai nanti oleh halaman daftar/form
  return (
    <Routes>
      <Route
        index
        element={<SegeraHadir judul="Konsumsi" Ikon={Coffee} keterangan="SPBY dan kwitansi pembelian konsumsi rapat/kegiatan." />}
      />
    </Routes>
  );
}
