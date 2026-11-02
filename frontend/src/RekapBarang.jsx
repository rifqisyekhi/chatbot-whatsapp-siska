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
  Undo2,
  UserPen,
  PackageOpen,
  AlertCircle,
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
// Setiap baris di sini adalah satu MUTASI: barang masuk, keluar, dipinjam,
// dikembalikan, atau koreksi stock opname. Menambah, mengedit, atau menghapus
// mutasi LANGSUNG mengubah stok barangnya (server yang mengurus, dalam satu
// transaksi), dan setiap perubahan tercatat di log yang bisa dibuka lewat
// tombol riwayat — itu yang membuat rekap yang bisa diedit tetap layak audit.
//
// Order dari WhatsApp tercatat sendiri (sumber "wa"), jadi operator tidak
// perlu menyalinnya.

const BASE_URL = (import.meta.env.VITE_API_TU || "").replace(/\/$/, "");

const PER_HALAMAN = 15;

const dua = (n) => String(n).padStart(2, "0");

// Tanggal "hari ini" menurut WIB, apa pun zona waktu komputer operatornya.
function hariIniWib(geserHari = 0) {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + geserHari * 86400000);
  return `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}`;
}

const awalBulanWib = () => `${hariIniWib().slice(0, 8)}01`;

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
  masuk: "border-green/40 bg-green/20 text-green-800",
  keluar: "border-rose-200 bg-rose-50 text-rose-700",
  pinjam: "border-accent-yellow/50 bg-accent-yellow/25 text-amber-800",
  kembali: "border-brand/20 bg-brand/10 text-brand",
  koreksi: "border-mist bg-paper text-slate-700",
};

const FORM_KOSONG = {
  tanggal: "",
  id_barang: "",
  jenis: "keluar",
  jumlah: 1,
  pihak: "",
  unit: "",
  keterangan: "",
  rencana_kembali: "",
};

const kelasIsian =
  "w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white " +
  "border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 " +
  "outline-none text-sm font-medium transition-all";

const kelasLabel = "block text-xs font-bold text-navy uppercase tracking-wider mb-1.5";

const kelasSaring =
  "cursor-pointer rounded-2xl border border-mist bg-paper/60 px-3 py-2.5 text-xs font-bold text-navy outline-none transition-all hover:bg-paper focus:border-brand focus:bg-white";

const kelasTombolSekunder =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-mist bg-paper px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-mist active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

const RekapBarang = ({ databaseBarang, showToast, onStokBerubah }) => {
  const [baris, setBaris] = useState([]);
  const [ringkasan, setRingkasan] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dari, setDari] = useState(awalBulanWib);
  const [sampai, setSampai] = useState(() => hariIniWib());
  const [jenis, setJenis] = useState("");
  const [idBarang, setIdBarang] = useState("");
  const [cari, setCari] = useState("");
  const [hanyaDipinjam, setHanyaDipinjam] = useState(false);
  const [halaman, setHalaman] = useState(1);

  const [operator, setOperator] = useState(bacaOperator);

  const [modalForm, setModalForm] = useState(null); // null | { baris?: mutasi }
  const [form, setForm] = useState(FORM_KOSONG);
  const [menyimpan, setMenyimpan] = useState(false);

  const [modalHapus, setModalHapus] = useState(null);
  const [modalKembali, setModalKembali] = useState(null);
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
    if (hanyaDipinjam) p.set("status", "dipinjam");
    return p.toString();
  }, [dari, sampai, jenis, idBarang, cariTertunda, hanyaDipinjam]);

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
  const total = useMemo(() => {
    const t = ringkasan.reduce(
      (acc, r) => {
        acc.masuk += r.masuk;
        acc.keluar += r.keluar;
        acc.pinjam += r.pinjam;
        acc.kembali += r.kembali;
        return acc;
      },
      { masuk: 0, keluar: 0, pinjam: 0, kembali: 0 },
    );
    return t;
  }, [ringkasan]);

  // Pinjaman yang belum kembali dihitung dari baris yang tampil — kartu ini
  // sekaligus tombol penyaring "sedang dipinjam".
  const pinjamAktif = baris.filter((b) => b.jenis === "pinjam" && !b.dikembalikan_pada).length;

  const totalHalaman = Math.ceil(baris.length / PER_HALAMAN);
  const barisHalaman = useMemo(
    () => baris.slice((halaman - 1) * PER_HALAMAN, halaman * PER_HALAMAN),
    [baris, halaman],
  );

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
            rencana_kembali: mutasi.rencana_kembali
              ? String(mutasi.rencana_kembali).slice(0, 10)
              : "",
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
      rencana_kembali: form.jenis === "pinjam" ? form.rencana_kembali : "",
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

  const konfirmasiKembali = async (e) => {
    e.preventDefault();
    setMenyimpan(true);
    try {
      await tulis({
        url: `api/mutasi-barang/${modalKembali.mutasi.id}/kembali`,
        method: "POST",
        body: {
          tanggal: dariIsianWaktu(modalKembali.tanggal),
          keterangan: modalKembali.keterangan,
        },
      });
      setModalKembali(null);
      showToast("Pengembalian dicatat.", "success");
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
      {/* RINGKASAN */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <KartuAngka label="Barang Masuk" nilai={total.masuk} sub="unit pada periode" warna="text-green-800" />
        <KartuAngka label="Barang Keluar" nilai={total.keluar} sub="unit pada periode" warna="text-rose-600" />
        <KartuAngka
          label="Dipinjam / Kembali"
          nilai={`${total.pinjam} / ${total.kembali}`}
          sub="unit pada periode"
          warna="text-amber-800"
        />
        <button
          type="button"
          onClick={() => setHanyaDipinjam((v) => !v)}
          aria-pressed={hanyaDipinjam}
          className={`cursor-pointer rounded-2xl border bg-white p-4 text-left shadow-2xs transition-all active:scale-[0.98] ${
            hanyaDipinjam ? "border-brand bg-brand/5 ring-4 ring-brand/10" : "border-mist hover:border-brand/40"
          }`}
        >
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Belum Dikembalikan
          </div>
          <div className="text-2xl font-black tracking-tight text-navy">{pinjamAktif}</div>
          <div className="mt-1 text-[10px] font-medium text-slate-400">
            {hanyaDipinjam ? "klik untuk tampilkan semua" : "klik untuk saring"}
          </div>
        </button>
      </div>

      {/* PENYARING & AKSI */}
      <div className="shrink-0 space-y-3 rounded-3xl border border-mist bg-white p-3 shadow-2xs sm:p-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari barang, pegawai, unit, keterangan..."
              className="w-full rounded-2xl border border-mist bg-paper/60 py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition-all hover:bg-paper focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className={kelasSaring}
              value={dari}
              max={sampai || undefined}
              onChange={(e) => setDari(e.target.value)}
              title="Dari tanggal"
            />
            <span className="text-xs font-bold text-slate-400">s.d.</span>
            <input
              type="date"
              className={kelasSaring}
              value={sampai}
              min={dari || undefined}
              onChange={(e) => setSampai(e.target.value)}
              title="Sampai tanggal"
            />
          </div>

          <select className={kelasSaring} value={jenis} onChange={(e) => setJenis(e.target.value)}>
            <option value="">Semua Jenis</option>
            {Object.entries(LABEL_JENIS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            className={`${kelasSaring} max-w-[220px]`}
            value={idBarang}
            onChange={(e) => setIdBarang(e.target.value)}
          >
            <option value="">Semua Barang</option>
            {databaseBarang.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} — {b.nama}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setDari("");
              setSampai("");
            }}
            className="cursor-pointer text-[11px] font-bold text-brand hover:underline"
            title="Tampilkan seluruh periode"
          >
            Semua periode
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-mist pt-3">
          <label
            className="inline-flex items-center gap-1.5 rounded-xl border border-mist bg-paper/60 px-2.5 py-1.5"
            title="Nama ini dicatat di kolom 'dicatat oleh' dan log perubahan"
          >
            <UserPen className="h-3.5 w-3.5 text-brand" />
            <input
              type="text"
              placeholder="Nama pencatat"
              className="w-36 bg-transparent text-xs font-bold text-navy outline-none placeholder:font-medium"
              value={operator}
              onChange={(e) => ubahOperator(e.target.value)}
            />
          </label>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={ambilTemplate} disabled={sibukExcel} className={kelasTombolSekunder}>
              <FileSpreadsheet className="h-3.5 w-3.5 text-green-800" />
              Template
            </button>
            <button
              type="button"
              onClick={() => inputBerkas.current?.click()}
              disabled={sibukExcel}
              className={kelasTombolSekunder}
            >
              <Upload className="h-3.5 w-3.5 text-brand" />
              Import Excel
            </button>
            <input
              ref={inputBerkas}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={pilihBerkas}
            />
            <button
              type="button"
              onClick={unduhExcel}
              disabled={sibukExcel || !baris.length}
              className={kelasTombolSekunder}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-green-800" />
              Export Excel
            </button>
            <a href={urlPdf()} className={kelasTombolSekunder} title="Laporan PDF sesuai saringan">
              <FileDown className="h-3.5 w-3.5 text-rose-600" />
              Export PDF
            </a>
            <button
              type="button"
              onClick={() => bukaForm()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-navy hover:shadow-lg active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Catat Mutasi
            </button>
          </div>
        </div>
      </div>

      {/* TABEL MUTASI */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-mist bg-white shadow-2xs">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-paper/95 backdrop-blur">
              <tr className="whitespace-nowrap border-b border-mist text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3.5">Tanggal</th>
                <th className="px-4 py-3.5">Barang</th>
                <th className="px-4 py-3.5">Jenis</th>
                <th className="px-4 py-3.5 text-right">Jumlah</th>
                <th className="px-4 py-3.5 text-right" title="Stok barang sesudah mutasi ini, saat dicatat">
                  Stok
                </th>
                <th className="px-4 py-3.5">Pegawai / Unit</th>
                <th className="px-4 py-3.5">Keterangan</th>
                <th className="px-4 py-3.5">Dicatat</th>
                <th className="px-4 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist/60 text-sm">
              {barisHalaman.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-paper/50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-600">
                    {tampilTanggal(m.tanggal)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold leading-snug text-navy">{m.nama_barang}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{m.id_barang}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-tight ${GAYA_JENIS[m.jenis]}`}
                    >
                      {LABEL_JENIS[m.jenis] || m.jenis}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-navy">
                    {m.jenis === "koreksi" && m.jumlah > 0 ? "+" : ""}
                    {m.jumlah} <span className="text-[10px] font-semibold text-slate-400">{m.satuan}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-slate-500">{m.stok_sesudah ?? "-"}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy">{m.pihak || "-"}</p>
                    {m.unit && <p className="text-[11px] text-slate-500">{m.unit}</p>}
                  </td>
                  <td className="max-w-[260px] px-4 py-3 text-xs text-slate-600">
                    {m.keterangan || (m.jenis !== "pinjam" && "-")}
                    {m.jenis === "pinjam" && (
                      <div className="mt-1">
                        {m.dikembalikan_pada ? (
                          <span className="text-[11px] font-bold text-green-800">
                            Dikembalikan {tampilTanggal(m.dikembalikan_pada, false)}
                          </span>
                        ) : (
                          <span
                            className={`text-[11px] font-bold ${
                              m.rencana_kembali && String(m.rencana_kembali).slice(0, 10) < hariIniWib()
                                ? "text-rose-600"
                                : "text-amber-800"
                            }`}
                          >
                            Belum kembali
                            {m.rencana_kembali && ` · rencana ${tampilTanggal(m.rencana_kembali, false)}`}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[11px] text-slate-500">
                    <p className="font-semibold text-slate-700">{m.dicatat_oleh || "-"}</p>
                    <p className="uppercase tracking-wider">{m.sumber}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1.5">
                      {m.jenis === "pinjam" && !m.dikembalikan_pada && (
                        <button
                          onClick={() =>
                            setModalKembali({ mutasi: m, tanggal: keIsianWaktu(), keterangan: "" })
                          }
                          className="cursor-pointer rounded-xl bg-green/20 p-2 text-green-800 transition-all hover:bg-green hover:text-white active:scale-95"
                          title="Tandai sudah dikembalikan"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => bukaLog(m)}
                        className="cursor-pointer rounded-xl bg-paper p-2 text-slate-600 transition-all hover:bg-mist active:scale-95"
                        title="Riwayat perubahan"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => bukaForm(m)}
                        className="cursor-pointer rounded-xl bg-brand/10 p-2 text-brand transition-all hover:bg-brand hover:text-white active:scale-95"
                        title="Edit mutasi"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setModalHapus(m)}
                        className="cursor-pointer rounded-xl bg-rose-50 p-2 text-rose-600 transition-all hover:bg-rose-600 hover:text-white active:scale-95"
                        title="Hapus mutasi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {barisHalaman.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    {loading ? (
                      <>
                        <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-brand" />
                        <p className="text-sm font-bold text-navy">Memuat rekap...</p>
                      </>
                    ) : (
                      <>
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-mist bg-paper text-slate-400 shadow-2xs">
                          <PackageOpen className="h-8 w-8" />
                        </div>
                        <p className="text-sm font-bold text-navy">Belum ada mutasi pada saringan ini.</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Order WhatsApp yang disetujui tercatat otomatis. Mutasi lain bisa dicatat manual
                          atau diimpor dari Excel.
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-mist bg-paper/40 px-4 py-3">
          <span className="text-[11px] font-bold tracking-tight text-slate-500">
            {baris.length} mutasi{baris.length >= 5000 && " (dibatasi 5000 — persempit periodenya)"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={halaman === 1}
              onClick={() => setHalaman((p) => p - 1)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-mist bg-white text-slate-600 shadow-2xs transition-all hover:bg-paper active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              title="Halaman sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[72px] text-center text-[11px] font-bold text-navy">
              Hal {totalHalaman === 0 ? 0 : halaman} / {totalHalaman}
            </span>
            <button
              disabled={halaman === totalHalaman || totalHalaman === 0}
              onClick={() => setHalaman((p) => p + 1)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-mist bg-white text-slate-600 shadow-2xs transition-all hover:bg-paper active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              title="Halaman berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

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
                    disabled={modalForm.baris?.jenis === "kembali"}
                    onChange={(e) => setForm({ ...form, jenis: e.target.value })}
                  >
                    {Object.entries(LABEL_JENIS)
                      // "Kembali" dicatat lewat tombol Kembalikan di baris
                      // pinjaman, supaya pinjamannya ikut tertutup.
                      .filter(([k]) => k !== "kembali" || modalForm.baris?.jenis === "kembali")
                      .map(([k, v]) => (
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
                  <label className={kelasLabel}>
                    {form.jenis === "pinjam" ? "Peminjam" : form.jenis === "masuk" ? "Diterima dari" : "Pegawai"}
                    {form.jenis === "pinjam" && <span className="text-rose-600"> *</span>}
                  </label>
                  <input
                    type="text"
                    required={form.jenis === "pinjam"}
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

              {form.jenis === "pinjam" && (
                <div>
                  <label className={kelasLabel}>Rencana Kembali</label>
                  <input
                    type="date"
                    className={kelasIsian}
                    value={form.rencana_kembali}
                    onChange={(e) => setForm({ ...form, rencana_kembali: e.target.value })}
                  />
                </div>
              )}

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

      {/* MODAL PENGEMBALIAN */}
      {modalKembali && (
        <Latar>
          <form
            onSubmit={konfirmasiKembali}
            className="w-full max-w-md animate-muncul overflow-hidden rounded-3xl border border-mist bg-white shadow-2xl"
          >
            <KepalaModal
              judul="Catat Pengembalian"
              sub={`${modalKembali.mutasi.jumlah} ${modalKembali.mutasi.satuan} ${modalKembali.mutasi.nama_barang} dari ${modalKembali.mutasi.pihak || "peminjam"}`}
              onTutup={() => setModalKembali(null)}
            />
            <div className="space-y-4 p-6">
              <div>
                <label className={kelasLabel}>Tanggal Kembali</label>
                <input
                  type="datetime-local"
                  required
                  className={kelasIsian}
                  value={modalKembali.tanggal}
                  onChange={(e) => setModalKembali({ ...modalKembali, tanggal: e.target.value })}
                />
              </div>
              <div>
                <label className={kelasLabel}>Keterangan</label>
                <input
                  type="text"
                  className={kelasIsian}
                  placeholder="Mis. kondisi baik"
                  value={modalKembali.keterangan}
                  onChange={(e) => setModalKembali({ ...modalKembali, keterangan: e.target.value })}
                />
              </div>
              {!operator && <PeringatanOperator />}
            </div>
            <KakiModal onBatal={() => setModalKembali(null)} sibuk={menyimpan} label="Tandai Dikembalikan" />
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

const KartuAngka = ({ label, nilai, sub, warna }) => (
  <div className="rounded-2xl border border-mist bg-white p-4 text-left shadow-2xs">
    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
    <div className={`text-2xl font-black tracking-tight ${warna}`}>{nilai}</div>
    <div className="mt-1 text-[10px] font-medium text-slate-400">{sub}</div>
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
  rencana_kembali: "Rencana kembali",
  dikembalikan_pada: "Dikembalikan",
};

const tampilNilaiLog = (k, v) => {
  if (v == null || v === "") return "—";
  if (k === "tanggal" || k === "dikembalikan_pada") return tampilTanggal(v);
  if (k === "rencana_kembali") return tampilTanggal(v, false);
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
