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
} from "lucide-react";
import { apiTU } from "./services/ApiTU";

// Diadaptasi dari dashboard proyek lain; tampilannya sengaja dipertahankan.
// Tiga penyesuaian terhadap proyek ini:
// 1. Impor apiTU memakai path relatif, karena alias "@/" tidak dipasang di
//    vite.config.js proyek ini (kalau dibiarkan, build langsung gagal).
// 2. Gerbang login dilepas, mengikuti keputusan bahwa dashboard tidak memakai
//    login. Versi aslinya juga tidak benar-benar mengamankan apa pun: apiTU
//    tidak pernah mengirim token, dan /api/barang di backend memang terbuka.
// 3. Tinggi akar diubah dari h-screen ke h-full supaya pas di dalam
//    AdminLayout yang sudah punya bilah navigasi sendiri.
//
// id barang: GET /api/barang memetakan id_barang menjadi `id` (index.js:320),
// sedangkan route PUT/DELETE memakai :id_barang. Jadi `item.id` di sini sudah
// tepat dan tidak perlu diubah.
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

  const handleDelete = async (id, nama) => {
    if (!window.confirm(`Hapus permanen barang "${nama}"?`)) return;
    try {
      await apiTU({
        url: `api/barang/${id}`,
        method: "DELETE",
      });
      setDatabaseBarang((prev) => prev.filter((b) => b.id !== id));
      showToast(`Barang ${nama} dihapus!`, "success");
    } catch (error) {
      console.error(error);
      showToast("Gagal menghapus barang.", "error");
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

  return (
    <div className="flex h-full w-full text-[#1f2937] font-sans overflow-hidden bg-gray-50">
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        <header className="h-[72px] bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-800 uppercase tracking-tight">
              Inventaris Admin
            </h1>
            <p className="text-[13px] font-medium text-gray-500 mt-0.5">
              Pusat Manajemen Barang
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              className="p-2 border rounded-lg hover:bg-gray-50 text-gray-500 transition-all active:scale-95"
              title="Refresh Data"
            >
              <RefreshCw
                size={15}
                className={loading ? "animate-spin text-blue-500" : ""}
              />
            </button>
            <button
              onClick={() => openModal(null)}
              className="h-[34px] bg-[#2563eb] text-white px-4 rounded-lg text-[13px] font-medium flex items-center gap-1.5 hover:bg-[#1d4ed8] transition-all"
            >
              <Plus size={15} /> Tambah Barang
            </button>
          </div>
        </header>

        <section className="p-6 flex-1 flex flex-col min-h-0 overflow-hidden gap-4">
          <div className="grid grid-cols-4 gap-3 shrink-0">
            <StatCard
              label="Total Jenis"
              value={stats.total}
              sub="produk"
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
              color="text-[#15803d]"
            />
            <StatCard
              label="Stok Rendah"
              value={stats.low}
              sub="perlu cek"
              color="text-[#b45309]"
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
              color="text-[#b91c1c]"
              active={activeTab === "habis"}
              onClick={() => {
                setActiveTab("habis");
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="flex justify-between items-center shrink-0">
            <div className="flex gap-2">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Cari SKU atau Nama..."
                  className="h-9 w-64 pl-9 pr-3 text-[13px] border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <select
                className="h-9 px-3 text-[13px] border border-gray-200 rounded-lg outline-none bg-white cursor-pointer"
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
            </div>
            <select
              className="h-9 px-3 text-[13px] border border-gray-200 rounded-lg outline-none bg-white cursor-pointer"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="nama">Urutan: A-Z</option>
              <option value="z-a">Urutan: Z-A</option>
              <option value="stok-asc">Stok: Terendah</option>
              <option value="stok-desc">Stok: Tertinggi</option>
            </select>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="px-4 py-3 w-12 text-center">No</th>
                    <th className="px-4 py-3">Barang</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Satuan</th>
                    <th className="px-4 py-3 w-40">Stok</th>
                    <th className="px-4 py-3 w-28">Status</th>
                    <th className="px-4 py-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedBarang.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-[13px] text-gray-400 text-center">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="px-4 py-3 flex items-center gap-3">
                        {item.img && (
                          <div className="w-10 h-10 bg-white border border-gray-200 rounded-lg overflow-hidden flex shrink-0">
                            <img
                              src={item.img}
                              alt={item.nama}
                              className="w-full h-full object-contain p-1"
                            />
                          </div>
                        )}
                        <div>
                          <div className="text-[13px] font-semibold text-gray-700">
                            {item.nama}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono uppercase">
                            {item.id}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-tight">
                          {item.kategori}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-gray-600">
                        {item.satuan || "Pcs"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => changeStok(item, -1)}
                            className="w-6 h-6 border rounded flex items-center justify-center text-gray-500 hover:bg-gray-100"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-[13px] font-bold text-gray-800 w-6 text-center">
                            {item.stok}
                          </span>
                          <button
                            onClick={() => changeStok(item, 1)}
                            className="w-6 h-6 border rounded flex items-center justify-center text-gray-500 hover:bg-gray-100"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge stok={item.stok} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => openModal(item)}
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.nama)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedBarang.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-10 text-gray-400 text-sm"
                      >
                        Tidak ada data ditemukan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/30 shrink-0">
              <span className="text-[11px] text-gray-400 font-medium tracking-tight">
                Menampilkan {paginatedBarang.length} dari {filteredBarang.length}{" "}
                item
              </span>
              <div className="flex gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="w-8 h-8 flex items-center justify-center border rounded-md disabled:opacity-30 bg-white hover:bg-gray-50"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="w-8 h-8 flex items-center justify-center border rounded-md disabled:opacity-30 bg-white hover:bg-gray-50"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-[16px] text-gray-800">
                {currentItem ? "Edit Barang" : "Tambah Barang Baru"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase mb-1.5 block">
                  Nama Barang <span className="text-red-500">*</span>
                </label>
                <input
                  name="nama-barang"
                  type="text"
                  required
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="Contoh: Kertas A4 80gr"
                  value={formData.nama}
                  onChange={(e) =>
                    setFormData({ ...formData, nama: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase mb-1.5 block">
                    Kategori <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full h-10 px-2 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-blue-500 transition-all bg-white"
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
                  <label className="text-[11px] font-bold text-gray-400 uppercase mb-1.5 block">
                    Satuan <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full h-10 px-2 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-blue-500 transition-all bg-white"
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
                <label className="text-[11px] font-bold text-gray-400 uppercase mb-1.5 block">
                  Stok Saat Ini <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-[13px] outline-none focus:border-blue-500 transition-all"
                  value={formData.stok}
                  onChange={(e) =>
                    setFormData({ ...formData, stok: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase mb-1.5 block">
                  Foto Barang (Opsional)
                </label>
                <div className="flex items-center gap-3">
                  {formData.img && (
                    <div className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden shrink-0">
                      <img
                        src={formData.img}
                        alt="preview"
                        className="w-full h-full object-contain bg-gray-50"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full text-[12px] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer"
                    onChange={handleImageChange}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 h-11 border border-gray-200 rounded-xl text-[13px] font-semibold text-gray-500 hover:bg-gray-50 transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-[2] h-11 bg-[#2563eb] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1d4ed8] shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
                >
                  {currentItem ? "Simpan Perubahan" : "Tambah Barang"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-[13px] text-white transition-all duration-300 transform translate-x-0 opacity-100 ${
              t.type === "success" ? "bg-[#15803d]" : "bg-[#b91c1c]"
            }`}
          >
            {t.type === "success" ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="w-4 h-4"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="w-4 h-4"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            )}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  sub,
  color = "text-gray-800",
  active,
  onClick,
}) => (
  <div
    onClick={onClick}
    className={`bg-white border p-4 rounded-xl shadow-sm cursor-pointer transition-all duration-300 ${
      active
        ? "ring-2 ring-blue-500 border-transparent bg-blue-50/30"
        : "border-gray-100 hover:border-blue-200"
    }`}
  >
    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
      {label}
    </div>
    <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
    <div className="text-[10px] text-gray-400 mt-1 font-medium">{sub}</div>
  </div>
);

const StatusBadge = ({ stok }) => {
  const s = Number(stok);
  if (s <= 0)
    return (
      <span className="bg-red-50 text-red-600 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight">
        Habis
      </span>
    );
  if (s <= 3)
    return (
      <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight">
        Rendah
      </span>
    );
  return (
    <span className="bg-green-50 text-green-600 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight">
      Tersedia
    </span>
  );
};

export default DashboardBarang;
