// =========================================================
// SERVER PENGEMBANGAN DASHBOARD TATA USAHA (TANPA BOT WHATSAPP)
// =========================================================
//
// Menyalakan hanya API Dashboard Tata Usaha (/api/kwitansi/..., termasuk
// fitur di features/fitur/) dan halaman web hasil build (public/), tanpa
// WhatsApp, Chromium, atau pengingat. Untuk anak magang yang mengerjakan
// fitur di laptop sendiri.
//
//   npm run dev:tu                → http://localhost:3999/tata-usaha
//   PORT_DEV_TU=4000 npm run dev:tu
//
// Butuh DATABASE_URL di .env (database Postgres SisKA). Untuk mengubah
// tampilan sambil melihat hasilnya langsung, jalankan juga
//   cd frontend && VITE_PROXY_TARGET=http://localhost:3999 npm run dev

require("dotenv").config({ quiet: true });
const path = require("path");
const express = require("express");
const { pasangRuteKwitansi } = require("../features/ruteKwitansi");

const PORT = Number(process.env.PORT_DEV_TU || 3999);
const PUBLIK = path.join(__dirname, "..", "public");

const app = express();
app.use(express.json({ limit: "20mb" }));
pasangRuteKwitansi(app);
app.use(express.static(PUBLIK));
app.use("/assets", express.static(path.join(__dirname, "..", "assets")));
// Fallback SPA: path halaman (tanpa titik) dijawab index.html.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.includes(".")) return next();
  // dotfiles: path proyek bisa berada di folder bertitik (mis. .claude/).
  res.sendFile(path.join(PUBLIK, "index.html"), { dotfiles: "allow" });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[DEV TU] Dashboard Tata Usaha: http://localhost:${PORT}/tata-usaha`);
});
