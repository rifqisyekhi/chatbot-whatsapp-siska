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
```
chatbot-whatsapp-siska
├─ .claude
│  └─ settings.local.json
├─ assets
│  ├─ fonts
│  │  ├─ BOOKOS.TTF
│  │  ├─ BOOKOSB.TTF
│  │  ├─ BOOKOSBI.TTF
│  │  ├─ BOOKOSI.TTF
│  │  ├─ times-bold.ttf
│  │  ├─ times-italic.ttf
│  │  ├─ times.ttf
│  │  └─ timesbi.ttf
│  └─ images
│     ├─ contoh-ttd.png
│     ├─ kop-kemnaker.png
│     └─ logo-kemnaker.png
├─ config
│  └─ config.js
├─ data
│  └─ data_helpdesk.txt
├─ features
│  ├─ ai_helpdesk.js
│  └─ pdf_generator.js
├─ index.js
├─ models
│  ├─ Antrian.js
│  ├─ Barang.js
│  ├─ Kendaraan.js
│  ├─ Pegawai.js
│  ├─ RiwayatKendaraan.js
│  └─ RiwayatLembur.js
├─ package-lock.json
├─ package.json
├─ public
│  ├─ assets
│  │  ├─ Amplop.png
│  │  ├─ BakBantalStempel.png
│  │  ├─ BantexFilingPockets.png
│  │  ├─ BantexHitam.png
│  │  ├─ BateraiAA.png
│  │  ├─ BateraiAAA.png
│  │  ├─ BinderClip105.png
│  │  ├─ BinderClipNo.107.png
│  │  ├─ BinderClipNo.111.png
│  │  ├─ BinderClipNo.155.png
│  │  ├─ BinderClipNo.200.png
│  │  ├─ BinderClipNo.260.png
│  │  ├─ BinderClipNo.280.png
│  │  ├─ BinderClipNo.300.png
│  │  ├─ BinderClipNo.320.png
│  │  ├─ BoldlinerBiru.png
│  │  ├─ BoldlinerHitam.png
│  │  ├─ Canon054Biru.png
│  │  ├─ Canon054Hitam.png
│  │  ├─ Canon054Kuning.png
│  │  ├─ Cutter.png
│  │  ├─ CutterKecil.png
│  │  ├─ Flashdisk.png
│  │  ├─ Gunting.png
│  │  ├─ index-BAOAPpQb.js
│  │  ├─ index-Blnrg7oO.css
│  │  ├─ index-ByUi0exa.css
│  │  ├─ index-CCHuW8ot.js
│  │  ├─ index-CKBuJ-OY.js
│  │  ├─ index-D8hwY5Cw.css
│  │  ├─ index-DzD8WUuZ.js
│  │  ├─ index-D_56OIod.js
│  │  ├─ index-rYIGEVuV.js
│  │  ├─ IsiCutter.png
│  │  ├─ IsiStaplesNo.10-1m.png
│  │  ├─ KertasA4.png
│  │  ├─ KertasF4.png
│  │  ├─ KeyboardFullSet.png
│  │  ├─ LakbanBening.png
│  │  ├─ LakbanHitam.png
│  │  ├─ Lem.png
│  │  ├─ MapPlastik.png
│  │  ├─ MouseWireless.png
│  │  ├─ PaperClipNo.5.png
│  │  ├─ PenggarisAluminium.png
│  │  ├─ Penghapus.png
│  │  ├─ Pensil2B.png
│  │  ├─ Pos-itTT.png
│  │  ├─ Post-itNote.png
│  │  ├─ PulpenJoykoHitam.png
│  │  ├─ PulpenKenkoBiru.png
│  │  ├─ PulpenKenkoHitam.png
│  │  ├─ PulpenZebra.png
│  │  ├─ RautanPensil.png
│  │  ├─ SIgnhereWarnaWarni.png
│  │  ├─ SpidolSnowman.png
│  │  ├─ SpidolSnowmanPermanen.png
│  │  ├─ StaplesHD-50.png
│  │  ├─ StaplesKecil.png
│  │  ├─ TaliPlastik.png
│  │  ├─ TintaStempelBantal.png
│  │  ├─ TintaStempelOtomatis.png
│  │  ├─ TipexKertas.png
│  │  ├─ Toner107A.png
│  │  ├─ Toner202ABiru.png
│  │  ├─ Toner202AHitam.png
│  │  ├─ Toner202AKuning.png
│  │  ├─ Toner202APink.png
│  │  ├─ Toner76A.png
│  │  ├─ Toner83A.png
│  │  ├─ TonerCanon054Magenta.png
│  │  ├─ TrigonalClip01.png
│  │  └─ TrigonalClip03.png
│  ├─ index.html
│  └─ logo-kemnaker.png
├─ README.md
└─ stok_barang.json

```