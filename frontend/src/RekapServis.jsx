import { useEffect, useMemo, useState } from "react";
import { apiTU } from "./services/ApiTU";
import { susunMatriks, exportMonitoring, NAMA_BULAN, rupiah } from "./services/excelServis";
import logoKemnaker from "./assets/logo-kemnaker.png";
import {
  ArrowLeft,
  Wrench,
  RefreshCw,
  FileSpreadsheet,
  Plus,
  Edit3,
  Trash2,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  Search,
} from "lucide-react";

// =========================================================
// REKAP PEMELIHARAAN / SERVICE KENDARAAN DINAS
// =========================================================
//
// Data masuk otomatis dari WhatsApp (menu 4 → 4). Admin bisa
// menambah baris yang tidak lewat WhatsApp, mengoreksi, menghapus,
// membuka PDF SPBY, dan mengekspor Excel format Monitoring.

const TAHUN_INI = new Date().getFullYear();

const tglPanjang = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return iso || "-";
  return `${d} ${["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][m - 1]} ${y}`;
};

const FORM_KOSONG = { kendaraan_id: "", tanggal_servis: "", bengkel: "", biaya: "", keterangan: "" };

const kelasInput =
  "w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

export default function RekapServis() {
  const [tahun, setTahun] = useState(TAHUN_INI);
  const [tahunTersedia, setTahunTersedia] = useState([]);
  const [servis, setServis] = useState([]);
  const [kendaraan, setKendaraan] = useState([]);
  const [sbm, setSbm] = useState({ Mobil: 0, Motor: 0 });
  const [loading, setLoading] = useState(false);
  const [galatMuat, setGalatMuat] = useState("");
  const [tampilan, setTampilan] = useState("monitoring");
  const [cari, setCari] = useState("");

  const [modal, setModal] = useState(null); // { mode: "tambah" | "edit", id? }
  const [form, setForm] = useState(FORM_KOSONG);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hapus, setHapus] = useState(null);
  const [mengekspor, setMengekspor] = useState(false);

  const [toast, setToast] = useState(null);
  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const muat = async (t = tahun) => {
    setLoading(true);
    setGalatMuat("");
    try {
      const [rekap, kend] = await Promise.all([
        apiTU({ url: `api/servis-kendaraan?tahun=${t}` }),
        apiTU({ url: "api/kendaraan" }),
      ]);
      setServis(rekap.data || []);
      setTahunTersedia(rekap.tahunTersedia || []);
      setSbm(rekap.sbm || { Mobil: 0, Motor: 0 });
      setKendaraan(kend || []);
    } catch (e) {
      setGalatMuat(e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  // Memuat ulang setiap tahun anggaran diganti.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    muat(tahun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahun]);

  const pilihanTahun = useMemo(
    () => [...new Set([TAHUN_INI, tahun, ...tahunTersedia])].sort((a, b) => b - a),
    [tahun, tahunTersedia],
  );

  const matriks = useMemo(() => susunMatriks(kendaraan, servis, sbm), [kendaraan, servis, sbm]);

  const statistik = useMemo(() => {
    const jumlah = (d) => d.reduce((a, b) => a + b.total, 0);
    const sbmTotal = (d) => d.reduce((a, b) => a + b.sbm, 0);
    return {
      total: servis.reduce((a, s) => a + (Number(s.biaya) || 0), 0),
      kali: servis.length,
      mobil: jumlah(matriks.mobil),
      motor: jumlah(matriks.motor),
      sbmMobil: sbmTotal(matriks.mobil),
      sbmMotor: sbmTotal(matriks.motor),
    };
  }, [servis, matriks]);

  const servisTersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return servis;
    return servis.filter((s) =>
      [s.nama_kendaraan, s.plat, s.bengkel, s.pelapor_nama, s.keterangan]
        .some((v) => String(v || "").toLowerCase().includes(q)),
    );
  }, [servis, cari]);

  // ---------- Form ----------
  const bukaTambah = () => {
    setForm({ ...FORM_KOSONG, tanggal_servis: new Date().toISOString().slice(0, 10) });
    setModal({ mode: "tambah" });
  };

  const bukaEdit = (s) => {
    setForm({
      kendaraan_id: s.kendaraan_id ? String(s.kendaraan_id) : "",
      nama_kendaraan: s.nama_kendaraan,
      plat: s.plat,
      jenis: s.jenis,
      tanggal_servis: s.tanggal_servis,
      bengkel: s.bengkel,
      biaya: String(s.biaya),
      keterangan: s.keterangan || "",
    });
    setModal({ mode: "edit", id: s.id });
  };

  const simpan = async (e) => {
    e.preventDefault();
    const k = kendaraan.find((x) => String(x._id) === String(form.kendaraan_id));
    if (!k && modal.mode === "tambah") return kabari("Pilih kendaraan dulu", "error");

    const isi = {
      tanggal_servis: form.tanggal_servis,
      bengkel: form.bengkel,
      biaya: form.biaya,
      keterangan: form.keterangan,
      ...(k
        ? { kendaraan_id: k._id, nama_kendaraan: k.nama, plat: k.plat, jenis: k.jenis === "Motor" ? "Motor" : "Mobil" }
        : {}),
    };

    setMenyimpan(true);
    try {
      if (modal.mode === "tambah") {
        await apiTU({ url: "api/servis-kendaraan", method: "POST", options: { body: isi } });
        kabari("Data service ditambahkan");
      } else {
        await apiTU({ url: `api/servis-kendaraan/${modal.id}`, method: "PUT", options: { body: isi } });
        kabari("Data service diperbarui");
      }
      setModal(null);
      const t = Number(form.tanggal_servis.slice(0, 4));
      if (t && t !== tahun) setTahun(t);
      else muat(tahun);
    } catch (err) {
      kabari(err.message || "Gagal menyimpan", "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const konfirmasiHapus = async () => {
    try {
      await apiTU({ url: `api/servis-kendaraan/${hapus.id}`, method: "DELETE" });
      kabari("Data service dihapus");
      setHapus(null);
      muat(tahun);
    } catch (err) {
      kabari(err.message || "Gagal menghapus", "error");
    }
  };

  const ekspor = async () => {
    setMengekspor(true);
    try {
      await exportMonitoring({ tahun, matriks, servis });
    } catch (err) {
      kabari(err.message || "Gagal membuat Excel", "error");
    } finally {
      setMengekspor(false);
    }
  };

  // ---------- Tampilan ----------
  const SelBulan = ({ n }) => (
    <td className={`py-2.5 px-2 text-right tabular-nums text-xs whitespace-nowrap ${n ? "text-navy font-semibold" : "text-slate-300"}`}>
      {n ? n.toLocaleString("id-ID") : "-"}
    </td>
  );

  const barisKelompok = (romawi, judul, daftar) => {
    const jml = (f) => daftar.reduce((a, b) => a + f(b), 0);
    return (
      <>
        <tr className="bg-paper/80 font-extrabold text-navy text-xs">
          <td className="py-2.5 px-3 text-center">{romawi}</td>
          <td className="py-2.5 px-3" colSpan={2}>{judul}</td>
          <td className="py-2.5 px-2 text-right tabular-nums">{jml((b) => b.sbm).toLocaleString("id-ID")}</td>
          <td className="py-2.5 px-2 text-right tabular-nums">{jml((b) => b.saldo).toLocaleString("id-ID")}</td>
          <td className="py-2.5 px-2 text-right tabular-nums bg-cyan-50">{jml((b) => b.total).toLocaleString("id-ID")}</td>
          {NAMA_BULAN.map((_, m) => (
            <td key={m} className="py-2.5 px-2 text-right tabular-nums">
              {jml((b) => b.bulan[m]) ? jml((b) => b.bulan[m]).toLocaleString("id-ID") : "-"}
            </td>
          ))}
        </tr>
        {daftar.map((b, i) => (
          <tr key={b.kunci} className="hover:bg-paper/50">
            <td className="py-2.5 px-3 text-center text-xs text-slate-400">{i + 1}</td>
            <td className="py-2.5 px-3 text-xs">
              <div className="font-bold text-navy whitespace-nowrap">{b.nama}</div>
              <div className="text-[11px] text-slate-400">{[b.tahun, b.noMesin].filter(Boolean).join(" • ") || " "}</div>
            </td>
            <td className="py-2.5 px-3">
              <span className="font-mono text-[11px] font-black text-navy bg-paper border border-mist px-2 py-1 rounded-lg whitespace-nowrap">
                {b.plat || "-"}
              </span>
            </td>
            <td className="py-2.5 px-2 text-right tabular-nums text-xs text-slate-500">{b.sbm.toLocaleString("id-ID")}</td>
            <td className={`py-2.5 px-2 text-right tabular-nums text-xs font-bold ${b.saldo < 0 ? "text-rose-600" : "text-green-700"}`}>
              {b.saldo.toLocaleString("id-ID")}
            </td>
            <td className="py-2.5 px-2 text-right tabular-nums text-xs font-extrabold text-navy bg-cyan-50/70">
              {b.total ? b.total.toLocaleString("id-ID") : "-"}
            </td>
            {b.bulan.map((n, m) => <SelBulan key={m} n={n} />)}
          </tr>
        ))}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <a
                href="/admin"
                className="p-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 transition-all active:scale-95 shadow-2xs"
                title="Kembali ke Master Data"
              >
                <ArrowLeft className="w-4 h-4" />
              </a>
              <div className="w-11 h-11 rounded-2xl bg-paper border border-mist hidden sm:flex items-center justify-center p-1.5 shrink-0">
                <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold text-navy tracking-tight truncate">
                  Rekap Pemeliharaan Kendaraan
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">
                  Biro Keuangan dan BMN • Service kendaraan dinas
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className="px-3 py-2 rounded-xl border border-mist bg-white text-sm font-bold text-navy cursor-pointer"
                title="Tahun anggaran"
              >
                {pilihanTahun.map((t) => (
                  <option key={t} value={t}>TA {t}</option>
                ))}
              </select>
              <button
                onClick={() => muat(tahun)}
                disabled={loading}
                className="p-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 transition-all active:scale-95 shadow-2xs cursor-pointer"
                title="Segarkan"
              >
                <RefreshCw className={`w-4 h-4 text-brand ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {galatMuat && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {galatMuat}
          </div>
        )}

        {/* Ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">Total Biaya TA {tahun}</p>
            <p className="text-xl font-black text-navy mt-1 tabular-nums">{rupiah(statistik.total)}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">Jumlah Service</p>
            <p className="text-xl font-black text-brand mt-1">{statistik.kali} <span className="text-xs font-bold text-slate-400">kali</span></p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">🚗 Roda 4</p>
            <p className="text-lg font-black text-navy mt-1 tabular-nums">{rupiah(statistik.mobil)}</p>
            <p className="text-[11px] text-slate-400 font-semibold">Saldo {rupiah(statistik.sbmMobil - statistik.mobil)}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
            <p className="text-xs font-semibold text-slate-500">🛵 Roda 2</p>
            <p className="text-lg font-black text-navy mt-1 tabular-nums">{rupiah(statistik.motor)}</p>
            <p className="text-[11px] text-slate-400 font-semibold">Saldo {rupiah(statistik.sbmMotor - statistik.motor)}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="inline-flex p-1.5 bg-white border border-mist rounded-2xl shadow-2xs self-start">
            {[
              ["monitoring", "Monitoring", LayoutGrid],
              ["rincian", "Rincian Service", List],
            ].map(([kunci, label, Ikon]) => (
              <button
                key={kunci}
                onClick={() => setTampilan(kunci)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                  tampilan === kunci ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:text-navy hover:bg-paper"
                }`}
              >
                <Ikon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={ekspor}
              disabled={mengekspor || loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm bg-green/15 text-green-800 border border-green/25 hover:bg-green hover:text-white transition-all active:scale-95 cursor-pointer disabled:opacity-60"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {mengekspor ? "Menyusun..." : "Export Excel"}
            </button>
            <button
              onClick={bukaTambah}
              className="inline-flex items-center gap-2 bg-brand hover:bg-navy text-white px-4 py-2.5 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tambah Service
            </button>
          </div>
        </div>

        {tampilan === "monitoring" ? (
          <div className="bg-white rounded-3xl border border-mist shadow-2xs overflow-hidden">
            <div className="px-5 py-3 border-b border-mist text-xs text-slate-500 font-medium">
              SBM tahunan per kendaraan: Roda 4 {rupiah(sbm.Mobil)} • Roda 2 {rupiah(sbm.Motor)}. Angka bulan = total biaya service di bulan itu.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-paper/70 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-mist whitespace-nowrap">
                    <th className="py-3 px-3 text-center">No</th>
                    <th className="py-3 px-3">Kendaraan</th>
                    <th className="py-3 px-3">Nopol</th>
                    <th className="py-3 px-2 text-right">SBM</th>
                    <th className="py-3 px-2 text-right">Saldo</th>
                    <th className="py-3 px-2 text-right bg-cyan-50">Total</th>
                    {NAMA_BULAN.map((b) => (
                      <th key={b} className="py-3 px-2 text-right">{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist/60">
                  {barisKelompok("I", "Roda 4 (Empat)", matriks.mobil)}
                  {barisKelompok("II", "Roda 2 (Dua)", matriks.motor)}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-mist shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-mist">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  placeholder="Cari kendaraan, nopol, bengkel, pelapor..."
                  className={`${kelasInput} pl-10`}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-paper/70 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-mist whitespace-nowrap">
                    <th className="py-3.5 px-4">Tanggal</th>
                    <th className="py-3.5 px-4">Kendaraan</th>
                    <th className="py-3.5 px-4">Bengkel</th>
                    <th className="py-3.5 px-4 text-right">Biaya</th>
                    <th className="py-3.5 px-4">Dilaporkan</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist/60 text-sm">
                  {servisTersaring.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Wrench className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="font-bold text-sm text-slate-600">Belum ada data service di TA {tahun}</p>
                        <p className="text-xs mt-0.5">Data masuk otomatis dari WhatsApp (Layanan Kendaraan → Lapor Service).</p>
                      </td>
                    </tr>
                  ) : (
                    servisTersaring.map((s) => (
                      <tr key={s.id} className="hover:bg-paper/50">
                        <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold">{tglPanjang(s.tanggal_servis)}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-navy">{s.nama_kendaraan}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{s.plat} • {s.jenis}</div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {s.bengkel || "-"}
                          {s.keterangan && <div className="text-[11px] text-slate-400">{s.keterangan}</div>}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold tabular-nums whitespace-nowrap">{rupiah(s.biaya)}</td>
                        <td className="py-3 px-4 text-xs">
                          <div className="font-semibold">{s.pelapor_nama || "-"}</div>
                          <span
                            className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              s.sumber === "whatsapp" ? "bg-green/15 text-green-800" : "bg-brand/10 text-brand"
                            }`}
                          >
                            {s.sumber === "whatsapp" ? "WhatsApp" : "Dashboard"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {s.berkas_pdf ? (
                              <a
                                href={`/api/servis-kendaraan/${s.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-xl text-teal bg-teal/10 hover:bg-teal hover:text-white transition-all"
                                title="Buka PDF SPBY"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="p-2 text-slate-300" title="Tidak ada PDF">
                                <FileText className="w-3.5 h-3.5" />
                              </span>
                            )}
                            <button
                              onClick={() => bukaEdit(s)}
                              className="p-2 rounded-xl text-brand bg-brand/10 hover:bg-brand hover:text-white transition-all cursor-pointer"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setHapus(s)}
                              className="p-2 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-600 hover:text-white transition-all cursor-pointer"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal tambah / edit */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm">
          <form onSubmit={simpan} className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-mist flex items-center justify-between">
              <h2 className="font-extrabold text-lg">
                {modal.mode === "tambah" ? "Tambah Data Service" : "Edit Data Service"}
              </h2>
              <button type="button" onClick={() => setModal(null)} className="p-2 rounded-xl hover:bg-paper cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">Kendaraan *</label>
                <select
                  value={form.kendaraan_id}
                  onChange={(e) => setForm({ ...form, kendaraan_id: e.target.value })}
                  className={`${kelasInput} font-bold cursor-pointer`}
                  required={modal.mode === "tambah"}
                >
                  <option value="">
                    {modal.mode === "edit" && !form.kendaraan_id
                      ? `${form.nama_kendaraan} (${form.plat})`
                      : "— Pilih kendaraan —"}
                  </option>
                  {["Mobil", "Motor"].map((j) => (
                    <optgroup key={j} label={j === "Mobil" ? "Roda 4" : "Roda 2"}>
                      {kendaraan
                        .filter((k) => (k.jenis === "Motor" ? "Motor" : "Mobil") === j)
                        .map((k) => (
                          <option key={k._id} value={k._id}>{k.nama} — {k.plat}</option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">Tanggal Service *</label>
                  <input
                    type="date"
                    value={form.tanggal_servis}
                    onChange={(e) => setForm({ ...form, tanggal_servis: e.target.value })}
                    className={kelasInput}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">Biaya (Rp) *</label>
                  <input
                    inputMode="numeric"
                    value={form.biaya}
                    onChange={(e) => setForm({ ...form, biaya: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder="1250000"
                    className={kelasInput}
                    required
                  />
                  {form.biaya && <p className="text-[11px] text-slate-400 mt-1">{rupiah(form.biaya)}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">Bengkel</label>
                <input
                  value={form.bengkel}
                  onChange={(e) => setForm({ ...form, bengkel: e.target.value })}
                  placeholder="Nama bengkel"
                  className={kelasInput}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5">Keterangan</label>
                <input
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                  placeholder="Opsional, misal: ganti oli & tune up"
                  className={kelasInput}
                />
              </div>
            </div>
            <div className="p-6 border-t border-mist bg-paper/30 flex justify-end gap-3">
              <button type="button" onClick={() => setModal(null)} className="px-5 py-2.5 bg-paper hover:bg-mist font-bold text-sm rounded-2xl cursor-pointer">
                Batal
              </button>
              <button
                type="submit"
                disabled={menyimpan}
                className="px-5 py-2.5 bg-brand hover:bg-navy text-white font-bold text-sm rounded-2xl cursor-pointer disabled:opacity-60"
              >
                {menyimpan ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Konfirmasi hapus */}
      {hapus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold">Hapus data service?</h3>
            <p className="text-sm text-slate-500 mt-1">
              {hapus.nama_kendaraan} ({hapus.plat}), {tglPanjang(hapus.tanggal_servis)}, {rupiah(hapus.biaya)}.
              {hapus.berkas_pdf && " Berkas PDF SPBY-nya tetap tersimpan di server."}
            </p>
            <div className="flex justify-center gap-3 mt-5">
              <button onClick={() => setHapus(null)} className="px-5 py-2.5 bg-paper hover:bg-mist font-bold text-sm rounded-2xl cursor-pointer">
                Batal
              </button>
              <button onClick={konfirmasiHapus} className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-2xl cursor-pointer">
                Hapus
              </button>
            </div>
          </div>
        </div>
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
