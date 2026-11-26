// Fitur BBM Kepala Biro: daftar per bidang + form baru/ubah.
// Sub-halaman diatur dengan <Routes> relatif terhadap
// /administrasi/bbm-kepala-biro.

import { Routes, Route } from "react-router-dom";
import DaftarBbm from "./DaftarBbm";
import FormBbm from "./FormBbm";

export default function BbmKepalaBiro(sesi) {
  return (
    <Routes>
      <Route index element={<DaftarBbm {...sesi} />} />
      <Route path=":id" element={<FormBbm {...sesi} />} />
    </Routes>
  );
}
