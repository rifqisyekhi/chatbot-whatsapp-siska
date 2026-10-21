import React, { useState, useEffect, useMemo } from "react";
import { apiTU, getUrlPresensi } from "./services/ApiTU";
import logoKemnaker from "./assets/logo-kemnaker.png";
import {
  Users,
  Car,
  Plus,
  Edit3,
  Trash2,
  X,
  Search,
  Filter,
  Package,
  Calendar,
  ExternalLink,
  RefreshCw,
  Mail,
  Building2,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Layers,
  Sparkles,
  Shield,
  FileSpreadsheet,
} from "lucide-react";

const DAFTAR_JABATAN = [
  "Analis Anggaran Ahli Pertama",
  "Analis Pengelola Keuangan APBN Ahli Madya",
  "Analis Pengelola Keuangan APBN Ahli Muda",
  "Analis Pengelola Keuangan APBN Ahli Pertama",
  "Analis Pengelolaan Keuangan APBN Ahli Pertama",
  "Analis SDMA Ahli Muda",
  "Arsiparis Ahli Madya",
  "Arsiparis Ahli Muda",
  "Arsiparis Ahli Pertama",
  "Arsiparis Terampil",
  "Kepala Biro Keuangan dan BMN",
  "Kepala Sub Bagian Tata Usaha",
  "Konselor SDM",
  "Penata Kelola Hukum dan Perundang-undangan",
  "Penata Kelola Sistem dan Teknologi Informasi",
  "Penata Layanan Operasional",
  "Penelaah Teknis Kebijakan",
  "Pengadministrasi Perkantoran",
  "Pengelola Data dan Informasi",
  "Perencana Ahli Pertama",
  "Petugas Kebersihan",
  "Pranata Keuangan APBN Terampil",
  "Pranata Komputer Ahli Muda",
  "Pranata Komputer Terampil",
  "Supir",
  "Tenaga Ahli",
  "Tenaga Perkantoran Umum",
];

export default function AdminMasterDataTU() {
  // ==========================================
  // STATE DATA MASTER
  // ==========================================
  const [activeTab, setActiveTab] = useState("pegawai");
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSubUnit, setFilterSubUnit] = useState("Semua");
  const [filterJenisKendaraan, setFilterJenisKendaraan] = useState("Semua");
  const [filterKategori, setFilterKategori] = useState("Semua");

  // State Modal Konfirmasi Hapus & Toast
  const [modalHapus, setModalHapus] = useState(null); // { id, nama, tipe }
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null); // { text, type: "success" | "error" }

  const showToast = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const [dataPegawai, setDataPegawai] = useState([]);
  const [dataKendaraan, setDataKendaraan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({});

  // AMBIL DATA
  const fetchData = async () => {
    setLoading(true);
    try {
      const resPegawai = await apiTU({ url: "api/pegawai" });
      const resKendaraan = await apiTU({ url: "api/kendaraan" });
      setDataPegawai(resPegawai || []);
      setDataKendaraan(resKendaraan || []);
    } catch (err) {
      console.error("Gagal menarik data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Master Data - Biro Keuangan dan BMN";
    fetchData();
  }, []);

  // =========================================================
  // JENIS NOMOR IDENTITAS
  // =========================================================
  const jenisIdentitas = (kategori) =>
    !kategori
      ? { label: "NIP / NIK", digit: null, contoh: "Pilih kategori dulu" }
      : kategori === "Internal"
        ? { label: "NIP", digit: 18, contoh: "18 digit (PNS / PPPK)" }
        : { label: "NIK", digit: 16, contoh: "16 digit (PPNPN / Magang)" };

  const identitasForm = jenisIdentitas(formData.kategori_pegawai);

  const digitIdentitas = String(formData.nip || "").replace(/\D/g, "").length;

  const identitasJanggal =
    digitIdentitas > 0 &&
    identitasForm.digit !== null &&
    digitIdentitas !== identitasForm.digit;

  // FUNGSI CRUD MASTER DATA (Pakai apiTU)
  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (modalType === "tambah") {
        await apiTU({
          url: `api/${activeTab}`,
          method: "POST",
          options: { body: formData },
        });
        showToast("Data baru berhasil ditambahkan!", "success");
      } else {
        await apiTU({
          url: `api/${activeTab}/${formData._id}`,
          method: "PUT",
          options: { body: formData },
        });
        showToast("Perubahan data berhasil disimpan!", "success");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error("Gagal simpan:", err);
      showToast("Gagal menyimpan data ke server.", "error");
    }
  };

  const konfirmasiHapus = async () => {
    if (!modalHapus) return;
    setIsDeleting(true);
    try {
      await apiTU({
        url: `api/${modalHapus.tipe}/${modalHapus.id}`,
        method: "DELETE",
      });
      showToast(`Data "${modalHapus.nama}" berhasil dihapus!`, "success");
      setModalHapus(null);
      fetchData();
    } catch (err) {
      console.error("Gagal hapus data:", err);
      showToast("Gagal menghapus data dari server.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenModal = (tipe, data = {}) => {
    setModalType(tipe);
    setFormData(tipe === "tambah" ? {} : data);
    setShowModal(true);
  };

  // FILTER DATA
  const filteredPegawai = useMemo(() => {
    return dataPegawai
      .filter((p) => {
        const q = searchTerm.toLowerCase();
        const matchSearch =
          p.nama?.toLowerCase().includes(q) ||
          p.nip?.includes(searchTerm) ||
          p.email?.toLowerCase().includes(q) ||
          p.jabatan?.toLowerCase().includes(q) ||
          p.no_wa?.includes(searchTerm);
        const matchSubUnit =
          filterSubUnit === "Semua" ? true : p.sub_unit === filterSubUnit;
        const matchKategori =
          filterKategori === "Semua" ? true : p.kategori_pegawai === filterKategori;
        return matchSearch && matchSubUnit && matchKategori;
      })
      .sort((a, b) =>
        (a.nama || "").localeCompare(b.nama || "", "id", { sensitivity: "base" })
      );
  }, [dataPegawai, searchTerm, filterSubUnit, filterKategori]);

  const filteredKendaraan = useMemo(() => {
    return dataKendaraan
      .filter((k) => {
        const q = searchTerm.toLowerCase();
        const matchSearch =
          k.nama?.toLowerCase().includes(q) ||
          k.plat?.toLowerCase().includes(q) ||
          k.id?.toLowerCase().includes(q);
        const matchFilter =
          filterJenisKendaraan === "Semua" ? true : k.jenis === filterJenisKendaraan;
        return matchSearch && matchFilter;
      })
      .sort((a, b) =>
        (a.nama || a.plat || "").localeCompare(b.nama || b.plat || "", "id", { sensitivity: "base" })
      );
  }, [dataKendaraan, searchTerm, filterJenisKendaraan]);

  // STATISTIK RINGKASAN
  const statsPegawai = useMemo(() => {
    const total = dataPegawai.length;
    const internal = dataPegawai.filter((p) => p.kategori_pegawai === "Internal").length;
    const ppnpn = dataPegawai.filter((p) => p.kategori_pegawai === "PPNPN").length;
    const magang = dataPegawai.filter((p) => p.kategori_pegawai === "Magang").length;
    return { total, internal, ppnpn, magang };
  }, [dataPegawai]);

  const statsKendaraan = useMemo(() => {
    const total = dataKendaraan.length;
    const tersedia = dataKendaraan.filter((k) => k.status === "TERSEDIA").length;
    const dipakai = dataKendaraan.filter((k) => k.status === "DIPAKAI").length;
    const mobil = dataKendaraan.filter((k) => k.jenis === "Mobil").length;
    const motor = dataKendaraan.filter((k) => k.jenis === "Motor").length;
    return { total, tersedia, dipakai, mobil, motor };
  }, [dataKendaraan]);

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16 selection:bg-brand selection:text-white">
      {/* =====================================================
          1. HEADER ATAS (NAVBAR)
      ===================================================== */}
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4">
            {/* Logo & Judul Sistem */}
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-paper border border-mist flex items-center justify-center p-1.5 shrink-0 shadow-2xs">
                <img
                  src={logoKemnaker}
                  alt="Logo Kemnaker"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-extrabold text-navy tracking-tight truncate">
                    Master Data
                  </h1>
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand/10 text-brand uppercase tracking-wider">
                    Portal TU
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium truncate">
                  Biro Keuangan dan BMN • Data Pegawai & Kendaraan
                </p>
              </div>
            </div>

            {/* Quick Switcher & Refresh */}
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={getUrlPresensi()}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-paper hover:bg-mist border border-mist transition-all active:scale-95 shadow-2xs"
                title="Buka Aplikasi Presensi Non-ASN"
              >
                <Calendar className="w-3.5 h-3.5 text-teal" />
                <span>Presensi</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>

              <a
                href="/barang"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-paper hover:bg-mist border border-mist transition-all active:scale-95 shadow-2xs"
                title="Buka Dashboard Stok ATK"
              >
                <Package className="w-3.5 h-3.5 text-brand" />
                <span>Stok ATK</span>
              </a>

              <a
                href="/"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-paper hover:bg-mist border border-mist transition-all active:scale-95 shadow-2xs"
                title="Buka Katalog Permintaan ATK"
              >
                <Layers className="w-3.5 h-3.5 text-green" />
                <span>Katalog ATK</span>
              </a>

              <button
                onClick={() => fetchData()}
                disabled={loading}
                className="p-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 transition-all active:scale-95 shadow-2xs cursor-pointer"
                title="Segarkan Data (Refresh)"
              >
                <RefreshCw
                  className={`w-4 h-4 text-brand ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* =====================================================
          2. KONTEN UTAMA
      ===================================================== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {/* TAB NAVIGATION: PEGAWAI VS KENDARAAN */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          {/* Segmented Control */}
          <div className="inline-flex p-1.5 bg-white border border-mist rounded-2xl shadow-2xs">
            <button
              onClick={() => {
                setActiveTab("pegawai");
                setSearchTerm("");
              }}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === "pegawai"
                  ? "bg-navy text-white shadow-sm"
                  : "text-slate-600 hover:text-navy hover:bg-paper"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Pegawai</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
                  activeTab === "pegawai"
                    ? "bg-white/20 text-white"
                    : "bg-paper text-slate-600"
                }`}
              >
                {dataPegawai.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab("kendaraan");
                setSearchTerm("");
              }}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${
                activeTab === "kendaraan"
                  ? "bg-navy text-white shadow-sm"
                  : "text-slate-600 hover:text-navy hover:bg-paper"
              }`}
            >
              <Car className="w-4 h-4" />
              <span>Kendaraan Dinas</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
                  activeTab === "kendaraan"
                    ? "bg-white/20 text-white"
                    : "bg-paper text-slate-600"
                }`}
              >
                {dataKendaraan.length}
              </span>
            </button>
          </div>

          {/* Tombol Tambah Data */}
          <button
            onClick={() => handleOpenModal("tambah")}
            className="inline-flex items-center justify-center gap-2 bg-brand hover:bg-navy text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah {activeTab === "pegawai" ? "Pegawai" : "Kendaraan"}</span>
          </button>
        </div>

        {/* METRICS & RINGKASAN */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {activeTab === "pegawai" ? (
            <>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">Total Pegawai</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-navy">
                    {statsPegawai.total}
                  </span>
                  <span className="text-xs font-bold text-slate-400">Orang</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">Internal (ASN)</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-brand">
                    {statsPegawai.internal}
                  </span>
                  <span className="text-xs font-bold text-brand/70">Pegawai</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">PPNPN</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-teal">
                    {statsPegawai.ppnpn}
                  </span>
                  <span className="text-xs font-bold text-teal/70">Personil</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">Magang</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-accent-yellow">
                    {statsPegawai.magang}
                  </span>
                  <span className="text-xs font-bold text-slate-400">Orang</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">Total Unit</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-navy">
                    {statsKendaraan.total}
                  </span>
                  <span className="text-xs font-bold text-slate-400">Kendaraan</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">Tersedia</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-green">
                    {statsKendaraan.tersedia}
                  </span>
                  <span className="text-xs font-bold text-green/70">Siap Pakai</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">Sedang Dipakai</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-accent-orange">
                    {statsKendaraan.dipakai}
                  </span>
                  <span className="text-xs font-bold text-slate-400">Operasional</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-mist shadow-2xs">
                <p className="text-xs font-semibold text-slate-500">Jenis Kendaraan</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-sm font-bold text-navy">
                    🚗 {statsKendaraan.mobil} Mobil • 🛵 {statsKendaraan.motor} Motor
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* TOOLBAR FILTER & CARI */}
        <div className="bg-white p-4 rounded-3xl border border-mist shadow-2xs mb-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  activeTab === "pegawai"
                    ? "Cari nama pegawai, NIP/NIK, jabatan, WA..."
                    : "Cari plat nomor, nama kendaraan..."
                }
                className="w-full pl-10 pr-4 py-2.5 bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 rounded-2xl outline-none text-sm font-medium transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-navy cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              {activeTab === "pegawai" ? (
                <>
                  <div className="relative min-w-[140px]">
                    <select
                      value={filterSubUnit}
                      onChange={(e) => setFilterSubUnit(e.target.value)}
                      className="w-full px-3 py-2.5 bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand rounded-2xl outline-none text-xs font-bold text-navy appearance-none cursor-pointer pr-8"
                    >
                      <option value="Semua">Semua Sub Unit</option>
                      <option value="KOOR">KOOR</option>
                      <option value="TU">TU</option>
                      <option value="AKLAP">AKLAP</option>
                      <option value="PA">PA</option>
                      <option value="BMN">BMN</option>
                      <option value="PTUK">PTUK</option>
                    </select>
                    <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <div className="relative min-w-[130px]">
                    <select
                      value={filterKategori}
                      onChange={(e) => setFilterKategori(e.target.value)}
                      className="w-full px-3 py-2.5 bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand rounded-2xl outline-none text-xs font-bold text-navy appearance-none cursor-pointer pr-8"
                    >
                      <option value="Semua">Semua Kategori</option>
                      <option value="Internal">Internal</option>
                      <option value="PPNPN">PPNPN</option>
                      <option value="Magang">Magang</option>
                    </select>
                    <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </>
              ) : (
                <div className="relative min-w-[140px]">
                  <select
                    value={filterJenisKendaraan}
                    onChange={(e) => setFilterJenisKendaraan(e.target.value)}
                    className="w-full px-3 py-2.5 bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand rounded-2xl outline-none text-xs font-bold text-navy appearance-none cursor-pointer pr-8"
                  >
                    <option value="Semua">Semua Jenis</option>
                    <option value="Mobil">Mobil</option>
                    <option value="Motor">Motor</option>
                  </select>
                  <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              {(searchTerm || filterSubUnit !== "Semua" || filterKategori !== "Semua" || filterJenisKendaraan !== "Semua") && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setFilterSubUnit("Semua");
                    setFilterKategori("Semua");
                    setFilterJenisKendaraan("Semua");
                  }}
                  className="px-3 py-2.5 rounded-2xl border border-mist bg-paper hover:bg-slate-200 text-xs font-bold text-slate-600 transition-all cursor-pointer whitespace-nowrap"
                  title="Reset Semua Filter"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================
            3. TABEL DATA
        ===================================================== */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-mist p-12 text-center shadow-2xs">
            <RefreshCw className="w-8 h-8 text-brand animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-navy">Menghubungkan ke Server...</p>
            <p className="text-xs text-slate-400 mt-1">Mengambil data master terkini</p>
          </div>
        ) : (
          <>
            {/* TABEL PEGAWAI */}
            {activeTab === "pegawai" && (
              <div className="bg-white rounded-3xl border border-mist shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-paper/70 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-mist whitespace-nowrap">
                        <th className="py-3.5 px-4 text-center w-14">No</th>
                        <th className="py-3.5 px-4">Nama Pegawai</th>
                        <th className="py-3.5 px-4">Email</th>
                        <th className="py-3.5 px-4">Sub Unit</th>
                        <th className="py-3.5 px-4">Jabatan</th>
                        <th className="py-3.5 px-4">Kategori</th>
                        <th className="py-3.5 px-4">No. WhatsApp</th>
                        <th className="py-3.5 px-4 text-center w-28">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist/60 text-sm">
                      {filteredPegawai.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="font-bold text-sm text-slate-600">
                              Tidak ada data pegawai yang cocok
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Coba ubah kata kunci pencarian atau filter subunit
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredPegawai.map((item, index) => (
                          <tr
                            key={item._id}
                            className="hover:bg-paper/50 transition-colors group"
                          >
                            <td className="py-3.5 px-4 text-center text-xs text-slate-400 font-semibold">
                              {index + 1}
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="font-bold text-navy leading-snug">
                                {item.nama}
                              </p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">
                                {item.nip || "-"}
                              </p>
                            </td>
                            <td className="py-3.5 px-4">
                              {item.email ? (
                                <span className="text-xs font-medium text-slate-700 truncate max-w-[220px] block" title={item.email}>
                                  {item.email}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-brand/10 text-brand">
                                {item.sub_unit || "-"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                              {item.jabatan || "-"}
                            </td>
                            <td className="py-3.5 px-4">
                              {item.kategori_pegawai === "PPNPN" ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-teal/15 text-teal-800 border border-teal/20">
                                  PPNPN
                                </span>
                              ) : item.kategori_pegawai === "Magang" ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  Magang
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-navy/10 text-navy border border-navy/15">
                                  Internal
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {item.no_wa ? (
                                <a
                                  href={`https://wa.me/${item.no_wa.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-mono font-medium text-slate-700 hover:text-brand transition-colors"
                                  title="Chat WhatsApp"
                                >
                                  {item.no_wa}
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleOpenModal("edit", item)}
                                  className="p-2 rounded-xl text-brand bg-brand/10 hover:bg-brand hover:text-white transition-all active:scale-95 cursor-pointer"
                                  title="Edit Data Pegawai"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setModalHapus({ id: item._id, nama: item.nama, tipe: "pegawai" })}
                                  className="p-2 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-600 hover:text-white transition-all active:scale-95 cursor-pointer"
                                  title="Hapus Data Pegawai"
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

            {/* TABEL KENDARAAN */}
            {activeTab === "kendaraan" && (
              <div className="bg-white rounded-3xl border border-mist shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-paper/70 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-mist whitespace-nowrap">
                        <th className="py-3.5 px-4 text-center w-14">No</th>
                        <th className="py-3.5 px-4">Plat Nomor</th>
                        <th className="py-3.5 px-4">Nama Kendaraan</th>
                        <th className="py-3.5 px-4">Jenis</th>
                        <th className="py-3.5 px-4">Status Ketersediaan</th>
                        <th className="py-3.5 px-4 text-center w-28">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist/60 text-sm">
                      {filteredKendaraan.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <Car className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="font-bold text-sm text-slate-600">
                              Tidak ada data kendaraan yang cocok
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Coba ubah kata kunci pencarian atau filter jenis
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredKendaraan.map((item, index) => (
                          <tr
                            key={item._id}
                            className="hover:bg-paper/50 transition-colors group"
                          >
                            <td className="py-3.5 px-4 text-center text-xs text-slate-400 font-semibold">
                              {index + 1}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-mono text-xs font-black tracking-wider text-navy bg-paper border border-mist px-3 py-1.5 rounded-xl inline-block shadow-2xs">
                                {item.plat}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-navy">
                              {item.nama}
                              {item.id && (
                                <span className="ml-2 text-[10px] font-semibold text-slate-400">
                                  ({item.id})
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-paper border border-mist text-slate-700">
                                {item.jenis === "Motor" ? "🛵 Motor" : "🚗 Mobil"}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {item.status === "TERSEDIA" ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green/15 text-green-800 border border-green/25">
                                  <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
                                  Tersedia
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                                  Dipakai
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleOpenModal("edit", item)}
                                  className="p-2 rounded-xl text-brand bg-brand/10 hover:bg-brand hover:text-white transition-all active:scale-95 cursor-pointer"
                                  title="Edit Kendaraan"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setModalHapus({ id: item._id, nama: item.nama || item.plat, tipe: "kendaraan" })}
                                  className="p-2 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-600 hover:text-white transition-all active:scale-95 cursor-pointer"
                                  title="Hapus Kendaraan"
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
          </>
        )}
      </main>

      {/* =====================================================
          4. MODAL FORM TAMBAH / EDIT
      ===================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-mist flex flex-col max-h-[92vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-mist bg-paper/40">
              <div>
                <h2 className="text-lg font-bold text-navy flex items-center gap-2">
                  <span>
                    {modalType === "tambah" ? "Tambah Data" : "Edit Data"}{" "}
                    {activeTab === "pegawai" ? "Pegawai" : "Kendaraan"}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lengkapi data di bawah ini dengan teliti
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-paper hover:bg-mist text-slate-400 hover:text-navy transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {activeTab === "pegawai" ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                      Nama Lengkap & Gelar *
                    </label>
                    <input
                      type="text"
                      name="nama"
                      value={formData.nama || ""}
                      onChange={handleChange}
                      placeholder="Contoh: Arip Sarkowi, S.E., M.Si."
                      className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Kategori Pegawai *
                      </label>
                      <select
                        name="kategori_pegawai"
                        value={formData.kategori_pegawai || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-bold text-navy cursor-pointer transition-all"
                        required
                      >
                        <option value="">Pilih Kategori</option>
                        <option value="Internal">Internal (PNS / PPPK)</option>
                        <option value="PPNPN">PPNPN</option>
                        <option value="Magang">Magang</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        {identitasForm.label} *
                      </label>
                      <input
                        type="text"
                        name="nip"
                        value={formData.nip || ""}
                        onChange={handleChange}
                        placeholder={identitasForm.contoh}
                        className={`w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border outline-none text-sm font-mono font-medium transition-all ${
                          identitasJanggal
                            ? "border-amber-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                            : "border-mist focus:border-brand focus:ring-4 focus:ring-brand/10"
                        }`}
                        required
                      />
                      {identitasJanggal && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {identitasForm.label} biasanya {identitasForm.digit} digit (saat ini {digitIdentitas}).
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Sub Unit *
                      </label>
                      <select
                        name="sub_unit"
                        value={formData.sub_unit || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-bold text-navy cursor-pointer transition-all"
                        required
                      >
                        <option value="">Pilih Sub Unit</option>
                        <option value="KOOR">KOOR</option>
                        <option value="TU">TU</option>
                        <option value="AKLAP">AKLAP</option>
                        <option value="PA">PA</option>
                        <option value="BMN">BMN</option>
                        <option value="PTUK">PTUK</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Jabatan *
                      </label>
                      <select
                        name="jabatan"
                        value={formData.jabatan || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-bold text-navy cursor-pointer transition-all"
                        required
                      >
                        <option value="">Pilih Jabatan</option>
                        {formData.jabatan && !DAFTAR_JABATAN.includes(formData.jabatan) && (
                          <option value={formData.jabatan}>{formData.jabatan}</option>
                        )}
                        {DAFTAR_JABATAN.map((j) => (
                          <option key={j} value={j}>
                            {j}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        No. WhatsApp *
                      </label>
                      <input
                        type="text"
                        name="no_wa"
                        value={formData.no_wa || ""}
                        onChange={handleChange}
                        placeholder="08123456789 atau 628123456789"
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Email Pegawai
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email || ""}
                        onChange={handleChange}
                        placeholder="nama@kemnaker.go.id"
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                      NIP Atasan Langsung (Opsional)
                    </label>
                    <input
                      type="text"
                      name="atasan_nip"
                      value={formData.atasan_nip || ""}
                      onChange={handleChange}
                      placeholder="Masukkan 18 digit NIP atasan bila ada..."
                      className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Plat Nomor *
                      </label>
                      <input
                        type="text"
                        name="plat"
                        value={formData.plat || ""}
                        onChange={handleChange}
                        placeholder="Contoh: B 1234 PQ"
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-mono font-bold tracking-wider transition-all uppercase"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Kode ID Unit (Opsional)
                      </label>
                      <input
                        type="text"
                        name="id"
                        value={formData.id || ""}
                        onChange={handleChange}
                        placeholder="Contoh: M01 / K02"
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                      Nama Kendaraan (Merek & Tipe) *
                    </label>
                    <input
                      type="text"
                      name="nama"
                      value={formData.nama || ""}
                      onChange={handleChange}
                      placeholder="Contoh: Toyota Innova Reborn 2.4 V"
                      className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Jenis Kendaraan *
                      </label>
                      <select
                        name="jenis"
                        value={formData.jenis || "Mobil"}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-bold text-navy cursor-pointer transition-all"
                      >
                        <option value="Mobil">Mobil</option>
                        <option value="Motor">Motor</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-navy uppercase tracking-wider mb-1.5">
                        Status Ketersediaan *
                      </label>
                      <select
                        name="status"
                        value={formData.status || "TERSEDIA"}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-bold text-navy cursor-pointer transition-all"
                      >
                        <option value="TERSEDIA">Tersedia (Siap Digunakan)</option>
                        <option value="DIPAKAI">Dipakai (Sedang Operasional)</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-mist bg-paper/30 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 bg-paper hover:bg-mist text-slate-700 font-bold text-sm rounded-2xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-navy hover:bg-brand text-white font-bold text-sm rounded-2xl shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
              >
                {modalType === "tambah" ? "Tambah Data" : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================
          5. MODAL KONFIRMASI HAPUS (CUSTOM POPUP)
      ===================================================== */}
      {modalHapus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-mist p-6 sm:p-7 text-center relative animate-in zoom-in-95 duration-150">
            {/* Close Button */}
            <button
              onClick={() => !isDeleting && setModalHapus(null)}
              disabled={isDeleting}
              className="absolute right-4 top-4 w-8 h-8 rounded-full bg-paper hover:bg-mist text-slate-400 hover:text-navy flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon Alert */}
            <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto mb-4 shadow-2xs">
              <Trash2 className="w-8 h-8" />
            </div>

            {/* Title & Description */}
            <h3 className="text-lg font-bold text-navy mb-1.5">
              Hapus Data {modalHapus.tipe === "pegawai" ? "Pegawai" : "Kendaraan"}?
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto mb-6">
              Apakah Anda yakin ingin menghapus{" "}
              <span className="font-bold text-navy">
                "{modalHapus.nama}"
              </span>
              ? Data ini akan dihapus permanen dari sistem.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalHapus(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-paper hover:bg-mist text-slate-700 font-bold text-sm rounded-2xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={konfirmasiHapus}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-2xl shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Ya, Hapus</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          6. TOAST NOTIFIKASI
      ===================================================== */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border animate-in slide-in-from-bottom-5 duration-200 bg-white border-mist text-navy">
          {toast.type === "success" ? (
            <div className="w-7 h-7 rounded-full bg-green/20 text-green flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
          <span className="text-xs font-bold">{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            className="p-1 text-slate-400 hover:text-navy cursor-pointer ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}