import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Minus,
  Users,
  Calendar,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  PackageOpen,
} from "lucide-react";
import { apiTU, getUrlPresensi } from "./services/ApiTU";
import logoKemnaker from "./assets/logo-kemnaker.png";

// Halaman ini berdiri sendiri tanpa navigasi bersama, supaya operator barang
// tidak punya jalan ke dashboard data pegawai (lihat App.jsx).
//
// id barang: GET /api/barang memetakan id_barang menjadi `id` (index.js:320),
// sedangkan route PUT/DELETE memakai :id_barang. Jadi `item.id` di sini sudah
// tepat dan tidak perlu diubah.
//
// TAMPILAN mengikuti palet resmi di index.css (navy / brand / paper / mist +
// aksen kuning, hijau, teal), dengan idiom yang sama seperti MasterDataTU.jsx:
// kartu rounded-2xl/3xl, border-mist, shadow-2xs, tombol utama bg-brand yang
// menggelap ke navy saat disentuh.
//
// Satu catatan soal keterbacaan warna: aksen kuning (#FFD52E) dan hijau
// (#9BC264) terlalu terang untuk dipakai sebagai warna TEKS di atas putih —
// kontrasnya di bawah ambang WCAG. Jadi aksen itu dipakai sebagai LATAR
// beropasitas rendah, sementara teksnya memakai nuansa gelap sewarna
// (amber-800 / green-800). Pola ini sudah dipakai lebih dulu di MasterDataTU.
const DashboardBarang = () => {
  const [databaseBarang, setDatabaseBarang] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterKategori, setFilterKategori] = useState("");
  const [sortBy, setSortBy] = useState("nama");
  const [activeTab, setActiveTab] = useState("inventaris");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [formData, setFormData] = useState({
    nama: "",
    kategori: "ATK",
    stok: 0,
    satuan: "Pcs",
    img: "",
  });

  // Konfirmasi hapus. Dulu memakai window.confirm() — kotak bawaan peramban
  // yang tidak bisa ikut palet dan tidak menyebut akibatnya. Diganti modal,
  // bentuknya sama dengan konfirmasi hapus di MasterDataTU.
  const [modalHapus, setModalHapus] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      setLoading(true);
      try {
        const data = await apiTU({ url: "api/barang" });
        setDatabaseBarang(data || []);
        if (isManualRefresh) showToast("Data berhasil disegarkan!", "success");
      } catch (error) {
        console.error("Gagal load data:", error);
        showToast("Gagal terhubung ke server!", "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    document.title = "Stok ATK - Biro Keuangan dan BMN";
    loadData();
  }, [loadData]);

  const openModal = (item = null) => {
    if (item) {
      setCurrentItem(item);
      setFormData({
        nama: item.nama || "",
        kategori: item.kategori || "ATK",
        stok: Number(item.stok) || 0,
        satuan: item.satuan || "Pcs",
        img: item.img || "",
      });
    } else {
      setCurrentItem(null);
      setFormData({
        nama: "",
        kategori: "ATK",
        stok: 0,
        satuan: "Pcs",
        img: "",
      });
    }
    setIsModalOpen(true);

    setTimeout(() => {
      const input = document.querySelector('input[name="nama-barang"]');
      if (input) input.focus();
    }, 200);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        setFormData({ ...formData, img: compressedBase64 });
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.nama || !formData.kategori || !formData.satuan) {
      showToast("Mohon lengkapi Nama, Kategori, dan Satuan!", "error");
      return;
    }

    const payload = {
      nama: formData.nama,
      kategori: formData.kategori,
      stok: Number(formData.stok) || 0,
      satuan: formData.satuan,
      img: formData.img,
    };

    try {
      const method = currentItem ? "PUT" : "POST";
      const url = currentItem ? `api/barang/${currentItem.id}` : `api/barang`;

      await apiTU({
        url,
        method,
        options: { body: payload },
      });

      setIsModalOpen(false);
      showToast(
        currentItem ? "Barang berhasil diperbarui!" : "Barang ditambahkan!",
        "success"
      );
      loadData();
    } catch (error) {
      console.error(error);
      showToast("Terjadi kesalahan saat menyimpan data.", "error");
    }
  };

  const changeStok = async (item, delta) => {
    const stokAwal = Number(item.stok) || 0;
    const newStok = stokAwal + delta;

    if (newStok < 0) {
      showToast("Stok tidak bisa kurang dari 0!", "error");
      return;
    }

    setDatabaseBarang((prev) =>
      prev.map((b) => (b.id === item.id ? { ...b, stok: newStok } : b))
    );

    const payload = {
      nama: item.nama,
      kategori: item.kategori,
      stok: newStok,
      satuan: item.satuan || "Pcs",
      img: item.img || "",
    };

    try {
      await apiTU({
        url: `api/barang/${item.id}`,
        method: "PUT",
        options: { body: payload },
      });
      showToast(`Stok ${item.nama} diupdate!`, "success");
    } catch (error) {
      console.error(error);
      loadData();
      showToast("Gagal update stok di server.", "error");
    }
  };

  const konfirmasiHapus = async () => {
    if (!modalHapus) return;
    const { id, nama } = modalHapus;

    setIsDeleting(true);
    try {
      await apiTU({
        url: `api/barang/${id}`,
        method: "DELETE",
      });
      setDatabaseBarang((prev) => prev.filter((b) => b.id !== id));
      setModalHapus(null);
      showToast(`Barang ${nama} dihapus!`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus barang.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredBarang = useMemo(() => {
    return databaseBarang
      .filter((item) => {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
          item.nama?.toLowerCase().includes(search) ||
          item.id?.toLowerCase().includes(search);
        const matchesKat = filterKategori
          ? item.kategori === filterKategori
          : true;
        const stok = Number(item.stok) || 0;

        if (activeTab === "stok-rendah")
          return matchesSearch && matchesKat && stok > 0 && stok <= 3;
        if (activeTab === "habis")
          return matchesSearch && matchesKat && stok === 0;
        return matchesSearch && matchesKat;
      })
      .sort((a, b) => {
        const stokA = Number(a.stok) || 0;
        const stokB = Number(b.stok) || 0;
        const namaA = a.nama?.toLowerCase() || "";
        const namaB = b.nama?.toLowerCase() || "";

        if (sortBy === "stok-asc") return stokA - stokB;
        if (sortBy === "stok-desc") return stokB - stokA;
        if (sortBy === "z-a") return namaB.localeCompare(namaA);
        return namaA.localeCompare(namaB);
      });
  }, [databaseBarang, searchTerm, filterKategori, sortBy, activeTab]);

  const totalPages = Math.ceil(filteredBarang.length / itemsPerPage);
  const paginatedBarang = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredBarang.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredBarang, currentPage]);

  const stats = useMemo(() => {
    return databaseBarang.reduce(
      (acc, curr) => {
        const s = Number(curr.stok) || 0;
        acc.total++;
        acc.stok += s;
        if (s > 0 && s <= 3) acc.low++;
        if (s <= 0) acc.out++;
        return acc;
      },
      { total: 0, stok: 0, low: 0, out: 0 }
    );
  }, [databaseBarang]);

  // Dipakai berulang di form modal, jadi ditaruh di satu tempat supaya
  // bentuk kolom isian tidak pelan-pelan berbeda satu sama lain.
  const kelasIsian =
    "w-full px-4 py-2.5 rounded-2xl bg-paper/60 hover:bg-paper focus:bg-white " +
    "border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 " +
    "outline-none text-sm font-medium transition-all";

  const kelasLabel =
    "block text-xs font-bold text-navy uppercase tracking-wider mb-1.5";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-paper font-sans text-navy selection:bg-brand selection:text-white">
      {/* =====================================================
          1. HEADER ATAS (NAVBAR)
      ===================================================== */}
      <header className="bg-white border-b border-mist shadow-2xs shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between gap-4">
            {/* Logo & Judul Sistem */}
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-mist bg-paper p-1.5 shadow-2xs">
                <img
                  src={logoKemnaker}
                  alt="Logo Kemnaker"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-lg font-extrabold tracking-tight text-navy sm:text-xl">
                    Stok ATK
                  </h1>
                  <span className="hidden items-center rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand sm:inline-flex">
                    Persediaan
                  </span>
                </div>
                <p className="truncate text-xs font-medium text-slate-500">
                  Biro Keuangan dan BMN • Persediaan Barang Kantor
                </p>
              </div>
            </div>

            {/* Quick Switcher, Refresh & Aksi Utama */}
            <div className="flex shrink-0 items-center gap-2">
              <a
                href="/admin"
                className="hidden items-center gap-1.5 rounded-xl border border-mist bg-paper px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-mist active:scale-95 sm:inline-flex"
                title="Ke Master Data Pegawai & Kendaraan"
              >
                <Users className="h-3.5 w-3.5 text-brand" />
                <span>Master Data</span>
              </a>

              <a
                href={getUrlPresensi()}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-1.5 rounded-xl border border-mist bg-paper px-3 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:bg-mist active:scale-95 md:inline-flex"
                title="Buka Aplikasi Presensi Non-ASN"
              >
                <Calendar className="h-3.5 w-3.5 text-teal" />
                <span>Presensi</span>
                <ExternalLink className="h-3 w-3 text-slate-400" />
              </a>

              <button
                onClick={() => loadData(true)}
                disabled={loading}
                className="cursor-pointer rounded-xl border border-mist bg-white p-2.5 text-slate-600 shadow-2xs transition-all hover:bg-paper active:scale-95"
                title="Segarkan Data (Refresh)"
              >
                <RefreshCw
                  className={`h-4 w-4 text-brand ${loading ? "animate-spin" : ""}`}
                />
              </button>

              <button
                onClick={() => openModal(null)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-navy hover:shadow-lg active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Tambah Barang</span>
                <span className="sm:hidden">Tambah</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* =====================================================
          2. KONTEN UTAMA
      ===================================================== */}
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
        {/* RINGKASAN — tiga di antaranya sekaligus penyaring tabel */}
        <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Total Jenis"
            value={stats.total}
            sub="produk"
            warna="text-navy"
            active={activeTab === "inventaris"}
            onClick={() => {
              setActiveTab("inventaris");
              setCurrentPage(1);
            }}
          />
          <StatCard
            label="Total Stok"
            value={stats.stok}
            sub="unit"
            warna="text-brand"
          />
          <StatCard
            label="Stok Rendah"
            value={stats.low}
            sub="perlu cek"
            warna="text-amber-800"
            active={activeTab === "stok-rendah"}
            onClick={() => {
              setActiveTab("stok-rendah");
              setCurrentPage(1);
            }}
          />
          <StatCard
            label="Stok Habis"
            value={stats.out}
            sub="kosong"
            warna="text-rose-600"
            active={activeTab === "habis"}
            onClick={() => {
              setActiveTab("habis");
              setCurrentPage(1);
            }}
          />
        </div>

        {/* PENYARING & PENGURUTAN */}
        <div className="shrink-0 rounded-3xl border border-mist bg-white p-3 shadow-2xs sm:p-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari SKU atau Nama..."
                className="w-full rounded-2xl border border-mist bg-paper/60 py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition-all hover:bg-paper focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <select
              className="cursor-pointer rounded-2xl border border-mist bg-paper/60 px-3 py-2.5 text-xs font-bold text-navy outline-none transition-all hover:bg-paper focus:border-brand focus:bg-white"
              value={filterKategori}
              onChange={(e) => {
                setFilterKategori(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">Semua Kategori</option>
              <option value="ATK">ATK</option>
              <option value="Elektronik">Elektronik</option>
            </select>

            <select
              className="cursor-pointer rounded-2xl border border-mist bg-paper/60 px-3 py-2.5 text-xs font-bold text-navy outline-none transition-all hover:bg-paper focus:border-brand focus:bg-white sm:ml-auto"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="nama">Urutan: A-Z</option>
              <option value="z-a">Urutan: Z-A</option>
              <option value="stok-asc">Stok: Terendah</option>
              <option value="stok-desc">Stok: Tertinggi</option>
            </select>
          </div>
        </div>

        {/* TABEL BARANG */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-mist bg-white shadow-2xs">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-paper/95 backdrop-blur">
                <tr className="whitespace-nowrap border-b border-mist text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="w-12 px-4 py-3.5 text-center">No</th>
                  <th className="px-4 py-3.5">Barang</th>
                  <th className="px-4 py-3.5">Kategori</th>
                  <th className="px-4 py-3.5">Satuan</th>
                  <th className="w-40 px-4 py-3.5">Stok</th>
                  <th className="w-28 px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist/60 text-sm">
                {paginatedBarang.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="group transition-colors hover:bg-paper/50"
                  >
                    <td className="px-4 py-3.5 text-center text-xs font-medium text-slate-400">
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {item.img && (
                          <div className="flex h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-mist bg-paper shadow-2xs">
                            <img
                              src={item.img}
                              alt={item.nama}
                              className="h-full w-full object-contain p-1"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold leading-snug text-navy">
                            {item.nama}
                          </p>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                            {item.id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand">
                        {item.kategori}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center rounded-lg border border-mist bg-paper px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {item.satuan || "Pcs"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => changeStok(item, -1)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-mist bg-paper text-slate-600 transition-all hover:border-brand hover:bg-brand hover:text-white active:scale-95"
                          title={`Kurangi stok ${item.nama}`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm font-black tracking-tight text-navy">
                          {item.stok}
                        </span>
                        <button
                          onClick={() => changeStok(item, 1)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-mist bg-paper text-slate-600 transition-all hover:border-brand hover:bg-brand hover:text-white active:scale-95"
                          title={`Tambah stok ${item.nama}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge stok={item.stok} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => openModal(item)}
                          className="cursor-pointer rounded-xl bg-brand/10 p-2 text-brand transition-all hover:bg-brand hover:text-white active:scale-95"
                          title={`Edit ${item.nama}`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            setModalHapus({ id: item.id, nama: item.nama })
                          }
                          className="cursor-pointer rounded-xl bg-rose-50 p-2 text-rose-600 transition-all hover:bg-rose-600 hover:text-white active:scale-95"
                          title={`Hapus ${item.nama}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {paginatedBarang.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      {loading ? (
                        <>
                          <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-brand" />
                          <p className="text-sm font-bold text-navy">
                            Menghubungkan ke Server...
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-mist bg-paper text-slate-400 shadow-2xs">
                            <PackageOpen className="h-8 w-8" />
                          </div>
                          <p className="text-sm font-bold text-navy">
                            Tidak ada data ditemukan.
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Coba ubah kata kunci, kategori, atau ringkasan yang
                            dipilih di atas.
                          </p>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINASI */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-mist bg-paper/40 px-4 py-3">
            <span className="text-[11px] font-bold tracking-tight text-slate-500">
              Menampilkan {paginatedBarang.length} dari {filteredBarang.length}{" "}
              item
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-mist bg-white text-slate-600 shadow-2xs transition-all hover:bg-paper active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                title="Halaman sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[72px] text-center text-[11px] font-bold text-navy">
                Hal {totalPages === 0 ? 0 : currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-mist bg-white text-slate-600 shadow-2xs transition-all hover:bg-paper active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                title="Halaman berikutnya"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* =====================================================
          3. MODAL TAMBAH / EDIT BARANG
      ===================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex animate-pudar items-center justify-center bg-navy/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="flex max-h-[92vh] w-full max-w-xl animate-muncul flex-col overflow-hidden rounded-3xl border border-mist bg-white shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-mist bg-paper/40 p-6">
              <div>
                <h2 className="text-lg font-bold text-navy">
                  {currentItem ? "Edit Barang" : "Tambah Barang Baru"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Lengkapi data di bawah ini dengan teliti
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-paper text-slate-400 transition-all hover:bg-mist hover:text-navy"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div>
                <label className={kelasLabel}>
                  Nama Barang <span className="text-rose-600">*</span>
                </label>
                <input
                  name="nama-barang"
                  type="text"
                  required
                  className={kelasIsian}
                  placeholder="Contoh: Kertas A4 80gr"
                  value={formData.nama}
                  onChange={(e) =>
                    setFormData({ ...formData, nama: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={kelasLabel}>
                    Kategori <span className="text-rose-600">*</span>
                  </label>
                  <select
                    className={`${kelasIsian} cursor-pointer`}
                    value={formData.kategori}
                    onChange={(e) =>
                      setFormData({ ...formData, kategori: e.target.value })
                    }
                  >
                    <option value="ATK">ATK</option>
                    <option value="Elektronik">Elektronik</option>
                  </select>
                </div>
                <div>
                  <label className={kelasLabel}>
                    Satuan <span className="text-rose-600">*</span>
                  </label>
                  <select
                    className={`${kelasIsian} cursor-pointer`}
                    value={formData.satuan}
                    onChange={(e) =>
                      setFormData({ ...formData, satuan: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      Pilih...
                    </option>
                    <option value="Pcs">Pcs</option>
                    <option value="Pack">Pack</option>
                    <option value="Dus">Dus</option>
                    <option value="Rim">Rim</option>
                    <option value="Box">Box</option>
                    <option value="Kosong">Kosong</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={kelasLabel}>
                  Stok Saat Ini <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  className={kelasIsian}
                  value={formData.stok}
                  onChange={(e) =>
                    setFormData({ ...formData, stok: e.target.value })
                  }
                />
              </div>

              <div>
                <label className={kelasLabel}>Foto Barang (Opsional)</label>
                <div className="flex items-center gap-3 rounded-2xl border border-mist bg-paper/60 p-3">
                  {formData.img && (
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-mist bg-white shadow-2xs">
                      <img
                        src={formData.img}
                        alt="preview"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full cursor-pointer text-xs font-medium text-slate-600 transition-all file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-brand/10 file:px-4 file:py-2 file:text-xs file:font-bold file:text-brand hover:file:bg-brand hover:file:text-white"
                    onChange={handleImageChange}
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex shrink-0 items-center gap-3 border-t border-mist bg-paper/40 p-6">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 cursor-pointer rounded-2xl bg-paper py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-mist"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-[2] cursor-pointer rounded-2xl bg-brand py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-navy hover:shadow-lg active:scale-95"
              >
                {currentItem ? "Simpan Perubahan" : "Tambah Barang"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================
          4. MODAL KONFIRMASI HAPUS
      ===================================================== */}
      {modalHapus && (
        <div className="fixed inset-0 z-50 flex animate-pudar items-center justify-center bg-navy/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md animate-muncul rounded-3xl border border-mist bg-white p-6 text-center shadow-2xl sm:p-7">
            <button
              onClick={() => !isDeleting && setModalHapus(null)}
              disabled={isDeleting}
              className="absolute right-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-paper text-slate-400 transition-all hover:bg-mist hover:text-navy"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-rose-100 bg-rose-50 text-rose-600 shadow-2xs">
              <Trash2 className="h-8 w-8" />
            </div>

            <h3 className="mb-1.5 text-lg font-bold text-navy">Hapus Barang?</h3>
            <p className="mx-auto mb-6 max-w-sm text-xs leading-relaxed text-slate-500">
              Apakah Anda yakin ingin menghapus{" "}
              <span className="font-bold text-navy">"{modalHapus.nama}"</span>?
              Data ini akan dihapus permanen dari sistem.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalHapus(null)}
                disabled={isDeleting}
                className="flex-1 cursor-pointer rounded-2xl bg-paper py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-mist"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={konfirmasiHapus}
                disabled={isDeleting}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-rose-600 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-rose-700 hover:shadow active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Ya, Hapus</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          5. TOAST NOTIFIKASI
      ===================================================== */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex animate-naik items-center gap-2.5 rounded-2xl border border-mist bg-white px-4 py-3 text-navy shadow-xl"
          >
            {t.type === "success" ? (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green/20 text-green-800">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertCircle className="h-4 w-4" />
              </div>
            )}
            <span className="text-xs font-bold">{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Kartu ringkasan. Tiga di antaranya merangkap penyaring tabel, jadi yang
// bisa diklik dirender sebagai <button> supaya bisa dicapai lewat Tab dan
// Enter — bukan <div onClick> yang tidak bisa dicapai lewat papan tik.
const StatCard = ({ label, value, sub, warna = "text-navy", active, onClick }) => {
  const isi = (
    <>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`text-2xl font-black tracking-tight ${warna}`}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-medium text-slate-400">{sub}</div>
    </>
  );

  const dasar = "rounded-2xl border bg-white p-4 text-left shadow-2xs transition-all";

  if (!onClick) {
    return <div className={`${dasar} border-mist`}>{isi}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${dasar} cursor-pointer active:scale-[0.98] ${
        active
          ? "border-brand bg-brand/5 ring-4 ring-brand/10"
          : "border-mist hover:border-brand/40"
      }`}
    >
      {isi}
    </button>
  );
};

// Aksen kuning & hijau palet dipakai sebagai LATAR beropasitas rendah dengan
// teks nuansa gelap sewarna. Kalau dipakai langsung sebagai warna teks di
// atas putih, keduanya terlalu tipis untuk dibaca.
const StatusBadge = ({ stok }) => {
  const s = Number(stok);

  if (s <= 0)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-tight text-rose-700">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Habis
      </span>
    );

  if (s <= 3)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent-yellow/50 bg-accent-yellow/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-tight text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-yellow" />
        Rendah
      </span>
    );

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-green/40 bg-green/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-tight text-green-800">
      <span className="h-1.5 w-1.5 rounded-full bg-green" />
      Tersedia
    </span>
  );
};

export default DashboardBarang;
