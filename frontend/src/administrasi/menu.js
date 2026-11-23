// =========================================================
// DAFTAR FITUR ADMINISTRASI ROKEU
// =========================================================
//
// Satu baris = satu menu sidebar + satu route /administrasi/<slug>/*.
// Halaman tiap fitur ada di folder ./fitur/<slug>/index.jsx dan mengatur
// sub-halamannya sendiri (daftar, form baru, ubah) dengan <Routes>.
//
// Anak magang cukup mengerjakan folder fiturnya; baris di sini sudah
// tersambung. Fitur baru: tambah folder + satu baris di bawah. nginx tidak
// perlu diubah — :8005 sudah meneruskan semua /administrasi/....

import { AppWindow, Coffee, Fuel, Plane, Printer } from "lucide-react";
import { jalur } from "./jalur";
import PerjalananDinas from "./fitur/perjalanan-dinas";
import LanggananAplikasi from "./fitur/langganan-aplikasi";
import Fotokopi from "./fitur/fotokopi";
import BbmKepalaBiro from "./fitur/bbm-kepala-biro";
import Konsumsi from "./fitur/konsumsi";

export const MENU_ADMINISTRASI = [
  {
    slug: "perjalanan-dinas",
    label: "Perjalanan Dinas",
    Ikon: Plane,
    keterangan: "Kwitansi, rincian, SPD, nominatif, dan SPBY perjalanan dinas.",
    Halaman: PerjalananDinas,
  },
  {
    slug: "langganan-aplikasi",
    label: "Langganan Aplikasi",
    Ikon: AppWindow,
    pisah: true,
    keterangan: "SPBY dan kwitansi pembayaran langganan aplikasi/layanan daring.",
    Halaman: LanggananAplikasi,
  },
  {
    slug: "fotokopi",
    label: "Fotokopi",
    Ikon: Printer,
    keterangan: "SPBY dan kwitansi jasa fotokopi dan penggandaan.",
    Halaman: Fotokopi,
  },
  {
    slug: "bbm-kepala-biro",
    label: "BBM Kepala Biro",
    Ikon: Fuel,
    keterangan: "SPBY dan kwitansi pembelian bahan bakar kendaraan Kepala Biro.",
    Halaman: BbmKepalaBiro,
  },
  {
    slug: "konsumsi",
    label: "Konsumsi",
    Ikon: Coffee,
    keterangan: "SPBY dan kwitansi pembelian konsumsi rapat/kegiatan.",
    Halaman: Konsumsi,
  },
].map((m) => ({ ...m, path: jalur(m.slug) }));
