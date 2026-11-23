import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { apiKwitansi } from "../services/sesiKwitansi";
import { MENU_TU } from "./menu";
import { jalur } from "./jalur";
import StatistikPerdin from "../StatistikPerdin";

// =========================================================
// DASHBOARD (HALAMAN AWAL /tata-usaha)
// =========================================================
//
// Ringkasan tahun berjalan, grafik monitoring, dan pintu ke tiap fitur. Angka saat ini baru dari
// Perjalanan Dinas (fitur lain belum menyimpan data); kartu fitur yang belum
// jadi ditandai "Segera hadir". Operator melihat bidangnya, bendahara/admin
// semua bidang — sama dengan aturan di server.

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : iso || "-";
};
const hariIni = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

// Fitur yang sudah benar-benar berjalan (sisanya halaman "Segera hadir").
const SUDAH_JADI = new Set(["perjalanan-dinas"]);

function sapaan() {
  const jam = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
  return jam < 11 ? "Selamat pagi" : jam < 15 ? "Selamat siang" : jam < 18 ? "Selamat sore" : "Selamat malam";
}

export default function Beranda({ operator }) {
  const bendahara = operator.peran === "bendahara";
  const semuaBidang = bendahara || operator.peran === "admin";
  const tahun = hariIni().slice(0, 4);
  const [daftar, setDaftar] = useState(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let usang = false;
    apiKwitansi({ url: `api/kwitansi/perjalanan?tahun=${tahun}` })
      .then((r) => !usang && setDaftar(r))
      .catch((e) => !usang && setGalat(e.message || "Gagal memuat ringkasan"));
    return () => {
      usang = true;
    };
  }, [tahun]);

  const ringkas = useMemo(() => {
    const aktif = (daftar || []).filter((d) => d.status === "aktif");
    const bulanIni = hariIni().slice(0, 7);
    return {
      perjalanan: aktif.length,
      peserta: aktif.reduce((a, d) => a + (d.jumlah_peserta || 0), 0),
      total: aktif.reduce((a, d) => a + (Number(d.total) || 0), 0),
      bulanIni: aktif.filter((d) => String(d.tanggal_berangkat).startsWith(bulanIni)).length,
      terbaru: [...aktif].sort((a, b) => String(b.diubah_pada).localeCompare(String(a.diubah_pada))).slice(0, 5),
    };
  }, [daftar]);

  const namaDepan = String(operator.nama || "").split(/[ ,]/)[0];

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      <header className="bg-white border-b border-mist">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight truncate">Dashboard</h1>
            <p className="text-xs text-slate-500 font-medium truncate">
              Dashboard Tata Usaha Rokeu • {semuaBidang ? "Semua bidang" : `Bidang ${operator.bidang}`} • Tahun {tahun}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        {/* Sambutan */}
        <section className="rounded-3xl bg-gradient-to-br from-navy via-[#1e4d79] to-brand text-white p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <p className="text-sm text-white/80 font-semibold">{sapaan()},</p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">{namaDepan || "Pegawai"} 👋</h2>
          <p className="text-sm text-white/80 mt-2 max-w-xl">
            {bendahara
              ? "Pantau SPJ seluruh bidang: perjalanan dinas dan pengeluaran lain, lengkap dengan PDF-nya."
              : "Susun SPBY, kwitansi, dan SPJ bidang Anda dari satu tempat, langsung jadi PDF."}
          </p>
          {!bendahara && (
            <Link
              to={jalur("perjalanan-dinas", "baru")}
              className="mt-5 inline-flex items-center gap-2 bg-white text-navy hover:bg-paper px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> Perjalanan dinas baru
            </Link>
          )}
        </section>

        {/* Ringkasan tahun ini (perjalanan dinas) */}
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <h3 className="text-sm font-extrabold">Ringkasan perjalanan dinas {tahun}</h3>
            <Link to={jalur("perjalanan-dinas")} className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-1">
              Lihat semua <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {galat ? (
            <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold">{galat}</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                ["Perjalanan aktif", ringkas.perjalanan],
                ["Berangkat bulan ini", ringkas.bulanIni],
                ["Jumlah peserta", ringkas.peserta],
                ["Total biaya", rupiah(ringkas.total)],
              ].map(([l, v]) => (
                <div key={l} className="bg-white rounded-2xl border border-mist shadow-2xs p-4">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{l}</p>
                  <p className="text-lg sm:text-2xl font-black tabular-nums mt-1 truncate">
                    {daftar ? v : <Loader2 className="w-5 h-5 text-brand animate-spin" />}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Grafik monitoring */}
        {daftar && (
          <section>
            <h3 className="text-sm font-extrabold mb-3">Grafik monitoring {tahun}</h3>
            <StatistikPerdin daftar={daftar} tahun={tahun} tampilBidang={semuaBidang} />
          </section>
        )}

        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          {/* Kartu fitur */}
          <section>
            <h3 className="text-sm font-extrabold mb-3">Fitur</h3>
            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              {MENU_TU.map((m) => {
                const jadi = SUDAH_JADI.has(m.slug);
                return (
                  <Link
                    key={m.slug}
                    to={m.path}
                    className="group bg-white rounded-2xl border border-mist shadow-2xs p-4 flex gap-3 hover:border-brand/40 hover:shadow-md transition-all"
                  >
                    <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
                      <m.Ikon className="w-5 h-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold">{m.label}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap ${
                            jadi ? "bg-emerald-50 text-emerald-700" : "bg-paper text-slate-500 border border-mist"
                          }`}
                        >
                          {jadi ? "Aktif" : "Segera hadir"}
                        </span>
                      </span>
                      <span className="block text-xs text-slate-500 mt-1">{m.keterangan}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Perjalanan terbaru */}
          <section>
            <h3 className="text-sm font-extrabold mb-3">Terakhir diubah</h3>
            <div className="bg-white rounded-2xl border border-mist shadow-2xs divide-y divide-mist">
              {!daftar ? (
                <div className="p-6 flex justify-center">
                  <Loader2 className="w-5 h-5 text-brand animate-spin" />
                </div>
              ) : !ringkas.terbaru.length ? (
                <p className="p-5 text-sm text-slate-400 font-semibold">Belum ada perjalanan dinas tahun ini.</p>
              ) : (
                ringkas.terbaru.map((d) => (
                  <Link
                    key={d.id}
                    to={jalur("perjalanan-dinas", bendahara ? "" : d.id)}
                    className="block px-4 py-3 hover:bg-paper transition-colors"
                  >
                    <p className="text-sm font-semibold truncate">{d.maksud || "(tanpa nama kegiatan)"}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {semuaBidang ? `${d.bidang} • ` : ""}
                      {d.kota_tujuan} • {tgl(d.tanggal_berangkat)} • {d.jumlah_peserta} orang • {rupiah(d.total)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
