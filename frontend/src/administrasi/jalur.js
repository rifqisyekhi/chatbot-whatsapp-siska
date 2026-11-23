// Alamat induk Administrasi Rokeu. Semua fitur ada di bawahnya:
//   /administrasi/<slug-fitur>/...
// Di VPS seluruhnya dibuka lewat :8005 (deploy/nginx/siska-8005-administrasi.conf).

export const DASAR = "/administrasi";

// jalur("perjalanan-dinas", "baru") → "/administrasi/perjalanan-dinas/baru"
export const jalur = (slug, ...sisa) => [DASAR, slug, ...sisa].filter((x) => x !== "" && x != null).join("/");
