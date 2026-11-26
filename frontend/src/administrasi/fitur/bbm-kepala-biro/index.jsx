// Fitur BBM: daftar per bidang + form baru/ubah.
// Sub-halaman diatur dengan <Routes> relatif terhadap
// /administrasi/bbm-kepala-biro.

import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import DaftarBbm from "./DaftarBbm";
import FormBbm from "./FormBbm";

function sesuaikanLabelMenu() {
  import("../../menu")
    .then(({ MENU_ADMINISTRASI }) => {
      const item = Array.isArray(MENU_ADMINISTRASI)
        ? MENU_ADMINISTRASI.find((m) => m.slug === "bbm-kepala-biro")
        : null;
      if (item && item.label !== "BBM") {
        item.label = "BBM";
      }
    })
    .catch(() => {});

  if (typeof document !== "undefined") {
    const tautan = document.querySelectorAll('a[href*="/bbm-kepala-biro"]');
    tautan.forEach((el) => {
      el.childNodes.forEach((node) => {
        if (node.nodeType === 3 && /BBM Kepala Biro/i.test(node.nodeValue || "")) {
          node.nodeValue = node.nodeValue.replace(/BBM Kepala Biro/gi, "BBM");
        }
      });
      if (el.getAttribute("title") === "BBM Kepala Biro") el.setAttribute("title", "BBM");
      if (el.getAttribute("aria-label") === "BBM Kepala Biro") el.setAttribute("aria-label", "BBM");
    });
  }
}

sesuaikanLabelMenu();
if (typeof window !== "undefined") {
  window.requestAnimationFrame(sesuaikanLabelMenu);
  setTimeout(sesuaikanLabelMenu, 50);
}

export default function BbmKepalaBiro(sesi) {
  useEffect(() => {
    sesuaikanLabelMenu();
  }, []);

  return (
    <Routes>
      <Route index element={<DaftarBbm {...sesi} />} />
      <Route path=":id" element={<FormBbm {...sesi} />} />
    </Routes>
  );
}
