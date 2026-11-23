// =========================================================
// PEMERIKSA LOGIN ADMINISTRASI ROKEU
// =========================================================
//
// Menjelaskan kenapa sebuah nomor bisa/tidak bisa login, langkah demi
// langkah, tanpa menyalakan server:
//
//   npm run cek-login -- 08123456789
//
// Yang dicetak hanya nama & peran (bukan data pribadi lain).

require("dotenv").config({ quiet: true });

const nomor = process.argv[2];
const ok = (t) => console.log(`  [OK]    ${t}`);
const gagal = (t, saran) => {
  console.log(`  [GAGAL] ${t}`);
  if (saran) console.log(`          → ${saran}`);
  process.exit(1);
};

(async () => {
  console.log("Pemeriksaan login Administrasi Rokeu\n");

  if (!nomor) gagal("Nomor belum diisi.", "Jalankan: npm run cek-login -- 08123456789");

  // 1. .env & DATABASE_URL
  const url = process.env.DATABASE_URL;
  if (!url) gagal("DATABASE_URL kosong.", "Buat berkas .env di folder repo (sejajar package.json) berisi DATABASE_URL=...");
  let tujuan = "?";
  try {
    const u = new URL(url);
    tujuan = `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`;
  } catch {
    gagal("DATABASE_URL tidak bisa dibaca.", "Bentuknya: postgresql://user:sandi@127.0.0.1:5433/db_siska");
  }
  ok(`.env terbaca, database ${tujuan}`);

  // 2. Koneksi database
  const { semuaBaris, tutup } = require("../db/kolam");
  try {
    const [r] = await semuaBaris("SELECT count(*)::int AS n FROM pegawai");
    ok(`Database tersambung, ${r.n} pegawai di Master Data`);
  } catch (err) {
    gagal(
      `Database tidak bisa dihubungi: ${err.message}`,
      "Kalau memakai database VPS, pastikan SSH tunnel menyala: ssh -N -L 5433:127.0.0.1:5432 support@192.168.221.44",
    );
  }

  // 3. Nomor → pegawai
  const auth = require("../features/kwitansiAuth");
  const dbPegawai = require("../db/pegawai");
  const usn = auth.nomorBaku(nomor);
  if (usn.length < 9) gagal(`Nomor "${nomor}" terlalu pendek.`, "Pakai nomor WA lengkap, mis. 08123456789");
  const p = await dbPegawai.satuPerWaAtauNol(usn);
  if (!p) {
    await tutup();
    gagal(`Nomor ${usn} tidak ada di kolom nomor WA Master Data.`, "Cek/isi nomor WA pegawai itu di Master Data Pegawai (:8006/pegawai).");
  }
  ok(`Nomor ditemukan: ${p.nama}`);

  // 4. Peran
  const admin = String(process.env.KWITANSI_ADMIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log(`          KWITANSI_ADMIN berisi ${admin.length} entri${admin.length ? ` (${admin.map((a) => `${a.length} digit`).join(", ")})` : ""}`);
  const peran = auth.peranPegawai(p);
  await tutup();
  if (!peran) {
    gagal(
      `${p.nama} bukan operator, bendahara, atau admin.`,
      "Tambahkan NIP atau nomor WA orang ini ke KWITANSI_ADMIN di .env (tanpa spasi), lalu jalankan ulang server.",
    );
  }
  ok(`Peran: ${peran.peran}${peran.bidang ? ` bidang ${peran.bidang}` : " (semua bidang)"}`);

  console.log(`\nBisa login: username dan password = ${nomor}`);
  console.log("Kalau di browser tetap gagal: jalankan ulang npm run dev:administrasi (ambil .env terbaru),");
  console.log("dan kalau memakai Vite, pastikan $env:VITE_PROXY_TARGET=\"http://localhost:3999\" sudah diisi.");
})().catch((err) => {
  console.error("Pemeriksaan berhenti:", err.message);
  process.exit(1);
});
