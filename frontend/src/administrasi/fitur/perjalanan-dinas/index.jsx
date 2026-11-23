// Fitur Perjalanan Dinas: daftar per bidang + form baru/ubah.
// Komponen aslinya (KwitansiDashboard, KwitansiPerdin) ada di src/.
// Contoh lengkap untuk fitur lain: sub-halaman diatur dengan <Routes>
// relatif terhadap /administrasi/perjalanan-dinas.

import { Routes, Route } from "react-router-dom";
import KwitansiDashboard from "../../../KwitansiDashboard";
import KwitansiPerdin from "../../../KwitansiPerdin";

export default function PerjalananDinas(sesi) {
  return (
    <Routes>
      <Route index element={<KwitansiDashboard {...sesi} />} />
      <Route path=":id" element={<KwitansiPerdin {...sesi} />} />
    </Routes>
  );
}
