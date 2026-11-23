// Menu sidebar SPBY & Kwitansi — dipakai KeuanganShell (sidebar) dan App
// (route). Tambah jenis pengeluaran baru di sini, lalu daftarkan path-nya di
// deploy/nginx/siska-8005-perjalanan-dinas.conf.

import { AppWindow, Coffee, Fuel, Plane, Printer } from "lucide-react";

export const MENU_KEUANGAN = [
  {
    path: "/perjalanan-dinas",
    label: "Perjalanan Dinas",
    Ikon: Plane,
    keterangan: "Kwitansi, rincian, SPD, nominatif, dan SPBY perjalanan dinas.",
  },
  {
    path: "/langganan-aplikasi",
    label: "Langganan Aplikasi",
    Ikon: AppWindow,
    pisah: true,
    keterangan: "SPBY dan kwitansi pembayaran langganan aplikasi/layanan daring.",
  },
  {
    path: "/fotokopi",
    label: "Fotokopi",
    Ikon: Printer,
    keterangan: "SPBY dan kwitansi jasa fotokopi dan penggandaan.",
  },
  {
    path: "/bbm-kepala-biro",
    label: "BBM Kepala Biro",
    Ikon: Fuel,
    keterangan: "SPBY dan kwitansi pembelian bahan bakar kendaraan Kepala Biro.",
  },
  {
    path: "/konsumsi",
    label: "Konsumsi",
    Ikon: Coffee,
    keterangan: "SPBY dan kwitansi pembelian konsumsi rapat/kegiatan.",
  },
];
