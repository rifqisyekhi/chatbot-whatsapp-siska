// const BASE_URL = process.env.REACT_APP_API_TU;

// export const apiTU = async ({ 
//   url, 
//   method = "GET", 
//   token = null, 
//   options = {}, 
//   isMultiType = false 
// }) => {
//   const fullUrl = `${BASE_URL}${url}`; 
  
//   const headers = {
//     ...(token && { Authorization: `Bearer ${token}` }),
//     ...(!isMultiType && { "Content-Type": "application/json" }),
//     ...options.headers,
//   };

//   const fetchOptions = {
//     method,
//     headers,
//   };

//   if (options.body && method !== "GET") {
//     fetchOptions.body = isMultiType ? options.body : JSON.stringify(options.body);
//   }

//   try {
//     const response = await fetch(fullUrl, fetchOptions);
//     if (!response.ok) {
//       const errorData = await response.json().catch(() => ({}));
//       throw new Error(errorData.message || `Error: ${response.status}`);
//     }

//     return await response.json();
//   } catch (error) {
//     console.error(`[API TU ERROR]: ${fullUrl}`, error.message);
//     throw error;
//   }
// };
// Default sengaja string kosong supaya URL-nya RELATIF terhadap halaman yang
// sedang dibuka. Frontend dan API disajikan oleh Express yang sama dan di port
// yang sama, jadi "/api/barang" selalu menemukan servernya sendiri — entah
// diakses lewat IP VPS, domain, atau localhost.
//
// Jangan isi VITE_API_TU dengan http://localhost:3000: nilainya dibakar ke
// dalam bundle saat build, sehingga browser pengunjung akan memanggil
// localhost MILIK PENGUNJUNG, bukan server.
const BASE_URL = import.meta.env.VITE_API_TU || "";

export const apiTU = async ({ 
  url, 
  method = "GET", 
  token = null, 
  options = {}, 
  isMultiType = false 
}) => {
  // CLEANING URL: Memastikan tidak ada double slash (//) di tengah
  const cleanBase = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  const fullUrl = `${cleanBase}${cleanUrl}`; 
  
  const headers = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(!isMultiType && { "Content-Type": "application/json" }),
    ...(options.headers || {}), // Safety check jika headers kosong
  };

  const fetchOptions = {
    method,
    headers,
  };

  // Logic Body
  if (options.body && method !== "GET") {
    fetchOptions.body = isMultiType ? options.body : JSON.stringify(options.body);
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);
    
    // Jika response kosongan (misal 204 No Content), jangan di .json()
    if (response.status === 204) return true;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // Tambahkan log yang lebih detail biar lu gampang debug di console
    console.error(`[API TU ERROR] Ke: ${fullUrl}`, error.message);
    throw error;
  }
};