import { useEffect, useState } from "react";
import logoKemnaker from "./assets/logo-kemnaker.png";
import { AlertTriangle, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { apiKwitansi, bacaSesi, hapusSesi, masuk, simpanSesi } from "./services/sesiKwitansi";

// =========================================================
// GERBANG LOGIN PERJALANAN DINAS
// =========================================================
//
// Membungkus Administrasi Rokeu: tanpa sesi sah, yang tampil form
// login. Akun sementara: nomor telepon (WhatsApp) di Master Data SISKA
// sebagai nama pengguna sekaligus kata sandi. Hanya operator bidang yang
// bisa masuk. Anak menerima `operator` dan `keluar` lewat fungsi render.
//
// Tampilan form meniru halaman login Presensi Non-ASN supaya pegawai
// melihat pintu masuk yang sama di semua aplikasi Biro.

const NOMOR_BOT_SISKA = import.meta.env.VITE_NOMOR_BOT_SISKA || "6285122777026";
const KUNCI_INGAT = "kwitansi-ingat-nomor";

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

function bacaIngat() {
  try {
    return localStorage.getItem(KUNCI_INGAT) || "";
  } catch {
    return "";
  }
}

function FormMasuk({ onMasuk }) {
  const [usn, setUsn] = useState(bacaIngat);
  const [pw, setPw] = useState("");
  const [lihatPw, setLihatPw] = useState(false);
  const [ingat, setIngat] = useState(true);
  const [galat, setGalat] = useState("");
  const [proses, setProses] = useState(false);

  const kirim = async (e) => {
    e.preventDefault();
    setProses(true);
    setGalat("");
    try {
      const sesi = await masuk(usn, pw);
      try {
        if (ingat) localStorage.setItem(KUNCI_INGAT, usn);
        else localStorage.removeItem(KUNCI_INGAT);
      } catch {
        // storage diblokir — tidak apa-apa
      }
      onMasuk(sesi);
    } catch (err) {
      setGalat(err.message || "Gagal masuk");
    } finally {
      setProses(false);
    }
  };

  const kelasInput =
    "w-full bg-paper border border-mist px-4 py-3 rounded-xl text-xs sm:text-sm text-navy outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all font-medium placeholder:text-slate-400";

  return (
    <div className="min-h-screen w-full bg-paper flex items-center justify-center p-0 md:p-6 lg:p-10 font-sans text-navy">
      <div className="w-full min-h-screen md:min-h-[640px] max-w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[32px] md:shadow-xl md:border md:border-mist overflow-hidden flex flex-col md:grid md:grid-cols-12">
        {/* ---------- Sisi kiri (desktop) ---------- */}
        <div className="hidden md:flex md:col-span-5 bg-gradient-to-br from-navy via-[#1e4d79] to-brand text-white p-8 lg:p-12 flex-col justify-between relative overflow-hidden select-none">
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
            viewBox="0 0 400 600"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="50" cy="200" r="220" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="200" r="280" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="200" r="340" stroke="white" strokeWidth="1.5" />
            <circle cx="50" cy="200" r="400" stroke="white" strokeWidth="1.5" />
          </svg>
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-brand/30 blur-2xl pointer-events-none" />

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 p-2 flex items-center justify-center shadow-inner">
              <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain drop-shadow-xs" />
            </div>
          </div>

          <div className="relative z-10 my-auto py-8">
            <div className="text-3xl text-yellow mb-2">✦</div>
            <h1 className="text-3xl lg:text-4xl font-black text-white leading-[1.15] tracking-tight">
              Halo <br />
              Pegawai! <span className="inline-block animate-bounce">👋</span>
            </h1>
            <p className="text-white/80 text-xs lg:text-sm mt-4 leading-relaxed max-w-xs font-normal">
              Administrasi Rokeu, Biro Keuangan dan BMN. Susun SPBY, kwitansi, dan SPJ perjalanan dinas maupun
              pengeluaran lain per bidang, langsung jadi PDF.
            </p>
          </div>

          <div className="relative z-10 text-[11px] text-white/60 font-medium">
            © {new Date().getFullYear()} Biro Keuangan dan BMN Kemnaker RI.
          </div>
        </div>

        {/* ---------- Banner atas (ponsel) ---------- */}
        <div className="block md:hidden bg-gradient-to-br from-navy via-[#1e4d79] to-brand text-white pt-8 pb-7 px-6 relative shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/20 p-1.5 border border-white/25 flex items-center justify-center shadow-inner shrink-0">
              <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 bg-white/15 px-2 py-0.5 rounded-full inline-block">
                Administrasi Rokeu
              </span>
              <p className="text-[11px] text-white/75 font-medium mt-0.5">Biro Keuangan dan BMN</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold mt-1">Selamat Datang 👋</h1>
          <p className="text-xs text-white/80 mt-0.5">Masuk untuk mengelola SPJ dan pengeluaran bidang Anda.</p>
        </div>

        {/* ---------- Sisi kanan: form ---------- */}
        <div className="w-full md:col-span-7 bg-white p-6 sm:p-8 lg:p-12 flex flex-col justify-between relative flex-1">
          <div className="hidden md:flex items-center justify-between pb-3 border-b border-mist/80 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-paper p-1.5 border border-mist flex items-center justify-center">
                <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-navy leading-tight">Administrasi Rokeu</h2>
                <p className="text-[10px] text-slate-400">Biro Keuangan dan BMN</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 bg-paper px-2.5 py-1 rounded-lg border border-mist">
              Kemnaker RI
            </span>
          </div>

          <div className="my-auto py-2">
            <div className="mb-6">
              <h2 className="text-2xl lg:text-3xl font-extrabold text-navy tracking-tight">Selamat Datang!</h2>
            </div>

            {galat && (
              <div className="mb-5 p-3.5 bg-red-50 text-red-700 text-xs sm:text-sm font-semibold rounded-2xl border border-red-200 flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <span>{galat}</span>
              </div>
            )}

            <form onSubmit={kirim} className="space-y-4">
              <div>
                <label className="block text-navy text-xs font-bold mb-1.5">Nomor WhatsApp / Telepon</label>
                <input
                  type="text"
                  inputMode="tel"
                  autoComplete="username"
                  value={usn}
                  onChange={(e) => setUsn(e.target.value)}
                  required
                  autoFocus
                  placeholder="Contoh: 08123456789 atau 62812..."
                  className={kelasInput}
                />
              </div>

              <div>
                <label className="block text-navy text-xs font-bold mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={lihatPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    required
                    placeholder="Masukkan password Anda"
                    className={`${kelasInput} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setLihatPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy cursor-pointer transition-colors p-1"
                    title={lihatPw ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {lihatPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={ingat}
                    onChange={(e) => setIngat(e.target.checked)}
                    className="mr-2 w-4 h-4 rounded border-mist accent-brand cursor-pointer"
                  />
                  Ingat nomor saya di perangkat ini
                </label>
              </div>

              <button
                type="submit"
                disabled={proses}
                className="w-full bg-navy hover:bg-brand text-white py-3.5 rounded-xl font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                {proses ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Memproses Masuk...</span>
                  </>
                ) : (
                  <span>Masuk Sekarang</span>
                )}
              </button>
            </form>
          </div>

          <div className="pt-4 text-center text-xs text-slate-500">
            Belum terdaftar sebagai operator atau lupa password?{" "}
            <a
              href={`https://wa.me/${NOMOR_BOT_SISKA}?text=menu`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-brand hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Chatbot SisKA</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
