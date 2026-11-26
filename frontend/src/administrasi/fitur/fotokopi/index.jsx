// =========================================================
// FITUR FOTOKOPI & PENGGANDAAN — ADMINISTRASI ROKEU
// =========================================================

import { Routes, Route } from "react-router-dom";
import DaftarFotokopi from "./DaftarFotokopi";
import FormFotokopi from "./FormFotokopi";

export default function Fotokopi(sesi) {
  return (
    <Routes>
      <Route index element={<DaftarFotokopi {...sesi} />} />
      <Route path="baru" element={<FormFotokopi {...sesi} />} />
      <Route path=":id" element={<FormFotokopi {...sesi} />} />
    </Routes>
  );
}
