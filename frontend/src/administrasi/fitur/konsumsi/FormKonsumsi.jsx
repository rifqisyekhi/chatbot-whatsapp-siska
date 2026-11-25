import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Plus,
  Trash2,
  FileText,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ReceiptText,
} from "lucide-react";
import { apiKwitansi, bukaPdf } from "../../../services/sesiKwitansi";
import { jalur } from "../../jalur";
import { DATA_CONTOH_KONSUMSI } from "./dataContoh";

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");
const hariIni = () => new Date().toISOString().slice(0, 10);

// Batas SBM PMK 32 Tahun 2025 (SBM TA 2026) per provinsi
const SBM_KONSUMSI = {
  "D.K.I. Jakarta": { makanan: 57000, kudapan: 24000 },
  "Jawa Barat": { makanan: 53000, kudapan: 22000 },
  Banten: { makanan: 53000, kudapan: 22000 },
  "Jawa Tengah": { makanan: 48000, kudapan: 20000 },
  "D.I. Yogyakarta": { makanan: 47000, kudapan: 20000 },
  "Jawa Timur": { makanan: 49000, kudapan: 21000 },
  "Luar Jawa / Lainnya": { makanan: 50000, kudapan: 21000 },
};

const DAFTAR_BIDANG = ["TU", "AKLAP", "PTUK", "BMN", "PA"];

const DAFTAR_AKUN = [
  "026.01.WA.2158.EBA.994.002.A.521211 — Belanja Bahan (Konsumsi Rapat Biasa)",
  "026.01.WA.2158.EBA.994.002.A.521219 — Belanja Bahan Lainnya",
  "026.01.WA.2158.EBA.994.002.A.524111 — Belanja Perjalanan Dinas Paket Meeting",
];

const DAFTAR_PROVINSI = [
  "D.K.I. Jakarta",
  "Jawa Barat",
  "Banten",
  "Jawa Tengah",
  "D.I. Yogyakarta",
  "Jawa Timur",
  "Luar Jawa / Lainnya",
];

const STATUS_PAJAK_OPTIONS = [
  { label: "Ber-NPWP — Jasa Katering (PPh Pasal 23: 2%)", persen: 2 },
  { label: "Non-NPWP — Jasa Katering (PPh Pasal 23: 4%)", persen: 4 },
  { label: "Bebas Pajak / Tidak Dipungut (0%)", persen: 0 },
];

const FORM_KOSONG = (bidangAwal = "") => ({
  bidang: bidangAwal,
  akun: DAFTAR_AKUN[0],
  dalam_rangka: "",
  tempat_kegiatan: "Ruang Rapat Rokeu, Gedung Kemnaker",
  lokasi_provinsi: "D.K.I. Jakarta",
  dua_restoran: false,
  // Restoran 1 (Vendor Pertama)
  penyedia: "",
  status_pajak: STATUS_PAJAK_OPTIONS[0].label,
  persen_pph23: 2,
  nomor_spby: "",
  ttd_penerima_nama: "",
  ttd_penerima_nip: "",
  ttd_penerima_bawah_tanggal: "",
  // Restoran 2 (Vendor Kedua)
  penyedia_2: "",
  status_pajak_2: STATUS_PAJAK_OPTIONS[0].label,
  persen_pph23_2: 2,
  nomor_spby_2: "",
  ttd_penerima_nama_2: "",
  ttd_penerima_nip_2: "",
  ttd_penerima_bawah_tanggal_2: "",

  tanggal_kegiatan: hariIni(),
  tanggal_spby: hariIni(),
  no_bku: "",
  no_bku_2: "",
  ppk_nama: "Drs. Hendra Wijaya, M.M.",
  ppk_nip: "",
  bendahara_nama: "Siti Rahmawati, S.E.",
  bendahara_nip: "",
  items: [
    {
      jenis: "Makanan",
      uraianMenu: "",
      volume: 20,
      satuan: "Pax",
      hargaSatuan: 57000,
      resto: 1,
    },
  ],
});

const kelasInput =
  "w-full px-3.5 py-2.5 rounded-xl bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

export default function FormKonsumsi({ operator }) {
  const { id } = useParams();
  const baru = !id || id === "baru";
  const navigate = useNavigate();

  const [form, setForm] = useState(() => {
    const bidangAwal = operator?.peran === "operator" ? operator?.bidang || "" : "";
    if (baru) return FORM_KOSONG(bidangAwal);

    if (!baru) {
      let temuan = null;
      if (String(id).startsWith("sample-")) {
        temuan = DATA_CONTOH_KONSUMSI.find((d) => String(d.id) === String(id));
      }
      if (!temuan) {
        try {
          const tersimpan = JSON.parse(localStorage.getItem("kwitansi-konsumsi-data") || "[]");
          temuan = tersimpan.find((d) => String(d.id) === String(id));
        } catch {
          // abaikan
        }
      }
      if (temuan) {
        const isian = temuan.isian || {};
        return {
          ...FORM_KOSONG(temuan.bidang || bidangAwal),
          bidang: temuan.bidang || "",
          akun: isian.akun || DAFTAR_AKUN[0],
          dalam_rangka: isian.dalam_rangka || temuan.nama_kegiatan || "",
          tempat_kegiatan: isian.tempat_kegiatan || temuan.lokasi_detail || "Ruang Rapat Rokeu, Gedung Kemnaker",
          lokasi_provinsi: temuan.lokasi_provinsi || isian.lokasi_provinsi || "D.K.I. Jakarta",
          dua_restoran: Boolean(isian.dua_restoran || isian.penyedia_2),
          penyedia: temuan.penyedia || isian.penyedia || "",
          status_pajak: isian.status_pajak || STATUS_PAJAK_OPTIONS[0].label,
          persen_pph23: Number(isian.persen_pph23 ?? 2),
          nomor_spby: temuan.nomor_spby || isian.nomor_spby || "",
          no_bku: isian.no_bku || "",
          penyedia_2: isian.penyedia_2 || "",
          status_pajak_2: isian.status_pajak_2 || STATUS_PAJAK_OPTIONS[0].label,
          persen_pph23_2: Number(isian.persen_pph23_2 ?? 2),
          nomor_spby_2: isian.nomor_spby_2 || "",
          no_bku_2: isian.no_bku_2 || "",
          tanggal_kegiatan: temuan.tanggal_kegiatan || isian.tanggal_kegiatan || hariIni(),
          tanggal_spby: isian.tanggal_spby || temuan.tanggal_kegiatan || hariIni(),
          ppk_nama: isian.ppk?.nama || "Drs. Hendra Wijaya, M.M.",
          ppk_nip: isian.ppk?.nip || "",
          bendahara_nama: isian.bendahara?.nama || "Siti Rahmawati, S.E.",
          bendahara_nip: isian.bendahara?.nip || "",
          ttd_penerima_nama: isian.ttd_penerima_nama || "",
          ttd_penerima_nip: isian.ttd_penerima_nip || "",
          ttd_penerima_bawah_tanggal: isian.ttd_penerima_bawah_tanggal || "",
          ttd_penerima_nama_2: isian.ttd_penerima_nama_2 || "",
          ttd_penerima_nip_2: isian.ttd_penerima_nip_2 || "",
          ttd_penerima_bawah_tanggal_2: isian.ttd_penerima_bawah_tanggal_2 || "",
          items: (isian.items || []).map((it, idx) => ({
            jenis: it.jenis || (it.namaItem?.toLowerCase().includes("snack") ? "Kudapan" : "Makanan"),
            uraianMenu: it.uraianMenu || it.namaItem || "",
            volume: Number(it.volume || it.porsi) || 20,
            satuan: it.satuan || "Pax",
            hargaSatuan: Number(it.hargaSatuan) || 57000,
            resto: Number(it.resto) || (isian.dua_restoran && idx > 0 ? 2 : 1),
          })),
        };
      }
    }
    return FORM_KOSONG(bidangAwal);
  });

  const [memuat, setMemuat] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const [toast, setToast] = useState(null);

  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Muat data jika mode edit dari server
  useEffect(() => {
    if (baru || String(id).startsWith("sample-")) return;

    let usang = false;
    apiKwitansi({ url: `api/kwitansi/konsumsi/${id}` })
      .then((data) => {
        if (usang || !data) return;
        const isian = data.isian || {};
        setForm((prev) => ({
          ...prev,
          bidang: data.bidang || isian.bidang || "",
          akun: isian.akun || DAFTAR_AKUN[0],
          dalam_rangka: isian.dalam_rangka || data.nama_kegiatan || "",
          tempat_kegiatan: isian.tempat_kegiatan || data.lokasi_detail || "",
          lokasi_provinsi: data.lokasi_provinsi || isian.lokasi_provinsi || "D.K.I. Jakarta",
          dua_restoran: Boolean(isian.dua_restoran || isian.penyedia_2),
          penyedia: data.penyedia || isian.penyedia || "",
          status_pajak: isian.status_pajak || STATUS_PAJAK_OPTIONS[0].label,
          persen_pph23: Number(isian.persen_pph23 ?? 2),
          nomor_spby: data.nomor_spby || isian.nomor_spby || "",
          no_bku: isian.no_bku || "",
          penyedia_2: isian.penyedia_2 || "",
          status_pajak_2: isian.status_pajak_2 || STATUS_PAJAK_OPTIONS[0].label,
          persen_pph23_2: Number(isian.persen_pph23_2 ?? 2),
          nomor_spby_2: isian.nomor_spby_2 || "",
          no_bku_2: isian.no_bku_2 || "",
          tanggal_kegiatan: data.tanggal_kegiatan || isian.tanggal_kegiatan || hariIni(),
          tanggal_spby: isian.tanggal_spby || data.tanggal_kegiatan || hariIni(),
          ppk_nama: isian.ppk?.nama || "Drs. Hendra Wijaya, M.M.",
          ppk_nip: isian.ppk?.nip || "",
          bendahara_nama: isian.bendahara?.nama || "Siti Rahmawati, S.E.",
          bendahara_nip: isian.bendahara?.nip || "",
          ttd_penerima_nama: isian.ttd_penerima_nama || "",
          ttd_penerima_nip: isian.ttd_penerima_nip || "",
          ttd_penerima_bawah_tanggal: isian.ttd_penerima_bawah_tanggal || "",
          ttd_penerima_nama_2: isian.ttd_penerima_nama_2 || "",
          ttd_penerima_nip_2: isian.ttd_penerima_nip_2 || "",
          ttd_penerima_bawah_tanggal_2: isian.ttd_penerima_bawah_tanggal_2 || "",
          items: (isian.items || []).map((it, idx) => ({
            jenis: it.jenis || (it.namaItem?.toLowerCase().includes("snack") ? "Kudapan" : "Makanan"),
            uraianMenu: it.uraianMenu || it.namaItem || "",
            volume: Number(it.volume || it.porsi) || 20,
            satuan: it.satuan || "Pax",
            hargaSatuan: Number(it.hargaSatuan) || 57000,
            resto: Number(it.resto) || (isian.dua_restoran && idx > 0 ? 2 : 1),
          })),
        }));
      })
      .catch((err) => {
        if (!usang) setGalat(err?.message || "Gagal memuat data");
      })
      .finally(() => {
        if (!usang) setMemuat(false);
      });

    return () => {
      usang = true;
    };
  }, [id, baru]);

  // Kalkulasi total rincian & batas SBM
  const hitungan = useMemo(() => {
    const sbm = SBM_KONSUMSI[form.lokasi_provinsi] || SBM_KONSUMSI["D.K.I. Jakarta"];
    const items = form.items || [];
    const totalPorsi = items.reduce((acc, it) => acc + (Number(it.volume) || 0), 0);

    const duaResto = Boolean(form.dua_restoran);
    const itemsResto1 = duaResto ? items.filter((it) => (it.resto ?? 1) === 1) : items;
    const itemsResto2 = duaResto ? items.filter((it) => it.resto === 2) : [];

    const subtotal1 = itemsResto1.reduce(
      (acc, it) => acc + (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0),
      0,
    );
    const persen1 = Number(form.persen_pph23) || 0;
    const pph1 = Math.round(subtotal1 * (persen1 / 100));
    const netto1 = subtotal1 - pph1;

    const subtotal2 = itemsResto2.reduce(
      (acc, it) => acc + (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0),
      0,
    );
    const persen2 = Number(form.persen_pph23_2 ?? form.persen_pph23) || 0;
    const pph2 = Math.round(subtotal2 * (persen2 / 100));
    const netto2 = subtotal2 - pph2;

    const subtotalBruto = subtotal1 + subtotal2;
    const potonganPajak = pph1 + pph2;
    const bersihDibayarkan = netto1 + netto2;

    return {
      sbm,
      totalPorsi,
      subtotalBruto,
      potonganPajak,
      bersihDibayarkan,
      duaResto,
      resto1: {
        items: itemsResto1,
        subtotal: subtotal1,
        pph: pph1,
        netto: netto1,
        persenPph: persen1,
      },
      resto2: {
        items: itemsResto2,
        subtotal: subtotal2,
        pph: pph2,
        netto: netto2,
        persenPph: persen2,
      },
    };
  }, [form.items, form.lokasi_provinsi, form.persen_pph23, form.persen_pph23_2, form.dua_restoran]);

  // Handler ubah field form
  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Handler ubah status pajak
  const ubahStatusPajak = (labelPajak, targetResto = 1) => {
    const opsi = STATUS_PAJAK_OPTIONS.find((o) => o.label === labelPajak);
    const persen = opsi ? opsi.persen : 2;
    if (targetResto === 2) {
      setForm((prev) => ({
        ...prev,
        status_pajak_2: labelPajak,
        persen_pph23_2: persen,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        status_pajak: labelPajak,
        persen_pph23: persen,
      }));
    }
  };

  // Handler ubah item konsumsi
  const updateItem = (index, field, value) => {
    setForm((prev) => {
      const itemsBaru = [...prev.items];
      itemsBaru[index] = { ...itemsBaru[index], [field]: value };

      // Bila ganti jenis konsumsi (Makanan <-> Kudapan), sesuaikan default harga sesuai batas SBM provinsi
      if (field === "jenis") {
        const sbm = SBM_KONSUMSI[prev.lokasi_provinsi] || SBM_KONSUMSI["D.K.I. Jakarta"];
        const batas = value === "Kudapan" ? sbm.kudapan : sbm.makanan;
        itemsBaru[index].hargaSatuan = batas;
      }

      return { ...prev, items: itemsBaru };
    });
  };

  // Tambah 1 item kosong
  const tambahItem = (restoPilihan = 1) => {
    const sbm = SBM_KONSUMSI[form.lokasi_provinsi] || SBM_KONSUMSI["D.K.I. Jakarta"];
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          jenis: "Kudapan",
          uraianMenu: "",
          volume: prev.items[0]?.volume || 20,
          satuan: "Pax",
          hargaSatuan: sbm.kudapan,
          resto: restoPilihan,
        },
      ],
    }));
  };

  // Tombol "Paket Standar (Makan + Kudapan)"
  const tambahPaketStandar = () => {
    const sbm = SBM_KONSUMSI[form.lokasi_provinsi] || SBM_KONSUMSI["D.K.I. Jakarta"];
    const vol = form.items[0]?.volume || 20;
    setForm((prev) => ({
      ...prev,
      items: [
        {
          jenis: "Makanan",
          uraianMenu: "Nasi Box Lengkap / Prasmanan",
          volume: vol,
          satuan: "Pax",
          hargaSatuan: sbm.makanan,
          resto: 1,
        },
        {
          jenis: "Kudapan",
          uraianMenu: "Snack Box (3 Macam Kue + Air Mineral)",
          volume: vol,
          satuan: "Pax",
          hargaSatuan: sbm.kudapan,
          resto: prev.dua_restoran ? 2 : 1,
        },
      ],
    }));
    kabari(
      form.dua_restoran
        ? "Paket standar diterapkan (Makan -> Resto 1, Snack -> Resto 2)"
        : "Paket standar Makan & Kudapan diterapkan"
    );
  };

  const hapusItem = (index) => {
    if (form.items.length <= 1) {
      kabari("Minimal harus ada satu item konsumsi", "error");
      return;
    }
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Tombol "Kosongkan"
  const kosongkanForm = () => {
    setForm(FORM_KOSONG(operator?.bidang || ""));
    kabari("Form dikosongkan");
  };

  // Susun isian untuk backend & PDF
  const siapkanPayload = () => ({
    ...form,
    nama_kegiatan: form.dalam_rangka,
    lokasi_detail: form.tempat_kegiatan,
    total: hitungan.subtotalBruto,
    pajak_pph23: hitungan.potonganPajak,
    netto: hitungan.bersihDibayarkan,
    jumlah_porsi: hitungan.totalPorsi,
    ppk: { nama: form.ppk_nama, nip: form.ppk_nip },
    bendahara: { nama: form.bendahara_nama, nip: form.bendahara_nip },
    items: form.items.map((it) => ({
      ...it,
      namaItem: it.uraianMenu || `${it.jenis} Konsumsi`,
      porsi: Number(it.volume) || 0,
      subtotal: (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0),
      resto: Number(it.resto) || 1,
    })),
  });

  // Simpan ke daftar dengan dual-persistence (localStorage + server API)
  const simpanKeDaftar = async (e) => {
    if (e) e.preventDefault();
    if (!form.bidang) {
      kabari("Pilih bidang pelaksana kegiatan", "error");
      return;
    }
    if (!form.dalam_rangka.trim()) {
      kabari("Uraian 'Dalam rangka' wajib diisi", "error");
      return;
    }
    if (!form.penyedia.trim()) {
      kabari(form.dua_restoran ? "Nama Restoran 1 wajib diisi" : "Nama penyedia/rekanan katering wajib diisi", "error");
      return;
    }
    if (form.dua_restoran && !form.penyedia_2.trim()) {
      kabari("Nama Restoran 2 wajib diisi saat opsi 2 Restoran aktif", "error");
      return;
    }

    setMenyimpan(true);
    setGalat("");

    const isian = siapkanPayload();

    const recordLokal = {
      id: baru || String(id).startsWith("sample-") ? `konsumsi-${Date.now()}` : id,
      bidang: form.bidang,
      status: "aktif",
      nama_kegiatan: form.dalam_rangka,
      tanggal_kegiatan: form.tanggal_kegiatan,
      lokasi_provinsi: form.lokasi_provinsi,
      lokasi_detail: form.tempat_kegiatan,
      nomor_spby: form.nomor_spby || "",
      sbm_kategori: "SBM PMK 32/2025",
      penyedia: form.penyedia,
      nama_penerima: form.penyedia,
      jumlah_porsi: hitungan.totalPorsi,
      total: hitungan.subtotalBruto,
      pajak_pph23: hitungan.potonganPajak,
      netto: hitungan.bersihDibayarkan,
      jumlah_jenis_item: form.items?.length || 1,
      isian,
      dibuat_pada: new Date().toISOString(),
      diubah_pada: new Date().toISOString(),
    };

    // 1. Simpan ke localStorage terlebih dahulu agar data selalu tersimpan secara lokal
    try {
      const dataLama = JSON.parse(localStorage.getItem("kwitansi-konsumsi-data") || "[]");
      const tanpaRecordIni = dataLama.filter((item) => String(item.id) !== String(recordLokal.id));
      localStorage.setItem("kwitansi-konsumsi-data", JSON.stringify([recordLokal, ...tanpaRecordIni]));
    } catch (errLokal) {
      console.warn("Gagal simpan ke localStorage:", errLokal);
    }

    // 2. Sinkronkan ke API backend jika server sedang aktif
    try {
      if (baru || String(id).startsWith("sample-")) {
        const responServer = await apiKwitansi({
          url: "api/kwitansi/konsumsi",
          method: "POST",
          body: { isian, bidang: form.bidang },
        });
        // Perbarui ID lokal agar sinkron dengan ID database dan tidak terjadi duplikasi/pengulangan baris
        if (responServer && responServer.id) {
          try {
            const dataLama = JSON.parse(localStorage.getItem("kwitansi-konsumsi-data") || "[]");
            const diperbarui = dataLama.map((item) =>
              String(item.id) === String(recordLokal.id) ? { ...item, id: responServer.id } : item
            );
            localStorage.setItem("kwitansi-konsumsi-data", JSON.stringify(diperbarui));
          } catch {
            // abaikan
          }
        }
      } else {
        await apiKwitansi({
          url: `api/kwitansi/konsumsi/${id}`,
          method: "PUT",
          body: { isian },
        });
      }
    } catch (errApi) {
      console.warn("[KONSUMSI] Sinkronisasi server tertunda, data tetap aman di penyimpanan lokal:", errApi);
    }

    kabari("Pengajuan konsumsi berhasil disimpan ke daftar");
    setTimeout(() => {
      navigate(jalur("konsumsi"));
    }, 600);
    setMenyimpan(false);
  };

  // Buka PDF
  const lihatPdf = async () => {
    try {
      const isian = siapkanPayload();
      await bukaPdf({
        url: "api/kwitansi/konsumsi/pdf-preview",
        method: "POST",
        body: { isian },
      });
      kabari("Membuka dokumen PDF SPBY & Kwitansi");
    } catch (err) {
      kabari(err?.message || "Gagal membuka PDF", "error");
    }
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      {/* Toast Notifikasi */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-lg border text-sm font-semibold flex items-center gap-2.5 animate-naik ${
            toast.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          {toast.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
          {toast.text}
        </div>
      )}

      {/* HEADER TOP BAR */}
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <Link
                to={jalur("konsumsi")}
                className="w-10 h-10 rounded-full border border-mist flex items-center justify-center text-slate-500 hover:text-navy hover:bg-slate-50 transition-colors shrink-0"
                title="Kembali ke Daftar Konsumsi"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight truncate">
                  {baru ? "Konsumsi Baru" : "Ubah Konsumsi"}
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                  Tarif PMK 32 Tahun 2025 (SBM TA 2026)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={kosongkanForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-mist bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Kosongkan</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER: TWO COLUMNS */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {galat && (
          <p className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {galat}
          </p>
        )}

        {memuat ? (
          <div className="py-24 flex justify-center">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT / MAIN COLUMN (8 COLS) */}
            <div className="lg:col-span-8 space-y-6">
              {/* CARD 1: DATA KEGIATAN & KONSUMSI */}
              <div className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-mist pb-3">
                  <h2 className="text-sm font-bold text-navy">Data Kegiatan & Konsumsi</h2>
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-lg">
                    Lampiran I Butir 38 PMK 32/2025
                  </span>
                </div>

                <div className="space-y-4 pt-1">
                  {/* Bidang */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Bidang <span className="text-rose-500">*</span>
                    </label>
                    <select
                      className={kelasInput}
                      value={form.bidang}
                      onChange={(e) => setField("bidang", e.target.value)}
                    >
                      <option value="">— Pilih bidang —</option>
                      {DAFTAR_BIDANG.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Akun */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Akun</label>
                    <select
                      className={kelasInput}
                      value={form.akun}
                      onChange={(e) => setField("akun", e.target.value)}
                    >
                      {DAFTAR_AKUN.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dalam rangka */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Dalam rangka <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      className={kelasInput + " resize-y"}
                      placeholder="Contoh: Rapat Koordinasi Penyusunan Laporan Keuangan Triwulan IV TA 2026 Biro Keuangan"
                      value={form.dalam_rangka}
                      onChange={(e) => setField("dalam_rangka", e.target.value)}
                      required
                    />
                  </div>

                  {/* Tempat kegiatan & Lokasi Provinsi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Tempat kegiatan</label>
                      <input
                        className={kelasInput}
                        placeholder="Ruang Rapat Rokeu, Gedung Kemnaker"
                        value={form.tempat_kegiatan}
                        onChange={(e) => setField("tempat_kegiatan", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Lokasi Provinsi</label>
                      <select
                        className={kelasInput}
                        value={form.lokasi_provinsi}
                        onChange={(e) => setField("lokasi_provinsi", e.target.value)}
                      >
                        {DAFTAR_PROVINSI.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* TOGGLE 1 RAPAT 2 RESTORAN */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-mist flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-navy flex items-center gap-2">
                        <span>1 Rapat 2 Restoran / Vendor</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${form.dua_restoran ? "bg-brand text-white shadow-2xs" : "bg-slate-200 text-slate-600"}`}>
                          {form.dua_restoran ? "Aktif — Split 2 SPBY & 2 Kwitansi" : "Non-aktif (1 Restoran)"}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Aktifkan jika pengadaan konsumsi memesan dari 2 vendor berbeda (misal: Makan Siang dan Snack Box dari resto/toko terpisah). File PDF otomatis diekspor menjadi 2 SPBY dan 2 Kwitansi (4 halaman).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const aktifkan = !form.dua_restoran;
                        setField("dua_restoran", aktifkan);
                        if (aktifkan && form.items.length > 1 && !form.items.some((it) => it.resto === 2)) {
                          setForm((prev) => ({
                            ...prev,
                            dua_restoran: true,
                            items: prev.items.map((it, idx) => ({
                              ...it,
                              resto: it.jenis === "Kudapan" || idx > 0 ? 2 : 1,
                            })),
                          }));
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${form.dua_restoran ? "bg-brand" : "bg-slate-300"}`}
                      title="Klik untuk mengaktifkan / menonaktifkan 2 restoran"
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${form.dua_restoran ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  {/* KONDISI 1: 1 RESTORAN (TAMPILAN TUNGGAL) */}
                  {!form.dua_restoran && (
                    <>
                      {/* Penyedia & Status NPWP/PKP */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Penyedia / Rekanan Katering <span className="text-rose-500">*</span>
                          </label>
                          <input
                            className={kelasInput}
                            placeholder="Contoh: RM. Sederhana / Dapur Nusantara"
                            value={form.penyedia}
                            onChange={(e) => setField("penyedia", e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Status NPWP / PKP Rekanan
                          </label>
                          <select
                            className={kelasInput}
                            value={form.status_pajak}
                            onChange={(e) => ubahStatusPajak(e.target.value, 1)}
                          >
                            {STATUS_PAJAK_OPTIONS.map((o) => (
                              <option key={o.label} value={o.label}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Nomor SPBY & No. BKU */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">Nomor SPBY</label>
                          <input
                            className={kelasInput}
                            placeholder="Contoh: 042/SPBY-ROKEU/XI/2026"
                            value={form.nomor_spby}
                            onChange={(e) => setField("nomor_spby", e.target.value)}
                          />
                          <p className="text-[11px] text-slate-400 mt-1">Boleh dikosongkan</p>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">No. BKU</label>
                          <input
                            className={kelasInput}
                            placeholder="Contoh: BKU-1124"
                            value={form.no_bku}
                            onChange={(e) => setField("no_bku", e.target.value)}
                          />
                          <p className="text-[11px] text-slate-400 mt-1">Boleh dikosongkan</p>
                        </div>
                      </div>

                      {/* Kolom Tanda Tangan Ketiga Kwitansi */}
                      <div className="border-t border-slate-100 pt-3.5 space-y-2">
                        <label className="block text-xs font-bold text-slate-700">
                          Kolom Tanda Tangan Ke-3 Kwitansi
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Nama</label>
                            <input
                              className={kelasInput}
                              placeholder="Nama"
                              value={form.ttd_penerima_nama}
                              onChange={(e) => setField("ttd_penerima_nama", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">NIP</label>
                            <input
                              className={kelasInput}
                              placeholder="NIP"
                              value={form.ttd_penerima_nip}
                              onChange={(e) => setField("ttd_penerima_nip", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* KONDISI 2: 2 RESTORAN (TAMPILAN TERPISAH RESTO 1 & RESTO 2) */}
                  {form.dua_restoran && (
                    <div className="space-y-4 pt-1">
                      {/* BLOK RESTORAN 1 */}
                      <div className="rounded-2xl border border-brand/20 p-4 bg-brand/5 space-y-3.5">
                        <div className="flex items-center justify-between border-b border-brand/10 pb-2">
                          <span className="text-xs font-black text-brand tracking-wider uppercase flex items-center gap-1.5">
                            <span>🏢</span> RESTORAN 1 (VENDOR PERTAMA)
                          </span>
                          <span className="text-[11px] font-bold text-brand bg-white px-2.5 py-0.5 rounded-lg border border-brand/20">
                            SPBY 1 & Kwitansi 1
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Nama Restoran 1 <span className="text-rose-500">*</span>
                            </label>
                            <input
                              className={kelasInput}
                              placeholder="Contoh: RM. Sederhana Masakan Padang"
                              value={form.penyedia}
                              onChange={(e) => setField("penyedia", e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Status NPWP / PKP Restoran 1
                            </label>
                            <select
                              className={kelasInput}
                              value={form.status_pajak}
                              onChange={(e) => ubahStatusPajak(e.target.value, 1)}
                            >
                              {STATUS_PAJAK_OPTIONS.map((o) => (
                                <option key={o.label} value={o.label}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Nomor SPBY Resto 1</label>
                            <input
                              className={kelasInput}
                              placeholder="Contoh: 038/SPBY-ROKEU/XI/2026"
                              value={form.nomor_spby}
                              onChange={(e) => setField("nomor_spby", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">No. BKU Resto 1</label>
                            <input
                              className={kelasInput}
                              placeholder="Contoh: BKU-1124"
                              value={form.no_bku}
                              onChange={(e) => setField("no_bku", e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="border-t border-brand/10 pt-2.5 space-y-2">
                          <label className="block text-xs font-bold text-slate-700">
                            Kolom Tanda Tangan Kwitansi Restoran 1
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <input
                                className={kelasInput}
                                placeholder="Nama"
                                value={form.ttd_penerima_nama}
                                onChange={(e) => setField("ttd_penerima_nama", e.target.value)}
                              />
                            </div>
                            <div>
                              <input
                                className={kelasInput}
                                placeholder="NIP"
                                value={form.ttd_penerima_nip}
                                onChange={(e) => setField("ttd_penerima_nip", e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* BLOK RESTORAN 2 */}
                      <div className="rounded-2xl border border-purple-200 p-4 bg-purple-50/40 space-y-3.5">
                        <div className="flex items-center justify-between border-b border-purple-100 pb-2">
                          <span className="text-xs font-black text-purple-700 tracking-wider uppercase flex items-center gap-1.5">
                            <span>🏪</span> RESTORAN 2 (VENDOR KEDUA)
                          </span>
                          <span className="text-[11px] font-bold text-purple-700 bg-white px-2.5 py-0.5 rounded-lg border border-purple-200">
                            SPBY 2 & Kwitansi 2
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Nama Restoran 2 <span className="text-rose-500">*</span>
                            </label>
                            <input
                              className={kelasInput}
                              placeholder="Contoh: Toko Bakery & Snack Prima"
                              value={form.penyedia_2}
                              onChange={(e) => setField("penyedia_2", e.target.value)}
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              Status NPWP / PKP Restoran 2
                            </label>
                            <select
                              className={kelasInput}
                              value={form.status_pajak_2}
                              onChange={(e) => ubahStatusPajak(e.target.value, 2)}
                            >
                              {STATUS_PAJAK_OPTIONS.map((o) => (
                                <option key={o.label} value={o.label}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Nomor SPBY Resto 2</label>
                            <input
                              className={kelasInput}
                              placeholder="Contoh: 039/SPBY-ROKEU/XI/2026"
                              value={form.nomor_spby_2}
                              onChange={(e) => setField("nomor_spby_2", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">No. BKU Resto 2</label>
                            <input
                              className={kelasInput}
                              placeholder="Contoh: BKU-1125"
                              value={form.no_bku_2}
                              onChange={(e) => setField("no_bku_2", e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="border-t border-purple-100 pt-2.5 space-y-2">
                          <label className="block text-xs font-bold text-slate-700">
                            Kolom Tanda Tangan Kwitansi Restoran 2
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <input
                                className={kelasInput}
                                placeholder="Nama"
                                value={form.ttd_penerima_nama_2}
                                onChange={(e) => setField("ttd_penerima_nama_2", e.target.value)}
                              />
                            </div>
                            <div>
                              <input
                                className={kelasInput}
                                placeholder="NIP"
                                value={form.ttd_penerima_nip_2}
                                onChange={(e) => setField("ttd_penerima_nip_2", e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tanggal kegiatan & Tanggal SPBY/Kwitansi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Tanggal kegiatan</label>
                      <input
                        type="date"
                        className={kelasInput}
                        value={form.tanggal_kegiatan}
                        onChange={(e) => setField("tanggal_kegiatan", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Tanggal SPBY / Kwitansi</label>
                      <input
                        type="date"
                        className={kelasInput}
                        value={form.tanggal_spby}
                        onChange={(e) => setField("tanggal_spby", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Pejabat PPK & Bendahara */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Pejabat Pembuat Komitmen (PPK)
                      </label>
                      <input
                        className={kelasInput}
                        placeholder="Drs. Hendra Wijaya, M.M."
                        value={form.ppk_nama}
                        onChange={(e) => setField("ppk_nama", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Bendahara Pengeluaran</label>
                      <input
                        className={kelasInput}
                        placeholder="Siti Rahmawati, S.E."
                        value={form.bendahara_nama}
                        onChange={(e) => setField("bendahara_nama", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* NIP PPK & NIP Bendahara */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">NIP PPK</label>
                      <input
                        className={kelasInput}
                        placeholder="Ketik NIP PPK"
                        value={form.ppk_nip}
                        onChange={(e) => setField("ppk_nip", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">NIP Bendahara</label>
                      <input
                        className={kelasInput}
                        placeholder="Ketik NIP Bendahara"
                        value={form.bendahara_nip}
                        onChange={(e) => setField("bendahara_nip", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: ITEM KONSUMSI (N) */}
              <div className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-mist pb-3">
                  <h2 className="text-sm font-bold text-navy">Item Konsumsi ({form.items.length})</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={tambahPaketStandar}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                      <span>Paket Standar (Makan + Kudapan)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => tambahItem(1)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand hover:bg-navy text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah item</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  {form.items.map((it, idx) => {
                    const batasMaks =
                      it.jenis === "Kudapan" ? hitungan.sbm.kudapan : hitungan.sbm.makanan;
                    const hargaValid = Number(it.hargaSatuan) <= batasMaks;
                    const subtotalItem = (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0);

                    return (
                      <div
                        key={idx}
                        className="rounded-2xl border border-mist p-4 sm:p-5 bg-white space-y-3.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-brand tracking-wider uppercase">
                            ITEM KONSUMSI {idx + 1}
                          </span>
                          {form.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => hapusItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                              title="Hapus Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Pilihan Restoran untuk Item ini bila 2 Restoran Aktif */}
                        {form.dua_restoran && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-mist">
                            <span className="text-[11px] font-bold text-slate-600 shrink-0">
                              Dipesan dari:
                            </span>
                            <div className="flex items-center gap-2 flex-1">
                              <button
                                type="button"
                                onClick={() => updateItem(idx, "resto", 1)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  (it.resto ?? 1) === 1
                                    ? "bg-brand text-white shadow-xs"
                                    : "bg-white text-slate-600 border border-mist hover:bg-slate-100"
                                }`}
                              >
                                Restoran 1: {form.penyedia || "Vendor 1"}
                              </button>
                              <button
                                type="button"
                                onClick={() => updateItem(idx, "resto", 2)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                  it.resto === 2
                                    ? "bg-purple-700 text-white shadow-xs"
                                    : "bg-white text-slate-600 border border-mist hover:bg-slate-100"
                                }`}
                              >
                                Restoran 2: {form.penyedia_2 || "Vendor 2"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Row 1: Jenis Konsumsi & Uraian Menu */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                          <div className="sm:col-span-4">
                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                              Jenis Konsumsi (SBM)
                            </label>
                            <select
                              className={kelasInput}
                              value={it.jenis}
                              onChange={(e) => updateItem(idx, "jenis", e.target.value)}
                            >
                              <option value="Makanan">Makanan</option>
                              <option value="Kudapan">Kudapan</option>
                            </select>
                          </div>
                          <div className="sm:col-span-8">
                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                              Uraian Menu / Paket <span className="text-rose-500">*</span>
                            </label>
                            <input
                              className={kelasInput}
                              placeholder="Ketik nama menu, misal: Nasi Box Ayam Bakar Komplit"
                              value={it.uraianMenu}
                              onChange={(e) => updateItem(idx, "uraianMenu", e.target.value)}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">
                              Pilih saran menu atau ketik sesuai faktur penyedia
                            </p>
                          </div>
                        </div>

                        {/* Row 2: Volume, Satuan, Harga Satuan, Jumlah Harga */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Volume</label>
                            <input
                              type="number"
                              min="1"
                              className={kelasInput + " tabular-nums"}
                              value={it.volume}
                              onChange={(e) => updateItem(idx, "volume", Number(e.target.value) || 0)}
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Satuan</label>
                            <select
                              className={kelasInput}
                              value={it.satuan}
                              onChange={(e) => updateItem(idx, "satuan", e.target.value)}
                            >
                              <option value="Pax">Pax</option>
                              <option value="Porsi">Porsi</option>
                              <option value="Kotak">Kotak</option>
                              <option value="Box">Box</option>
                              <option value="Paket">Paket</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                              Harga Satuan (Rp)
                            </label>
                            <input
                              type="number"
                              step="500"
                              className={kelasInput + " tabular-nums"}
                              value={it.hargaSatuan}
                              onChange={(e) => updateItem(idx, "hargaSatuan", Number(e.target.value) || 0)}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">
                              Batas maks: {rupiah(batasMaks)}
                            </p>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                              Jumlah Harga
                            </label>
                            <div className="py-2.5 px-3.5 rounded-xl bg-slate-50 border border-mist font-bold text-navy text-sm tabular-nums truncate">
                              {rupiah(subtotalItem)}
                            </div>
                          </div>
                        </div>

                        {/* SBM Validasi Status */}
                        <div className="pt-1">
                          {hargaValid ? (
                            <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                              <span>✓</span> Sesuai batas tertinggi PMK 32/2025 ({form.lokasi_provinsi}: maks. {rupiah(batasMaks)}/{it.satuan.toLowerCase()})
                            </p>
                          ) : (
                            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1.5">
                              <span>⚠️</span> Melebihi batas tertinggi PMK 32/2025 ({form.lokasi_provinsi}: maks. {rupiah(batasMaks)}/{it.satuan.toLowerCase()})
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN (4 COLS): SIDEBAR RINCIAN */}
            <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
              <div className="bg-white rounded-3xl border border-mist shadow-2xs p-5 space-y-4">
                <div className="flex items-center gap-2 text-navy font-black text-sm">
                  <ReceiptText className="w-4 h-4 text-brand" />
                  <span>Rincian</span>
                </div>

                {/* Banner Peringatan Bidang */}
                {!form.bidang ? (
                  <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs font-medium leading-relaxed">
                    Bidang pelaksana kegiatan belum dipilih.
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-sky-50/70 border border-sky-200/70 text-sky-900 text-xs font-semibold">
                    Bidang: <span className="font-bold">{form.bidang}</span>
                  </div>
                )}

                {/* Ringkasan Lokasi, Porsi, Subtotal */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Lokasi Provinsi</span>
                    <span className="font-bold text-navy">{form.lokasi_provinsi}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Total Porsi (Orang/Kali)</span>
                    <span className="font-bold text-navy">{hitungan.totalPorsi} porsi</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Subtotal Bruto</span>
                    <span className="font-bold text-navy text-sm tabular-nums">
                      {rupiah(hitungan.subtotalBruto)}
                    </span>
                  </div>
                </div>

                <hr className="border-mist" />

                {/* KONDISI 2 RESTORAN: BREAKDOWN PER RESTORAN */}
                {form.dua_restoran ? (
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Breakdown Realisasi 2 Restoran
                    </p>

                    {/* Resto 1 */}
                    <div className="p-3 rounded-xl bg-brand/5 border border-brand/20 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center font-bold text-brand">
                        <span className="truncate">1. {form.penyedia || "Restoran 1"}</span>
                        <span className="tabular-nums">{rupiah(hitungan.resto1.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>PPh 23 ({hitungan.resto1.persenPph}%)</span>
                        <span className="text-rose-600 tabular-nums">- {rupiah(hitungan.resto1.pph)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-bold text-emerald-700 pt-1 border-t border-brand/10">
                        <span>Netto Resto 1</span>
                        <span className="tabular-nums">{rupiah(hitungan.resto1.netto)}</span>
                      </div>
                    </div>

                    {/* Resto 2 */}
                    <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-200 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center font-bold text-purple-700">
                        <span className="truncate">2. {form.penyedia_2 || "Restoran 2"}</span>
                        <span className="tabular-nums">{rupiah(hitungan.resto2.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>PPh 23 ({hitungan.resto2.persenPph}%)</span>
                        <span className="text-rose-600 tabular-nums">- {rupiah(hitungan.resto2.pph)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-bold text-emerald-700 pt-1 border-t border-purple-200">
                        <span>Netto Resto 2</span>
                        <span className="tabular-nums">{rupiah(hitungan.resto2.netto)}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-blue-700 font-semibold bg-blue-50 p-2.5 rounded-xl border border-blue-200 leading-relaxed">
                      📄 Dokumen akan otomatis diekspor menjadi <b>2 SPBY & 2 Kwitansi</b> (Total 4 halaman).
                    </div>
                  </div>
                ) : (
                  /* KONDISI 1 RESTORAN: PERHITUNGAN PAJAK TUNGGAL */
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-500">Perhitungan Pajak SPBY / Kwitansi</p>
                    <select
                      className={kelasInput + " text-xs py-2"}
                      value={form.status_pajak}
                      onChange={(e) => ubahStatusPajak(e.target.value, 1)}
                    >
                      {STATUS_PAJAK_OPTIONS.map((o) => (
                        <option key={o.label} value={o.label}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-500">
                        Potongan PPh Pasal 23 ({form.persen_pph23}%)
                      </span>
                      <span className="font-bold text-rose-600 tabular-nums">
                        - {rupiah(hitungan.potonganPajak)}
                      </span>
                    </div>
                  </div>
                )}

                <hr className="border-mist" />

                {/* Total Tagihan & Bersih Dibayarkan (Gabungan) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Total Tagihan (Gabungan)</span>
                    <span className="text-base font-black text-navy tabular-nums">
                      {rupiah(hitungan.subtotalBruto)}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800">Bersih Dibayarkan</span>
                    <span className="text-base font-black text-emerald-700 tabular-nums">
                      {rupiah(hitungan.bersihDibayarkan)}
                    </span>
                  </div>
                </div>

                {/* Tombol Aksi */}
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={lihatPdf}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span>Lihat PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={simpanKeDaftar}
                    disabled={menyimpan}
                    className="w-full py-2.5 px-4 rounded-xl border-2 border-slate-200 hover:border-brand bg-white text-navy text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {menyimpan ? <Loader2 className="w-4 h-4 animate-spin text-brand" /> : <Save className="w-4 h-4 text-brand" />}
                    <span>Simpan ke daftar</span>
                  </button>
                </div>

                {/* Catatan SBM di Bawah */}
                <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
                  SPBY, kwitansi, rincian konsumsi sesuai PMK No. 32 Tahun 2025 (SBM TA 2026).
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
