// =========================================================
// SERVER PENGEMBANGAN ADMINISTRASI ROKEU (TANPA BOT WHATSAPP)
// =========================================================
//
// Menyalakan hanya API Administrasi Rokeu (/api/kwitansi/..., termasuk
// fitur di features/fitur/) dan halaman web hasil build (public/), tanpa
// WhatsApp, Chromium, atau pengingat. Untuk anak magang yang mengerjakan
// fitur di laptop sendiri.
//
//   npm run dev:administrasi                → http://localhost:3999/administrasi
//   PORT_DEV_ADMINISTRASI=4000 npm run dev:administrasi
//
// Butuh DATABASE_URL di .env (database Postgres SisKA). Untuk mengubah
// tampilan sambil melihat hasilnya langsung, jalankan juga
//   cd frontend && VITE_PROXY_TARGET=http://localhost:3999 npm run dev
//
// TANPA LOGIN (khusus laptop pengembang):
//   npm run dev:tanpa-login                       → masuk otomatis sebagai admin
//   npm run dev:tanpa-login -- --peran=operator --bidang=BMN
//   npm run dev:tanpa-login -- --peran=bendahara
// Halaman langsung terbuka tanpa form login. Hanya ada di skrip ini — bot di
// VPS (index.js) tidak pernah memakainya. Data tetap dibaca dari database.

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const express = require("express");
const { pasangRuteKwitansi } = require("../features/ruteKwitansi");
const auth = require("../features/kwitansiAuth");

// --tanpa-login [--peran=admin|operator|bendahara] [--bidang=BMN]
const argumen = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]),
);
const TANPA_LOGIN = Boolean(argumen["tanpa-login"]);
const PERAN = ["admin", "operator", "bendahara"].includes(argumen.peran) ? argumen.peran : "admin";
const BIDANG = PERAN === "operator" ? String(argumen.bidang || "BMN").toUpperCase() : null;
if (PERAN === "operator" && !auth.BIDANG.includes(BIDANG)) {
  console.error(`[DEV ADMINISTRASI] Bidang ${BIDANG} tidak dikenal. Pilih: ${auth.BIDANG.join(", ")}`);
  process.exit(1);
}
const OPERATOR_DEV = { nama: `Pengembang Lokal (${PERAN}${BIDANG ? " " + BIDANG : ""})`, nip: "", peran: PERAN, bidang: BIDANG };

const PORT = Number(process.env.PORT_DEV_ADMINISTRASI || 3999);
const PUBLIK = path.join(__dirname, "..", "public");

const app = express();
app.use(express.json({ limit: "20mb" }));
pasangRuteKwitansi(app);

const halaman = (req) => req.method === "GET" && !req.path.startsWith("/api/") && !req.path.includes(".");

// Mode tanpa login: setiap halaman membawa sesi siap pakai (token sah 12 jam
// untuk OPERATOR_DEV), jadi form login tidak pernah muncul.
if (TANPA_LOGIN) {
  app.use((req, res, next) => {
    if (!halaman(req)) return next();
    const sesi = { token: auth.buatToken(OPERATOR_DEV), operator: OPERATOR_DEV };
    const html = fs
      .readFileSync(path.join(PUBLIK, "index.html"), "utf8")
      .replace("<head>", `<head><script>localStorage.setItem("kwitansi-sesi", ${JSON.stringify(JSON.stringify(sesi))});</script>`);
    res.type("html").send(html);
  });
}

app.use(express.static(PUBLIK));
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));
// Fallback SPA: path halaman (tanpa titik) dijawab index.html.
app.use((req, res, next) => {
  if (!halaman(req)) return next();
  // dotfiles: path proyek bisa berada di folder bertitik (mis. .claude/).
  res.sendFile(path.join(PUBLIK, "index.html"), { dotfiles: "allow" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[DEV ADMINISTRASI] Administrasi Rokeu: http://localhost:${PORT}/administrasi`);
  if (TANPA_LOGIN) console.log(`[DEV ADMINISTRASI] TANPA LOGIN — masuk otomatis sebagai ${OPERATOR_DEV.nama}`);
});
