import React, { useEffect, useState } from "react";
import { SendHorizontal } from "lucide-react";

export default function InventoryTaking() {
  // 1. STATE UNTUK MENAMPUNG DATA DARI API
  const [databaseBarang, setDatabaseBarang] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // STATE BAWAAN SEBELUMNYA
  const [keranjang, setKeranjang] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [listKonfirmasi, setListKonfirmasi] = useState([]);
  const [teksWA, setTeksWA] = useState("");

  useEffect(() => {
    fetch("http://192.168.221.44:3000/api/barang")
      .then((response) => response.json())
      .then((data) => {
        setDatabaseBarang(data);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Gagal menarik data dari API:", error);
        setIsLoading(false);
      });
  }, []);

  const ubahJumlah = (id, perubahan, stok) => {
    setKeranjang((prev) => {
      let jumlah = (prev[id] || 0) + perubahan;

      if (jumlah < 0) jumlah = 0;
      if (jumlah > stok) {
        alert("Melebihi stok!");
        jumlah = stok;
      }

      return { ...prev, [id]: jumlah };
    });
  };

  const checkoutWA = () => {
    let list = [];
    // 3. UBAH TEKS AWALAN AGAR BOT SISKA BISA MENDETEKSI!
    let teks = `!ORDER_BARANG\n\n`;

    databaseBarang.forEach((b) => {
      const jumlah = keranjang[b.id] || 0;
      if (jumlah > 0) {
        list.push(`${b.nama} (${jumlah} ${b.satuan})`);
        teks += `- ${b.nama} (${jumlah} ${b.satuan})\n`;
      }
    });

    if (list.length === 0) {
      alert("Belum pilih barang!");
      return;
    }

    setListKonfirmasi(list);
    setTeksWA(teks);
    setShowModal(true);
  };

  const sendToWA = () => {
    // 4. PASTIKAN INI ADALAH NOMOR BOT SISKA (Awalan 62)
    const nomor = "6285122777026";
    window.location.href = `https://wa.me/${nomor}?text=${encodeURIComponent(teksWA)}`;
  };

  return (
    <div className="bg-gray-100 min-h-screen pb-24">
      <div className="max-w-3xl mx-auto p-4">

        <div className="bg-white rounded-xl shadow p-4 text-center mb-4">
          <h1 className="text-lg font-bold">Pengambilan Persediaan</h1>
          <p className="text-sm text-gray-500">Biro Keuangan dan BMN</p>
        </div>

        {/* Indikator Loading saat narik data dari VPS */}
        {isLoading ? (
          <div className="text-center p-10 text-gray-500 font-semibold animate-pulse">
            Mengambil data dari Gudang...
          </div>
        ) : (
          databaseBarang.map((barang) => (
            <div key={barang.id} className="flex items-center justify-between bg-white p-3 rounded-lg shadow mb-2">
              <img src={barang.img} alt="" className="w-12 h-12 object-contain" />

              <div className="flex-1 ml-3">
                <h2 className="font-semibold text-sm">{barang.nama}</h2>
                <p className="text-xs text-gray-500">
                  {barang.satuan} | Stok: {barang.stok}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => ubahJumlah(barang.id, -1, barang.stok)}
                  className="text-red-500 text-xl"
                >
                  -
                </button>

                <span className="w-6 text-center">
                  {keranjang[barang.id] || 0}
                </span>

                <button
                  onClick={() => ubahJumlah(barang.id, 1, barang.stok)}
                  className="text-green-500 text-xl"
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:relative flex justify-center w-full">
        <div className="w-full bg-white/80 backdrop-blur-md p-4 md:rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button
            onClick={checkoutWA}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>Kirim ke WhatsApp</span>
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-5 w-full max-w-md">
            <h2 className="font-bold mb-2">Konfirmasi</h2>

            <ul className="text-sm mb-3 max-h-60 overflow-y-auto">
              {listKonfirmasi.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
              >
                Kembali
              </button>

              <button
                onClick={sendToWA}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Ya, Kirim Sekarang <SendHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}