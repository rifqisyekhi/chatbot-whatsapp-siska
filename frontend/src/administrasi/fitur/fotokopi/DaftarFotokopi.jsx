import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  FileText,
  Pencil,
  Ban,
  Trash2,
  Loader2,
  AlertCircle,
  Eye,
  RotateCcw,
  Printer,
  X,
  Sparkles,
} from "lucide-react";
import { apiKwitansi, bukaPdf } from "../../../services/sesiKwitansi";
import { jalur } from "../../jalur";

// =========================================================
// DAFTAR FOTOKOPI & PENGGANDAAN
// =========================================================
//
// Data hanya dari API (Postgres). Batal, pulihkan, dan hapus lewat API;
// setelah berhasil daftar dimuat ulang dari server. Galat API tampil
// sebagai toast merah, tidak pernah dianggap berhasil. Angka (total, PPh,
// netto, volume) diambil dari kolom yang dihitung server.

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");

const DAFTAR_BIDANG_PILIHAN = ["Semua bidang", "TU", "AKLAP", "PTUK", "BMN", "PA"];

const NAMA_BIDANG_LENGKAP = {
  TU: "Bidang Tata Usaha",
  AKLAP: "Bidang Akuntansi & Pelaporan",
  PTUK: "Bidang Perbendaharaan & TUK",
  BMN: "Bidang Pengelolaan BMN",
  PA: "Bidang Perencanaan & Anggaran",
};

const kelasInput =
  "px-3.5 py-2.5 rounded-xl bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

function formatTanggalPendek(iso) {
  if (!iso) return "-";
  const p = String(iso).slice(0, 10).split("-");
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return iso;
}

function ambilKodeMak(akunStr) {
  const m = String(akunStr || "").match(/52\d{4}/);
  return m ? m[0] : "-";
}

export default function DaftarFotokopi({ operator }) {
  const bendahara = operator?.peran === "bendahara";
  const admin = operator?.peran === "admin" || bendahara;

  const [daftar, setDaftar] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [cari, setCari] = useState("");
  const [bidang, setBidang] = useState("Semua bidang");
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));
  const [status, setStatus] = useState("semua");

  // Modal-modal
  const [modalBatal, setModalBatal] = useState(null);
  const [alasanBatal, setAlasanBatal] = useState("");
  const [modalDetail, setModalDetail] = useState(null);
  const [modalHapus, setModalHapus] = useState(null);
  const [bekerja, setBekerja] = useState(false);

  const [toast, setToast] = useState(null);
  const [putaran, setPutaran] = useState(0);
  const muatUlang = () => setPutaran((p) => p + 1);

  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let usang = false;
    const q = new URLSearchParams();
    if (tahun !== "Semua tahun") q.set("tahun", tahun);
    if (admin && bidang !== "Semua bidang") q.set("bidang", bidang);
    if (status !== "semua") q.set("status", status);

    apiKwitansi({ url: `api/kwitansi/fotokopi?${q}` })
      .then((data) => {
        if (usang) return;
        setDaftar(Array.isArray(data) ? data : []);
        setGalat("");
      })
      .catch((e) => {
        if (usang) return;
        setDaftar([]);
        setGalat(e?.message || "Gagal memuat daftar fotokopi");
      })
      .finally(() => !usang && setMemuat(false));

    return () => {
      usang = true;
    };
  }, [tahun, bidang, status, admin, putaran]);

  // Pencarian kata kunci (saringan lain sudah dikerjakan server)
  const dataTampil = useMemo(() => {
    const c = cari.trim().toLowerCase();
    if (!c) return daftar;
    return daftar.filter((d) =>
      [d.nama_kegiatan, d.lokasi_provinsi, d.lokasi_detail, d.penyedia, d.nomor_spby, d.bidang]
        .join(" ")
        .toLowerCase()
        .includes(c),
    );
  }, [daftar, cari]);

  // Statistik ringkasan (dari kolom server)
  const aktifList = useMemo(() => dataTampil.filter((d) => d.status === "aktif"), [dataTampil]);
  const jumlahBatal = dataTampil.length - aktifList.length;
  const totalVolumeAktif = useMemo(
    () => aktifList.reduce((acc, d) => acc + (Number(d.jumlah_volume) || 0), 0),
    [aktifList],
  );
  const totalBiayaAktif = useMemo(
    () => aktifList.reduce((acc, d) => acc + (Number(d.total) || 0), 0),
    [aktifList],
  );

  // PDF dari data tersimpan di server
  const unduhPdf = async (item) => {
    try {
      await bukaPdf({ url: `api/kwitansi/fotokopi/${item.id}/pdf` });
    } catch (e) {
      kabari(e?.message || "Gagal membuka PDF", "error");
    }
  };

  // Jalankan satu aksi API; daftar dimuat ulang hanya bila berhasil.
  const jalankan = async (aksi, pesanBerhasil, pesanGagal) => {
    setBekerja(true);
    try {
      await aksi();
      kabari(pesanBerhasil);
      muatUlang();
      return true;
    } catch (e) {
      kabari(e?.message || pesanGagal, "error");
      return false;
    } finally {
      setBekerja(false);
    }
  };

  const konfirmasiBatal = async () => {
    if (!modalBatal) return;
    if (!alasanBatal.trim()) {
      kabari("Alasan pembatalan wajib diisi", "error");
      return;
    }
    const ok = await jalankan(
      () =>
        apiKwitansi({
          url: `api/kwitansi/fotokopi/${modalBatal.id}/batalkan`,
          method: "POST",
          body: { alasan: alasanBatal.trim() },
        }),
      "Pengajuan fotokopi dibatalkan",
      "Gagal membatalkan pengajuan",
    );
    if (ok) {
      setModalBatal(null);
      setAlasanBatal("");
    }
  };

  const pulihkanPengajuan = (item) =>
    jalankan(
      () => apiKwitansi({ url: `api/kwitansi/fotokopi/${item.id}/pulihkan`, method: "POST" }),
      `Pengajuan "${item.nama_kegiatan}" dipulihkan`,
      "Gagal memulihkan pengajuan",
    );

  const konfirmasiHapus = async () => {
    if (!modalHapus) return;
    const item = modalHapus;
    const ok = await jalankan(
      () => apiKwitansi({ url: `api/kwitansi/fotokopi/${item.id}`, method: "DELETE" }),
      `Pengajuan "${item.nama_kegiatan}" dihapus`,
      "Gagal menghapus pengajuan",
    );
    if (ok) setModalHapus(null);
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      {/* TOAST NOTIFIKASI */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-muncul">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 border ${
              toast.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* HEADER UTAMA */}
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight truncate">
                {bendahara
                  ? "Monitoring Fotokopi"
                  : `Fotokopi ${admin ? "— Semua Bidang" : `— Bidang ${operator?.bidang || ""}`}`}
              </h1>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {operator?.nama || ""} • {bendahara ? "Bendahara" : admin ? "Admin" : "Operator"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-5">
        {/* KARTU STATISTIK 4 KOLOM */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-mist shadow-2xs p-4 sm:p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">PENGAJUAN AKTIF</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy">{aktifList.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-mist shadow-2xs p-4 sm:p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">DIBATALKAN</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy">{jumlahBatal}</p>
          </div>

          <div className="bg-white rounded-2xl border border-mist shadow-2xs p-4 sm:p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">JUMLAH LEMBAR / VOLUME</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy">
              {totalVolumeAktif.toLocaleString("id-ID")}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-mist shadow-2xs p-4 sm:p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">TOTAL BIAYA</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy truncate">
              {rupiah(totalBiayaAktif)}
            </p>
          </div>
        </div>

        {/* BANNER INFORMASI */}
        <div className="bg-white rounded-2xl border border-mist/80 shadow-2xs px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs sm:text-sm font-medium text-slate-600">
            Menampilkan ringkasan realisasi{" "}
            <span className="font-bold text-navy">{aktifList.length} pengajuan fotokopi & penjilidan aktif</span> (
            <span className="font-bold text-navy">{totalVolumeAktif.toLocaleString("id-ID")} volume satuan</span>) pada tahun anggaran {tahun}.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50/80 border border-sky-200/80 text-sky-800 text-xs font-bold shrink-0 self-start sm:self-auto">
            <Printer className="w-3.5 h-3.5 text-sky-600" />
            <span>MAK 521111 / 521211 — Belanja Barang & Penggandaan</span>
          </div>
        </div>

        {/* SECTION TABEL DAFTAR FOTOKOPI */}
        <section className="bg-white rounded-3xl border border-mist shadow-2xs p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
            {/* Input Pencarian */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                className={kelasInput + " w-full pl-10"}
                placeholder="Cari kegiatan, dokumen, rekanan percetakan..."
                value={cari}
                onChange={(e) => setCari(e.target.value)}
              />
            </div>

            {/* Filter & Tombol Baru */}
            <div className="flex flex-wrap items-center gap-2">
              {admin && (
                <select className={kelasInput} value={bidang} onChange={(e) => setBidang(e.target.value)}>
                  {DAFTAR_BIDANG_PILIHAN.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}

              <select className={kelasInput} value={tahun} onChange={(e) => setTahun(e.target.value)}>
                <option value="Semua tahun">Semua tahun</option>
                <option value="2027">2027</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>

              <select className={kelasInput} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="semua">Semua status</option>
                <option value="aktif">Aktif / Selesai</option>
                <option value="dibatalkan">Dibatalkan</option>
              </select>

              {!bendahara && (
                <Link
                  to={jalur("fotokopi", "baru")}
                  className="inline-flex items-center gap-2 bg-[#123B5D] hover:bg-[#0E2D47] text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Fotokopi baru</span>
                </Link>
              )}
            </div>
          </div>

          {galat && (
            <p className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {galat}
            </p>
          )}

          {/* TABEL ATAU EMPTY STATE */}
          {memuat ? (
            <div className="py-20 flex justify-center items-center">
              <Loader2 className="w-7 h-7 text-brand animate-spin" />
            </div>
          ) : dataTampil.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-50 border border-mist flex items-center justify-center">
                <Printer className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-base font-bold text-navy">Belum ada kegiatan fotokopi</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {galat ? "Daftar tidak dapat dimuat." : "Tidak ada data fotokopi yang sesuai dengan saringan."}
              </p>
              {!bendahara && !galat && (
                <Link
                  to={jalur("fotokopi", "baru")}
                  className="inline-flex items-center gap-2 mt-4 bg-brand hover:bg-navy text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Pengajuan Fotokopi
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[1020px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-mist bg-slate-50/50">
                    <th className="py-3.5 px-3.5 font-bold">KEGIATAN & TANGGAL</th>
                    <th className="py-3.5 px-3.5 font-bold whitespace-nowrap">BIDANG & KODE AKUN</th>
                    <th className="py-3.5 px-3.5 font-bold min-w-[200px]">PENYEDIA / RINCIAN</th>
                    <th className="py-3.5 px-3.5 font-bold text-center whitespace-nowrap">VOLUME</th>
                    <th className="py-3.5 px-3.5 font-bold whitespace-nowrap">TOTAL BIAYA</th>
                    <th className="py-3.5 px-3.5 font-bold text-center whitespace-nowrap">STATUS</th>
                    <th className="py-3.5 px-3.5 font-bold text-center whitespace-nowrap">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist/60">
                  {dataTampil.map((d) => {
                    const batalkan = d.status === "dibatalkan";
                    const tglFormat = formatTanggalPendek(d.tanggal_kegiatan);
                    const kodeMak = ambilKodeMak(d.isian?.akun);
                    const namaBidangLengkap = NAMA_BIDANG_LENGKAP[d.bidang] || `Bidang ${d.bidang || "-"}`;
                    const jumlahJenis = Number(d.jumlah_jenis_item) || 0;

                    return (
                      <tr
                        key={d.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          batalkan ? "bg-slate-50/70 text-slate-400" : ""
                        }`}
                      >
                        {/* 1. KEGIATAN & TANGGAL */}
                        <td className="py-4 px-3.5 max-w-[340px]">
                          <p
                            className={`font-bold text-navy text-sm leading-snug line-clamp-2 ${
                              batalkan ? "line-through text-slate-400" : "hover:text-brand"
                            }`}
                          >
                            {d.nama_kegiatan || "(Penggandaan Dokumen)"}
                          </p>
                          <p className="text-[11px] text-slate-400 font-medium mt-1">
                            {tglFormat} • {d.lokasi_provinsi || "D.K.I. Jakarta"}
                            {d.nomor_spby && ` • ${d.nomor_spby}`}
                          </p>
                        </td>

                        {/* 2. BIDANG & KODE AKUN */}
                        <td className="py-4 px-3.5 whitespace-nowrap">
                          <p className="font-bold text-navy text-xs leading-none">
                            {namaBidangLengkap}
                          </p>
                          <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                            MAK {kodeMak}
                          </span>
                        </td>

                        {/* 3. PENYEDIA / RINCIAN */}
                        <td className="py-4 px-3.5 max-w-[240px]">
                          <p className="font-bold text-navy text-xs truncate">
                            {d.penyedia || "-"}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {jumlahJenis} jenis pekerjaan fotokopi/jilid
                          </p>
                        </td>

                        {/* 4. VOLUME */}
                        <td className="py-4 px-3.5 text-center whitespace-nowrap">
                          <span className="font-bold text-navy text-sm tabular-nums">
                            {Number(d.jumlah_volume || 0).toLocaleString("id-ID")} item
                          </span>
                        </td>

                        {/* 5. TOTAL BIAYA */}
                        <td className="py-4 px-3.5 whitespace-nowrap">
                          <p className="font-bold text-navy text-sm tabular-nums">{rupiah(d.total)}</p>
                          <p className="text-[10px] font-medium text-slate-500 tabular-nums">
                            Netto: {rupiah(d.netto)}
                          </p>
                        </td>

                        {/* 6. STATUS */}
                        <td className="py-4 px-3.5 text-center whitespace-nowrap">
                          {batalkan ? (
                            <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                              Dibatalkan
                            </span>
                          ) : (
                            <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Aktif / Selesai
                            </span>
                          )}
                        </td>

                        {/* 7. AKSI */}
                        <td className="py-4 px-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            {/* Tombol PDF */}
                            <button
                              type="button"
                              onClick={() => unduhPdf(d)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-brand hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Buka / Cetak PDF SPBY & Kwitansi"
                            >
                              <FileText className="w-4 h-4" />
                            </button>

                            {/* Tombol Rincian / Detail */}
                            <button
                              type="button"
                              onClick={() => setModalDetail(d)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                              title="Lihat Rincian Pengajuan"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Tombol Ubah */}
                            {!bendahara && !batalkan && (
                              <Link
                                to={jalur("fotokopi", String(d.id))}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                title="Ubah Pengajuan"
                              >
                                <Pencil className="w-4 h-4" />
                              </Link>
                            )}

                            {/* Tombol Batalkan */}
                            {!bendahara && !batalkan && (
                              <button
                                type="button"
                                onClick={() => setModalBatal(d)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Batalkan Pengajuan"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}

                            {/* Tombol Pulihkan (data dibatalkan) */}
                            {!bendahara && batalkan && (
                              <button
                                type="button"
                                onClick={() => pulihkanPengajuan(d)}
                                disabled={bekerja}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50"
                                title={d.alasan_batal ? `Pulihkan — dibatalkan: ${d.alasan_batal}` : "Pulihkan Pengajuan"}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}

                            {/* Tombol Hapus */}
                            {!bendahara && (
                              <button
                                type="button"
                                onClick={() => setModalHapus(d)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Pengajuan"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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

      {/* MODAL DETAIL */}
      {modalDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-2xs animate-pudar">
          <div className="bg-white rounded-3xl border border-mist shadow-2xl p-6 w-full max-w-xl animate-muncul max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-mist">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-navy leading-none">Rincian Pengajuan Fotokopi</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {modalDetail.bidang || "-"} • {formatTanggalPendek(modalDetail.tanggal_kegiatan)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nama Kegiatan</p>
                <p className="text-sm font-bold text-navy mt-0.5">{modalDetail.nama_kegiatan}</p>
                {modalDetail.lokasi_detail && (
                  <p className="text-xs text-slate-500 mt-0.5">{modalDetail.lokasi_detail}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-mist text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Rekanan Percetakan:</span>
                  <span className="font-bold text-navy">{modalDetail.penyedia || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Lokasi Provinsi:</span>
                  <span className="font-bold text-navy">{modalDetail.lokasi_provinsi || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Nomor SPBY:</span>
                  <span className="font-bold text-navy">{modalDetail.nomor_spby || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Kode Akun / MAK:</span>
                  <span className="font-bold text-navy">{ambilKodeMak(modalDetail.isian?.akun)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Nomor BKU:</span>
                  <span className="font-bold text-navy">{modalDetail.isian?.no_bku || "-"}</span>
                </div>
                {modalDetail.status === "dibatalkan" && (
                  <div>
                    <span className="text-slate-400 block font-medium">Alasan Pembatalan:</span>
                    <span className="font-bold text-navy">{modalDetail.alasan_batal || "-"}</span>
                  </div>
                )}
              </div>

              {/* Rincian Item Pekerjaan */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Item Fotokopi & Penjilidan
                </p>
                <div className="border border-mist rounded-2xl overflow-hidden text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-mist text-left text-[11px] font-bold text-slate-500">
                        <th className="py-2 px-3">Uraian / Spesifikasi</th>
                        <th className="py-2 px-3 text-center">Volume</th>
                        <th className="py-2 px-3 text-right">Harga Satuan</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist/60">
                      {(modalDetail.isian?.items || []).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-semibold text-navy">
                            {it.uraianMenu || it.jenis || `Pekerjaan ${idx + 1}`}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {Number(it.volume) || 0} {it.satuan || ""}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600 tabular-nums">
                            {rupiah(it.hargaSatuan)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-navy tabular-nums">
                            {rupiah((Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ringkasan Biaya & Pajak */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between font-semibold text-slate-600">
                  <span>Total Tagihan (Bruto):</span>
                  <span className="text-navy tabular-nums">{rupiah(modalDetail.total)}</span>
                </div>
                <div className="flex justify-between font-semibold text-rose-600">
                  <span>Potongan Pajak (PPh):</span>
                  <span className="tabular-nums">- {rupiah(modalDetail.pajak_pph)}</span>
                </div>
                <div className="flex justify-between font-black text-emerald-800 pt-1.5 border-t border-emerald-200 text-sm">
                  <span>Bersih Dibayarkan:</span>
                  <span className="tabular-nums">{rupiah(modalDetail.netto)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-mist">
              <button
                type="button"
                onClick={() => setModalDetail(null)}
                className="px-4 py-2 rounded-xl border border-mist text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  unduhPdf(modalDetail);
                  setModalDetail(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand hover:bg-navy text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Buka PDF SPBY & Kwitansi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BATALKAN */}
      {modalBatal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-2xs animate-pudar">
          <div className="bg-white rounded-3xl border border-mist shadow-2xl p-6 w-full max-w-md animate-muncul">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-navy">Batalkan Pengajuan Fotokopi</h3>
                <p className="text-xs text-slate-500 mt-0.5">Tindakan ini akan mengubah status menjadi dibatalkan.</p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Alasan Pembatalan</label>
                <textarea
                  rows={3}
                  className={kelasInput + " w-full resize-none"}
                  placeholder="Misal: Revisi dokumen cetak / pembatalan agenda rapat"
                  value={alasanBatal}
                  onChange={(e) => setAlasanBatal(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalBatal(null)}
                className="px-4 py-2 rounded-xl border border-mist text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={konfirmasiBatal}
                disabled={bekerja}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HAPUS */}
      {modalHapus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-2xs animate-pudar">
          <div className="bg-white rounded-3xl border border-mist shadow-2xl p-6 w-full max-w-md animate-muncul">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-navy">Hapus Pengajuan Fotokopi?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Data yang dihapus tidak dapat dipulihkan kembali.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-5 p-3 rounded-xl bg-slate-50 border border-mist">
              <span className="font-bold text-navy">{modalHapus.nama_kegiatan}</span> ({rupiah(modalHapus.total)})
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalHapus(null)}
                className="px-4 py-2 rounded-xl border border-mist text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={bekerja}
                onClick={konfirmasiHapus}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {bekerja && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
