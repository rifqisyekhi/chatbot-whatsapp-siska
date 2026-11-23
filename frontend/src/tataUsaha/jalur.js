// Alamat induk Dashboard Tata Usaha Rokeu. Semua fitur ada di bawahnya:
//   /tata-usaha/<slug-fitur>/...
// Di VPS seluruhnya dibuka lewat :8005 (deploy/nginx/siska-8005-tata-usaha.conf).

export const DASAR = "/tata-usaha";

// jalur("perjalanan-dinas", "baru") → "/tata-usaha/perjalanan-dinas/baru"
export const jalur = (slug, ...sisa) => [DASAR, slug, ...sisa].filter((x) => x !== "" && x != null).join("/");
