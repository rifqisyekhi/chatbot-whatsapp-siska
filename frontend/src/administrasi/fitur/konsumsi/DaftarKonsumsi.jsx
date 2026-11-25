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
  BookOpen,
  Coffee,
  X,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { apiKwitansi, bukaPdf } from "../../../services/sesiKwitansi";
import { jalur } from "../../jalur";
import { DATA_CONTOH_KONSUMSI } from "./dataContoh";

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");

const ambilHari = (iso) => {
  if (!iso) return "-";
  try {
    const bagian = String(iso).slice(0, 10).split("-");
    if (bagian.length !== 3) return "-";
    const d = new Date(Number(bagian[0]), Number(bagian[1]) - 1, Number(bagian[2]));
    const hari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    return hari[d.getDay()] || "-";
  } catch {
    return "-";
  }
};

const DAFTAR_BIDANG_PILIHAN = [
  "Semua bidang",
  "TU",
  "AKLAP",
  "PTUK",
  "BMN",
  "PA",
];

const kelasInput =
  "px-3.5 py-2.5 rounded-xl bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

const bacaDataLokal = () => {
  try {
    return JSON.parse(localStorage.getItem("kwitansi-konsumsi-data") || "[]");
  } catch {
    return [];
  }
};

const simpanDataLokal = (items) => {
  try {
    localStorage.setItem("kwitansi-konsumsi-data", JSON.stringify(items));
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

  // 1. Prioritas data server (jika PostgreSQL aktif dan punya data)
  if (Array.isArray(dataServer) && dataServer.length > 0) {
    dataServer.forEach((d) => {
      peta.set(String(d.id), d);
      jejakUnik.add(buatKunci(d));
    });
  }

  // 2. Data lokal pengguna (hanya jika belum ada di server, mencegah duplikasi/pengulangan)
  dataLokal.forEach((d) => {
    const kunci = buatKunci(d);
    if (!peta.has(String(d.id)) && !jejakUnik.has(kunci)) {
      peta.set(String(d.id), d);
      jejakUnik.add(kunci);
    }
  });

  // 3. Data contoh resmi sebagai basis awal HANYA bila belum ada data kegiatan sama sekali
  if (peta.size === 0) {
    DATA_CONTOH_KONSUMSI.forEach((d) => {
      const kunci = buatKunci(d);
      if (!peta.has(String(d.id)) && !jejakUnik.has(kunci)) {
        peta.set(String(d.id), d);
        jejakUnik.add(kunci);
      }
    });
  }

  return Array.from(peta.values());
};

export default function DaftarKonsumsi({ operator }) {
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

  // Modal-modal interaktif
  const [modalBatal, setModalBatal] = useState(null);
  const [alasanBatal, setAlasanBatal] = useState("");
  const [modalRiwayat, setModalRiwayat] = useState(null);
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

    apiKwitansi({ url: `api/kwitansi/konsumsi?${q.toString()}` })
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

  // Tombol "Data Contoh" untuk reset data kembali ke data contoh awal
  const pulihkanDataContoh = () => {
    try {
      localStorage.removeItem("kwitansi-konsumsi-data");
    } catch {
      // abaikan
    }
    setLihatEmptyState(false);
    setDaftar(DATA_CONTOH_KONSUMSI);
    setPutaran((p) => p + 1);
    kabari("Data contoh dimuat kembali");
  };

  // Penyaringan data
  const dataTampil = useMemo(() => {
    if (lihatEmptyState) return [];

    return daftar.filter((d) => {
      // Saringan status
      if (status !== "Semua status") {
        const cocokStatus =
          (status === "Aktif" && d.status === "aktif") ||
          (status === "Dibatalkan" && d.status === "dibatalkan");
        if (!cocokStatus) return false;
      }
      // Saringan bidang
      if (bidang !== "Semua bidang" && d.bidang !== bidang) {
        return false;
      }
      // Saringan tahun
      if (tahun !== "Semua tahun" && d.tanggal_kegiatan && !d.tanggal_kegiatan.startsWith(tahun)) {
        return false;
      }
      // Pencarian kata kunci
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

  // Statistik ringkasan
  const aktifList = useMemo(() => dataTampil.filter((d) => d.status === "aktif"), [dataTampil]);
  const batalList = useMemo(() => dataTampil.filter((d) => d.status === "dibatalkan"), [dataTampil]);
  const totalPorsiAktif = useMemo(
    () => aktifList.reduce((acc, d) => acc + (Number(d.jumlah_porsi) || 0), 0),
    [aktifList],
  );
  const totalBiayaAktif = useMemo(
    () => aktifList.reduce((acc, d) => acc + (Number(d.total) || 0), 0),
    [aktifList],
  );

  // Aksi Cetak PDF
  const unduhPdf = async (item) => {
    try {
      const isian = item.isian || item;
      await bukaPdf({
        url: "api/kwitansi/konsumsi/pdf-preview",
        method: "POST",
        body: { isian },
      });
      kabari("Membuka PDF SPBY & Kwitansi");
    } catch (e) {
      kabari(e?.message || "Gagal membuka PDF", "error");
    }
  };

  // Aksi Batalkan
  const konfirmasiBatal = async () => {
    if (!modalBatal) return;
    try {
      const dataLokal = bacaDataLokal();
      const lokalBaru = dataLokal.map((d) =>
        String(d.id) === String(modalBatal.id)
          ? { ...d, status: "dibatalkan", alasan_batal: alasanBatal, tanggal_batal: new Date().toISOString().slice(0, 10) }
          : d,
      );
      simpanDataLokal(lokalBaru);

      setDaftar((prev) =>
        prev.map((d) =>
          String(d.id) === String(modalBatal.id)
            ? { ...d, status: "dibatalkan", alasan_batal: alasanBatal, tanggal_batal: new Date().toISOString().slice(0, 10) }
            : d,
        ),
      );

      if (!String(modalBatal.id).startsWith("sample-") && !String(modalBatal.id).startsWith("konsumsi-")) {
        await apiKwitansi({
          url: `api/kwitansi/konsumsi/${modalBatal.id}/batalkan`,
          method: "POST",
          body: { alasan: alasanBatal },
        });
      }

      kabari("Kegiatan konsumsi berhasil dibatalkan");
      setModalBatal(null);
      setAlasanBatal("");
    } catch (e) {
      kabari(e?.message || "Gagal membatalkan kegiatan", "error");
    }
  };

  // Aksi Pulihkan Kegiatan Dibatalkan
  const pulihkanKegiatan = (item) => {
    if (!item) return;
    const dataLokal = bacaDataLokal();
    const lokalBaru = dataLokal.map((d) =>
      String(d.id) === String(item.id)
        ? { ...d, status: "aktif", alasan_batal: null, tanggal_batal: null }
        : d,
    );
    simpanDataLokal(lokalBaru);

    setDaftar((prev) =>
      prev.map((d) =>
        String(d.id) === String(item.id)
          ? { ...d, status: "aktif", alasan_batal: null, tanggal_batal: null }
          : d,
      ),
    );
    kabari(`Kegiatan "${item.nama_kegiatan}" berhasil dipulihkan`);
    setModalRiwayat(null);
  };

  // Aksi Hapus (dieksekusi dari modal pop-up konfirmasi)
  const konfirmasiHapus = async () => {
    if (!modalHapus) return;
    const item = modalHapus;
    setMenghapus(true);
    try {
      const dataLokal = bacaDataLokal();
      simpanDataLokal(dataLokal.filter((d) => String(d.id) !== String(item.id)));

      setDaftar((prev) => prev.filter((d) => String(d.id) !== String(item.id)));

      if (!String(item.id).startsWith("sample-") && !String(item.id).startsWith("konsumsi-")) {
        await apiKwitansi({
          url: `api/kwitansi/konsumsi/${item.id}`,
          method: "DELETE",
        });
      }

      kabari(`Kegiatan "${item.nama_kegiatan}" berhasil dihapus`);
      setModalHapus(null);
    } catch (e) {
      kabari(e?.message || "Gagal menghapus kegiatan", "error");
    } finally {
      setMenghapus(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      {/* Toast Notifikasi */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-lg border text-sm font-semibold flex items-center gap-2.5 animate-naik ${
            toast.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {toast.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
          {toast.text}
        </div>
      )}

      {/* HEADER UTAMA */}
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight truncate">
                {bendahara
                  ? "Monitoring Konsumsi"
                  : `Konsumsi ${admin ? "— Semua Bidang" : `— Bidang ${operator?.bidang || "BMN"}`}`}
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
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">KEGIATAN AKTIF</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy">{aktifList.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-mist shadow-2xs p-4 sm:p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">DIBATALKAN</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy">{batalList.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-mist shadow-2xs p-4 sm:p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">JUMLAH PESERTA / PORSI</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy">{totalPorsiAktif}</p>
          </div>

          <div className="bg-white rounded-2xl border border-mist shadow-2xs p-4 sm:p-5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">TOTAL BIAYA</p>
            <p className="text-2xl sm:text-3xl font-black tabular-nums mt-1 text-navy truncate">
              {rupiah(totalBiayaAktif)}
            </p>
          </div>
        </div>

        {/* BANNER INFORMASI & ATURAN SBM PMK */}
        <div className="bg-white rounded-2xl border border-mist/80 shadow-2xs px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs sm:text-sm font-medium text-slate-600">
            Menampilkan ringkasan realisasi{" "}
            <span className="font-bold text-navy">{aktifList.length} kegiatan konsumsi aktif</span> (
            <span className="font-bold text-navy">{totalPorsiAktif} porsi</span>) pada tahun anggaran {tahun}.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50/80 border border-sky-200/80 text-sky-800 text-xs font-bold shrink-0 self-start sm:self-auto">
            <BookOpen className="w-3.5 h-3.5 text-sky-600" />
            <span>PMK 32 Tahun 2025 (Lampiran I Butir 38)</span>
          </div>
        </div>

        {/* SECTION TABEL DAFTAR KONSUMSI */}
        <section className="bg-white rounded-3xl border border-mist shadow-2xs p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
            {/* Input Pencarian */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                className={kelasInput + " w-full pl-10"}
                placeholder="Cari kegiatan, lokasi provinsi, penyedia..."
                value={cari}
                onChange={(e) => setCari(e.target.value)}
              />
            </div>

            {/* Kontrol Saringan & Tombol Baru */}
            <div className="flex flex-wrap items-center gap-2">
              <select className={kelasInput} value={bidang} onChange={(e) => setBidang(e.target.value)}>
                {DAFTAR_BIDANG_PILIHAN.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <select className={kelasInput} value={tahun} onChange={(e) => setTahun(e.target.value)}>
                <option value="2027">2027</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="Semua tahun">Semua tahun</option>
              </select>

              <select className={kelasInput} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Semua status">Semua status</option>
                <option value="Aktif">Aktif</option>
                <option value="Dibatalkan">Dibatalkan</option>
              </select>

              {!bendahara && (
                <Link
                  to={jalur("konsumsi", "baru")}
                  className="inline-flex items-center gap-2 bg-[#123B5D] hover:bg-[#0E2D47] text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Konsumsi baru</span>
                </Link>
              )}
            </div>
          </div>

          {galat && (
            <p className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {galat}
            </p>
          )}

          {/* TABEL DAFTAR KONSUMSI ATAU EMPTY STATE */}
          {memuat ? (
            <div className="py-20 flex justify-center items-center">
              <Loader2 className="w-7 h-7 text-brand animate-spin" />
            </div>
          ) : dataTampil.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-50 border border-mist flex items-center justify-center">
                <Coffee className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-base font-bold text-navy">Belum ada kegiatan konsumsi</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {lihatEmptyState
                  ? "Tampilan pratinjau Empty State aktif. Klik tombol \"Lihat Empty State\" di kanan atas untuk kembali."
                  : "Belum ada data pengajuan konsumsi yang sesuai dengan filter pencarian."}
              </p>
              {!bendahara && !lihatEmptyState && (
                <Link
                  to={jalur("konsumsi", "baru")}
                  className="inline-flex items-center gap-2 mt-4 bg-brand hover:bg-navy text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Konsumsi Baru
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[1020px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-mist bg-slate-50/50">
                    <th className="py-3.5 px-3 font-bold text-center w-12">NO</th>
                    <th className="py-3.5 px-3.5 font-bold">KEGIATAN</th>
                    <th className="py-3.5 px-3.5 font-bold whitespace-nowrap">TANGGAL & HARI</th>
                    <th className="py-3.5 px-3.5 font-bold text-center whitespace-nowrap">BIDANG</th>
                    <th className="py-3.5 px-3.5 font-bold text-center whitespace-nowrap">PORSI</th>
                    <th className="py-3.5 px-3.5 font-bold whitespace-nowrap">TOTAL BIAYA</th>
                    <th className="py-3.5 px-3.5 font-bold min-w-[200px]">KINERJA / RINCIAN</th>
                    <th className="py-3.5 px-3.5 font-bold text-center whitespace-nowrap">BERKAS</th>
                    <th className="py-3.5 px-3.5 font-bold text-center whitespace-nowrap">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist/60">
                  {dataTampil.map((d, index) => {
                    const batalkan = d.status === "dibatalkan";
                    const hariNama = ambilHari(d.tanggal_kegiatan);
                    const duaResto = Boolean(d.isian?.dua_restoran || d.isian?.penyedia_2);
                    const daftarMenu = (d.isian?.items || [])
                      .map((it) => it.uraianMenu || it.namaItem || it.uraian)
                      .filter(Boolean);
                    const ringkasanMenu = duaResto
                      ? `[2 Resto] 1. ${d.penyedia || "Resto 1"} & 2. ${d.isian?.penyedia_2 || "Resto 2"}${daftarMenu.length > 0 ? " — " + daftarMenu.join(", ") : ""}`
                      : daftarMenu.length > 0
                        ? `${d.penyedia ? d.penyedia + " — " : ""}${daftarMenu.join(", ")}`
                        : d.penyedia || d.lokasi_detail || "-";

                    return (
                      <tr
                        key={d.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          batalkan ? "bg-slate-50/70 text-slate-400" : ""
                        }`}
                      >
                        {/* 1. NO */}
                        <td className="py-4 px-3 text-center text-xs font-semibold text-slate-400">
                          {index + 1}
                        </td>

                        {/* 2. KEGIATAN */}
                        <td className="py-4 px-3.5 max-w-[280px]">
                          <p
                            className={`font-bold text-navy text-sm leading-snug line-clamp-2 ${
                              batalkan ? "line-through text-slate-400" : "hover:text-brand"
                            }`}
                          >
                            {d.nama_kegiatan || "(Kegiatan tanpa nama)"}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {d.nomor_spby && (
                              <span className="text-[11px] text-slate-400 font-medium truncate max-w-[180px]" title={d.nomor_spby}>
                                {d.nomor_spby}
                              </span>
                            )}
                            {duaResto && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                                2 Resto (2 SPBY & 2 Kwitansi)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. TANGGAL & HARI */}
                        <td className="py-4 px-3.5 whitespace-nowrap">
                          <p className="font-bold text-navy text-xs leading-none">
                            {d.tanggal_kegiatan || "-"}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{hariNama}</p>
                        </td>

                        {/* 4. BIDANG (Teks murni tanpa background/border/warna hijau) */}
                        <td className="py-4 px-3.5 text-center whitespace-nowrap">
                          <span className="font-bold text-navy text-sm">
                            {d.bidang || "BMN"}
                          </span>
                          {batalkan && (
                            <span className="block text-[10px] text-slate-400 font-medium mt-0.5" title={d.alasan_batal || "Dibatalkan"}>
                              (Batal)
                            </span>
                          )}
                        </td>

                        {/* 5. PORSI (Bold metric like MASUK) */}
                        <td className="py-4 px-3.5 text-center whitespace-nowrap">
                          <span className="font-bold text-navy text-sm tabular-nums">
                            {d.jumlah_porsi}
                          </span>
                        </td>

                        {/* 6. TOTAL BIAYA (Bold metric like PULANG) */}
                        <td className="py-4 px-3.5 whitespace-nowrap">
                          <p className="font-bold text-navy text-sm tabular-nums">{rupiah(d.total)}</p>
                          <p className="text-[10px] font-medium text-slate-500 tabular-nums">
                            Netto: {rupiah(d.netto || d.total - (d.pajak_pph23 || 0))}
                          </p>
                        </td>

                        {/* 7. KINERJA / RINCIAN (analogous to KINERJA HARIAN) */}
                        <td className="py-4 px-3.5 max-w-[260px]">
                          <p className="text-xs text-slate-600 leading-relaxed line-clamp-2" title={ringkasanMenu}>
                            {ringkasanMenu}
                          </p>
                        </td>

                        {/* 8. BERKAS (Two rounded outline icon buttons like FOTO) */}
                        <td className="py-4 px-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center justify-center gap-2">
                            {/* Tombol PDF (Sky / Cyan outline) */}
                            <button
                              type="button"
                              onClick={() => unduhPdf(d)}
                              className="p-2 rounded-xl border border-sky-300 text-sky-600 bg-white hover:bg-sky-50 hover:border-sky-400 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                              title="Buka / Cetak PDF SPBY & Kwitansi"
                            >
                              <FileText className="w-4 h-4" />
                            </button>

                            {/* Tombol Rincian / Detail (Purple outline) */}
                            <button
                              type="button"
                              onClick={() => setModalDetail(d)}
                              className="p-2 rounded-xl border border-purple-300 text-purple-600 bg-white hover:bg-purple-50 hover:border-purple-400 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                              title="Lihat Rincian Kegiatan & Pesanan"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                        {/* 9. AKSI (Three rounded outline buttons: Clock, Pencil, Trash2) */}
                        <td className="py-4 px-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            {/* Tombol 1: Clock (Riwayat Pembatalan atau Batalkan) */}
                            <button
                              type="button"
                              onClick={() => {
                                if (batalkan) {
                                  setModalRiwayat(d);
                                } else {
                                  setModalBatal(d);
                                  setAlasanBatal("");
                                }
                              }}
                              className={`p-2 rounded-xl border bg-white transition-colors cursor-pointer shadow-2xs inline-flex items-center justify-center ${
                                batalkan
                                  ? "border-amber-300 text-amber-600 hover:bg-amber-50 hover:border-amber-400"
                                  : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-navy"
                              }`}
                              title={batalkan ? "Lihat Catatan Pembatalan" : "Batalkan Pengajuan"}
                            >
                              <Clock className="w-4 h-4" />
                            </button>

                            {/* Tombol 2: Pencil (Ubah) */}
                            {!bendahara && !batalkan ? (
                              <Link
                                to={jalur("konsumsi", d.id)}
                                className="p-2 rounded-xl border border-slate-200 text-slate-500 bg-white hover:border-brand hover:text-brand hover:bg-sky-50/50 transition-colors shadow-2xs inline-flex items-center justify-center"
                                title="Ubah Pengajuan"
                              >
                                <Pencil className="w-4 h-4" />
                              </Link>
                            ) : (
                              <span
                                className="p-2 rounded-xl border border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed inline-flex items-center justify-center"
                                title="Tidak dapat diubah"
                              >
                                <Pencil className="w-4 h-4" />
                              </span>
                            )}

                            {/* Tombol 3: Trash2 (Hapus Permanen) */}
                            {!bendahara && (
                              <button
                                type="button"
                                onClick={() => setModalHapus(d)}
                                className="p-2 rounded-xl border border-slate-200 text-slate-500 bg-white hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shadow-2xs inline-flex items-center justify-center"
                                title="Hapus Permanen"
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

      {/* MODAL DETAIL KONSUMSI (Dipicu oleh tombol Eye warna ungu di kolom BERKAS) */}
      {modalDetail && (() => {
        const duaRestoModal = Boolean(modalDetail.isian?.dua_restoran || modalDetail.isian?.penyedia_2);

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-2xs animate-pudar">
          <div className="bg-white rounded-3xl border border-mist shadow-2xl p-6 w-full max-w-xl animate-muncul max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-mist">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-navy leading-none">Rincian Kegiatan Konsumsi</h3>
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
                {duaRestoModal && (
                  <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                    Mode 1 Rapat 2 Restoran (2 SPBY & 2 Kwitansi)
                  </span>
                )}
              </div>

              {duaRestoModal ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-mist text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-brand/20">
                    <span className="text-[10px] font-black uppercase text-brand block">Restoran 1 (Vendor Pertama)</span>
                    <span className="font-bold text-navy block text-sm mt-0.5">{modalDetail.penyedia || modalDetail.isian?.penyedia || "-"}</span>
                    <span className="text-slate-400 block text-[11px] mt-1">SPBY: {modalDetail.nomor_spby || modalDetail.isian?.nomor_spby || "-"}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-purple-200">
                    <span className="text-[10px] font-black uppercase text-purple-700 block">Restoran 2 (Vendor Kedua)</span>
                    <span className="font-bold text-navy block text-sm mt-0.5">{modalDetail.isian?.penyedia_2 || "-"}</span>
                    <span className="text-slate-400 block text-[11px] mt-1">SPBY: {modalDetail.isian?.nomor_spby_2 || "-"}</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-mist text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Penyedia Katering:</span>
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
                    <span className="text-slate-400 block font-medium">Nomor BKU:</span>
                    <span className="font-bold text-navy">{modalDetail.nomor_bku || "-"}</span>
                  </div>
                </div>
              )}

              {/* Rincian Menu Pesanan */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Item Konsumsi Pesanan
                </p>
                <div className="border border-mist rounded-2xl overflow-hidden text-xs">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-mist text-left text-[11px] font-bold text-slate-500">
                        <th className="py-2 px-3">Uraian Menu</th>
                        {duaRestoModal && (
                          <th className="py-2 px-3">Vendor</th>
                        )}
                        <th className="py-2 px-3 text-center">Volume</th>
                        <th className="py-2 px-3 text-right">Harga Satuan</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist/60">
                      {(modalDetail.isian?.items || []).map((it, idx) => {
                        const namaMenu = it.uraianMenu || it.namaItem || it.uraian || `Menu ${idx + 1}`;
                        const vol = Number(it.volume || it.porsi) || 0;
                        const hrg = Number(it.hargaSatuan || it.harga_satuan) || 0;
                        const sub = Number(it.subtotal || it.jumlah_harga) || vol * hrg;
                        const isResto2 = it.resto === 2;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-navy">{namaMenu}</td>
                            {duaRestoModal && (
                              <td className="py-2 px-3">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isResto2 ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800"}`}>
                                  {isResto2 ? "Resto 2" : "Resto 1"}
                                </span>
                              </td>
                            )}
                            <td className="py-2 px-3 text-center text-slate-600">
                              {vol} {it.satuan || "Pax"}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600 tabular-nums">{rupiah(hrg)}</td>
                            <td className="py-2 px-3 text-right font-bold text-navy tabular-nums">{rupiah(sub)}</td>
                          </tr>
                        );
                      })}
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
                  <span>Potongan Pajak (PPh Pasal 23):</span>
                  <span className="tabular-nums">- {rupiah(modalDetail.pajak_pph23 || 0)}</span>
                </div>
                <div className="flex justify-between font-black text-emerald-800 pt-1.5 border-t border-emerald-200 text-sm">
                  <span>Bersih Dibayarkan:</span>
                  <span className="tabular-nums">{rupiah(modalDetail.netto || modalDetail.total - (modalDetail.pajak_pph23 || 0))}</span>
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
        );
      })()}

      {/* MODAL RIWAYAT PEMBATALAN (Dipicu oleh tombol Clock pada baris Dibatalkan) */}
      {modalRiwayat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-2xs animate-pudar">
          <div className="bg-white rounded-3xl border border-mist shadow-2xl p-6 w-full max-w-md animate-muncul">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-mist">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-navy leading-none">Riwayat Pembatalan</h3>
                  <p className="text-xs text-slate-500 mt-1">Status Kegiatan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalRiwayat(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <p className="text-xs text-slate-400 font-semibold">Nama Kegiatan</p>
                <p className="text-sm font-bold text-navy mt-0.5">{modalRiwayat.nama_kegiatan}</p>
              </div>

              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100">
                <p className="text-xs font-bold text-rose-700">Alasan Pembatalan:</p>
                <p className="text-xs text-rose-800 mt-1 italic leading-relaxed">
                  &ldquo;{modalRiwayat.alasan_batal || "Tidak ada alasan yang dicantumkan."}&rdquo;
                </p>
                {modalRiwayat.tanggal_batal && (
                  <p className="text-[10px] text-rose-500 mt-2 font-medium">
                    Dibatalkan pada: {modalRiwayat.tanggal_batal}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalRiwayat(null)}
                className="px-4 py-2 rounded-xl border border-mist text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Tutup
              </button>
              {!bendahara && (
                <button
                  type="button"
                  onClick={() => pulihkanKegiatan(modalRiwayat)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer"
                >
                  Pulihkan Kegiatan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PEMBATALAN */}
      {modalBatal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-2xs animate-pudar">
          <div className="bg-white rounded-3xl border border-mist shadow-2xl p-6 w-full max-w-md animate-muncul">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-navy flex items-center gap-2">
                <Ban className="w-5 h-5 text-amber-500" />
                Batalkan Pengajuan Konsumsi
              </h3>
              <button
                type="button"
                onClick={() => setModalBatal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Anda akan membatalkan kegiatan{" "}
              <strong className="text-navy">{modalBatal.nama_kegiatan}</strong>. Masukkan alasan pembatalan di bawah ini:
            </p>

            <textarea
              className={kelasInput + " w-full h-24 mb-4 resize-none"}
              placeholder="Contoh: Rapat ditunda atau alokasi anggaran dibatalkan..."
              value={alasanBatal}
              onChange={(e) => setAlasanBatal(e.target.value)}
            />

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
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Konfirmasi Pembatalan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL POP-UP HAPUS PERMANEN (MENGGANTIKAN WINDOW.CONFIRM) */}
      {modalHapus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/40 backdrop-blur-2xs animate-pudar">
          <div className="bg-white rounded-3xl border border-mist shadow-2xl p-6 w-full max-w-md animate-muncul">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-navy flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                  <Trash2 className="w-4 h-4" />
                </div>
                <span>Hapus Pengajuan Konsumsi</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalHapus(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-3 leading-relaxed">
              Hapus permanen kegiatan konsumsi <strong className="text-navy">&ldquo;{modalHapus.nama_kegiatan}&rdquo;</strong>?
            </p>
            <p className="text-xs text-rose-600 font-medium mb-6 bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Data tidak dapat dikembalikan setelah dihapus.</span>
            </p>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalHapus(null)}
                className="px-4 py-2.5 rounded-xl border border-mist text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={konfirmasiHapus}
                disabled={menghapus}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {menghapus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Hapus Permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
