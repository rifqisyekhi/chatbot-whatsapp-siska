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
} from "lucide-react";
import { apiKwitansi, bukaPdf } from "../../../services/sesiKwitansi";
import { jalur } from "../../jalur";
import { DATA_CONTOH_FOTOKOPI } from "./dataContoh";

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");
const hariIni = () => new Date().toISOString().slice(0, 10);

const DAFTAR_BIDANG = [
  { kode: "TU", label: "TU — Bidang Tata Usaha" },
  { kode: "AKLAP", label: "AKLAP — Bidang Akuntansi & Pelaporan" },
  { kode: "PTUK", label: "PTUK — Bidang Perbendaharaan & TUK" },
  { kode: "BMN", label: "BMN — Bidang Pengelolaan BMN" },
  { kode: "PA", label: "PA — Bidang Perencanaan & Anggaran" },
];

const DAFTAR_AKUN = [
  "026.01.WA.2158.EBA.994.002.A.521111 — Belanja Keperluan Perkantoran (Fotokopi & Penggandaan)",
  "026.01.WA.2158.EBA.994.002.A.521211 — Belanja Bahan (Penggandaan Rapat & Bahan Sidang)",
  "026.01.WA.2158.EBA.994.002.A.521219 — Belanja Barang Non Operasional Lainnya",
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
  {
    label: "UMKM / Fotokopi Eceran Tanpa Potongan Pajak",
    persen: 0,
    labelRingkas: "Tanpa Potongan Pajak (Non-PKP / Tunai)",
  },
  {
    label: "Ber-NPWP — Jasa Percetakan/Fotokopi (PPh Pasal 23: 2%)",
    persen: 2,
    labelRingkas: "PPh Pasal 23 (2%) — Rekanan NPWP",
  },
  {
    label: "Non-NPWP — Jasa Percetakan/Fotokopi (PPh Pasal 23: 4%)",
    persen: 4,
    labelRingkas: "PPh Pasal 23 (4%) — Rekanan Non-NPWP",
  },
  {
    label: "PPh Pasal 22 Belanja Barang Pemerintah (1.5%)",
    persen: 1.5,
    labelRingkas: "PPh Pasal 22 (1.5%) — Belanja Barang",
  },
];

const JENIS_PEKERJAAN_OPTIONS = [
  { jenis: "Fotokopi Hitam Putih", satuan: "Lembar", hargaDefault: 300 },
  { jenis: "Fotokopi Warna", satuan: "Lembar", hargaDefault: 1500 },
  { jenis: "Cetak / Print Dokumen", satuan: "Lembar", hargaDefault: 1000 },
  { jenis: "Penjilidan Spiral Kawat", satuan: "Buku", hargaDefault: 10000 },
  { jenis: "Penjilidan Lakban / Mika Biasa", satuan: "Buku", hargaDefault: 5000 },
  { jenis: "Penjilidan Hard Cover", satuan: "Buku", hargaDefault: 35000 },
  { jenis: "Lainnya", satuan: "Set", hargaDefault: 5000 },
];

const DAFTAR_SATUAN = ["Lembar", "Buku", "Eksemplar", "Set", "Jilid"];

const FORM_KOSONG = (bidangAwal = "") => ({
  bidang: bidangAwal,
  akun: DAFTAR_AKUN[0],
  dalam_rangka: "",
  tempat_kegiatan: "Biro Keuangan dan BMN, Gedung Kemnaker",
  lokasi_provinsi: "D.K.I. Jakarta",
  penyedia: "",
  status_pajak: STATUS_PAJAK_OPTIONS[0].label,
  persen_pph: 0,
  nomor_spby: "",
  no_bku: "",
  ttd_penerima_nama: "",
  ttd_penerima_nip: "",
  tanggal_kegiatan: hariIni(),
  tanggal_spby: hariIni(),
  ppk_nama: "Drs. Hendra Wijaya, M.M.",
  ppk_nip: "197508121998032001",
  bendahara_nama: "Siti Rahmawati, S.E.",
  bendahara_nip: "198304152006041002",
  items: [
    {
      jenis: "Fotokopi Hitam Putih",
      uraianMenu: "Fotokopi Bahan Rapat & Penggandaan HVS A4 70gr",
      volume: 500,
      satuan: "Lembar",
      hargaSatuan: 300,
    },
  ],
});

const kelasInput =
  "w-full px-3.5 py-2.5 rounded-xl bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

export default function FormFotokopi({ operator }) {
  const { id } = useParams();
  const baru = !id || id === "baru";
  const navigate = useNavigate();

  const [form, setForm] = useState(() => {
    const bidangAwal = operator?.peran === "operator" ? operator?.bidang || "" : "";
    if (baru) return FORM_KOSONG(bidangAwal);

    let temuan = null;
    if (String(id).startsWith("sample-")) {
      temuan = DATA_CONTOH_FOTOKOPI.find((d) => String(d.id) === String(id));
    }
    if (!temuan) {
      try {
        const tersimpan = JSON.parse(localStorage.getItem("kwitansi-fotokopi-data") || "[]");
        temuan = tersimpan.find((d) => String(d.id) === String(id));
      } catch {
        // abaikan
      }
    }

    if (temuan) {
      const isian = temuan.isian || {};
      const statusPajakTerpilih =
        STATUS_PAJAK_OPTIONS.find((p) => p.persen === Number(isian.persen_pph))?.label ||
        isian.status_pajak ||
        STATUS_PAJAK_OPTIONS[0].label;

      return {
        ...FORM_KOSONG(temuan.bidang || bidangAwal),
        bidang: temuan.bidang || isian.bidang || "",
        akun: isian.akun || DAFTAR_AKUN[0],
        dalam_rangka: isian.dalam_rangka || temuan.nama_kegiatan || "",
        tempat_kegiatan:
          isian.tempat_kegiatan || temuan.lokasi_detail || "Biro Keuangan dan BMN, Gedung Kemnaker",
        lokasi_provinsi: temuan.lokasi_provinsi || isian.lokasi_provinsi || "D.K.I. Jakarta",
        penyedia: temuan.penyedia || isian.penyedia || "",
        status_pajak: statusPajakTerpilih,
        persen_pph: Number(isian.persen_pph ?? 0),
        nomor_spby: temuan.nomor_spby || isian.nomor_spby || "",
        no_bku: isian.no_bku || "",
        ttd_penerima_nama: isian.ttd_penerima_nama || "",
        ttd_penerima_nip: isian.ttd_penerima_nip || "",
        tanggal_kegiatan: temuan.tanggal_kegiatan || isian.tanggal_kegiatan || hariIni(),
        tanggal_spby: isian.tanggal_spby || temuan.tanggal_kegiatan || hariIni(),
        ppk_nama: isian.ppk?.nama || isian.ppk_nama || "Drs. Hendra Wijaya, M.M.",
        ppk_nip: isian.ppk?.nip || isian.ppk_nip || "197508121998032001",
        bendahara_nama: isian.bendahara?.nama || isian.bendahara_nama || "Siti Rahmawati, S.E.",
        bendahara_nip: isian.bendahara?.nip || isian.bendahara_nip || "198304152006041002",
        items: (isian.items || []).map((it) => ({
          jenis: it.jenis || "Fotokopi Hitam Putih",
          uraianMenu: it.uraianMenu || it.namaItem || "",
          volume: Number(it.volume || it.porsi) || 500,
          satuan: it.satuan || "Lembar",
          hargaSatuan: Number(it.hargaSatuan) || 300,
        })),
      };
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

  // Muat data dari server jika mode edit
  useEffect(() => {
    if (baru || String(id).startsWith("sample-")) return;

    let usang = false;
    apiKwitansi({ url: `api/kwitansi/fotokopi/${id}` })
      .then((data) => {
        if (usang || !data) return;
        const isian = data.isian || {};
        const statusPajakTerpilih =
          STATUS_PAJAK_OPTIONS.find((p) => p.persen === Number(isian.persen_pph))?.label ||
          isian.status_pajak ||
          STATUS_PAJAK_OPTIONS[0].label;

        setForm((prev) => ({
          ...prev,
          bidang: data.bidang || isian.bidang || "",
          akun: isian.akun || DAFTAR_AKUN[0],
          dalam_rangka: isian.dalam_rangka || data.nama_kegiatan || "",
          tempat_kegiatan:
            isian.tempat_kegiatan || data.lokasi_detail || "Biro Keuangan dan BMN, Gedung Kemnaker",
          lokasi_provinsi: data.lokasi_provinsi || isian.lokasi_provinsi || "D.K.I. Jakarta",
          penyedia: data.penyedia || isian.penyedia || "",
          status_pajak: statusPajakTerpilih,
          persen_pph: Number(isian.persen_pph ?? 0),
          nomor_spby: data.nomor_spby || isian.nomor_spby || "",
          no_bku: isian.no_bku || "",
          ttd_penerima_nama: isian.ttd_penerima_nama || "",
          ttd_penerima_nip: isian.ttd_penerima_nip || "",
          tanggal_kegiatan: data.tanggal_kegiatan || isian.tanggal_kegiatan || hariIni(),
          tanggal_spby: isian.tanggal_spby || data.tanggal_kegiatan || hariIni(),
          ppk_nama: isian.ppk?.nama || isian.ppk_nama || "Drs. Hendra Wijaya, M.M.",
          ppk_nip: isian.ppk?.nip || isian.ppk_nip || "197508121998032001",
          bendahara_nama: isian.bendahara?.nama || isian.bendahara_nama || "Siti Rahmawati, S.E.",
          bendahara_nip: isian.bendahara?.nip || isian.bendahara_nip || "198304152006041002",
          items: (isian.items || []).map((it) => ({
            jenis: it.jenis || "Fotokopi Hitam Putih",
            uraianMenu: it.uraianMenu || it.namaItem || "",
            volume: Number(it.volume || it.porsi) || 500,
            satuan: it.satuan || "Lembar",
            hargaSatuan: Number(it.hargaSatuan) || 300,
          })),
        }));
      })
      .catch((err) => {
        if (!usang) setGalat(err?.message || "Gagal memuat data dari server");
      })
      .finally(() => {
        if (!usang) setMemuat(false);
      });

    return () => {
      usang = true;
    };
  }, [id, baru]);

  // Kalkulasi total rincian & pajak
  const hitungan = useMemo(() => {
    const items = form.items || [];
    const totalVolume = items.reduce((acc, it) => acc + (Number(it.volume) || 0), 0);
    const subtotalBruto = items.reduce(
      (acc, it) => acc + (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0),
      0
    );

    const persen = Number(form.persen_pph) || 0;
    const potonganPajak = Math.round(subtotalBruto * (persen / 100));
    const bersihDibayarkan = subtotalBruto - potonganPajak;

    return {
      totalVolume,
      subtotalBruto,
      potonganPajak,
      bersihDibayarkan,
      persen,
    };
  }, [form.items, form.persen_pph]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const ubahStatusPajak = (labelPajak) => {
    const opsi = STATUS_PAJAK_OPTIONS.find(
      (o) => o.label === labelPajak || o.labelRingkas === labelPajak
    );
    const persen = opsi ? opsi.persen : 0;
    const labelUtama = opsi ? opsi.label : labelPajak;
    setForm((prev) => ({
      ...prev,
      status_pajak: labelUtama,
      persen_pph: persen,
    }));
  };

  const updateItem = (index, field, value) => {
    setForm((prev) => {
      const itemsBaru = [...prev.items];
      itemsBaru[index] = { ...itemsBaru[index], [field]: value };

      if (field === "jenis") {
        const standar = JENIS_PEKERJAAN_OPTIONS.find((j) => j.jenis === value);
        if (standar) {
          itemsBaru[index].satuan = standar.satuan;
          itemsBaru[index].hargaSatuan = standar.hargaDefault;
        }
      }

      return { ...prev, items: itemsBaru };
    });
  };

  const tambahItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          jenis: "Fotokopi Hitam Putih",
          uraianMenu: "",
          volume: 100,
          satuan: "Lembar",
          hargaSatuan: 300,
        },
      ],
    }));
  };

  const tambahPaketStandar = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        {
          jenis: "Fotokopi Hitam Putih",
          uraianMenu: "Fotokopi HVS A4 70gr Bolak Balik",
          volume: 2500,
          satuan: "Lembar",
          hargaSatuan: 500,
        },
        {
          jenis: "Penjilidan Spiral Kawat",
          uraianMenu: "Jilid Spiral Kawat + Cover Mika Bening / Biru",
          volume: 20,
          satuan: "Buku",
          hargaSatuan: 10000,
        },
      ],
    }));
    kabari("Paket standar Fotokopi + Penjilidan diterapkan");
  };

  const hapusItem = (index) => {
    if (form.items.length <= 1) {
      kabari("Minimal harus ada satu rincian item pekerjaan", "error");
      return;
    }
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const kosongkanForm = () => {
    if (!window.confirm("Kosongkan seluruh isian form pengajuan fotokopi?")) return;
    const bidangAwal = operator?.peran === "operator" ? operator?.bidang || "" : "";
    setForm(FORM_KOSONG(bidangAwal));
    kabari("Form dikosongkan");
  };

  const siapkanPayload = () => {
    const itemsTersusun = form.items.map((it) => ({
      jenis: it.jenis,
      uraianMenu: it.uraianMenu || it.jenis,
      namaItem: it.uraianMenu || it.jenis,
      volume: Number(it.volume) || 0,
      porsi: Number(it.volume) || 0,
      satuan: it.satuan || "Lembar",
      hargaSatuan: Number(it.hargaSatuan) || 0,
      subtotal: (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0),
    }));

    const isian = {
      bidang: form.bidang,
      akun: form.akun,
      dalam_rangka: form.dalam_rangka,
      nama_kegiatan: form.dalam_rangka,
      tempat_kegiatan: form.tempat_kegiatan,
      lokasi_detail: form.tempat_kegiatan,
      lokasi_provinsi: form.lokasi_provinsi,
      penyedia: form.penyedia,
      nama_penerima: form.penyedia,
      status_pajak: form.status_pajak,
      persen_pph: hitungan.persen,
      nomor_spby: form.nomor_spby,
      no_bku: form.no_bku,
      tanggal_kegiatan: form.tanggal_kegiatan,
      tanggal_spby: form.tanggal_spby,
      total: hitungan.subtotalBruto,
      pajak_pph: hitungan.potonganPajak,
      netto: hitungan.bersihDibayarkan,
      items: itemsTersusun,
      ppk: {
        nama: form.ppk_nama,
        nip: form.ppk_nip,
      },
      bendahara: {
        nama: form.bendahara_nama,
        nip: form.bendahara_nip,
      },
      ttd_penerima_nama: form.ttd_penerima_nama,
      ttd_penerima_nip: form.ttd_penerima_nip,
    };

    return isian;
  };

  const simpanKeDaftar = async () => {
    if (!form.bidang) {
      kabari("Pilih bidang pelaksana kegiatan terlebih dahulu", "error");
      return;
    }
    if (!form.dalam_rangka.trim()) {
      kabari("Isi nama kegiatan / dalam rangka terlebih dahulu", "error");
      return;
    }
    if (!form.penyedia.trim()) {
      kabari("Isi nama rekanan / penyedia fotokopi terlebih dahulu", "error");
      return;
    }

    setMenyimpan(true);
    const isian = siapkanPayload();

    const entriLokal = {
      id: baru ? `local-${Date.now()}` : id,
      bidang: form.bidang,
      status: "aktif",
      nama_kegiatan: form.dalam_rangka,
      tanggal_kegiatan: form.tanggal_kegiatan,
      lokasi_provinsi: form.lokasi_provinsi,
      lokasi_detail: form.tempat_kegiatan,
      nomor_spby: form.nomor_spby,
      penyedia: form.penyedia,
      nama_penerima: form.penyedia,
      jumlah_volume: hitungan.totalVolume,
      total: hitungan.subtotalBruto,
      pajak_pph: hitungan.potonganPajak,
      netto: hitungan.bersihDibayarkan,
      jumlah_jenis_item: form.items.length,
      isian,
    };

    try {
      const dataLokal = JSON.parse(localStorage.getItem("kwitansi-fotokopi-data") || "[]");
      let dataBaru;
      if (baru) {
        dataBaru = [entriLokal, ...dataLokal];
      } else {
        dataBaru = dataLokal.map((d) => (String(d.id) === String(id) ? entriLokal : d));
        if (!dataBaru.some((d) => String(d.id) === String(id))) {
          dataBaru.unshift(entriLokal);
        }
      }
      localStorage.setItem("kwitansi-fotokopi-data", JSON.stringify(dataBaru));
    } catch {
      // abaikan jika localStorage gagal
    }

    try {
      if (baru) {
        const res = await apiKwitansi({
          url: "api/kwitansi/fotokopi",
          method: "POST",
          body: { isian },
        });
        if (res?.data?.id) {
          try {
            const dataLokal = JSON.parse(localStorage.getItem("kwitansi-fotokopi-data") || "[]");
            const disesuaikan = dataLokal.map((d) =>
              String(d.id) === String(entriLokal.id) ? { ...d, id: res.data.id } : d
            );
            localStorage.setItem("kwitansi-fotokopi-data", JSON.stringify(disesuaikan));
          } catch {
            // abaikan
          }
        }
      } else {
        await apiKwitansi({
          url: `api/kwitansi/fotokopi/${id}`,
          method: "PUT",
          body: { isian },
        });
      }
    } catch (errApi) {
      console.warn("[FOTOKOPI] Sinkronisasi server tertunda, data tersimpan di penyimpanan lokal:", errApi);
    }

    kabari("Pengajuan fotokopi berhasil disimpan ke daftar");
    setTimeout(() => {
      navigate(jalur("fotokopi"));
    }, 600);
    setMenyimpan(false);
  };

  const lihatPdf = async () => {
    try {
      const isian = siapkanPayload();
      await bukaPdf({
        url: "api/kwitansi/fotokopi/pdf-preview",
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
          {toast.type === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          )}
          {toast.text}
        </div>
      )}

      {/* HEADER TOP BAR */}
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <Link
                to={jalur("fotokopi")}
                className="w-10 h-10 rounded-full border border-mist flex items-center justify-center text-slate-500 hover:text-navy hover:bg-slate-50 transition-colors shrink-0"
                title="Kembali ke Daftar Fotokopi"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-black text-navy tracking-tight truncate">
                  {baru ? "Fotokopi Baru" : "Ubah Fotokopi"}
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                  Belanja Penggandaan, Fotokopi & Penjilidan Dokumen (TA 2026)
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
              {/* CARD 1: DATA KEGIATAN & FOTOKOPI */}
              <div className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-mist pb-3">
                  <h2 className="text-sm font-bold text-navy">Data Kegiatan & Fotokopi</h2>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                    SPBY & Kwitansi Penggandaan
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Bidang */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Bidang <span className="text-rose-500">*</span>
                    </label>
                    <select
                      className={kelasInput}
                      value={form.bidang}
                      onChange={(e) => setField("bidang", e.target.value)}
                      required
                    >
                      <option value="">— Pilih bidang —</option>
                      {DAFTAR_BIDANG.map((b) => (
                        <option key={b.kode} value={b.kode}>
                          {b.label}
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
                      rows={3}
                      className={kelasInput}
                      placeholder="Contoh: Penggandaan dan penjilidan dokumen Laporan Keuangan Semester II TA 2026 Biro Keuangan"
                      value={form.dalam_rangka}
                      onChange={(e) => setField("dalam_rangka", e.target.value)}
                      required
                    />
                  </div>

                  {/* Tempat kegiatan & Lokasi Provinsi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Tempat kegiatan / Unit pengguna
                      </label>
                      <input
                        className={kelasInput}
                        placeholder="Contoh: Biro Keuangan dan BMN, Gedung Kemnaker"
                        value={form.tempat_kegiatan}
                        onChange={(e) => setField("tempat_kegiatan", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Lokasi Provinsi
                      </label>
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

                  {/* Penyedia & Status NPWP / PKP Rekanan */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Penyedia / Rekanan Fotokopi <span className="text-rose-500">*</span>
                      </label>
                      <input
                        className={kelasInput}
                        placeholder="Contoh: CV. Mitra Grafika / Fotokopi Abadi"
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
                        onChange={(e) => ubahStatusPajak(e.target.value)}
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
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Nomor SPBY
                      </label>
                      <input
                        className={kelasInput}
                        placeholder="Contoh: 029/SPBY-ROKEU/XI/2026"
                        value={form.nomor_spby}
                        onChange={(e) => setField("nomor_spby", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">No. BKU</label>
                      <input
                        className={kelasInput}
                        placeholder="Contoh: BKU-1052"
                        value={form.no_bku}
                        onChange={(e) => setField("no_bku", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Kolom Tanda Tangan Kwitansi Penerima / Vendor */}
                  <div className="border-t border-mist/80 pt-3 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Kolom Tanda Tangan Kwitansi Rekanan / Penerima
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <input
                          className={kelasInput}
                          placeholder="Nama (kosong = nama penyedia)"
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

                  {/* Tanggal kegiatan & Tanggal SPBY / Kwitansi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Tanggal kegiatan
                      </label>
                      <input
                        type="date"
                        className={kelasInput}
                        value={form.tanggal_kegiatan}
                        onChange={(e) => setField("tanggal_kegiatan", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Tanggal SPBY / Kwitansi
                      </label>
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
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Bendahara Pengeluaran
                      </label>
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
                        placeholder="NIP PPK"
                        value={form.ppk_nip}
                        onChange={(e) => setField("ppk_nip", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        NIP Bendahara
                      </label>
                      <input
                        className={kelasInput}
                        placeholder="NIP Bendahara"
                        value={form.bendahara_nip}
                        onChange={(e) => setField("bendahara_nip", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: ITEM FOTOKOPI & PENJILIDAN */}
              <div className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-mist pb-3">
                  <h2 className="text-sm font-bold text-navy">
                    Item Fotokopi & Penjilidan ({form.items.length})
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={tambahPaketStandar}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                      <span>+ Paket Fotokopi + Jilid</span>
                    </button>
                    <button
                      type="button"
                      onClick={tambahItem}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand hover:bg-navy text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah item</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  {form.items.map((it, idx) => {
                    const subtotalItem =
                      (Number(it.volume) || 0) * (Number(it.hargaSatuan) || 0);

                    return (
                      <div
                        key={idx}
                        className="rounded-2xl border border-mist p-4 sm:p-5 bg-white space-y-3.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
                            Rincian Pekerjaan #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => hapusItem(idx)}
                            disabled={form.items.length <= 1}
                            className={`p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ${
                              form.items.length <= 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                            }`}
                            title="Hapus item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Jenis Pekerjaan & Uraian */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Jenis Pekerjaan
                            </label>
                            <select
                              className={kelasInput}
                              value={it.jenis}
                              onChange={(e) => updateItem(idx, "jenis", e.target.value)}
                            >
                              {JENIS_PEKERJAAN_OPTIONS.map((j) => (
                                <option key={j.jenis} value={j.jenis}>
                                  {j.jenis}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Uraian Menu / Spesifikasi
                            </label>
                            <input
                              className={kelasInput}
                              placeholder="Contoh: Dokumen LKKL HVS A4 70gr"
                              value={it.uraianMenu}
                              onChange={(e) => updateItem(idx, "uraianMenu", e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Volume, Satuan, Harga Satuan, Subtotal */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 items-end">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Volume / Lembar
                            </label>
                            <input
                              type="number"
                              min="1"
                              className={kelasInput}
                              value={it.volume}
                              onChange={(e) =>
                                updateItem(idx, "volume", Math.max(1, Number(e.target.value) || 0))
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Satuan
                            </label>
                            <select
                              className={kelasInput}
                              value={it.satuan}
                              onChange={(e) => updateItem(idx, "satuan", e.target.value)}
                            >
                              {DAFTAR_SATUAN.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Harga Satuan
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              className={kelasInput}
                              value={it.hargaSatuan}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  "hargaSatuan",
                                  Math.max(0, Number(e.target.value) || 0)
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Subtotal
                            </label>
                            <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-mist text-sm font-bold text-navy truncate">
                              {rupiah(subtotalItem)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: RINCIAN & AKSI (4 COLS) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-3xl border border-mist shadow-2xs p-5 space-y-4 sticky top-28">
                <div className="flex items-center gap-2 text-sm font-bold text-navy border-b border-mist pb-3">
                  <FileText className="w-4 h-4 text-brand" />
                  <span>Rincian</span>
                </div>

                {/* Warning jika belum pilih bidang */}
                {!form.bidang && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold leading-relaxed">
                    Bidang pelaksana kegiatan belum dipilih.
                  </div>
                )}

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-mist/50">
                    <span className="text-slate-500">Lokasi Provinsi</span>
                    <span className="font-bold text-navy">{form.lokasi_provinsi}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-mist/50">
                    <span className="text-slate-500">Total Volume</span>
                    <span className="font-bold text-navy">
                      {hitungan.totalVolume.toLocaleString("id-ID")} lembar
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-mist/50">
                    <span className="text-slate-500">Subtotal Bruto</span>
                    <span className="font-bold text-navy">{rupiah(hitungan.subtotalBruto)}</span>
                  </div>

                  {/* Dropdown status pajak di sidebar sesuai screenshot */}
                  <div className="pt-2">
                    <label className="block text-slate-500 font-medium mb-1.5">
                      Perhitungan Pajak SPBY / Kwitansi
                    </label>
                    <select
                      className={kelasInput + " text-xs py-2"}
                      value={form.status_pajak}
                      onChange={(e) => ubahStatusPajak(e.target.value)}
                    >
                      {STATUS_PAJAK_OPTIONS.map((o) => (
                        <option key={o.label} value={o.label}>
                          {o.labelRingkas}
                        </option>
                      ))}
                    </select>
                  </div>

                  {hitungan.potonganPajak > 0 && (
                    <div className="flex justify-between items-center py-1 text-amber-700">
                      <span>Potongan Pajak (PPh {hitungan.persen}%)</span>
                      <span className="font-bold">- {rupiah(hitungan.potonganPajak)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 text-sm font-bold text-navy">
                    <span>Total Tagihan</span>
                    <span>{rupiah(hitungan.subtotalBruto)}</span>
                  </div>

                  {/* Box Bersih Dibayarkan (Kotak Hijau Sesuai Screenshot) */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800">Bersih Dibayarkan</span>
                    <span className="text-sm font-black text-emerald-700">
                      {rupiah(hitungan.bersihDibayarkan)}
                    </span>
                  </div>
                </div>

                {/* Tombol Aksi */}
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={lihatPdf}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-mist bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>Lihat PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={simpanKeDaftar}
                    disabled={menyimpan}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand hover:bg-navy text-white text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-98 disabled:opacity-50"
                  >
                    {menyimpan ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>Simpan ke daftar</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  SPBY, kwitansi, dan rincian fotokopi & penjilidan sesuai format Biro Keuangan Kemnaker.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
