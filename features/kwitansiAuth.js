// =========================================================
// LOGIN OPERATOR KWITANSI PERJALANAN DINAS
// =========================================================
//
// AKUN SEMENTARA: nama pengguna dan kata sandi sama-sama nomor
// WhatsApp/telepon pegawai di Master Data SISKA (08… atau 62…).
// Ini bukan pengamanan yang kuat — nomor telepon mudah diketahui
// rekan kerja — dan perlu diganti kata sandi sungguhan sebelum
// dibuka ke luar jaringan kantor.
//
// Hanya pegawai yang terdaftar sebagai operator di bawah ini yang
// bisa masuk. Operator hanya melihat dan mengubah perjalanan dinas
// bidangnya sendiri. Admin (KWITANSI_ADMIN di .env: daftar NIP atau
// nomor WA dipisah koma) melihat semua bidang.
//
// Token tanpa status: payload JSON + HMAC-SHA256, berlaku 12 jam.
// Kunci HMAC dari KWITANSI_RAHASIA; kalau kosong diturunkan dari
// DATABASE_URL supaya tetap sama setelah server direstart.

const crypto = require("crypto");
const dbPegawai = require("../db/pegawai");

// Operator per bidang (nama persis seperti di Master Data).
const OPERATOR = [
  { bidang: "BMN", nama: "Gadis Sukma Dewa, S.Ak." },
  { bidang: "PTUK", nama: "Nofitra Dwi Yulyanto, A.Md. M." },
  { bidang: "TU", nama: "Siti Nurhabibah. S.Pd." },
  { bidang: "AKLAP", nama: "Wikan Nurcahyanti, S.E." },
  { bidang: "PA", nama: "Rachmawati, S.E." },
];

// Kode bidang = isi kolom sub_unit di Master Data.
const BIDANG = OPERATOR.map((o) => o.bidang);

const UMUR_TOKEN_MS = 12 * 60 * 60 * 1000;
const rapat = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// "0812-3456 789", "+62 812…", "812…" → "62812…"
function nomorBaku(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

function kunci() {
  return (
    process.env.KWITANSI_RAHASIA ||
    crypto.createHash("sha256").update(`kwitansi-perdin:${process.env.DATABASE_URL || ""}`).digest("hex")
  );
}

const b64 = (s) => Buffer.from(s).toString("base64url");
const tanda = (isi) => crypto.createHmac("sha256", kunci()).update(isi).digest("base64url");

function buatToken(operator) {
  const isi = b64(JSON.stringify({ ...operator, exp: Date.now() + UMUR_TOKEN_MS }));
  return `${isi}.${tanda(isi)}`;
}

function bacaToken(token) {
  const [isi, sig] = String(token || "").split(".");
  if (!isi || !sig) return null;
  const harus = tanda(isi);
  if (sig.length !== harus.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(harus))) return null;
  try {
    const data = JSON.parse(Buffer.from(isi, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function daftarAdmin() {
  return String(process.env.KWITANSI_ADMIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Peran pegawai di kwitansi, atau null kalau bukan operator/admin.
function peranPegawai(p) {
  const admin = daftarAdmin();
  const nip = String(p.nip || "").replace(/\s+/g, "");
  if (admin.some((a) => a.replace(/\s+/g, "") === nip || nomorBaku(a) === nomorBaku(p.no_wa))) {
    return { peran: "admin", bidang: null };
  }
  const op = OPERATOR.find((o) => rapat(o.nama) === rapat(p.nama));
  return op ? { peran: "operator", bidang: op.bidang } : null;
}

// Pembatas percobaan sederhana per IP: 10 kali gagal per 15 menit.
const gagal = new Map();
function terlaluSering(ip) {
  const now = Date.now();
  const c = (gagal.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  gagal.set(ip, c);
  return c.length >= 10;
}

async function login(req, res) {
  const ip = req.ip || "?";
  if (terlaluSering(ip)) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." });

  const usn = nomorBaku(req.body?.username);
  const pw = nomorBaku(req.body?.password);
  const tolak = (pesan = "Nomor telepon atau kata sandi salah.") => {
    gagal.get(ip).push(Date.now());
    res.status(401).json({ error: pesan });
  };
  if (usn.length < 9 || usn !== pw) return tolak();

  let p;
  try {
    p = await dbPegawai.satuPerWaAtauNol(usn);
  } catch (err) {
    console.error("[KWITANSI] Gagal mencari pegawai untuk login:", err?.message || err);
    return res.status(500).json({ error: "Gagal memeriksa akun" });
  }
  if (!p || nomorBaku(p.no_wa) !== usn) return tolak();

  const peran = peranPegawai(p);
  if (!peran) return tolak(`${p.nama} belum terdaftar sebagai operator kwitansi.`);

  const operator = { nama: p.nama, nip: String(p.nip || "").replace(/\s+/g, ""), ...peran };
  res.json({ token: buatToken(operator), operator });
}

// Middleware: menolak permintaan tanpa token sah, mengisi req.operator.
function wajibLogin(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  const op = m && bacaToken(m[1]);
  if (!op) return res.status(401).json({ error: "Sesi habis, silakan masuk lagi." });
  req.operator = op;
  next();
}

// Operator hanya boleh menyentuh bidangnya; admin semua.
const bolehBidang = (op, bidang) => op.peran === "admin" || op.bidang === bidang;

module.exports = { OPERATOR, BIDANG, login, wajibLogin, bolehBidang, buatToken, nomorBaku };
