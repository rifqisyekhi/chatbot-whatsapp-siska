import React, { useState, useEffect } from "react";
import AdminMasterData from "./AdminMasterData";
// import AdminBarang from "./AdminBarang"; // Nanti buka komen ini kalau file AdminBarang udah lu bikin

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState(""); // Isinya bakal 'admin' atau 'persediaan'
  
  // State untuk form login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Cek otomatis kalau sebelumnya udah pernah login (baca dari memory browser)
  useEffect(() => {
    const savedRole = localStorage.getItem("auth_role");
    if (savedRole) {
      setIsLoggedIn(true);
      setRole(savedRole);
    }
  }, []);

  const handleLogin = (e) => {
  e.preventDefault();
  setErrorMsg("");

  // Mengambil data kredensial dari file .env
  const adminUser = import.meta.env.VITE_ADMIN_USER;
  const adminPass = import.meta.env.VITE_ADMIN_PASS;
  const stokUser = import.meta.env.VITE_STOK_USER;
  const stokPass = import.meta.env.VITE_STOK_PASS;

  // Logika pengecekan login
  if (username === adminUser && password === adminPass) {
    loginSuccess("admin");
  } else if (username === stokUser && password === stokPass) {
    loginSuccess("persediaan");
  } else {
    setErrorMsg("Username atau Password salah, brad!");
  }
};

  const loginSuccess = (userRole) => {
    setIsLoggedIn(true);
    setRole(userRole);
    localStorage.setItem("auth_role", userRole);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setRole("");
    setUsername("");
    setPassword("");
    localStorage.removeItem("auth_role");
  };

  // 1. RENDER UI LOGIN JIKA BELUM MASUK
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-blue-600 mb-2">SisKA Login</h1>
            <p className="text-sm text-slate-500">Silakan masuk ke panel admin</p>
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4 text-center border border-red-100 font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm" 
                placeholder="Masukkan username"
                required 
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm" 
                placeholder="••••••••"
                required 
              />
            </div>
            <button 
              type="submit" 
              className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 text-sm"
            >
              Masuk
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. RENDER UI ADMIN JIKA ROLE = ADMIN
  if (role === "admin") {
    return <AdminMasterData onLogout={handleLogout} />;
  }

  // 3. RENDER UI PERSEDIAAN JIKA ROLE = PERSEDIAAN
  if (role === "persediaan") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center font-sans">
        <h1 className="text-2xl font-bold mb-4 text-slate-800">Panel Admin Persediaan (Barang)</h1>
        <p className="text-slate-500 mb-6 max-w-md">
          Komponen tabel AdminBarang lu nanti dimasukin ke sini brad. Buat sekarang, ini cuma halaman sementara aja.
        </p>
        
        {/* Nanti buka komen ini kalau komponennya udah ada: */}
        {/* <AdminBarang onLogout={handleLogout} /> */}
        
        {/* Tombol darurat buat ngetes fungsi logout di role persediaan */}
        <button 
          onClick={handleLogout} 
          className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-100 transition-all px-6 py-2.5 rounded-xl font-bold text-sm"
        >
          Logout dari Persediaan
        </button>
      </div>
    );
  }

  return null;
}