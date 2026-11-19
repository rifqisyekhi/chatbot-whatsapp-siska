// =========================================================
// SESI OPERATOR KWITANSI PERJALANAN DINAS
// =========================================================
//
// Token dari /api/kwitansi/login disimpan di localStorage dan dikirim
// sebagai Authorization: Bearer. Server menolak token kedaluwarsa
// (12 jam) dengan 401; saat itu sesi dihapus dan halaman kembali ke
// form login.

import { apiTU } from "./ApiTU";

const KUNCI = "kwitansi-sesi";

export function bacaSesi() {
  try {
    const s = JSON.parse(localStorage.getItem(KUNCI) || "null");
    return s?.token ? s : null;
  } catch {
    return null;
  }
}

export function simpanSesi(sesi) {
  try {
    localStorage.setItem(KUNCI, JSON.stringify(sesi));
  } catch {
    // storage diblokir — sesi hanya hidup selama halaman terbuka
  }
}

export function hapusSesi() {
  try {
    localStorage.removeItem(KUNCI);
  } catch {
    // abaikan
  }
}

export async function masuk(username, password) {
  const sesi = await apiTU({ url: "api/kwitansi/login", method: "POST", options: { body: { username, password } } });
  simpanSesi(sesi);
  return sesi;
}

// apiTU dengan token. 401 = sesi habis: dihapus, lalu halaman dimuat ulang
// supaya form login muncul.
export async function apiKwitansi({ url, method = "GET", body }) {
  const sesi = bacaSesi();
  try {
    return await apiTU({ url, method, token: sesi?.token, options: body !== undefined ? { body } : {} });
  } catch (e) {
    if (/sesi habis/i.test(e.message || "")) {
      hapusSesi();
      window.location.reload();
    }
    throw e;
  }
}

// PDF diambil sebagai blob (butuh header token), lalu dibuka di tab baru.
// Jendela dibuka lebih dulu, di dalam klik, supaya tidak diblokir.
export async function bukaPdf({ url, method = "GET", body }) {
  const jendela = window.open("", "_blank");
  try {
    const base = (import.meta.env.VITE_API_TU || "").replace(/\/$/, "");
    const res = await fetch(`${base}/${url.replace(/^\//, "")}`, {
      method,
      headers: {
        Authorization: `Bearer ${bacaSesi()?.token || ""}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Error: ${res.status}`);
    }
    const href = URL.createObjectURL(await res.blob());
    if (jendela) jendela.location.href = href;
    else window.location.href = href;
  } catch (e) {
    if (jendela) jendela.close();
    throw e;
  }
}
