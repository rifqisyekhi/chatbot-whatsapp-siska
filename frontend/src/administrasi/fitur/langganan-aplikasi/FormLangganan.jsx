import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiKwitansi, bukaPdf } from "../../../services/sesiKwitansi";
import { jalur } from "../../jalur";
import {
  ArrowLeft,
  ReceiptText,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Save,
  Upload,
  Image as ImageIcon,
  ChevronDown,
} from "lucide-react";

// =========================================================
// FORM LANGGANAN APLIKASI (BARU / UBAH)
// =========================================================
//
// Operator mengisi data langganan aplikasi, penerima (Kepada),
// rincian biaya, serta mengunggah bukti/nota pembelian. Server
// menyusun PDF Surat Perintah Bayar (SPBY) beserta lampiran bukti.
// Simpan/ubah hanya lewat API; angka pratinjau dihitung server
// (POST .../hitung). localStorage hanya untuk draf form baru yang belum
// disimpan.

const KUNCI_DRAF = "kwitansi-langganan-draf";

const BIDANG_BAWAAN = ["BMN", "PTUK", "TU", "AKLAP", "PA"];

const AKUN_BAWAAN = [
  {
    kode: "026.01.WA.2158.EBA.994.002.A.522191",
    uraian: "522191 — Belanja Jasa Lainnya (Langganan Aplikasi / Layanan Daring)",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.521111",
    uraian: "521111 — Belanja Keperluan Perkantoran",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.522119",
    uraian: "522119 — Belanja Langganan Daya dan Jasa Lainnya",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.524111",
    uraian: "524111 — Belanja Perjalanan / Operasional",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.521211",
    uraian: "521211 — Belanja Bahan / Operasional Kegiatan",
  },
];

const APLIKASI_POPULER_BAWAAN = [
  { nama: "Zoom Workplace" },
  { nama: "Canva" },
  { nama: "Google Workspace / Google One" },
  { nama: "Adobe Creative Cloud" },
  { nama: "Microsoft 365" },
];

const PENYEDIA_LAMA =
  /zoom video communications|canva pty|google asia pacific|adobe systems software|microsoft operations|openai|bytedance|grammarly|penyedia layanan cloud/i;

const DIHAPUS_APLIKASI = /capcut|grammarly|chatgpt|gpt|vps|cloud hosting/i;

const REF_BAWAAN = {
  bidang: BIDANG_BAWAAN,
  akun: AKUN_BAWAAN,
  aplikasiPopuler: APLIKASI_POPULER_BAWAAN,
  periode: ["Bulanan", "Triwulanan", "Semesteran", "Tahunan", "Sekali Bayar"],
  satuan: ["Lisensi", "Akun", "Bulan", "Tahun", "Paket", "Unit"],
};

const RINCIAN_KOSONG = {
  uraian: "",
  volume: "1",
  satuan: "Lisensi",
  harga_satuan: "",
  pajak: "",
  keterangan: "",
};

const hariIni = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const FORM_AWAL = () => {
  const t = hariIni();
  return {
    akun: AKUN_BAWAAN[0].kode,
    kegiatan_mak: "2158.EBA.994",
    kode_akun: "522191",
    nama_aplikasi: "",
    penyedia: "",
    paket: "",
    periode: "Bulanan",
    keperluan: "",
    tanggal_mulai: t,
    tanggal_selesai: t,
    tanggal_bayar: t,
    nomor_spby: "",
    no_bku: "",
    cetak_tanggal_lengkap: false,
    penerima_nama: "",
    penerima_nip: "",
    penerima_jabatan: "",
    rincian: [{ ...RINCIAN_KOSONG }],
    lampiran: [],
  };
};

function bacaDraf() {
  try {
    const d = JSON.parse(localStorage.getItem(KUNCI_DRAF) || "null");
    if (d && Array.isArray(d.rincian)) {
      if (PENYEDIA_LAMA.test(String(d.penyedia || ""))) d.penyedia = "";
      return { ...FORM_AWAL(), ...d, lampiran: [] };
    }
  } catch {
    // abaikan jika draf rusak
  }
  return FORM_AWAL();
}

// Kompres gambar yang dipilih menjadi JPEG dataUrl agar ringan disimpan dan ditanam ke PDF.
function kompresGambarKeDataUrl(berkas) {
  return new Promise((resolve, reject) => {
    const pembaca = new FileReader();
    pembaca.onerror = () => reject(new Error(`Gagal membaca berkas ${berkas.name}`));
    pembaca.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error(`Format gambar ${berkas.name} tidak didukung`));
      img.onload = () => {
        const SISI_MAKS = 1400;
        let w = img.width || 800;
        let h = img.height || 600;
        if (w > SISI_MAKS || h > SISI_MAKS) {
          if (w >= h) {
            h = Math.round((h * SISI_MAKS) / w);
            w = SISI_MAKS;
          } else {
            w = Math.round((w * SISI_MAKS) / h);
            h = SISI_MAKS;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({
          nama: berkas.name,
          dataUrl: canvas.toDataURL("image/jpeg", 0.78),
        });
      };
      img.src = pembaca.result;
    };
    pembaca.readAsDataURL(berkas);
  });
}

// Batas lampiran (disamakan dengan server; nilai dari referensi bila ada).
const MAKS_LAMPIRAN = 5;
const MAKS_BYTE_LAMPIRAN = 1024 * 1024;
const ukuranDataUrl = (dataUrl) => Math.floor((String(dataUrl).split(",")[1] || "").length * 0.75);

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");

const kelasInput =
  "w-full px-3.5 py-2.5 rounded-xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

function Medan({ label, children, petunjuk, className = "" }) {
  return (
    <div className={`block ${className}`}>
      <span className="block text-xs font-bold text-slate-600 mb-1.5">{label}</span>
      {children}
      {petunjuk && <span className="block text-[11px] text-slate-400 mt-1">{petunjuk}</span>}
    </div>
  );
}

function InputRupiah({ value, onChange }) {
  const tampil = value === "" || value === undefined ? "" : Number(value).toLocaleString("id-ID");
  return (
    <input
      inputMode="numeric"
      className={kelasInput + " tabular-nums"}
      value={tampil}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
    />
  );
}

// Dropdown saran berwarna putih bersih (menggantikan <datalist> bawaan browser yang gelap).
function InputSaranPutih({ value, onChange, onSelect, daftar = [] }) {
  const [terbuka, setTerbuka] = useState(false);
  const [modeSemua, setModeSemua] = useState(false);
  const wadahRef = useRef(null);

  useEffect(() => {
    const tutupLuar = (e) => {
      if (wadahRef.current && !wadahRef.current.contains(e.target)) {
        setTerbuka(false);
      }
    };
    document.addEventListener("mousedown", tutupLuar);
    return () => document.removeEventListener("mousedown", tutupLuar);
  }, []);

  const tersaring = useMemo(() => {
    const k = String(value || "").trim().toLowerCase();
    if (!k || modeSemua) return daftar;
    const cocok = daftar.filter(
      (item) =>
        item.utama.toLowerCase().includes(k) ||
        (item.sub && item.sub.toLowerCase().includes(k)),
    );
    return cocok.length ? cocok : daftar;
  }, [value, daftar, modeSemua]);

  return (
    <div ref={wadahRef} className="relative">
      <div className="relative">
        <input
          className={kelasInput + " pr-9"}
          value={value}
          onFocus={() => {
            setModeSemua(true);
            setTerbuka(true);
          }}
          onChange={(e) => {
            setModeSemua(false);
            setTerbuka(true);
            onChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setTerbuka(false);
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setModeSemua(true);
            setTerbuka((v) => !v);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-navy cursor-pointer"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${terbuka ? "rotate-180" : ""}`} />
        </button>
      </div>

      {terbuka && tersaring.length > 0 && (
        <ul className="absolute left-0 right-0 z-40 mt-1.5 max-h-60 overflow-y-auto rounded-2xl bg-white border border-mist shadow-xl py-1.5 divide-y divide-mist/50">
          {tersaring.map((item, idx) => {
            const aktif = String(value || "").toLowerCase() === item.utama.toLowerCase();
            return (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item.utama);
                    setTerbuka(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer ${
                    aktif ? "bg-brand/10 text-brand" : "bg-white hover:bg-paper text-navy"
                  }`}
                >
                  <span className="block text-sm font-bold leading-snug">{item.utama}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function FormLangganan({ operator }) {
  const { id } = useParams();
  const baru = !id || id === "baru";
  const navigate = useNavigate();
  const admin = operator?.peran === "admin";
  const bendahara = operator?.peran === "bendahara";
  const [ref, setRef] = useState(REF_BAWAAN);
  const [pegawai, setPegawai] = useState([]);
  const [galatMuat, setGalatMuat] = useState("");
  const [form, setForm] = useState(() => (baru ? bacaDraf() : FORM_AWAL()));
  const [tersimpan, setTersimpan] = useState(null);
  const [bidang, setBidang] = useState(operator?.bidang || "");
  const [menyimpan, setMenyimpan] = useState(false);
  const [hasil, setHasil] = useState(null);
  const [galatHitung, setGalatHitung] = useState("");
  const [menghitung, setMenghitung] = useState(false);
  const [membuatPdf, setMembuatPdf] = useState(false);
  const [mengunggah, setMengunggah] = useState(false);
  const [toast, setToast] = useState(null);
  const urutanHitung = useRef(0);
  const inputBerkasRef = useRef(null);

  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    apiKwitansi({ url: "api/kwitansi/langganan-aplikasi/referensi" })
      .then((r) => {
        if (r && typeof r === "object") {
          const daftarAplikasi = Array.isArray(r.aplikasiPopuler)
            ? r.aplikasiPopuler.filter((a) => !DIHAPUS_APLIKASI.test(a.nama))
            : APLIKASI_POPULER_BAWAAN;
          setRef((lama) => ({
            ...lama,
            ...r,
            aplikasiPopuler: daftarAplikasi.length ? daftarAplikasi : APLIKASI_POPULER_BAWAAN,
            bidang: Array.isArray(r.bidang) && r.bidang.length ? r.bidang : lama.bidang,
          }));
          setForm((f) => (f.akun ? f : { ...f, akun: r.akun?.[0]?.kode || AKUN_BAWAAN[0].kode }));
        }
      })
      .catch(() => {});

    apiKwitansi({ url: "api/kwitansi/pegawai" })
      .then((p) => setPegawai(Array.isArray(p) ? p : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (baru) return;
    apiKwitansi({ url: `api/kwitansi/langganan-aplikasi/${id}` })
      .then((b) => {
        setTersimpan(b);
        setBidang(b.bidang);
        setForm({ ...FORM_AWAL(), ...b.isian });
      })
      .catch((e) => setGalatMuat(e.message || "Gagal memuat data langganan aplikasi"));
  }, [id, baru]);

  // Simpan draf tanpa gambar lampiran agar tidak melebihi batas localStorage.
  useEffect(() => {
    if (!baru) return;
    try {
      localStorage.setItem(KUNCI_DRAF, JSON.stringify({ ...form, lampiran: undefined }));
    } catch {
      // abaikan
    }
  }, [form, baru]);

  useEffect(() => {
    const nomor = ++urutanHitung.current;
    const t = setTimeout(async () => {
      setMenghitung(true);
      try {
        const h = await apiKwitansi({
          url: "api/kwitansi/langganan-aplikasi/hitung",
          method: "POST",
          body: { isian: { ...form, lampiran: undefined } },
        });
        if (nomor !== urutanHitung.current) return;
        setHasil(h);
        setGalatHitung("");
      } catch (e) {
        if (nomor !== urutanHitung.current) return;
        setHasil(null);
        setGalatHitung(e.message || "Gagal menghitung");
      } finally {
        if (nomor === urutanHitung.current) setMenghitung(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [form]);

  const ubah = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const gantiAkun = (kodeLengkap) => {
    const bagian = String(kodeLengkap || "").split(".");
    const kodeUjung = bagian[bagian.length - 1] || "522191";
    const kegiatan = bagian.length >= 6 ? bagian.slice(3, 6).join(".") : "2158.EBA.994";
    setForm((f) => ({
      ...f,
      akun: kodeLengkap,
      kegiatan_mak: kegiatan,
      kode_akun: kodeUjung,
    }));
  };

  const daftarSaranAplikasi = useMemo(
    () =>
      (ref?.aplikasiPopuler || APLIKASI_POPULER_BAWAAN)
        .filter((a) => !DIHAPUS_APLIKASI.test(a.nama))
        .map((a) => ({
          utama: a.nama,
          sub: [a.penyedia, a.paket].filter(Boolean).join(" • "),
        })),
    [ref],
  );

  const daftarSaranPegawai = useMemo(
    () =>
      pegawai.map((p) => ({
        utama: p.nama,
        sub: [p.jabatan, p.nip ? `NIP ${p.nip}` : ""].filter(Boolean).join(" • "),
      })),
    [pegawai],
  );

  const pilihAplikasi = (nama) => {
    const cocok = (ref?.aplikasiPopuler || []).find((a) => a.nama.toLowerCase() === nama.toLowerCase());
    setForm((f) => ({
      ...f,
      nama_aplikasi: nama,
      ...(cocok
        ? {
            penyedia: cocok.penyedia || f.penyedia,
            paket: cocok.paket || f.paket,
          }
        : {}),
    }));
  };

  const pilihPenerima = (nama) => {
    const peg = pegawai.find((p) => p.nama === nama);
    setForm((f) => ({
      ...f,
      penerima_nama: nama,
      ...(peg
        ? {
            penerima_nip: String(peg.nip || "").replace(/\s+/g, ""),
            penerima_jabatan: peg.jabatan || "",
          }
        : {}),
    }));
  };

  const ubahRincian = (i, k, v) =>
    setForm((f) => ({
      ...f,
      rincian: f.rincian.map((r, j) => (j === i ? { ...r, [k]: v } : r)),
    }));

  const pilihBerkasBukti = async (e) => {
    const daftarBerkas = Array.from(e.target.files || []);
    if (!daftarBerkas.length) return;
    const maks = Number(ref?.maksLampiran) || MAKS_LAMPIRAN;
    const maksByte = Number(ref?.maksByteLampiran) || MAKS_BYTE_LAMPIRAN;
    const sisa = maks - (Array.isArray(form.lampiran) ? form.lampiran.length : 0);
    if (sisa <= 0) {
      kabari(`Lampiran gambar paling banyak ${maks} berkas`, "error");
      if (inputBerkasRef.current) inputBerkasRef.current.value = "";
      return;
    }
    setMengunggah(true);
    try {
      const hasilUnggah = [];
      for (const berkas of daftarBerkas.slice(0, sisa)) {
        const terkompres = await kompresGambarKeDataUrl(berkas);
        if (ukuranDataUrl(terkompres.dataUrl) > maksByte) {
          throw new Error(`Gambar ${berkas.name} terlalu besar (maksimal 1 MB setelah dikompres)`);
        }
        hasilUnggah.push(terkompres);
      }
      setForm((f) => ({
        ...f,
        lampiran: [...(Array.isArray(f.lampiran) ? f.lampiran : []), ...hasilUnggah].slice(0, maks),
      }));
      if (daftarBerkas.length > sisa) {
        kabari(`Hanya ${sisa} berkas ditambahkan (maksimal ${maks} lampiran)`, "error");
        return;
      }
      kabari(`${hasilUnggah.length} bukti pembayaran ditambahkan`);
    } catch (err) {
      kabari(err.message || "Gagal memuat berkas bukti", "error");
    } finally {
      setMengunggah(false);
      if (inputBerkasRef.current) inputBerkasRef.current.value = "";
    }
  };

  const hapusLampiran = (indeks) => {
    setForm((f) => ({
      ...f,
      lampiran: (f.lampiran || []).filter((_, i) => i !== indeks),
    }));
  };

  const buatPdf = async () => {
    setMembuatPdf(true);
    try {
      // Bendahara hanya membuka PDF data tersimpan; selain itu pratinjau
      // dari isian form disusun server (angka dihitung ulang di sana).
      if (bendahara && !baru) {
        await bukaPdf({ url: `api/kwitansi/langganan-aplikasi/${id}/pdf` });
      } else {
        await bukaPdf({
          url: "api/kwitansi/langganan-aplikasi/pdf",
          method: "POST",
          body: { isian: form },
        });
      }
      kabari("PDF SPBY & Kwitansi dibuka");
    } catch (e) {
      kabari(e.message || "Gagal membuat PDF", "error");
    } finally {
      setMembuatPdf(false);
    }
  };

  const simpan = async () => {
    setMenyimpan(true);
    try {
      if (baru) {
        await apiKwitansi({
          url: "api/kwitansi/langganan-aplikasi",
          method: "POST",
          body: { isian: form, bidang },
        });
        try {
          localStorage.removeItem(KUNCI_DRAF);
        } catch {
          // abaikan
        }
      } else {
        await apiKwitansi({
          url: `api/kwitansi/langganan-aplikasi/${id}`,
          method: "PUT",
          body: { isian: form },
        });
      }
      navigate(jalur("langganan-aplikasi"));
    } catch (e) {
      kabari(e.message || "Gagal menyimpan", "error");
      setMenyimpan(false);
    }
  };

  const ulangi = () => {
    setForm({ ...FORM_AWAL(), akun: ref?.akun?.[0]?.kode || AKUN_BAWAAN[0].kode });
  };

  const daftarBidang = Array.isArray(ref?.bidang) && ref.bidang.length ? ref.bidang : BIDANG_BAWAAN;
  const daftarSatuan = ref?.satuan || REF_BAWAAN.satuan;
  const daftarLampiran = Array.isArray(form.lampiran) ? form.lampiran : [];

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                to={jalur("langganan-aplikasi")}
                className="p-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 transition-all active:scale-95 shadow-2xs"
                title="Kembali ke daftar langganan aplikasi"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold text-navy tracking-tight truncate">
                  {baru ? "Langganan Aplikasi Baru" : "Ubah Langganan Aplikasi"}
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">
                  {bidang ? `Bidang ${bidang} • ` : ""}Surat Perintah Bayar (SPBY) Langganan Aplikasi
                </p>
              </div>
            </div>
            {baru && (
              <button
                type="button"
                onClick={ulangi}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 text-sm font-bold transition-all active:scale-95 shadow-2xs cursor-pointer shrink-0"
                title="Kosongkan form"
              >
                <RotateCcw className="w-4 h-4 text-brand" />
                <span className="hidden sm:inline">Kosongkan</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {galatMuat && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {galatMuat}
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            {/* ---------- Data Langganan & Pembebanan ---------- */}
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6">
              <div className="grid sm:grid-cols-2 gap-4">
                {admin && (
                  <Medan
                    label="Bidang"
                    className="sm:col-span-2"
                    petunjuk={baru ? undefined : "Bidang tidak bisa diubah setelah disimpan"}
                  >
                    <select
                      className={kelasInput}
                      value={bidang}
                      disabled={!baru}
                      onChange={(e) => setBidang(e.target.value)}
                    >
                      <option value="">— Pilih bidang —</option>
                      {daftarBidang.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </Medan>
                )}

                <Medan label="Akun" className="sm:col-span-2">
                  <select className={kelasInput} value={form.akun} onChange={(e) => gantiAkun(e.target.value)}>
                    <option value="">— Pilih akun —</option>
                    {(ref?.akun || []).map((a) => (
                      <option key={a.kode} value={a.kode}>
                        {a.kode} — {a.uraian}
                      </option>
                    ))}
                  </select>
                </Medan>

                <Medan
                  label="Nama aplikasi / layanan daring"
                  petunjuk="Ketik bebas atau pilih dari daftar aplikasi"
                >
                  <InputSaranPutih
                    value={form.nama_aplikasi}
                    onChange={(v) => ubah("nama_aplikasi", v)}
                    onSelect={(v) => pilihAplikasi(v)}
                    daftar={daftarSaranAplikasi}
                  />
                </Medan>

                <Medan label="Paket / jenis lisensi">
                  <input
                    className={kelasInput}
                    value={form.paket}
                    onChange={(e) => ubah("paket", e.target.value)}
                  />
                </Medan>

                <Medan label="Penyedia / vendor" className="sm:col-span-2">
                  <input
                    className={kelasInput}
                    value={form.penyedia}
                    onChange={(e) => ubah("penyedia", e.target.value)}
                  />
                </Medan>

                <Medan
                  label="Dalam rangka / untuk pembayaran"
                  className="sm:col-span-2"
                  petunjuk='Otomatis diakhiri ", sesuai dengan bukti terlampir" pada cetak SPBY'
                >
                  <textarea
                    rows={2}
                    className={kelasInput}
                    value={form.keperluan}
                    onChange={(e) => ubah("keperluan", e.target.value)}
                  />
                </Medan>

                <Medan label="Tanggal pembelian">
                  <input
                    type="date"
                    className={kelasInput}
                    value={form.tanggal_mulai}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({
                        ...f,
                        tanggal_mulai: v,
                        tanggal_selesai: !f.tanggal_selesai || f.tanggal_selesai < v ? v : f.tanggal_selesai,
                      }));
                    }}
                  />
                </Medan>

                <Medan label="Tanggal batas akhir">
                  <input
                    type="date"
                    className={kelasInput}
                    value={form.tanggal_selesai}
                    min={form.tanggal_mulai}
                    onChange={(e) => ubah("tanggal_selesai", e.target.value)}
                  />
                </Medan>

                <Medan label="Tanggal SPBY">
                  <input
                    type="date"
                    className={kelasInput}
                    value={form.tanggal_bayar}
                    onChange={(e) => ubah("tanggal_bayar", e.target.value)}
                  />
                </Medan>

                <Medan label="Nomor SPBY" petunjuk="Boleh dikosongkan">
                  <input
                    className={kelasInput}
                    value={form.nomor_spby}
                    onChange={(e) => ubah("nomor_spby", e.target.value)}
                  />
                </Medan>
              </div>
            </section>

            {/* ---------- Kepada / Penerima ---------- */}
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6">
              <h2 className="text-base font-extrabold mb-4">Kepada / Penerima</h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <Medan label="Kepada (Nama Penerima)" petunjuk="Ketik nama pegawai atau penerima di SPBY">
                  <InputSaranPutih
                    value={form.penerima_nama}
                    onChange={(v) => ubah("penerima_nama", v)}
                    onSelect={(v) => pilihPenerima(v)}
                    daftar={daftarSaranPegawai}
                  />
                </Medan>
                <Medan label="NIP">
                  <input
                    className={kelasInput}
                    value={form.penerima_nip}
                    onChange={(e) => ubah("penerima_nip", e.target.value.replace(/\s+/g, ""))}
                  />
                </Medan>
                <Medan label="Jabatan" className="sm:col-span-2">
                  <input
                    className={kelasInput}
                    value={form.penerima_jabatan}
                    onChange={(e) => ubah("penerima_jabatan", e.target.value)}
                  />
                </Medan>
              </div>
            </section>

            {/* ---------- Rincian Biaya ---------- */}
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 gap-3">
                <h2 className="text-base font-extrabold">Rincian Biaya ({form.rincian.length})</h2>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rincian: [...f.rincian, { ...RINCIAN_KOSONG }] }))}
                  className="inline-flex items-center gap-2 bg-brand hover:bg-navy text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Tambah rincian
                </button>
              </div>

              <div className="space-y-4">
                {form.rincian.map((r, i) => (
                  <div key={i} className="rounded-2xl border border-mist p-4 bg-paper/30">
                    {form.rincian.length > 1 && (
                      <div className="flex items-center justify-end mb-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, rincian: f.rincian.filter((_, j) => j !== i) }))
                          }
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                          title="Hapus item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Medan label="Jumlah / volume">
                          <input
                            inputMode="numeric"
                            className={kelasInput + " tabular-nums"}
                            value={r.volume}
                            onChange={(e) => ubahRincian(i, "volume", e.target.value.replace(/[^\d]/g, ""))}
                          />
                        </Medan>
                        <Medan label="Satuan">
                          <select
                            className={kelasInput}
                            value={r.satuan}
                            onChange={(e) => ubahRincian(i, "satuan", e.target.value)}
                          >
                            {daftarSatuan.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </Medan>
                      </div>

                      <Medan label="Harga satuan (Rp)">
                        <InputRupiah
                          value={r.harga_satuan}
                          onChange={(v) => ubahRincian(i, "harga_satuan", v)}
                        />
                      </Medan>

                      <Medan label="PPN / biaya admin (Rp)" petunjuk="Opsional (kosong = 0)">
                        <InputRupiah
                          value={r.pajak}
                          onChange={(v) => ubahRincian(i, "pajak", v)}
                        />
                      </Medan>

                      <Medan label="Keterangan" petunjuk="Opsional">
                        <input
                          className={kelasInput}
                          value={r.keterangan}
                          onChange={(e) => ubahRincian(i, "keterangan", e.target.value)}
                        />
                      </Medan>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ---------- Upload Bukti / Nota Pembelian ---------- */}
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6">
              <div className="flex items-center justify-between mb-3 gap-3">
                <div>
                  <h2 className="text-base font-extrabold">Upload Bukti / Nota Pembelian</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Unggah foto/gambar kuitansi atau invoice langganan aplikasi untuk dilampirkan ke PDF SPBY.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 bg-brand hover:bg-navy text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer shrink-0">
                  {mengunggah ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Pilih berkas
                  <input
                    ref={inputBerkasRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={pilihBerkasBukti}
                  />
                </label>
              </div>

              {!daftarLampiran.length ? (
                <div
                  onClick={() => inputBerkasRef.current?.click()}
                  className="mt-3 border-2 border-dashed border-mist hover:border-brand/50 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-paper/40"
                >
                  <ImageIcon className="w-7 h-7 mx-auto text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-500">
                    Klik untuk memilih foto/gambar nota atau bukti pembelian
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {daftarLampiran.map((item, idx) => (
                    <div
                      key={idx}
                      className="group relative rounded-2xl border border-mist bg-paper/40 p-2 flex flex-col"
                    >
                      <img
                        src={item.dataUrl}
                        alt={item.nama}
                        className="w-full h-32 object-contain rounded-xl bg-white"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2 px-1">
                        <span className="text-[11px] font-semibold text-slate-600 truncate">
                          {item.nama || `Bukti ${idx + 1}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => hapusLampiran(idx)}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer shrink-0"
                          title="Hapus bukti"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ---------- Pratinjau ---------- */}
          <aside className="lg:sticky lg:top-28 space-y-4">
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-brand" /> Rincian SPBY
                </h2>
                {menghitung && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
              </div>

              {galatHitung ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 font-semibold">
                  {galatHitung}
                </p>
              ) : !hasil ? (
                <p className="text-sm text-slate-400">Isi form untuk melihat rincian.</p>
              ) : (
                <div className="space-y-4">
                  <div className="border-b border-mist pb-3">
                    <p className="text-sm font-bold truncate">
                      {hasil.namaAplikasi}
                      {hasil.paket ? ` (${hasil.paket})` : ""}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      Kepada: {hasil.penerima.nama}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      MAK: {hasil.kegiatanMak} • Kode: {hasil.kodeAkun}
                    </p>
                    {daftarLampiran.length > 0 && (
                      <p className="text-[11px] font-bold text-brand mt-1">
                        {daftarLampiran.length} berkas bukti terlampir
                      </p>
                    )}
                    <table className="w-full text-xs mt-2">
                      <tbody>
                        {hasil.rincian.map((r, j) => (
                          <tr key={j}>
                            <td className="py-1 text-slate-500">
                              <span className="font-semibold text-navy block">{r.uraian}</span>
                              {r.volume} {r.satuan} × {r.hargaSatuan.toLocaleString("id-ID")}
                              {r.pajak > 0 && ` + pajak ${r.pajak.toLocaleString("id-ID")}`}
                            </td>
                            <td className="py-1 text-right tabular-nums font-semibold whitespace-nowrap align-top">
                              {r.jumlah.toLocaleString("id-ID")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between bg-paper rounded-2xl px-4 py-3">
                    <span className="text-sm font-bold">Total SPBY</span>
                    <span className="text-lg font-black tabular-nums">{rupiah(hasil.total)}</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={buatPdf}
                disabled={membuatPdf || (!(bendahara && !baru) && (!hasil || !!galatHitung))}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-navy disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
              >
                {membuatPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Lihat PDF
              </button>
              {!bendahara && (
              <button
                type="button"
                onClick={simpan}
                disabled={
                  !hasil ||
                  !!galatHitung ||
                  menyimpan ||
                  (admin && !bidang) ||
                  tersimpan?.status === "dibatalkan"
                }
                className="mt-2 w-full inline-flex items-center justify-center gap-2 border-2 border-brand text-brand hover:bg-brand hover:text-white disabled:border-slate-300 disabled:text-slate-400 disabled:bg-transparent disabled:cursor-not-allowed px-5 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95 cursor-pointer"
              >
                {menyimpan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {baru ? "Simpan ke daftar" : "Simpan perubahan"}
              </button>
              )}
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Surat Perintah Bayar (SPBY) + lampiran bukti pembelian
              </p>
            </section>
          </aside>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border bg-white border-mist text-navy">
          {toast.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-green" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600" />
          )}
          <span className="text-xs font-bold">{toast.text}</span>
        </div>
      )}
    </div>
  );
}
