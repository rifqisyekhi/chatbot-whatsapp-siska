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
import { DATA_CONTOH_FOTOKOPI } from "./dataContoh";

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");

const DAFTAR_BIDANG_PILIHAN = [
  "Semua bidang",
  "TU",
  "AKLAP",
  "PTUK",
  "BMN",
  "PA",
];

const NAMA_BIDANG_LENGKAP = {
  TU: "Bidang Tata Usaha",
  AKLAP: "Bidang Akuntansi & Pelaporan",
  PTUK: "Bidang Perbendaharaan & TUK",
  BMN: "Bidang Pengelolaan BMN",
  PA: "Bidang Perencanaan & Anggaran",
};

const kelasInput =
  "px-3.5 py-2.5 rounded-xl bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

const bacaDataLokal = () => {
  try {
    return JSON.parse(localStorage.getItem("kwitansi-fotokopi-data") || "[]");
  } catch {
    return [];
  }
};

const simpanDataLokal = (items) => {
  try {
    localStorage.setItem("kwitansi-fotokopi-data", JSON.stringify(items));
  } catch {
    // abaikan
  }
};

const gabungkanData = (dataServer = []) => {
  const dataLokal = bacaDataLokal();
  const peta = new Map();
  const jejakUnik = new Set();

  const buatKunci = (d) => {
    const nama = String(d.nama_kegiatan || d.isian?.nama_kegiatan || d.isian?.dalam_rangka || "").trim().toLowerCase();
    const tgl = String(d.tanggal_kegiatan || d.isian?.tanggal_kegiatan || "").trim();
    const tot = String(d.total || d.isian?.total || 0);
    return `${nama}|${tgl}|${tot}`;
  };

  if (Array.isArray(dataServer) && dataServer.length > 0) {
    dataServer.forEach((d) => {
      peta.set(String(d.id), d);
      jejakUnik.add(buatKunci(d));
    });
  }

  dataLokal.forEach((d) => {
    const kunci = buatKunci(d);
    if (!peta.has(String(d.id)) && !jejakUnik.has(kunci)) {
      peta.set(String(d.id), d);
      jejakUnik.add(kunci);
    }
  });

  if (peta.size === 0) {
    DATA_CONTOH_FOTOKOPI.forEach((d) => {
      const kunci = buatKunci(d);
      if (!peta.has(String(d.id)) && !jejakUnik.has(kunci)) {
        peta.set(String(d.id), d);
        jejakUnik.add(kunci);
      }
    });
  }

  return Array.from(peta.values());
};

function formatTanggalPendek(iso) {
  if (!iso) return "-";
  const p = String(iso).slice(0, 10).split("-");
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return iso;
}

function ambilKodeMak(akunStr) {
  const m = String(akunStr || "").match(/52\d{4}/);
  return m ? m[0] : "521111";
}

export default function DaftarFotokopi({ operator }) {
  const bendahara = operator?.peran === "bendahara";
  const admin = operator?.peran === "admin" || bendahara;

  const [daftar, setDaftar] = useState(() => gabungkanData());
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const [cari, setCari] = useState("");
  const [bidang, setBidang] = useState("Semua bidang");
  const [tahun, setTahun] = useState("2026");
  const [status, setStatus] = useState("Semua status");
  const [lihatEmptyState, setLihatEmptyState] = useState(false);

  // Modal-modal
  const [modalBatal, setModalBatal] = useState(null);
  const [alasanBatal, setAlasanBatal] = useState("");
  const [modalDetail, setModalDetail] = useState(null);
  const [modalHapus, setModalHapus] = useState(null);
  const [menghapus, setMenghapus] = useState(false);

  const [toast, setToast] = useState(null);
  const [putaran, setPutaran] = useState(0);

  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let usang = false;
    const q = new URLSearchParams();
    if (tahun && tahun !== "Semua tahun") q.set("tahun", tahun);
    if (bidang && bidang !== "Semua bidang") q.set("bidang", bidang);
    if (status && status !== "Semua status") q.set("status", status.toLowerCase());

    apiKwitansi({ url: `api/kwitansi/fotokopi?${q.toString()}` })
      .then((data) => {
        if (usang) return;
        setDaftar(gabungkanData(data));
        setGalat("");
      })
      .catch(() => {
        if (!usang) {
          setDaftar(gabungkanData());
        }
      })
      .finally(() => {
        if (!usang) setMemuat(false);
      });

    return () => {
      usang = true;
    };
  }, [tahun, bidang, status, putaran]);

  const pulihkanDataContoh = () => {
    try {
      localStorage.removeItem("kwitansi-fotokopi-data");
    } catch {
      // abaikan
    }
    setLihatEmptyState(false);
    setDaftar(DATA_CONTOH_FOTOKOPI);
    setPutaran((p) => p + 1);
    kabari("Data contoh fotokopi dimuat kembali");
  };

  const dataTampil = useMemo(() => {
    if (lihatEmptyState) return [];

    return daftar.filter((d) => {
      if (status !== "Semua status") {
        const cocokStatus =
          (status === "Aktif / Selesai" && d.status === "aktif") ||
          (status === "Aktif" && d.status === "aktif") ||
          (status === "Dibatalkan" && d.status === "dibatalkan");
        if (!cocokStatus) return false;
      }
      if (bidang !== "Semua bidang" && d.bidang !== bidang) {
        return false;
      }
      if (tahun !== "Semua tahun" && d.tanggal_kegiatan && !d.tanggal_kegiatan.startsWith(tahun)) {
        return false;
      }
      if (cari.trim()) {
        const c = cari.toLowerCase();
        const teks = [
          d.nama_kegiatan,
          d.lokasi_provinsi,
          d.lokasi_detail,
          d.penyedia,
          d.nomor_spby,
          d.bidang,
        ]
          .join(" ")
          .toLowerCase();
        if (!teks.includes(c)) return false;
      }
      return true;
    });
  }, [daftar, lihatEmptyState, status, bidang, tahun, cari]);

  const aktifList = useMemo(() => dataTampil.filter((d) => d.status === "aktif"), [dataTampil]);
  const batalList = useMemo(() => dataTampil.filter((d) => d.status === "dibatalkan"), [dataTampil]);
  const totalVolumeAktif = useMemo(
    () => aktifList.reduce((acc, d) => acc + (Number(d.jumlah_volume || d.jumlah_porsi) || 0), 0),
    [aktifList],
  );
  const totalBiayaAktif = useMemo(
    () => aktifList.reduce((acc, d) => acc + (Number(d.total) || 0), 0),
    [aktifList],
  );

  const unduhPdf = async (item) => {
    try {
      const isian = item.isian || item;
      await bukaPdf({
        url: "api/kwitansi/fotokopi/pdf-preview",
        method: "POST",
        body: { isian },
      });
      kabari("Membuka PDF SPBY & Kwitansi Fotokopi");
    } catch (e) {
      kabari(e?.message || "Gagal membuka PDF", "error");
    }
  };

  const konfirmasiBatal = async () => {
    if (!modalBatal) return;
    try {
      const dataLokal = bacaDataLokal();
      const diperbarui = dataLokal.map((it) =>
        String(it.id) === String(modalBatal.id)
          ? {
              ...it,
              status: "dibatalkan",
              alasan_batal: alasanBatal || "Dibatalkan oleh operator",
              tanggal_batal: new Date().toISOString().slice(0, 10),
            }
          : it
      );
      simpanDataLokal(diperbarui);

      setDaftar((prev) =>
        prev.map((it) =>
          String(it.id) === String(modalBatal.id)
            ? {
                ...it,
                status: "dibatalkan",
                alasan_batal: alasanBatal || "Dibatalkan oleh operator",
                tanggal_batal: new Date().toISOString().slice(0, 10),
              }
            : it
        )
      );

      if (!String(modalBatal.id).startsWith("sample-") && !String(modalBatal.id).startsWith("local-")) {
        apiKwitansi({
          url: `api/kwitansi/fotokopi/${modalBatal.id}/batalkan`,
          method: "POST",
          body: { alasan: alasanBatal },
        }).catch(() => {});
      }

      kabari("Pengajuan fotokopi berhasil dibatalkan");
      setModalBatal(null);
      setAlasanBatal("");
    } catch (e) {
      kabari(e?.message || "Gagal membatalkan pengajuan", "error");
    }
  };

  const konfirmasiHapus = async () => {
    if (!modalHapus) return;
    setMenghapus(true);
    try {
      const dataLokal = bacaDataLokal();
      const sisa = dataLokal.filter((it) => String(it.id) !== String(modalHapus.id));
      simpanDataLokal(sisa);

      setDaftar((prev) => prev.filter((it) => String(it.id) !== String(modalHapus.id)));

      if (!String(modalHapus.id).startsWith("sample-") && !String(modalHapus.id).startsWith("local-")) {
        apiKwitansi({
          url: `api/kwitansi/fotokopi/${modalHapus.id}`,
          method: "DELETE",
        }).catch(() => {});
      }

      kabari("Data pengajuan fotokopi berhasil dihapus");
      setModalHapus(null);
    } catch (e) {
      kabari(e?.message || "Gagal menghapus data", "error");
    } finally {
      setMenghapus(false);
    }
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
                  : `Fotokopi ${admin ? "— Semua Bidang" : `— Bidang ${operator?.bidang || "BMN"}`}`}
              </h1>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {operator?.nama || "Pengembang Lokal (admin)"} • {bendahara ? "Bendahara" : admin ? "Admin" : "Operator"}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setLihatEmptyState((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  lihatEmptyState
                    ? "bg-brand text-white border-brand shadow-xs"
                    : "bg-white border-mist text-slate-600 hover:bg-slate-50"
                }`}
                title="Pratinjau tampilan saat tidak ada data"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Lihat Empty State</span>
              </button>

              <button
                type="button"
                onClick={pulihkanDataContoh}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-mist bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                title="Muat kembali data contoh resmi"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Data Contoh</span>
              </button>
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
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy">{batalList.length}</p>
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
              <select className={kelasInput} value={bidang} onChange={(e) => setBidang(e.target.value)}>
                {DAFTAR_BIDANG_PILIHAN.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <select className={kelasInput} value={tahun} onChange={(e) => setTahun(e.target.value)}>
                <option value="Semua tahun">Semua tahun</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>

              <select className={kelasInput} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Semua status">Semua status</option>
                <option value="Aktif / Selesai">Aktif / Selesai</option>
                <option value="Dibatalkan">Dibatalkan</option>
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
                {lihatEmptyState
                  ? "Tampilan pratinjau Empty State aktif. Klik tombol \"Lihat Empty State\" di kanan atas untuk kembali."
                  : "Belum ada data pengajuan fotokopi yang sesuai dengan filter pencarian."}
              </p>
              {!bendahara && !lihatEmptyState && (
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
                    const kodeMak = ambilKodeMak(d.isian?.akun || d.akun);
                    const namaBidangLengkap = NAMA_BIDANG_LENGKAP[d.bidang] || `Bidang ${d.bidang || "BMN"}`;
                    const jumlahJenis = Number(d.jumlah_jenis_item) || (d.isian?.items?.length || 1);

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
                            {Number(d.jumlah_volume || d.jumlah_porsi || 0).toLocaleString("id-ID")} item
                          </span>
                        </td>

                        {/* 5. TOTAL BIAYA */}
                        <td className="py-4 px-3.5 whitespace-nowrap">
                          <p className="font-bold text-navy text-sm tabular-nums">{rupiah(d.total)}</p>
                          <p className="text-[10px] font-medium text-slate-500 tabular-nums">
                            Netto: {rupiah(d.netto || d.total - (d.pajak_pph || 0))}
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
                    {modalDetail.bidang || "BMN"} • {modalDetail.tanggal_kegiatan}
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
                  <span className="font-bold text-navy">{modalDetail.lokasi_provinsi || "D.K.I. Jakarta"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Nomor SPBY:</span>
                  <span className="font-bold text-navy">{modalDetail.nomor_spby || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Kode Akun / MAK:</span>
                  <span className="font-bold text-navy">{ambilKodeMak(modalDetail.isian?.akun)}</span>
                </div>
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
                            {it.uraianMenu || it.namaItem || it.uraian || `Pekerjaan ${idx + 1}`}
                          </td>
                          <td className="py-2 px-3 text-center text-slate-600">
                            {it.volume || it.porsi} {it.satuan || "Lembar"}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600 tabular-nums">
                            {rupiah(it.hargaSatuan || it.harga_satuan)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-navy tabular-nums">
                            {rupiah(it.subtotal || it.jumlah_harga || (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0))}
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
                  <span className="tabular-nums">- {rupiah(modalDetail.pajak_pph || modalDetail.pajak_pph23 || 0)}</span>
                </div>
                <div className="flex justify-between font-black text-emerald-800 pt-1.5 border-t border-emerald-200 text-sm">
                  <span>Bersih Dibayarkan:</span>
                  <span className="tabular-nums">
                    {rupiah(modalDetail.netto || modalDetail.total - (modalDetail.pajak_pph || 0))}
                  </span>
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
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
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
                disabled={menghapus}
                onClick={konfirmasiHapus}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {menghapus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
