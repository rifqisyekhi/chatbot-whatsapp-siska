# SisKA - Chatbot Whatsapp Biro Keuangan & BMN

Sistem otomasi pelayanan internal berbasis WhatsApp Bot dan Dashboard Web terintegrasi.

## Description

SisKA (Asisten Cerdas Biro Keuangan & Barang Milik Negara) dirancang untuk mendigitalisasi dan mempercepat alur kerja administrasi di lingkungan Kementerian Ketenagakerjaan RI. Sistem ini terdiri dari dua bagian utama:
1. **WhatsApp Bot (`whatsapp-web.js`):** Menangani AI Helpdesk, pengajuan lembur, manajemen cuti, peminjaman kendaraan dinas, dan order persediaan dengan sistem *approval* langsung via chat.
2. **Dashboard Management Web (React.js):** Panel kontrol untuk mengelola Master Data Pegawai, Master Data Kendaraan, dan memonitor stok gudang. Sistem dilengkapi dengan *Role-Based Authentication* mandiri tanpa bergantung pada layanan pihak ketiga.

## Getting Started

### Dependencies

* OS: VPS Biro Keuangan dan BMN
* Lingkungan Runtime: Node.js (Minimal v18, disarankan v24+)
* Database: MongoDB Atlas Login pakai akung google **tatausaha026@gmail.com**
* Process Manager: PM2 (Diperlukan untuk menjaga bot tetap berjalan di server latar belakang)
* Package Manager: `npm`
* env (file bersifat private): Link Drive: (https://drive.google.com/drive/folders/1dKGnlIvLO36HexyN_IcnPJLJ3lJDs9Kj?usp=sharing)

### Installing

* Kloning repositori ke mesin lokal atau server:
```bash
git clone [https://github.com/rifqisyekhi/chatbot-whatsapp-siska](https://github.com/rifqisyekhi/chatbot-whatsapp-siska)
cd SisKA

* Unduh dan instal semua dependensi program: npm install

### Executing Program
* Local: node index.js
* VPS: pm2 start index.js --name "bot-siska" (pm2 ada di deskripsi dependencies)

* Melihat Log (Untuk Scan QR Code atau Cek Error): pm2 logs bot-siska --lines 200
```

## Help
Jika bingung dan ingin ditanyakan bisa hubungi kontak author

## Authors
- Rifqi Syekhi - MagangHUB Batch 2
- Rizqi Akbar

## License
This project is licensed under the Biro Keuangan dan BMN License