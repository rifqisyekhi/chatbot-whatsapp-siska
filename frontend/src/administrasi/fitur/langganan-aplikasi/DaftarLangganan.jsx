import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  FileText,
  Pencil,
  Ban,
  RotateCcw,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AppWindow,
  Camera,
  X,
} from "lucide-react";
import { apiKwitansi, bukaPdf } from "../../../services/sesiKwitansi";
import { jalur } from "../../jalur";
import StatistikLangganan from "./StatistikLangganan";

// =========================================================
// DASHBOARD LANGGANAN APLIKASI PER BIDANG
// =========================================================
//
// Daftar langganan aplikasi bidang operator yang masuk (admin/bendahara:
// semua bidang), dengan aksi lihat bukti, cetak PDF SPBY, buka/ubah,
// batalkan/pulihkan, dan hapus. Semua data lewat API (Postgres); galat API
// ditampilkan sebagai pesan merah, tidak pernah dianggap berhasil.

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");
const hariIni = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const BIDANG_BAWAAN = ["BMN", "PTUK", "TU", "AKLAP", "PA"];

const kelasInput =
  "px-3.5 py-2.5 rounded-xl bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

const kelasTombolKotak =
  "w-8 h-8 rounded-xl border border-mist bg-white hover:bg-paper inline-flex items-center justify-center transition-colors cursor-pointer";

export default function DaftarLangganan({ operator }) {
  const bendahara = operator.peran === "bendahara";
  const admin = operator.peran === "admin" || bendahara;
  const tahunIni = Number(hariIni().slice(0, 4));
  const [daftar, setDaftar] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [tahun, setTahun] = useState(String(tahunIni));
  const [status, setStatus] = useState("semua");
  const [cari, setCari] = useState("");
  const [bidang, setBidang] = useState("");
  const [daftarBidang, setDaftarBidang] = useState(BIDANG_BAWAAN);
  const [batal, setBatal] = useState(null);
  const [lihatBukti, setLihatBukti] = useState(null);
  const [lihatUraian, setLihatUraian] = useState(null);
  const [toast, setToast] = useState(null);

  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [putaran, setPutaran] = useState(0);
  const muat = useCallback(() => setPutaran((n) => n + 1), []);

  useEffect(() => {
    let usang = false;
    const q = new URLSearchParams();
    if (tahun) q.set("tahun", tahun);
    if (admin && bidang) q.set("bidang", bidang);
    apiKwitansi({ url: `api/kwitansi/langganan-aplikasi?${q}` })
      .then((r) => {
        if (usang) return;
        setDaftar(Array.isArray(r) ? r : []);
        setGalat("");
      })
      .catch((e) => {
        if (usang) return;
        setDaftar([]);
        setGalat(e.message || "Gagal memuat daftar langganan aplikasi");
      })
      .finally(() => !usang && setMemuat(false));
    return () => {
      usang = true;
    };
  }, [tahun, bidang, admin, putaran]);

  useEffect(() => {
    if (admin) {
      apiKwitansi({ url: "api/kwitansi/saya" })
        .then((r) => {
          if (Array.isArray(r.bidang) && r.bidang.length) setDaftarBidang(r.bidang);
        })
        .catch(() => {});
    }
  }, [admin]);

  const tersaring = useMemo(() => {
    const c = cari.trim().toLowerCase();
    return daftar.filter(
      (d) =>
        (status === "semua" || d.status === status) &&
        (!c ||
          [d.nama_aplikasi, d.penyedia, d.paket, d.keperluan, d.penerima_nama, d.penerima_nip, d.bidang]
            .join(" ")
            .toLowerCase()
            .includes(c)),
    );
  }, [daftar, status, cari]);

  const aktif = daftar.filter((d) => d.status === "aktif");
  const ringkas = {
    aktif: aktif.length,
    batal: daftar.length - aktif.length,
    lisensi: aktif.reduce((a, d) => a + (Number(d.jumlah_lisensi) || 0), 0),
    total: aktif.reduce((a, d) => a + (Number(d.total) || 0), 0),
  };

  // PDF selalu disusun server dari data tersimpan.
  const pdf = async (d) => {
    try {
      await bukaPdf({ url: `api/kwitansi/langganan-aplikasi/${d.id}/pdf` });
    } catch (e) {
      kabari(e.message || "Gagal membuka PDF", "error");
    }
  };

  const bukaModalBukti = async (d) => {
    try {
      const detail = await apiKwitansi({ url: `api/kwitansi/langganan-aplikasi/${d.id}` });
      const lampiran = detail?.isian?.lampiran || [];
      if (!lampiran.length) {
        kabari("Belum ada foto bukti yang diunggah pada data ini", "error");
        return;
      }
      setLihatBukti({ baris: d, lampiran });
    } catch (e) {
      kabari(e.message || "Gagal memuat foto bukti", "error");
    }
  };

  const pulihkan = async (d) => {
    if (!window.confirm(`Pulihkan langganan aplikasi "${d.nama_aplikasi}"?`)) return;
    try {
      await apiKwitansi({
        url: `api/kwitansi/langganan-aplikasi/${d.id}/pulihkan`,
        method: "POST",
        body: {},
      });
      kabari("Langganan aplikasi dipulihkan");
      muat();
    } catch (e) {
      kabari(e.message || "Gagal memulihkan langganan aplikasi", "error");
    }
  };

  const hapus = async (d) => {
    if (
      !window.confirm(
        `Hapus permanen langganan aplikasi "${d.nama_aplikasi}"? Data tidak bisa dikembalikan.`,
      )
    )
      return;
    try {
      await apiKwitansi({ url: `api/kwitansi/langganan-aplikasi/${d.id}`, method: "DELETE" });
      kabari("Langganan aplikasi dihapus");
      muat();
    } catch (e) {
      kabari(e.message || "Gagal menghapus langganan aplikasi", "error");
    }
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold text-navy tracking-tight truncate">
                  {bendahara
                    ? "Monitoring Langganan Aplikasi"
                    : `Langganan Aplikasi ${admin ? "— Semua Bidang" : `— Bidang ${operator.bidang}`}`}
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">
                  {operator.nama} • {bendahara ? "Bendahara" : admin ? "Admin" : "Operator"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            ["Langganan aktif", ringkas.aktif],
            ["Dibatalkan", ringkas.batal],
            ["Jumlah lisensi", ringkas.lisensi],
            ["Total biaya", rupiah(ringkas.total)],
          ].map(([l, v]) => (
            <div key={l} className="bg-white rounded-2xl border border-mist shadow-2xs p-4">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{l}</p>
              <p className="text-lg sm:text-2xl font-black tabular-nums mt-1 truncate">{v}</p>
            </div>
          ))}
        </div>

        {admin && !memuat && !galat && <StatistikLangganan daftar={daftar} tahun={tahun} />}

        <section className="bg-white rounded-3xl border border-mist shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-mist/70">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  className={kelasInput + " w-full pl-10"}
                  placeholder="Cari pegawai, aplikasi, keperluan…"
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {admin && (
                  <select className={kelasInput} value={bidang} onChange={(e) => setBidang(e.target.value)}>
                    <option value="">Semua bidang</option>
                    {daftarBidang.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                )}
                <select className={kelasInput} value={tahun} onChange={(e) => setTahun(e.target.value)}>
                  {[tahunIni + 1, tahunIni, tahunIni - 1].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="">Semua tahun</option>
                </select>
                <select className={kelasInput} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="semua">Semua status</option>
                  <option value="aktif">Aktif</option>
                  <option value="dibatalkan">Dibatalkan</option>
                </select>
                {!bendahara && (
                  <Link
                    to={jalur("langganan-aplikasi", "baru")}
                    className="inline-flex items-center gap-2 bg-brand hover:bg-navy text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Langganan baru
                  </Link>
                )}
              </div>
            </div>

            {galat && (
              <p className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {galat}
              </p>
            )}
          </div>

          {memuat ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 text-brand animate-spin" />
            </div>
          ) : !tersaring.length ? (
            <div className="py-16 text-center text-slate-400">
              <AppWindow className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">
                {daftar.length
                  ? "Tidak ada yang cocok dengan saringan."
                  : bendahara
                    ? "Belum ada langganan aplikasi pada tahun ini."
                    : 'Belum ada langganan aplikasi. Klik "Langganan baru".'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="text-center text-[11px] uppercase tracking-wider text-slate-500 border-b border-mist bg-paper/40">
                    <th className="py-3.5 px-4 font-bold text-center w-14">NO</th>
                    <th className="py-3.5 px-4 font-bold text-center">PEGAWAI</th>
                    <th className="py-3.5 px-4 font-bold text-center">TANGGAL</th>
                    <th className="py-3.5 px-4 font-bold text-center">APLIKASI</th>
                    <th className="py-3.5 px-4 font-bold text-center">BIAYA</th>
                    <th className="py-3.5 px-4 font-bold text-center">URAIAN</th>
                    <th className="py-3.5 px-4 font-bold text-center">FOTO</th>
                    <th className="py-3.5 px-4 font-bold text-center">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist/60">
                  {tersaring.map((d, idx) => {
                    const batalkan = d.status === "dibatalkan";
                    const tglBayar = d.tanggal_bayar || d.tanggal_mulai || "-";
                    return (
                      <tr
                        key={d.id}
                        className={`align-middle hover:bg-paper/40 transition-colors ${
                          batalkan ? "bg-slate-50/70 text-slate-400" : ""
                        }`}
                      >
                        <td className="py-3.5 px-4 text-center text-xs font-semibold text-slate-400">
                          {idx + 1}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="inline-flex flex-col items-center justify-center">
                            <p className={`text-sm font-bold text-navy leading-snug ${batalkan ? "line-through text-slate-400" : ""}`}>
                              {d.penerima_nama || "-"}
                            </p>
                            <span className="mt-1 inline-flex items-center justify-center min-w-[44px] px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide">
                              {d.bidang || "TU"}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <p className="text-sm font-semibold text-slate-700">{tglBayar}</p>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <p className="text-sm font-extrabold text-navy">{d.nama_aplikasi || "-"}</p>
                        </td>

                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="text-sm font-extrabold text-navy tabular-nums">
                            {rupiah(d.total)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center max-w-[260px]">
                          <button
                            type="button"
                            onClick={() => setLihatUraian(d)}
                            title="Klik untuk melihat uraian lengkap"
                            className="text-sm text-slate-600 hover:text-brand line-clamp-2 mx-auto cursor-pointer transition-colors"
                          >
                            {d.keperluan || `Pembayaran langganan ${d.nama_aplikasi || "aplikasi"}`}
                          </button>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => bukaModalBukti(d)}
                              title="Lihat foto bukti pembelian"
                              className={kelasTombolKotak + " text-brand hover:text-navy"}
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => pdf(d)}
                              title="Buka PDF SPBY"
                              className={kelasTombolKotak + " text-purple-600 hover:text-purple-700"}
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {!bendahara && (
                              <>
                                {batalkan ? (
                                  <button
                                    type="button"
                                    title="Pulihkan"
                                    onClick={() => pulihkan(d)}
                                    className={kelasTombolKotak + " text-slate-500 hover:text-navy"}
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    title="Batalkan"
                                    onClick={() => setBatal(d)}
                                    className={kelasTombolKotak + " text-slate-500 hover:text-amber-600"}
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                )}

                                {!batalkan && (
                                  <Link
                                    to={jalur("langganan-aplikasi", d.id)}
                                    title="Ubah"
                                    className={kelasTombolKotak + " text-slate-500 hover:text-navy"}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Link>
                                )}

                                <button
                                  type="button"
                                  title="Hapus"
                                  onClick={() => hapus(d)}
                                  className={kelasTombolKotak + " text-slate-400 hover:text-rose-600"}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {lihatUraian && (
        <ModalUraian
          baris={lihatUraian}
          tutup={() => setLihatUraian(null)}
        />
      )}

      {lihatBukti && (
        <ModalBukti
          baris={lihatBukti.baris}
          lampiran={lihatBukti.lampiran}
          tutup={() => setLihatBukti(null)}
        />
      )}

      {batal && (
        <ModalBatal
          baris={batal}
          tutup={() => setBatal(null)}
          selesai={() => {
            setBatal(null);
            kabari("Langganan aplikasi dibatalkan");
            muat();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border bg-white border-mist text-navy">
          {toast.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-green" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600" />
          )}
          <span className="text-xs font-bold">{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function ModalUraian({ baris, tutup }) {
  useEffect(() => {
    const tombol = (e) => {
      if (e.key === "Escape") tutup();
    };
    document.addEventListener("keydown", tombol);
    return () => document.removeEventListener("keydown", tombol);
  }, [tutup]);

  const isiUraian = baris.keperluan || `Pembayaran langganan ${baris.nama_aplikasi || "aplikasi"}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={tutup}
    >
      <div
        className="w-full max-w-[300px] bg-white rounded-2xl shadow-xl border border-mist overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3.5 py-2.5 border-b border-mist flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xs font-extrabold text-navy truncate">Detail Uraian</h2>
            <p className="text-[11px] text-slate-400 truncate">
              {baris.nama_aplikasi} {baris.penerima_nama ? `• ${baris.penerima_nama}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={tutup}
            className="w-6 h-6 rounded-lg border border-mist bg-white hover:bg-paper inline-flex items-center justify-center text-slate-400 hover:text-navy cursor-pointer shrink-0"
            title="Tutup"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 bg-paper/40">
          <div className="rounded-xl border border-mist bg-white px-3 py-2.5 text-xs text-navy leading-relaxed whitespace-pre-wrap break-words">
            {isiUraian}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalBukti({ baris, lampiran, tutup }) {
  const [indeks, setIndeks] = useState(0);
  const aktif = lampiran[indeks] || lampiran[0] || {};

  useEffect(() => {
    const tombol = (e) => {
      if (e.key === "Escape") tutup();
      if (e.key === "ArrowRight" && lampiran.length > 1) setIndeks((i) => (i + 1) % lampiran.length);
      if (e.key === "ArrowLeft" && lampiran.length > 1) setIndeks((i) => (i - 1 + lampiran.length) % lampiran.length);
    };
    document.addEventListener("keydown", tombol);
    return () => document.removeEventListener("keydown", tombol);
  }, [tutup, lampiran.length]);

  return (
    <div
      className="fixed inset-0 z-50 bg-navy/50 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6"
      onClick={tutup}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] flex flex-col bg-white rounded-3xl shadow-2xl border border-mist overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-mist flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold text-navy truncate">Foto Bukti Pembelian</h2>
            <p className="text-xs text-slate-500 truncate">
              {baris.nama_aplikasi} {baris.penerima_nama ? `• ${baris.penerima_nama}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={tutup}
            className="w-8 h-8 rounded-xl border border-mist bg-white hover:bg-paper inline-flex items-center justify-center text-slate-500 hover:text-navy cursor-pointer shrink-0"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex-1 min-h-0 flex flex-col items-center justify-center bg-paper/50">
          <div className="w-full flex-1 min-h-0 flex items-center justify-center rounded-2xl border border-mist bg-white p-2 overflow-hidden">
            <img
              src={aktif.dataUrl}
              alt={aktif.nama || `Bukti ${indeks + 1}`}
              className="max-w-full max-h-[58vh] w-auto h-auto object-contain rounded-xl mx-auto"
            />
          </div>

          <div className="w-full mt-2.5 px-1 flex items-center justify-between gap-2 shrink-0">
            <p className="text-xs font-semibold text-slate-500 truncate flex-1 text-center">
              {aktif.nama || `Bukti ${indeks + 1}`}
            </p>
            {lampiran.length > 1 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIndeks((i) => (i - 1 + lampiran.length) % lampiran.length)}
                  className="px-2.5 py-1 rounded-lg border border-mist bg-white hover:bg-paper text-xs font-bold text-navy cursor-pointer"
                >
                  ‹
                </button>
                <span className="text-xs font-bold text-slate-500 tabular-nums">
                  {indeks + 1}/{lampiran.length}
                </span>
                <button
                  type="button"
                  onClick={() => setIndeks((i) => (i + 1) % lampiran.length)}
                  className="px-2.5 py-1 rounded-lg border border-mist bg-white hover:bg-paper text-xs font-bold text-navy cursor-pointer"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalBatal({ baris, tutup, selesai }) {
  const [alasan, setAlasan] = useState("");
  const [tanggal, setTanggal] = useState(hariIni());
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState("");

  const kirim = async () => {
    setProses(true);
    setGalat("");
    try {
      await apiKwitansi({
        url: `api/kwitansi/langganan-aplikasi/${baris.id}/batal`,
        method: "POST",
        body: { alasan, tanggal },
      });
      selesai();
    } catch (e) {
      setGalat(e.message || "Gagal membatalkan langganan aplikasi");
      setProses(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-navy/40 flex items-center justify-center px-4 py-6"
      onClick={tutup}
    >
      <div
        className="w-full max-w-md max-h-full overflow-y-auto bg-white rounded-3xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-extrabold">Batalkan langganan aplikasi</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {baris.nama_aplikasi} {baris.penerima_nama ? `• ${baris.penerima_nama}` : ""}
            </p>
          </div>
          <button onClick={tutup} className="p-1.5 rounded-lg hover:bg-paper cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block mb-3">
          <span className="block text-xs font-bold text-slate-600 mb-1.5">Alasan pembatalan</span>
          <textarea
            rows={2}
            className={kelasInput + " w-full"}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
          />
        </label>

        <label className="block mb-4">
          <span className="block text-xs font-bold text-slate-600 mb-1.5">Tanggal pembatalan</span>
          <input
            type="date"
            className={kelasInput + " w-full"}
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
          />
        </label>

        {galat && <p className="mb-3 text-xs font-semibold text-rose-600">{galat}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={tutup}
            className="px-4 py-2.5 rounded-xl border border-mist text-sm font-bold text-slate-600 hover:bg-paper cursor-pointer"
          >
            Tidak
          </button>
          <button
            onClick={kirim}
            disabled={proses || !alasan.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-sm font-bold cursor-pointer"
          >
            {proses && <Loader2 className="w-4 h-4 animate-spin" />} Batalkan
          </button>
        </div>
      </div>
    </div>
  );
}
