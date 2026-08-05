import React, { useState, useEffect } from "react";
import { apiTU } from "./services/ApiTU";
import {
  FaUsers,
  FaCar,
  FaPlus,
  FaEdit,
  FaTrash,
  FaTimes,
  FaSearch,
  FaFilter,
} from "react-icons/fa";

export default function AdminMasterDataTU() {
  // ==========================================
  // STATE AUTENTIKASI (Login Tembak API)
  // ==========================================
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // ==========================================
  // STATE DATA MASTER
  // ==========================================
  const [activeTab, setActiveTab] = useState("pegawai");
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("");
  const [searchTerm, setSearchSearchTerm] = useState("");
  const [filterSubUnit, setFilterSubUnit] = useState("Semua");
  const [filterJenisKendaraan, setFilterJenisKendaraan] = useState("Semua");

  const [dataPegawai, setDataPegawai] = useState([]);
  const [dataKendaraan, setDataKendaraan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({});

  // CEK LOGIN MEMORY (Cari token di localStorage)
  useEffect(() => {
    const savedToken = localStorage.getItem("masterdataToken");
    if (savedToken) {
      setIsLoggedIn(true);
    }
  }, []);

  // FUNGSI LOGIN (Nembak API Backend)
  // FUNGSI LOGIN (Nembak API Backend)
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!usernameInput || !passwordInput) {
      setErrorMsg("Isi username dan password dulu, brad!");
      return;
    }

    setIsLoginLoading(true);
    try {
      const requestBody = {
        username: usernameInput.trim(),
        password: passwordInput,
      };

      console.log("Ngirim data login:", requestBody);

      const res = await apiTU({
        url: "api/login",
        method: "POST",
        options: {
          body: requestBody,
        },
      });

      if (res && res.token) {
        localStorage.setItem("masterdataToken", res.token);
        setIsLoggedIn(true);
      } else {
        throw new Error("Token tidak diterima dari server");
      }
    } catch (error) {
      console.error("Login Error:", error.message);
      setErrorMsg("Username atau Password salah, brad!");
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm("Yakin mau logout dari Master Data?")) {
      setIsLoggedIn(false);
      localStorage.removeItem("masterdataToken");
      setUsernameInput("");
      setPasswordInput("");
    }
  };

  // AMBIL DATA (Hanya jalan kalau sudah login, otomatis pakai token jika ada)
  const fetchData = async () => {
    setLoading(true);
    try {
      const resPegawai = await apiTU({ url: "api/pegawai" });
      const resKendaraan = await apiTU({ url: "api/kendaraan" });
      setDataPegawai(resPegawai || []);
      setDataKendaraan(resKendaraan || []);
    } catch (err) {
      console.error("Gagal narik data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    }
  }, [isLoggedIn]);

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
        alert("Data Berhasil Ditambah!");
      } else {
        await apiTU({
          url: `api/${activeTab}/${formData._id}`,
          method: "PUT",
          options: { body: formData },
        });
        alert("Data Berhasil Diperbarui!");
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error("Gagal simpan:", err);
      alert("Waduh, gagal simpan data brad!");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Beneran mau hapus data ini, Sakeh?")) {
      try {
        await apiTU({
          url: `api/${activeTab}/${id}`,
          method: "DELETE",
        });
        fetchData();
      } catch (err) {
        alert("Gagal hapus data!");
      }
    }
  };

  const handleOpenModal = (tipe, data = {}) => {
    setModalType(tipe);
    setFormData(tipe === "tambah" ? {} : data);
    setShowModal(true);
  };

  // FILTER DATA
  const filteredPegawai = dataPegawai.filter((p) => {
    const matchSearch =
      p.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nip?.includes(searchTerm);
    const matchFilter =
      filterSubUnit === "Semua" ? true : p.sub_unit === filterSubUnit;
    return matchSearch && matchFilter;
  });

  const filteredKendaraan = dataKendaraan.filter((k) => {
    const matchSearch =
      k.nama?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.plat?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchFilter =
      filterJenisKendaraan === "Semua"
        ? true
        : k.jenis === filterJenisKendaraan;
    return matchSearch && matchFilter;
  });

  // ==========================================
  // RENDER UI 1: JIKA BELUM LOGIN
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-blue-600 mb-2">
              Admin Panel Tata Usaha
            </h1>
            <p className="text-sm text-slate-500">
              Pegawai dan Kendaraan
            </p>
          </div>
          {errorMsg && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4 text-center border border-red-100 font-medium">
              {errorMsg}
            </div>
          )}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm"
                placeholder="Masukkan username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoginLoading}
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 text-sm disabled:opacity-50"
            >
              {isLoginLoading ? "Memeriksa..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER UI 2: JIKA SUDAH LOGIN (PANEL ADMIN)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* HEADER & TABS */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 border-b-4 border-blue-600">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">
              Admin Panel Master Data
            </h1>
            <p className="text-sm text-slate-500">
              Kelola Data Pegawai dan Kendaraan Dinas
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
              <button
                onClick={() => setActiveTab("pegawai")}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${
                  activeTab === "pegawai"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <FaUsers className="w-4 h-4" /> Pegawai
              </button>
              <button
                onClick={() => setActiveTab("kendaraan")}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${
                  activeTab === "kendaraan"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <FaCar className="w-4 h-4" /> Kendaraan
              </button>
            </div>
            {/* TOMBOL LOGOUT */}
            <button
              onClick={handleLogout}
              className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white px-5 py-2 rounded-xl font-bold text-sm transition-all border border-red-100"
            >
              Logout
            </button>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-3">
          <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3 flex-1">
            <div className="relative w-full sm:w-72">
              <FaSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchSearchTerm(e.target.value)}
                placeholder={`Cari data ${activeTab}...`}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm"
              />
            </div>

            <div className="relative w-full sm:w-48">
              <FaFilter className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              {activeTab === "pegawai" ? (
                <select
                  value={filterSubUnit}
                  onChange={(e) => setFilterSubUnit(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
                >
                  <option value="Semua">Semua Sub Unit</option>
                  <option value="KOOR">KOOR</option>
                  <option value="TU">TU</option>
                  <option value="AKLAP">AKLAP</option>
                  <option value="PA">PA</option>
                  <option value="BMN">BMN</option>
                  <option value="PTUK">PTUK</option>
                </select>
              ) : (
                <select
                  value={filterJenisKendaraan}
                  onChange={(e) => setFilterJenisKendaraan(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
                >
                  <option value="Semua">Semua Jenis</option>
                  <option value="Mobil">Mobil</option>
                  <option value="Motor">Motor</option>
                </select>
              )}
            </div>
          </div>

          <button
            onClick={() => handleOpenModal("tambah")}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            <FaPlus className="w-3 h-3" /> Tambah{" "}
            {activeTab === "pegawai" ? "Pegawai" : "Kendaraan"}
          </button>
        </div>

        {loading ? (
          <p className="text-center py-10 text-slate-500">
            Lagi nunggu database VPS brad...
          </p>
        ) : (
          <>
            {/* TABEL PEGAWAI */}
            {activeTab === "pegawai" && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100 whitespace-nowrap">
                        <th className="p-4 font-bold text-center w-16">No</th>
                        <th className="p-4 font-bold">Nama Pegawai</th>
                        <th className="p-4 font-bold">NIP</th>
                        <th className="p-4 font-bold">Sub Unit</th>
                        <th className="p-4 font-bold">Jabatan</th>
                        <th className="p-4 font-bold">Kategori</th>
                        <th className="p-4 font-bold">No. WA</th>
                        <th className="p-4 font-bold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {filteredPegawai.map((item, index) => (
                        <tr
                          key={item._id}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-4 text-center text-slate-500 font-medium">
                            {index + 1}
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            {item.nama}
                          </td>
                          <td className="p-4 text-slate-600">{item.nip}</td>
                          <td className="p-4">
                            <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">
                              {item.sub_unit || "-"}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600">{item.jabatan}</td>
                          <td className="p-4">
                            <div className="text-xs text-blue-600 font-semibold bg-blue-50 inline-block px-2 py-1 rounded">
                              {item.kategori_pegawai || "Internal"}
                            </div>
                          </td>
                          <td className="p-4 text-slate-600">
                            {item.no_wa || "-"}
                          </td>
                          <td className="p-4 flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenModal("edit", item)}
                              className="p-2 text-amber-500 bg-amber-50 hover:bg-amber-100 rounded-lg"
                            >
                              <FaEdit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item._id)}
                              className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"
                            >
                              <FaTrash className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TABEL KENDARAAN */}
            {activeTab === "kendaraan" && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100 whitespace-nowrap">
                        <th className="p-4 font-bold text-center w-16">No</th>
                        <th className="p-4 font-bold">Plat</th>
                        <th className="p-4 font-bold">Nama Kendaraan</th>
                        <th className="p-4 font-bold">Jenis</th>
                        <th className="p-4 font-bold">Status</th>
                        <th className="p-4 font-bold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {filteredKendaraan.map((item, index) => (
                        <tr
                          key={item._id}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-4 text-center text-slate-500 font-medium">
                            {index + 1}
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            {item.plat}
                          </td>
                          <td className="p-4 font-medium text-slate-700">
                            {item.nama}
                          </td>
                          <td className="p-4 text-slate-600">{item.jenis}</td>
                          <td className="p-4">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                item.status === "TERSEDIA"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-600"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="p-4 flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenModal("edit", item)}
                              className="p-2 text-amber-500 bg-amber-50 hover:bg-amber-100 rounded-lg"
                            >
                              <FaEdit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item._id)}
                              className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"
                            >
                              <FaTrash className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL FORM TAMBAH/EDIT */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">
                {modalType === "tambah" ? "Tambah" : "Edit"}{" "}
                {activeTab === "pegawai" ? "Data Pegawai" : "Data Kendaraan"}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {activeTab === "pegawai" ? (
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Nama Pegawai
                    </label>
                    <input
                      type="text"
                      name="nama"
                      value={formData.nama || ""}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        NIP
                      </label>
                      <input
                        type="text"
                        name="nip"
                        value={formData.nip || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        No. WA (Aktif)
                      </label>
                      <input
                        type="text"
                        name="no_wa"
                        value={formData.no_wa || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email || ""}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Jabatan
                    </label>
                    <input
                      type="text"
                      name="jabatan"
                      value={formData.jabatan || ""}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      NIP Atasan
                    </label>
                    <input
                      type="text"
                      name="atasan_nip"
                      value={formData.atasan_nip || ""}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                      placeholder="Opsional..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Subunit
                      </label>
                      <select
                        name="sub_unit"
                        value={formData.sub_unit || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm bg-white cursor-pointer focus:border-blue-500"
                        required
                      >
                        <option value="" disabled>
                          Pilih Subunit
                        </option>
                        <option value="KOOR">KOOR</option>
                        <option value="TU">TU</option>
                        <option value="AKLAP">AKLAP</option>
                        <option value="PA">PA</option>
                        <option value="BMN">BMN</option>
                        <option value="PTUK">PTUK</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Kategori
                      </label>
                      <select
                        name="kategori_pegawai"
                        value={formData.kategori_pegawai || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm bg-white cursor-pointer focus:border-blue-500"
                        required
                      >
                        <option value="" disabled>
                          Pilih Kategori
                        </option>
                        <option value="Internal">Internal</option>
                        <option value="PPNPN">PPNPN</option>
                        <option value="Magang">Magang</option>
                        <option value="TimGudang">Tim Gudang</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Kode ID (Opsional)
                      </label>
                      <input
                        type="text"
                        name="id"
                        value={formData.id || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                        placeholder="Contoh: M01"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Plat Nomor
                      </label>
                      <input
                        type="text"
                        name="plat"
                        value={formData.plat || ""}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                        placeholder="B 1234 XX"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">
                      Nama Kendaraan
                    </label>
                    <input
                      type="text"
                      name="nama"
                      value={formData.nama || ""}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm focus:border-blue-500"
                      placeholder="Merek/Tipe..."
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Jenis
                      </label>
                      <select
                        name="jenis"
                        value={formData.jenis || "Mobil"}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm bg-white focus:border-blue-500"
                      >
                        <option value="Mobil">Mobil</option>
                        <option value="Motor">Motor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">
                        Status
                      </label>
                      <select
                        name="status"
                        value={formData.status || "TERSEDIA"}
                        onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm bg-white focus:border-blue-500"
                      >
                        <option value="TERSEDIA">Tersedia</option>
                        <option value="DIPAKAI">Dipakai</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-sm transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold text-sm shadow-lg shadow-blue-200 transition-all"
              >
                Simpan Data
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}