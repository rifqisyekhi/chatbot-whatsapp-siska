import React, { useEffect, useState, useCallback } from "react";
import { SendHorizontal, Loader2, PackageOpen, Plus, Minus, Info, Search, Filter } from "lucide-react";
import { apiTU } from "./services/ApiTU";

export default function InventoryTaking() {
  const [databaseBarang, setDatabaseBarang] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedKategori, setSelectedKategori] = useState("Semua");

  const [sortBy, setSortBy] = useState("A-Z");

  const [zoomedImg, setZoomedImg] = useState(null);

  const [keranjang, setKeranjang] = useState({});
  const [showModal, setShowModal] = useState(false);

  const fetchBarang = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiTU({ url: "api/barang" });
      setDatabaseBarang(
        (data || []).map((item) => ({
          ...item,
          id: item.id_barang || item._id || item.id,
          nama: item.nama || item.nama_barang || "",
          kategori: item.kategori || "Umum",
          stok: Number(item.stok || 0),
          satuan: item.satuan || "Pcs",
          img: item.img || "",
        }))
      );
      setError(null);
    } catch (err) {
      setError(err.message || "Gagal mengambil data dari server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBarang();
  }, [fetchBarang]);

  const ubahJumlah = (id, perubahan, stok, satuanDefault) => {
    setKeranjang((prev) => {
      const itemLama = prev[id] || { qty: 0, satuan: satuanDefault };
      const jumlahBaru = itemLama.qty + perubahan;

      if (jumlahBaru < 0) return { ...prev, [id]: { ...itemLama, qty: 0 } };
      if (jumlahBaru > stok) {
        alert("Stok tidak mencukupi!");
        return { ...prev, [id]: { ...itemLama, qty: stok } };
      }
      return { ...prev, [id]: { ...itemLama, qty: jumlahBaru } };
    });
  };

  const ubahSatuan = (id, satuanBaru) => {
    setKeranjang((prev) => ({
      ...prev,
      [id]: { ...prev[id], satuan: satuanBaru },
    }));
  };

  const handleCheckout = () => {
    const adaBarang = Object.values(keranjang).some((item) => item.qty > 0);
    if (!adaBarang) {
      alert("Silahkan pilih barang terlebih dahulu!");
      return;
    }
    setShowModal(true);
  };

  const sendToWA = () => {
    const nomor = "6285122777026"; 
    let teks = "!ORDER_BARANG\n\n";

    databaseBarang.forEach((b) => {
      const item = keranjang[b.id];
      if (item && item.qty > 0) {
        teks += `- [${b.id}] ${b.nama} (${item.qty} ${item.satuan})\n`;
      }
    });

    window.location.href = `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}`;
    setShowModal(false);
  };

  const daftarKategori = [...new Set(databaseBarang.map(b => b.kategori).filter(Boolean))];
  const filteredBarang = databaseBarang
    .filter(barang => {
      const matchSearch = barang.nama.toLowerCase().includes(searchTerm.toLowerCase());
      const matchKategori = selectedKategori === "Semua" || barang.kategori === selectedKategori;
      return matchSearch && matchKategori;
    })
    .sort((a, b) => {
      if (sortBy === "A-Z") {
        return (a.nama || "").localeCompare(b.nama || "");
      }
      if (sortBy === "Z-A") {
        return (b.nama || "").localeCompare(a.nama || "");
      }
      if (sortBy === "STOK_TINGGI") {
        return b.stok - a.stok; 
      }
      if (sortBy === "STOK_RENDAH") {
        return a.stok - b.stok; 
      }
      return (a.nama || "").localeCompare(b.nama || "");
    });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
        <p className="text-slate-600 font-medium animate-pulse">Menghubungkan ke Gudang...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <div className="bg-red-50 p-8 rounded-3xl border border-red-100 max-w-sm">
          <PackageOpen className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-red-600 font-bold text-lg">Gagal Mengambil Data</h2>
          <button onClick={fetchBarang} className="w-full py-3 bg-red-500 text-white rounded-xl font-bold mt-4">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 w-full mb-24">
        {/* HEADER */}
        <div className="bg-white rounded-2xl shadow-sm p-6 text-center mb-6 border-b-4 border-blue-500">
          <h1 className="text-xl font-extrabold text-gray-800">Katalog Persediaan Barang</h1>
          <p className="text-sm text-gray-500 mt-1">Biro Keuangan dan BMN - SisKA</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama barang..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          <div className="relative col-span-1">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={selectedKategori}
              onChange={(e) => setSelectedKategori(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
            >

              <option value="Semua">Semua Kategori</option>
              
              {daftarKategori.map(kat => (
                <option key={kat} value={kat}>{kat}</option>
              ))}
            </select>
          </div>

          <div className="relative col-span-1">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transform rotate-180" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all text-gray-700 font-medium"
            >
              <option value="A-Z">Nama (A - Z)</option>
              <option value="Z-A">Nama (Z - A)</option>
              <option value="STOK_TINGGI">Tinggi - Rendah</option>
              <option value="STOK_RENDAH">Rendah - Tinggi</option>
            </select>
          </div>
        </div>


        <div className="grid gap-3">
          {filteredBarang.length > 0 ? (
            filteredBarang.map((barang) => (
              <div key={barang.id} className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 overflow-hidden shrink-0">
                  <img 
                    src={barang.img} 
                    alt={barang.nama} 
                    onClick={() => setZoomedImg(barang.img)}
                    className="w-10 h-10 object-contain cursor-pointer hover:opacity-80 hover:scale-110 transition-all"
                    onError={(e) => { e.target.src = "https://placehold.co/100x100?text=No+Img"; }}
                  />
                </div>

                <div className="flex-1 ml-4 mr-2">
                  <h2 className="font-bold text-gray-800 text-sm leading-tight">{barang.nama}</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Stok: <span className={`font-bold ${barang.stok > 0 ? 'text-blue-600' : 'text-red-500'}`}>{barang.stok}</span> {barang.satuan}
                  </p>
                </div>

                <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 shrink-0">
                  <button
                    onClick={() => ubahJumlah(barang.id, -1, barang.stok, barang.satuan)}
                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-red-500 shadow-sm disabled:opacity-50"
                    disabled={!keranjang[barang.id]?.qty}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-bold text-gray-700 text-sm">
                    {keranjang[barang.id]?.qty || 0}
                  </span>
                  <button
                    onClick={() => ubahJumlah(barang.id, 1, barang.stok, barang.satuan)}
                    className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-green-600 shadow-sm disabled:opacity-50"
                    disabled={barang.stok === 0 || keranjang[barang.id]?.qty >= barang.stok}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-10">
              <PackageOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Barang tidak ditemukan</p>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Item</p>
            <p className="text-lg font-black text-blue-600">
              {Object.values(keranjang).reduce((a, b) => a + b.qty, 0)} <span className="text-sm font-normal text-gray-400">Barang</span>
            </p>
          </div>
          <button
            onClick={handleCheckout}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
            disabled={Object.values(keranjang).reduce((a, b) => a + b.qty, 0) === 0}
          >
            <SendHorizontal className="w-4 h-4" />
            Checkout
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-2 mb-4 text-blue-600">
              <Info className="w-5 h-5" />
              <h2 className="text-lg font-bold text-gray-800">Review Pesanan</h2>
            </div>

            <div className="space-y-4 mb-6 max-h-[50vh] overflow-y-auto pr-2">
              {databaseBarang.filter(b => keranjang[b.id]?.qty > 0).map((b) => (
                <div key={b.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-sm font-bold text-gray-700 mb-2">{b.nama}</p>
                  <div className="flex items-center justify-between gap-4">
                    <select
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      value={keranjang[b.id].satuan}
                      onChange={(e) => ubahSatuan(b.id, e.target.value)}
                    >
                      {["Pcs", "Pack", "Box", "Rim", "Buku", "Roll"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>

                    <div className="flex items-center bg-white rounded-lg p-1 border border-gray-200">
                      <button onClick={() => ubahJumlah(b.id, -1, b.stok, b.satuan)} className="px-2 text-red-500"><Minus className="w-3 h-3" /></button>
                      <span className="w-6 text-center text-sm font-bold">{keranjang[b.id].qty}</span>
                      <button onClick={() => ubahJumlah(b.id, 1, b.stok, b.satuan)} className="px-2 text-green-600"><Plus className="w-3 h-3" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button onClick={sendToWA} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all">
                Kirim ke WhatsApp
              </button>
              <button onClick={() => setShowModal(false)} className="w-full py-3 text-gray-500 hover:text-gray-700 font-semibold transition-all">
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {zoomedImg && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setZoomedImg(null)} 
        >
          <div className="relative max-w-4xl w-full flex justify-center items-center flex-col relative">
            <button 
              onClick={() => setZoomedImg(null)}
              className="absolute -top-12 right-0 md:right-4 text-white hover:text-red-500 text-4xl font-bold transition-colors"
            >
              &times;
            </button>
            <img 
              src={zoomedImg} 
              alt="Zoomed" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border-4 border-white/10"
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}

    </div>
  );
}