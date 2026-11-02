// Nama operator dashboard barang, untuk kolom "dicatat oleh" di rekap mutasi.
//
// Belum ada login, jadi ini sekadar nama yang diketik operator sekali lalu
// diingat browser. Dikirim lewat header X-Operator di setiap permintaan yang
// mengubah stok, dan server mencatatnya ke log audit. Ini BUKAN bukti
// identitas — siapa pun bisa mengetik nama apa pun — tapi tetap jauh lebih
// berguna bagi auditor daripada kolom kosong.
//
// localStorage bisa melempar galat (mode privat, penyimpanan diblokir), jadi
// setiap aksesnya dibungkus try/catch; tanpa nama pun dashboard tetap jalan.

const KUNCI = "operatorBarang";

export function bacaOperator() {
  try {
    return localStorage.getItem(KUNCI) || "";
  } catch {
    return "";
  }
}

export function simpanOperator(nama) {
  try {
    localStorage.setItem(KUNCI, nama);
  } catch {
    // Dibiarkan: nama tetap terpakai selama halaman terbuka.
  }
}

// Header dikodekan URI karena header HTTP hanya boleh ASCII, sedangkan nama
// pegawai bisa memuat huruf seperti é atau apostrof lengkung.
export function headerOperator(nama = bacaOperator()) {
  return nama ? { "X-Operator": encodeURIComponent(nama) } : {};
}
