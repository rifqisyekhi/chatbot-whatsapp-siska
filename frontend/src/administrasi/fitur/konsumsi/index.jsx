// =========================================================
// FITUR KONSUMSI — ADMINISTRASI ROKEU
// =========================================================

import { Routes, Route } from "react-router-dom";
import DaftarKonsumsi from "./DaftarKonsumsi";
import FormKonsumsi from "./FormKonsumsi";

export default function Konsumsi(sesi) {
  return (
    <Routes>
      <Route index element={<DaftarKonsumsi {...sesi} />} />
      <Route path="baru" element={<FormKonsumsi {...sesi} />} />
      <Route path=":id" element={<FormKonsumsi {...sesi} />} />
    </Routes>
  );
}
