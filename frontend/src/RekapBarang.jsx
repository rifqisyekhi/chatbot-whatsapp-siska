import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  FileSpreadsheet,
  FileDown,
  Upload,
  History,
  UserPen,
  PackageOpen,
  AlertCircle,
  FileText,
  Filter,
  PackagePlus,
  PackageMinus,
  SlidersHorizontal,
  ClipboardList,
} from "lucide-react";
import { apiTU } from "./services/ApiTU";
import { bacaOperator, simpanOperator, headerOperator } from "./services/operatorBarang";
import {
  LABEL_JENIS,
  unduhTemplate,
  bacaBerkasImpor,
  exportRekapExcel,
} from "./services/excelRekap";

// Tab Rekap & Audit di dashboard barang.
//
// Setiap baris di sini adalah satu MUTASI: barang masuk (pembelian), keluar
// (diambil pegawai, terutama lewat order WA), atau koreksi stock opname. Menambah, mengedit, atau menghapus
// mutasi LANGSUNG mengubah stok barangnya (server yang mengurus, dalam satu
// transaksi), dan setiap perubahan tercatat di log yang bisa dibuka lewat
// tombol riwayat — itu yang membuat rekap yang bisa diedit tetap layak audit.
//
// Order dari WhatsApp tercatat sendiri (sumber "wa"), jadi operator tidak
// perlu menyalinnya.

const BASE_URL = (import.meta.env.VITE_API_TU || "").replace(/\/$/, "");

// Pilihan baris per halaman; yang pertama jadi bawaan.
const PILIHAN_PER_HALAMAN = [10, 25, 50, 100];

const dua = (n) => String(n).padStart(2, "0");

// Tanggal "hari ini" menurut WIB, apa pun zona waktu komputer operatornya.
function hariIniWib(geserHari = 0) {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + geserHari * 86400000);
  return `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}`;
}

const awalBulanWib = () => `${hariIniWib().slice(0, 8)}01`;

function akhirBulanLaluWib() {
  const [th, bln] = hariIniWib().split("-").map(Number);
  // Hari ke-0 bulan ini = hari terakhir bulan lalu.
  const d = new Date(Date.UTC(th, bln - 1, 0));
  return `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}`;
}

const awalBulanLaluWib = () => `${akhirBulanLaluWib().slice(0, 8)}01`;

const tampilJam = (nilai) =>
  new Date(nilai).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

function tampilTanggal(nilai, denganJam = true) {
  if (!nilai) return "-";
  return new Date(nilai).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(denganJam ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

// Nilai untuk <input type="datetime-local">, dalam WIB.
function keIsianWaktu(nilai) {
  const d = new Date(new Date(nilai || Date.now()).getTime() + 7 * 3600 * 1000);
  return (
    `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}` +
    `T${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}`
  );
}

const dariIsianWaktu = (v) => (v ? `${v}:00+07:00` : "");

const GAYA_JENIS = {
  masuk: "bg-emerald-100 text-emerald-800",
  keluar: "bg-rose-100 text-rose-700",
  koreksi: "bg-amber-100 text-amber-800",
};

const FORM_KOSONG = {
  tanggal: "",
  id_barang: "",
  jenis: "keluar",
  jumlah: 1,
  pihak: "",
  unit: "",
  keterangan: "",
};

const kelasIsian =
  "w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white " +
  "border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 " +
  "outline-none text-sm font-medium transition-all";

const kelasLabel = "block text-xs font-bold text-navy uppercase tracking-wider mb-1.5";

const kelasSaring =
  "w-full cursor-pointer rounded-xl border border-mist bg-white px-3 py-2 text-xs font-medium focus:border-brand focus:outline-hidden focus:ring-2 focus:ring-brand/30 sm:text-sm";

const kelasLabelSaring = "mb-1 block text-[11px] font-semibold text-slate-500";

const kelasTombolGaris =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-mist bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

const RekapBarang = ({ databaseBarang, showToast, onStokBerubah }) => {
  const [baris, setBaris] = useState([]);
  const [ringkasan, setRingkasan] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dari, setDari] = useState(awalBulanWib);
  const [sampai, setSampai] = useState(() => hariIniWib());
  const [jenis, setJenis] = useState("");
  const [idBarang, setIdBarang] = useState("");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [perHalaman, setPerHalaman] = useState(PILIHAN_PER_HALAMAN[0]);

  const [operator, setOperator] = useState(bacaOperator);

  const [modalForm, setModalForm] = useState(null); // null | { baris?: mutasi }
  const [form, setForm] = useState(FORM_KOSONG);
  const [menyimpan, setMenyimpan] = useState(false);

  const [modalHapus, setModalHapus] = useState(null);
  const [modalLog, setModalLog] = useState(null); // { mutasi, log }
  const [impor, setImpor] = useState(null); // { berkas, baris }
  const [sibukExcel, setSibukExcel] = useState(false);

  const inputBerkas = useRef(null);

  // Pencarian teks dikirim ke server setelah operator berhenti mengetik,
  // bukan pada setiap huruf.
  const [cariTertunda, setCariTertunda] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setCariTertunda(cari.trim()), 350);
    return () => clearTimeout(t);
  }, [cari]);

  const parameter = useMemo(() => {
    const p = new URLSearchParams();
    if (dari) p.set("dari", dari);
    if (sampai) p.set("sampai", sampai);
    if (jenis) p.set("jenis", jenis);
    if (idBarang) p.set("id_barang", idBarang);
    if (cariTertunda) p.set("cari", cariTertunda);
    return p.toString();
  }, [dari, sampai, jenis, idBarang, cariTertunda]);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const hasil = await apiTU({ url: `api/mutasi-barang?${parameter}` });
      setBaris(hasil?.data || []);
      setRingkasan(hasil?.ringkasan || []);
      setHalaman(1);
    } catch (err) {
      showToast(`Gagal memuat rekap: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [parameter, showToast]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Setiap tulis mengubah stok, jadi tabel inventaris di tab sebelah ikut
  // dimuat ulang.
  const sesudahTulis = useCallback(async () => {
    await muat();
    onStokBerubah?.();
  }, [muat, onStokBerubah]);

  const tulis = async ({ url, method, body }) =>
    apiTU({ url, method, options: { body, headers: headerOperator(operator) } });

  const ubahOperator = (nama) => {
    setOperator(nama);
    simpanOperator(nama.trim());
  };

  // --- RINGKASAN ---
  const total = useMemo(
    () =>
      ringkasan.reduce(
        (acc, r) => {
          acc.masuk += r.masuk;
          acc.keluar += r.keluar;
          acc.koreksi += r.koreksi;
          return acc;
        },
        { masuk: 0, keluar: 0, koreksi: 0 },
      ),
    [ringkasan],
  );

  const totalHalaman = Math.max(1, Math.ceil(baris.length / perHalaman));
  const barisHalaman = useMemo(
    () => baris.slice((halaman - 1) * perHalaman, halaman * perHalaman),
    [baris, halaman, perHalaman],
  );
  const awalTampil = baris.length === 0 ? 0 : (halaman - 1) * perHalaman + 1;
  const akhirTampil = Math.min(halaman * perHalaman, baris.length);

  const barangTerpilih = databaseBarang.find((b) => b.id === form.id_barang);

  // --- FORM ---
  const bukaForm = (mutasi = null) => {
    setForm(
      mutasi
        ? {
            tanggal: keIsianWaktu(mutasi.tanggal),
            id_barang: mutasi.id_barang,
            jenis: mutasi.jenis,
            jumlah: mutasi.jumlah,
            pihak: mutasi.pihak || "",
            unit: mutasi.unit || "",
            keterangan: mutasi.keterangan || "",
          }
        : { ...FORM_KOSONG, tanggal: keIsianWaktu() },
    );
    setModalForm({ baris: mutasi });
  };

  const simpanForm = async (e) => {
    e.preventDefault();
    if (!form.id_barang) return showToast("Pilih barangnya dulu.", "error");

    const body = {
      ...form,
      tanggal: dariIsianWaktu(form.tanggal),
      jumlah: Number(form.jumlah),
    };

    setMenyimpan(true);
    try {
      const lama = modalForm?.baris;
      await tulis(
        lama
          ? { url: `api/mutasi-barang/${lama.id}`, method: "PUT", body }
          : { url: "api/mutasi-barang", method: "POST", body },
      );
      setModalForm(null);
      showToast(lama ? "Mutasi diperbarui, stok disesuaikan." : "Mutasi dicatat.", "success");
      sesudahTulis();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const konfirmasiHapus = async () => {
    setMenyimpan(true);
    try {
      await tulis({ url: `api/mutasi-barang/${modalHapus.id}`, method: "DELETE" });
      setModalHapus(null);
      showToast("Mutasi dihapus, stok dikembalikan.", "success");
      sesudahTulis();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const bukaLog = async (mutasi) => {
    setModalLog({ mutasi, log: null });
    try {
      const log = await apiTU({ url: `api/mutasi-barang/${mutasi.id}/log` });
      setModalLog({ mutasi, log });
    } catch (err) {
      setModalLog(null);
      showToast(`Gagal memuat riwayat: ${err.message}`, "error");
    }
  };

  // --- EXCEL & PDF ---
  const pilihBerkas = async (e) => {
    const berkas = e.target.files?.[0];
    e.target.value = "";
    if (!berkas) return;

    setSibukExcel(true);
    try {
      const hasil = await bacaBerkasImpor(berkas, databaseBarang);
      if (!hasil.length) {
        showToast("Berkas tidak berisi baris mutasi.", "error");
        return;
      }
      setImpor({ berkas, baris: hasil });
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSibukExcel(false);
    }
  };

  const jalankanImpor = async () => {
    setMenyimpan(true);
    try {
      const hasil = await tulis({
        url: "api/mutasi-barang/import",
        method: "POST",
        // `galat` hanya untuk pratinjau; server memeriksa ulang sendiri.
        body: {
          baris: impor.baris.map((b) => {
            const kirim = { ...b };
            delete kirim.galat;
            return kirim;
          }),
        },
      });
      setImpor(null);
      showToast(hasil?.message || "Import berhasil.", "success");
      sesudahTulis();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const unduhExcel = async () => {
    setSibukExcel(true);
    try {
      await exportRekapExcel(baris, ringkasan, { dari, sampai });
    } catch (err) {
      showToast(`Gagal membuat Excel: ${err.message}`, "error");
    } finally {
      setSibukExcel(false);
    }
  };

  const urlPdf = () => {
    const p = new URLSearchParams(parameter);
    if (operator) p.set("oleh", operator);
    return `${BASE_URL}/api/mutasi-barang/pdf?${p.toString()}`;
  };

  const ambilTemplate = async () => {
    setSibukExcel(true);
    try {
      await unduhTemplate(databaseBarang);
    } catch (err) {
      showToast(`Gagal membuat template: ${err.message}`, "error");
    } finally {
      setSibukExcel(false);
    }
  };

  const galatImpor = impor ? impor.baris.filter((b) => b.galat.length).length : 0;

  return (
    <>
      {/* JUDUL & AKSI */}
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-navy sm:text-lg">Rekap & Audit Mutasi Barang</h2>
          <p className="text-[11px] text-slate-500 sm:text-xs">
            Barang masuk (pembelian), keluar (diambil pegawai), dan koreksi stock opname.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={ambilTemplate} disabled={sibukExcel} className={kelasTombolGaris}>
            <FileSpreadsheet className="h-4 w-4 text-slate-500" />
            Template
          </button>
          <button
            type="button"
            onClick={() => inputBerkas.current?.click()}
            disabled={sibukExcel}
            className={kelasTombolGaris}
          >
            <Upload className="h-4 w-4 text-brand" />
            Import
          </button>
          <input ref={inputBerkas} type="file" accept=".xlsx,.csv" className="hidden" onChange={pilihBerkas} />
          <button
            type="button"
            onClick={unduhExcel}
            disabled={sibukExcel || !baris.length}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            title="Unduh rekap sesuai saringan (.xlsx)"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Unduh Excel
          </button>
          <a
            href={urlPdf()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 shadow-xs transition-all hover:bg-rose-100 active:scale-95"
            title="Laporan PDF sesuai saringan"
          >
            <FileDown className="h-4 w-4" />
            Unduh PDF
          </a>
          <button
            type="button"
            onClick={() => bukaForm()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-navy hover:shadow-sm active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Catat Mutasi
          </button>
        </div>
      </div>

      {/* STATISTIK RINGKASAN */}
      <div className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KartuAngka
          Ikon={PackagePlus}
          warnaIkon="bg-emerald-50 text-emerald-600"
          label="Barang Masuk"
          nilai={total.masuk}
          warna="text-emerald-700"
          sub="unit dibeli pada periode"
        />
        <KartuAngka
          Ikon={PackageMinus}
          warnaIkon="bg-rose-50 text-rose-600"
          label="Barang Keluar"
          nilai={total.keluar}
          warna="text-rose-600"
          sub="unit diambil pegawai"
        />
        <KartuAngka
          Ikon={SlidersHorizontal}
          warnaIkon="bg-amber-50 text-amber-600"
          label="Koreksi Stok"
          nilai={`${total.koreksi > 0 ? "+" : ""}${total.koreksi}`}
          warna="text-amber-700"
          sub="selisih stock opname"
        />
        <KartuAngka
          Ikon={ClipboardList}
          warnaIkon="bg-blue-50 text-brand"
          label="Total Transaksi"
          nilai={baris.length}
          warna="text-navy"
          sub="baris mutasi tercatat"
        />
      </div>

      {/* FILTER */}
      <div className="flex shrink-0 flex-col gap-4 rounded-2xl border border-mist/80 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex flex-col justify-between gap-3 border-b border-mist/60 pb-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-bold text-navy">Filter Periode & Kriteria</h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 text-[11px] text-slate-400">Preset:</span>
            {[
              ["Hari Ini", hariIniWib(), hariIniWib()],
              ["Bulan Ini", awalBulanWib(), hariIniWib()],
              ["Bulan Lalu", awalBulanLaluWib(), akhirBulanLaluWib()],
              ["Semua", "", ""],
            ].map(([label, d, s]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setDari(d);
                  setSampai(s);
                }}
                className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-all active:scale-95 ${
                  dari === d && sampai === s
                    ? "border-brand bg-brand text-white shadow-xs"
                    : "border-mist text-slate-700 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={kelasLabelSaring}>Dari Tanggal</label>
            <input
              type="date"
              className={kelasSaring}
              value={dari}
              max={sampai || undefined}
              onChange={(e) => setDari(e.target.value)}
            />
          </div>
          <div>
            <label className={kelasLabelSaring}>Sampai Tanggal</label>
            <input
              type="date"
              className={kelasSaring}
              value={sampai}
              min={dari || undefined}
              onChange={(e) => setSampai(e.target.value)}
            />
          </div>
          <div>
            <label className={kelasLabelSaring}>Jenis Mutasi</label>
            <select className={kelasSaring} value={jenis} onChange={(e) => setJenis(e.target.value)}>
              <option value="">Semua Jenis</option>
              {Object.entries(LABEL_JENIS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={kelasLabelSaring}>Barang</label>
            <select className={`${kelasSaring} truncate`} value={idBarang} onChange={(e) => setIdBarang(e.target.value)}>
              <option value="">Semua Barang</option>
              {databaseBarang.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} — {b.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* PENCARIAN, PENCATAT & BARIS PER HALAMAN */}
      <div className="flex shrink-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari barang, pegawai, unit, atau keterangan..."
            className="w-full rounded-xl border border-mist bg-white py-2 pl-9 pr-8 text-xs shadow-2xs focus:border-brand focus:outline-hidden focus:ring-2 focus:ring-brand/30 sm:text-sm"
          />
          {cari && (
            <button
              type="button"
              onClick={() => setCari("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 self-end text-xs text-slate-500 sm:self-auto">
          <label
            className="inline-flex items-center gap-1.5 rounded-xl border border-mist bg-white px-2.5 py-1.5 shadow-2xs"
            title="Nama ini dicatat di kolom 'dicatat oleh' dan log perubahan"
          >
            <UserPen className="h-3.5 w-3.5 text-brand" />
            <input
              type="text"
              placeholder="Nama pencatat"
              className="w-32 bg-transparent text-xs font-semibold text-navy outline-none placeholder:font-normal"
              value={operator}
              onChange={(e) => ubahOperator(e.target.value)}
            />
          </label>
          <span className="font-medium">
            Ditemukan: <strong className="text-navy">{baris.length}</strong> data
            {baris.length >= 5000 && " (dibatasi 5000)"}
          </span>
          <div className="flex items-center gap-1.5">
            <span>Baris:</span>
            <select
              value={perHalaman}
              onChange={(e) => {
                setPerHalaman(Number(e.target.value));
                setHalaman(1);
              }}
              className="rounded-lg border border-mist bg-white px-2 py-1 text-xs font-semibold text-navy focus:outline-hidden"
            >
              {PILIHAN_PER_HALAMAN.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TABEL MUTASI */}
      <div className="shrink-0 overflow-hidden rounded-2xl border border-mist/80 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="whitespace-nowrap border-b border-mist/80 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-12 px-4 py-3.5 text-center">No</th>
                <th className="px-4 py-3.5">Tanggal</th>
                <th className="min-w-[180px] px-4 py-3.5">Barang</th>
                <th className="px-3 py-3.5 text-center">Jenis</th>
                <th className="px-3 py-3.5 text-right">Jumlah</th>
                <th className="px-3 py-3.5 text-right" title="Stok barang sesudah mutasi ini, saat dicatat">
                  Stok
                </th>
                <th className="min-w-[180px] px-4 py-3.5">Pegawai / Unit</th>
                <th className="min-w-[200px] px-4 py-3.5">Keterangan</th>
                <th className="px-4 py-3.5">Dicatat</th>
                <th className="px-4 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist/50">
              {loading && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-brand" />
                    <span>Sedang memuat rekap mutasi...</span>
                  </td>
                </tr>
              )}

              {!loading && barisHalaman.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <PackageOpen className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-500">Tidak ada mutasi yang cocok.</p>
                    <p className="mt-0.5 text-[11px]">Coba ubah rentang tanggal atau kata kunci pencarian.</p>
                  </td>
                </tr>
              )}

              {!loading &&
                barisHalaman.map((m, idx) => (
                  <tr key={m.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3.5 text-center font-semibold text-slate-400">
                      {(halaman - 1) * perHalaman + idx + 1}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <div className="font-semibold text-slate-700">{tampilTanggal(m.tanggal, false)}</div>
                      <div className="text-[11px] text-slate-400">{tampilJam(m.tanggal)} WIB</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[13px] font-bold text-navy">{m.nama_barang}</div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{m.id_barang}</div>
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${GAYA_JENIS[m.jenis] || GAYA_JENIS.koreksi}`}
                      >
                        {LABEL_JENIS[m.jenis] || m.jenis}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right">
                      <span className="text-[13px] font-bold text-slate-700">
                        {m.jenis === "koreksi" && m.jumlah > 0 ? "+" : ""}
                        {m.jumlah}
                      </span>{" "}
                      <span className="text-[10px] text-slate-400">{m.satuan}</span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-semibold text-slate-500">{m.stok_sesudah ?? "-"}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-navy">{m.pihak || "-"}</div>
                      {m.unit && (
                        <span className="mt-0.5 inline-block rounded-sm bg-slate-100 px-1.5 text-[10px] font-medium text-slate-600">
                          {m.unit}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[260px] px-4 py-3.5 text-slate-600">
                      {m.keterangan ? (
                        <div className="line-clamp-2 text-[11px]" title={m.keterangan}>
                          {m.keterangan}
                        </div>
                      ) : (
                        <span className="text-[11px] italic text-slate-300">Tidak ada keterangan</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-slate-500">
                      <div className="font-semibold text-slate-700">{m.dicatat_oleh || "-"}</div>
                      <div className="uppercase tracking-wider">{m.sumber}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {m.ada_bukti && (
                          <a
                            href={`${BASE_URL}/api/mutasi-barang/${m.id}/bukti`}
                            target="_blank"
                            rel="noreferrer"
                            className="cursor-pointer rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-amber-700 transition-all hover:border-amber-400 hover:bg-amber-100"
                            title="Bukti serah terima barang (PDF)"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => bukaLog(m)}
                          className="cursor-pointer rounded-lg border border-mist p-1.5 text-slate-600 transition-all hover:border-brand hover:bg-blue-50/50 hover:text-brand"
                          title="Riwayat perubahan"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => bukaForm(m)}
                          className="cursor-pointer rounded-lg border border-mist p-1.5 text-slate-600 transition-all hover:border-brand hover:bg-blue-50/50 hover:text-brand"
                          title="Edit mutasi"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalHapus(m)}
                          className="cursor-pointer rounded-lg border border-rose-200 p-1.5 text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50"
                          title="Hapus mutasi"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINASI */}
      {!loading && baris.length > 0 && (
        <div className="flex shrink-0 flex-col items-center justify-between gap-3 rounded-2xl border border-mist/80 bg-white p-3 text-xs text-slate-600 shadow-2xs sm:flex-row sm:p-4">
          <div>
            Menampilkan{" "}
            <strong>
              {awalTampil} - {akhirTampil}
            </strong>{" "}
            dari <strong>{baris.length}</strong> mutasi
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHalaman((p) => Math.max(1, p - 1))}
              disabled={halaman <= 1}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-mist px-3 py-1.5 font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Sebelumnya</span>
            </button>
            <span className="px-3 py-1 font-bold text-navy">
              Halaman {halaman} dari {totalHalaman}
            </span>
            <button
              type="button"
              onClick={() => setHalaman((p) => Math.min(totalHalaman, p + 1))}
              disabled={halaman >= totalHalaman}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-mist px-3 py-1.5 font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              <span>Berikutnya</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL CATAT / EDIT MUTASI */}
      {modalForm && (
        <Latar>
          <form
            onSubmit={simpanForm}
            className="flex max-h-[92vh] w-full max-w-xl animate-muncul flex-col overflow-hidden rounded-3xl border border-mist bg-white shadow-2xl"
          >
            <KepalaModal
              judul={modalForm.baris ? "Edit Mutasi" : "Catat Mutasi Barang"}
              sub={
                modalForm.baris
                  ? "Stok barang akan disesuaikan dengan perubahan ini, dan perubahannya tercatat di riwayat."
                  : "Stok barang langsung berubah sesuai jenis dan jumlahnya."
              }
              onTutup={() => setModalForm(null)}
            />

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={kelasLabel}>
                    Tanggal <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    className={kelasIsian}
                    value={form.tanggal}
                    onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  />
                </div>
                <div>
                  <label className={kelasLabel}>
                    Jenis <span className="text-rose-600">*</span>
                  </label>
                  <select
                    className={`${kelasIsian} cursor-pointer`}
                    value={form.jenis}
                    onChange={(e) => setForm({ ...form, jenis: e.target.value })}
                  >
                    {Object.entries(LABEL_JENIS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={kelasLabel}>
                  Barang <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  className={`${kelasIsian} cursor-pointer`}
                  value={form.id_barang}
                  onChange={(e) => setForm({ ...form, id_barang: e.target.value })}
                >
                  <option value="" disabled>
                    Pilih barang...
                  </option>
                  {databaseBarang.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} — {b.nama} (stok {b.stok})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={kelasLabel}>
                  Jumlah {barangTerpilih && `(${barangTerpilih.satuan || "Pcs"})`}{" "}
                  <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  step="1"
                  min={form.jenis === "koreksi" ? undefined : 1}
                  className={kelasIsian}
                  value={form.jumlah}
                  onChange={(e) => setForm({ ...form, jumlah: e.target.value })}
                />
                {form.jenis === "koreksi" && (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Koreksi stock opname: isi minus bila fisik lebih sedikit dari sistem (mis. -2), plus bila lebih
                    banyak.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={kelasLabel}>{form.jenis === "masuk" ? "Diterima dari" : "Pegawai"}</label>
                  <input
                    type="text"
                    className={kelasIsian}
                    placeholder={form.jenis === "masuk" ? "Penyedia / pengirim" : "Nama pegawai"}
                    value={form.pihak}
                    onChange={(e) => setForm({ ...form, pihak: e.target.value })}
                  />
                </div>
                <div>
                  <label className={kelasLabel}>Unit</label>
                  <input
                    type="text"
                    className={kelasIsian}
                    placeholder="Unit kerja"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className={kelasLabel}>Keterangan</label>
                <textarea
                  rows={2}
                  className={kelasIsian}
                  placeholder="Mis. nomor BAST, keperluan, alasan koreksi"
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                />
              </div>

              {!operator && <PeringatanOperator />}
            </div>

            <KakiModal
              onBatal={() => setModalForm(null)}
              sibuk={menyimpan}
              label={modalForm.baris ? "Simpan Perubahan" : "Catat Mutasi"}
            />
          </form>
        </Latar>
      )}

      {/* MODAL HAPUS */}
      {modalHapus && (
        <Latar>
          <div className="relative w-full max-w-md animate-muncul rounded-3xl border border-mist bg-white p-6 text-center shadow-2xl sm:p-7">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-rose-100 bg-rose-50 text-rose-600 shadow-2xs">
              <Trash2 className="h-8 w-8" />
            </div>
            <h3 className="mb-1.5 text-lg font-bold text-navy">Hapus Mutasi?</h3>
            <p className="mx-auto mb-6 max-w-sm text-xs leading-relaxed text-slate-500">
              <span className="font-bold text-navy">
                {LABEL_JENIS[modalHapus.jenis]} {modalHapus.jumlah} {modalHapus.satuan} {modalHapus.nama_barang}
              </span>{" "}
              pada {tampilTanggal(modalHapus.tanggal)} akan dihapus dan stoknya dikembalikan seperti sebelum mutasi
              ini. Isi barisnya tetap tersimpan di log audit.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalHapus(null)}
                disabled={menyimpan}
                className="flex-1 cursor-pointer rounded-2xl bg-paper py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-mist"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={konfirmasiHapus}
                disabled={menyimpan}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-rose-600 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-rose-700 active:scale-95 disabled:opacity-50"
              >
                {menyimpan ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Ya, Hapus
              </button>
            </div>
          </div>
        </Latar>
      )}

      {/* MODAL RIWAYAT PERUBAHAN */}
      {modalLog && (
        <Latar>
          <div className="flex max-h-[85vh] w-full max-w-2xl animate-muncul flex-col overflow-hidden rounded-3xl border border-mist bg-white shadow-2xl">
            <KepalaModal
              judul="Riwayat Perubahan"
              sub={`Mutasi #${modalLog.mutasi.id} — ${modalLog.mutasi.nama_barang}`}
              onTutup={() => setModalLog(null)}
            />
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              {!modalLog.log && <RefreshCw className="mx-auto h-6 w-6 animate-spin text-brand" />}
              {modalLog.log?.length === 0 && (
                <p className="text-center text-xs text-slate-500">Belum ada riwayat untuk mutasi ini.</p>
              )}
              {modalLog.log?.map((l) => (
                <EntriLog key={l.id} log={l} />
              ))}
            </div>
          </div>
        </Latar>
      )}

      {/* MODAL PRATINJAU IMPORT */}
      {impor && (
        <Latar>
          <div className="flex max-h-[92vh] w-full max-w-5xl animate-muncul flex-col overflow-hidden rounded-3xl border border-mist bg-white shadow-2xl">
            <KepalaModal
              judul={`Pratinjau Import — ${impor.berkas.name}`}
              sub={
                galatImpor
                  ? `${galatImpor} dari ${impor.baris.length} baris bermasalah. Perbaiki di Excel lalu pilih berkasnya lagi — tidak ada yang disimpan sebelum semuanya benar.`
                  : `${impor.baris.length} baris siap diimpor. Stok setiap barang akan langsung berubah.`
              }
              onTutup={() => setImpor(null)}
            />
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-paper/95">
                  <tr className="whitespace-nowrap border-b border-mist text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2.5">Baris</th>
                    <th className="px-3 py-2.5">Tanggal</th>
                    <th className="px-3 py-2.5">Barang</th>
                    <th className="px-3 py-2.5">Jenis</th>
                    <th className="px-3 py-2.5 text-right">Jumlah</th>
                    <th className="px-3 py-2.5">Pegawai / Unit</th>
                    <th className="px-3 py-2.5">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist/60">
                  {impor.baris.map((b) => (
                    <React.Fragment key={b.baris_excel}>
                      <tr className={b.galat.length ? "bg-rose-50/60" : ""}>
                        <td className="px-3 py-2 font-mono text-slate-400">{b.baris_excel}</td>
                        <td className="whitespace-nowrap px-3 py-2">{b.tanggal ? tampilTanggal(b.tanggal) : "-"}</td>
                        <td className="px-3 py-2">
                          <span className="font-bold text-navy">{b.nama_barang || "-"}</span>{" "}
                          <span className="font-mono text-[10px] text-slate-400">{b.id_barang}</span>
                        </td>
                        <td className="px-3 py-2">{LABEL_JENIS[b.jenis] || b.jenis}</td>
                        <td className="px-3 py-2 text-right font-bold">{Number.isFinite(b.jumlah) ? b.jumlah : "-"}</td>
                        <td className="px-3 py-2">{[b.pihak, b.unit].filter(Boolean).join(" — ") || "-"}</td>
                        <td className="px-3 py-2 text-slate-600">{b.keterangan || "-"}</td>
                      </tr>
                      {b.galat.length > 0 && (
                        <tr className="bg-rose-50/60">
                          <td />
                          <td colSpan={6} className="px-3 pb-2 text-[11px] font-bold text-rose-700">
                            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
                            {b.galat.join("; ")}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex shrink-0 items-center gap-3 border-t border-mist bg-paper/40 p-5">
              {!operator && (
                <span className="text-[11px] font-bold text-amber-800">Isi nama pencatat dulu supaya tercatat.</span>
              )}
              <button
                type="button"
                onClick={() => setImpor(null)}
                className="ml-auto cursor-pointer rounded-2xl bg-paper px-5 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-mist"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={jalankanImpor}
                disabled={menyimpan || galatImpor > 0}
                className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-navy active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {menyimpan && <RefreshCw className="h-4 w-4 animate-spin" />}
                Import {impor.baris.length} Baris
              </button>
            </div>
          </div>
        </Latar>
      )}
    </>
  );
};

const KartuAngka = ({ Ikon, warnaIkon, label, nilai, sub, warna }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-mist bg-white p-3.5 shadow-xs sm:p-4">
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${warnaIkon}`}>
      <Ikon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
      <h3 className={`text-xl font-bold sm:text-2xl ${warna}`}>{nilai}</h3>
      <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">{sub}</p>
    </div>
  </div>
);

const Latar = ({ children }) => (
  <div className="fixed inset-0 z-50 flex animate-pudar items-center justify-center bg-navy/60 p-4 backdrop-blur-sm">
    {children}
  </div>
);

const KepalaModal = ({ judul, sub, onTutup }) => (
  <div className="flex items-start justify-between gap-4 border-b border-mist bg-paper/40 p-6">
    <div className="min-w-0">
      <h2 className="text-lg font-bold text-navy">{judul}</h2>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
    <button
      type="button"
      onClick={onTutup}
      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-paper text-slate-400 transition-all hover:bg-mist hover:text-navy"
    >
      <X className="h-4 w-4" />
    </button>
  </div>
);

const KakiModal = ({ onBatal, sibuk, label }) => (
  <div className="flex shrink-0 items-center gap-3 border-t border-mist bg-paper/40 p-6">
    <button
      type="button"
      onClick={onBatal}
      className="flex-1 cursor-pointer rounded-2xl bg-paper py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-mist"
    >
      Batal
    </button>
    <button
      type="submit"
      disabled={sibuk}
      className="flex flex-[2] cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-navy hover:shadow-lg active:scale-95 disabled:opacity-50"
    >
      {sibuk && <RefreshCw className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  </div>
);

const PeringatanOperator = () => (
  <p className="rounded-2xl border border-accent-yellow/50 bg-accent-yellow/25 px-4 py-2.5 text-[11px] font-bold text-amber-800">
    Nama pencatat masih kosong. Isi di kolom "Nama pencatat" supaya perubahan ini tercatat atas nama Anda.
  </p>
);

// Kolom yang ditampilkan di riwayat perubahan, dengan label yang dibaca
// manusia. Kolom teknis (id, dibuat_pada, diubah_pada) sengaja dilewati.
const KOLOM_LOG = {
  tanggal: "Tanggal",
  id_barang: "Kode barang",
  jenis: "Jenis",
  jumlah: "Jumlah",
  stok_sesudah: "Stok sesudah",
  pihak: "Pegawai",
  unit: "Unit",
  keterangan: "Keterangan",
};

const tampilNilaiLog = (k, v) => {
  if (v == null || v === "") return "—";
  if (k === "tanggal") return tampilTanggal(v);
  if (k === "jenis") return LABEL_JENIS[v] || v;
  return String(v);
};

const EntriLog = ({ log }) => {
  const label = { buat: "Dicatat", ubah: "Diubah", hapus: "Dihapus" }[log.aksi];
  const warna = {
    buat: "bg-green/20 text-green-800",
    ubah: "bg-brand/10 text-brand",
    hapus: "bg-rose-50 text-rose-700",
  }[log.aksi];

  const lama = log.data_lama || {};
  const baru = log.data_baru || {};

  const berubah =
    log.aksi === "ubah"
      ? Object.keys(KOLOM_LOG).filter((k) => JSON.stringify(lama[k]) !== JSON.stringify(baru[k]))
      : [];

  const isi = log.aksi === "hapus" ? lama : baru;

  return (
    <div className="rounded-2xl border border-mist p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase ${warna}`}>{label}</span>
        <span className="text-xs font-bold text-navy">{log.oleh || "tanpa nama"}</span>
        <span className="text-[11px] text-slate-500">{tampilTanggal(log.pada)}</span>
      </div>

      {log.aksi === "ubah" ? (
        berubah.length ? (
          <table className="w-full text-xs">
            <tbody>
              {berubah.map((k) => (
                <tr key={k}>
                  <td className="w-32 py-0.5 font-semibold text-slate-500">{KOLOM_LOG[k]}</td>
                  <td className="py-0.5 text-rose-700 line-through">{tampilNilaiLog(k, lama[k])}</td>
                  <td className="px-2 py-0.5 text-slate-400">→</td>
                  <td className="py-0.5 font-bold text-navy">{tampilNilaiLog(k, baru[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-slate-500">Disimpan tanpa perubahan isi.</p>
        )
      ) : (
        <p className="text-xs text-slate-600">
          {LABEL_JENIS[isi.jenis]} {isi.jumlah} {isi.satuan} {isi.nama_barang}
          {isi.pihak && ` — ${isi.pihak}`}
          {isi.keterangan && ` (${isi.keterangan})`}
        </p>
      )}
    </div>
  );
};

export default RekapBarang;
