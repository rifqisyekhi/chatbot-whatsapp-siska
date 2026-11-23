// =========================================================
// FITUR LANGGANAN APLIKASI — DIKERJAKAN ANAK MAGANG
// (branch magang/langganan-aplikasi)
// =========================================================
//
// Halaman ini sudah tersambung ke menu sidebar "Langganan Aplikasi" dan
// alamat /administrasi/langganan-aplikasi/... . Kerjakan SEMUA tampilan fitur
// ini di folder ini saja (frontend/src/administrasi/fitur/langganan-aplikasi/),
// dan API-nya di features/fitur/langganan-aplikasi/.
// Panduan lengkap: PANDUAN-MAGANG.md
//
// Props `sesi` berisi `operator` — operator.peran: "operator" |
// "bendahara" | "admin", operator.bidang: "BMN" | "PTUK" | "TU" | ...
// Bendahara hanya boleh melihat (sembunyikan tombol ubah/hapus).
//
// Sub-halaman diatur dengan <Routes> RELATIF terhadap
// /administrasi/langganan-aplikasi:
//   index  → daftar        "baru" → form baru        ":id" → ubah
//
// Contoh lengkap yang sudah jadi: ../perjalanan-dinas (KwitansiDashboard
// dan KwitansiPerdin di frontend/src/).
//
// TODO (hapus komentar ini setelah dikerjakan):
//   1. Buat komponen DaftarLangganan.jsx dan FormLangganan.jsx di folder ini.
//   2. Panggil API lewat apiKwitansi (services/sesiKwitansi), mis.
//        apiKwitansi({ url: "api/kwitansi/langganan-aplikasi/status" })
//   3. PDF (SPBY + kwitansi) dibuka dengan bukaPdf({ url: ... }).

import { Routes, Route } from "react-router-dom";
import { AppWindow } from "lucide-react";
import SegeraHadir from "../../SegeraHadir";

export default function LanggananAplikasi(sesi) {
  void sesi; // dipakai nanti oleh halaman daftar/form
  return (
    <Routes>
      <Route
        index
        element={
          <SegeraHadir
            judul="Langganan Aplikasi"
            Ikon={AppWindow}
            keterangan="SPBY dan kwitansi pembayaran langganan aplikasi/layanan daring."
          />
        }
      />
    </Routes>
  );
}
