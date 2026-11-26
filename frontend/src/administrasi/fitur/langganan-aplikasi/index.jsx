// Fitur Langganan Aplikasi: daftar per bidang + form baru/ubah.
// Sub-halaman diatur dengan <Routes> relatif terhadap
// /administrasi/langganan-aplikasi.

import { Routes, Route } from "react-router-dom";
import DaftarLangganan from "./DaftarLangganan";
import FormLangganan from "./FormLangganan";

export default function LanggananAplikasi(sesi) {
  return (
    <Routes>
      <Route index element={<DaftarLangganan {...sesi} />} />
      <Route path=":id" element={<FormLangganan {...sesi} />} />
    </Routes>
  );
}
