import { useEffect, useState } from "react";
import logoKemnaker from "./assets/logo-kemnaker.png";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { apiKwitansi, bacaSesi, hapusSesi, masuk, simpanSesi } from "./services/sesiKwitansi";

// =========================================================
// GERBANG LOGIN KWITANSI PERJALANAN DINAS
// =========================================================
//
// Membungkus halaman kwitansi: tanpa sesi sah, yang tampil form login.
// Akun sementara: nomor telepon (WhatsApp) di Master Data SISKA sebagai
// nama pengguna sekaligus kata sandi. Hanya operator bidang yang bisa
// masuk. Anak menerima `operator` dan `keluar` lewat fungsi render.

export default function KwitansiMasuk({ children }) {
  const [sesi, setSesi] = useState(bacaSesi);
  const [memeriksa, setMemeriksa] = useState(!!bacaSesi());

  // Sesi tersimpan diperiksa ulang ke server (token bisa kedaluwarsa).
  useEffect(() => {
    if (!bacaSesi()) return;
    apiKwitansi({ url: "api/kwitansi/saya" })
      .then((r) => {
        const s = { ...bacaSesi(), operator: r.operator };
        simpanSesi(s);
        setSesi(s);
      })
      .catch(() => {
        hapusSesi();
        setSesi(null);
      })
      .finally(() => setMemeriksa(false));
  }, []);

  const keluar = () => {
    hapusSesi();
    setSesi(null);
  };

  if (memeriksa) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    );
  }
  if (!sesi) return <FormMasuk onMasuk={setSesi} />;
  return children({ operator: sesi.operator, keluar });
}

function FormMasuk({ onMasuk }) {
  const [usn, setUsn] = useState("");
  const [pw, setPw] = useState("");
  const [galat, setGalat] = useState("");
  const [proses, setProses] = useState(false);

  const kirim = async (e) => {
    e.preventDefault();
    setProses(true);
    setGalat("");
    try {
      onMasuk(await masuk(usn, pw));
    } catch (err) {
      setGalat(err.message || "Gagal masuk");
    } finally {
      setProses(false);
    }
  };

  const kelasInput =
    "w-full px-4 py-3 rounded-xl bg-paper/60 focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

  return (
    <div className="min-h-screen bg-paper font-sans text-navy flex items-center justify-center px-4">
      <form onSubmit={kirim} className="w-full max-w-sm bg-white rounded-3xl border border-mist shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-paper border border-mist flex items-center justify-center p-1.5 shrink-0">
            <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">Perjalanan Dinas</h1>
            <p className="text-xs text-slate-500 font-medium">Biro Keuangan dan BMN</p>
          </div>
        </div>

        <label className="block mb-4">
          <span className="block text-xs font-bold text-slate-600 mb-1.5">Nomor telepon</span>
          <input
            className={kelasInput}
            inputMode="tel"
            autoComplete="username"
            value={usn}
            onChange={(e) => setUsn(e.target.value)}
            placeholder="08…"
            autoFocus
          />
        </label>
        <label className="block mb-2">
          <span className="block text-xs font-bold text-slate-600 mb-1.5">Kata sandi</span>
          <input
            type="password"
            className={kelasInput}
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </label>
        <p className="text-[11px] text-slate-400 mb-5">
          Akun sementara: kata sandi sama dengan nomor telepon di Master Data SISKA.
        </p>

        {galat && (
          <p className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {galat}
          </p>
        )}

        <button
          type="submit"
          disabled={proses || !usn || !pw}
          className="w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-navy disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
        >
          {proses ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          Masuk
        </button>
      </form>
    </div>
  );
}
