import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiKwitansi } from "../../../services/sesiKwitansi";
import { jalur } from "../../jalur";
import { buatLokal, satuLokal, ubahLokal } from "./simpananLokal";
import { bukaPdfBbmLokal } from "./cetakPdfLokal";
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
// FORM BBM KEPALA BIRO (BARU / UBAH)
// =========================================================

const KUNCI_DRAF = "kwitansi-bbm-kabiro-draf";

const BIDANG_BAWAAN = ["BMN", "PTUK", "TU", "AKLAP", "PA"];

const AKUN_BAWAAN = [
  {
    kode: "026.01.WA.2158.EBA.994.002.A.523121",
    uraian: "523121 — Belanja Biaya Pemeliharaan Peralatan dan Mesin (BBM Kendaraan Dinas)",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.521111",
    uraian: "521111 — Belanja Keperluan Perkantoran",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.521211",
    uraian: "521211 — Belanja Bahan / Operasional Kegiatan",
  },
  {
    kode: "026.01.WA.2158.EBA.994.002.A.524111",
    uraian: "524111 — Belanja Perjalanan / Operasional",
  },
];

const JENIS_BBM_BAWAAN = [
  { nama: "Pertamax" },
  { nama: "Pertamax Turbo" },
  { nama: "Pertamina Dex" },
  { nama: "Dexlite" },
  { nama: "Pertalite" },
  { nama: "Solar" },
];

const PENYEDIA_SPBU_BAWAAN = [
  { utama: "SPBU Pertamina" },
  { utama: "SPBU Shell" },
  { utama: "SPBU BP-AKR" },
  { utama: "SPBU Vivo" },
];

const DAFTAR_MOBIL_INDONESIA = [
  "Toyota Kijang Innova",
  "Toyota Avanza",
];

const DAFTAR_MOTOR_INDONESIA = [
  "Honda Vario",
  "Yamaha NMAX",
];

const REF_BAWAAN = {
  bidang: BIDANG_BAWAAN,
  akun: AKUN_BAWAAN,
  jenisBbmPopuler: JENIS_BBM_BAWAAN,
  satuan: ["Liter", "Pengisian", "Paket", "Unit"],
};

const RINCIAN_KOSONG = {
  uraian: "",
  volume: "1",
  satuan: "Liter",
  harga_satuan: "",
  pajak: "",
  keterangan: "",
};

const hariIni = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const FORM_AWAL = () => {
  const t = hariIni();
  return {
    akun: AKUN_BAWAAN[0].kode,
    jenis_bbm: "",
    penyedia: "",
    kendaraan: "",
    nomor_polisi: "",
    keperluan: "",
    tanggal_mulai: t,
    tanggal_selesai: t,
    tanggal_bayar: t,
    nomor_spby: "",
    no_bku: "",
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
    if (d && Array.isArray(d.rincian)) return { ...FORM_AWAL(), ...d, lampiran: [] };
  } catch {
    // abaikan jika draf rusak
  }
  return FORM_AWAL();
}

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

const angkaBulat = (v) => Math.max(0, Math.floor(Number(String(v ?? "").replace(/[^\d]/g, "")) || 0));

function hitungLokal(isian) {
  const jenisBbm = String(isian.jenis_bbm || "").trim();
  if (!jenisBbm) throw new Error("Jenis BBM wajib diisi.");

  const penyedia = String(isian.penyedia || "").trim();
  const kendaraan = [String(isian.kendaraan || "").trim(), String(isian.nomor_polisi || "").trim()]
    .filter(Boolean)
    .join(" - ");
  const keperluan = String(isian.keperluan || "").trim();
  const tanggalMulai = isian.tanggal_mulai || hariIni();
  const tanggalSelesai = isian.tanggal_selesai || tanggalMulai;
  if (tanggalSelesai < tanggalMulai) {
    throw new Error("Tanggal batas akhir tidak boleh sebelum tanggal pembelian.");
  }

  const penerimaNama = String(isian.penerima_nama || "").trim();
  if (!penerimaNama) throw new Error("Nama penerima (Kepada) wajib diisi.");

  const daftarRincian = Array.isArray(isian.rincian) && isian.rincian.length ? isian.rincian : [{}];
  const rincian = daftarRincian.map((item, idx) => {
    const uraianDefault =
      idx === 0
        ? `Pembelian BBM ${jenisBbm}${kendaraan ? ` (${kendaraan})` : ""}`
        : `Item BBM ${idx + 1}`;
    const uraian = String(item.uraian || "").trim() || uraianDefault;
    const volume = Math.max(1, angkaBulat(item.volume || 1));
    const satuan = String(item.satuan || "").trim() || "Liter";
    const hargaSatuan = angkaBulat(item.harga_satuan);
    const pajak = angkaBulat(item.pajak);
    const keterangan = String(item.keterangan || "").trim();
    const jumlah = volume * hargaSatuan + pajak;
    return { uraian, volume, satuan, hargaSatuan, pajak, keterangan, jumlah };
  });

  const total = rincian.reduce((a, r) => a + r.jumlah, 0);
  if (total <= 0) {
    throw new Error("Isi harga satuan pada rincian biaya (total harus lebih dari Rp 0).");
  }

  const bagianAkun = String(isian.akun || AKUN_BAWAAN[0].kode).split(".");
  return {
    jenisBbm,
    penyedia,
    kendaraan,
    keperluan,
    kegiatanMak: bagianAkun.length >= 6 ? bagianAkun.slice(3, 6).join(".") : "2158.EBA.994",
    kodeAkun: bagianAkun[bagianAkun.length - 1] || "523121",
    penerima: {
      nama: penerimaNama,
      nip: String(isian.penerima_nip || "").trim(),
      jabatan: String(isian.penerima_jabatan || "").trim(),
    },
    rincian,
    total,
  };
}

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
    const cocok = daftar.filter((item) => item.utama.toLowerCase().includes(k));
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

function InputMobilMotor({ value, onChange, onSelect }) {
  const [terbuka, setTerbuka] = useState(false);
  const [modeSemua, setModeSemua] = useState(false);
  const [kategori, setKategori] = useState(() => {
    const v = String(value || "").toLowerCase();
    if (DAFTAR_MOTOR_INDONESIA.some((m) => m.toLowerCase() === v) || v.startsWith("motor")) {
      return "motor";
    }
    return "mobil";
  });
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

  const daftarKategori = kategori === "motor" ? DAFTAR_MOTOR_INDONESIA : DAFTAR_MOBIL_INDONESIA;

  const tersaring = useMemo(() => {
    const k = String(value || "").trim().toLowerCase();
    if (!k || modeSemua || k === "mobil" || k === "motor") return daftarKategori;
    const cocokAktif = daftarKategori.filter((nama) => nama.toLowerCase().includes(k));
    if (cocokAktif.length) return cocokAktif;
    const daftarLain = kategori === "motor" ? DAFTAR_MOBIL_INDONESIA : DAFTAR_MOTOR_INDONESIA;
    const cocokLain = daftarLain.filter((nama) => nama.toLowerCase().includes(k));
    return cocokLain.length ? cocokLain : daftarKategori;
  }, [value, daftarKategori, kategori, modeSemua]);

  const pilihKategori = (kat) => {
    setKategori(kat);
    setModeSemua(true);
    setTerbuka(true);
  };

  return (
    <div ref={wadahRef} className="block">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="block text-xs font-bold text-slate-600">Jenis Kendaraan</span>
        <div className="inline-flex items-center rounded-lg bg-paper border border-mist p-0.5">
          <button
            type="button"
            onClick={() => pilihKategori("mobil")}
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-extrabold transition-all cursor-pointer ${
              kategori === "mobil"
                ? "bg-brand text-white shadow-2xs"
                : "text-slate-600 hover:text-navy"
            }`}
          >
            Mobil
          </button>
          <button
            type="button"
            onClick={() => pilihKategori("motor")}
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-extrabold transition-all cursor-pointer ${
              kategori === "motor"
                ? "bg-brand text-white shadow-2xs"
                : "text-slate-600 hover:text-navy"
            }`}
          >
            Motor
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="relative">
          <input
            className={kelasInput + " pr-9"}
            value={value}
            onFocus={() => {
              setModeSemua(true);
              setTerbuka(true);
            }}
            onChange={(e) => {
              const val = e.target.value;
              const k = val.trim().toLowerCase();
              if (k === "mobil") {
                setKategori("mobil");
                setModeSemua(true);
              } else if (k === "motor") {
                setKategori("motor");
                setModeSemua(true);
              } else {
                setModeSemua(false);
              }
              setTerbuka(true);
              onChange(val);
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
            {tersaring.map((nama, idx) => {
              const aktif = String(value || "").toLowerCase() === nama.toLowerCase();
              return (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(nama);
                      setTerbuka(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer ${
                      aktif ? "bg-brand/10 text-brand" : "bg-white hover:bg-paper text-navy"
                    }`}
                  >
                    <span className="block text-sm font-bold leading-snug">{nama}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function FormBbm({ operator }) {
  const { id } = useParams();
  const baru = !id || id === "baru";
  const navigate = useNavigate();
  const admin = operator?.peran === "admin";
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
    apiKwitansi({ url: "api/kwitansi/bbm-kepala-biro/referensi" })
      .then((r) => {
        if (r && typeof r === "object") {
          setRef((lama) => ({
            ...lama,
            ...r,
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
    apiKwitansi({ url: `api/kwitansi/bbm-kepala-biro/${id}` })
      .then((b) => {
        setTersimpan(b);
        setBidang(b.bidang);
        setForm({ ...FORM_AWAL(), ...b.isian });
      })
      .catch((e) => {
        const lokal = satuLokal(id);
        if (lokal) {
          setTersimpan(lokal);
          setBidang(lokal.bidang);
          setForm({ ...FORM_AWAL(), ...lokal.isian });
          setGalatMuat("");
        } else {
          setGalatMuat(e.message || "Gagal memuat data BBM Kepala Biro");
        }
      });
  }, [id, baru]);

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
          url: "api/kwitansi/bbm-kepala-biro/hitung",
          method: "POST",
          body: { ...form, lampiran: undefined },
        });
        if (nomor !== urutanHitung.current) return;
        setHasil(h);
        setGalatHitung("");
      } catch {
        if (nomor !== urutanHitung.current) return;
        try {
          const lokal = hitungLokal(form);
          setHasil(lokal);
          setGalatHitung("");
        } catch (errLokal) {
          setHasil(null);
          setGalatHitung(errLokal.message || "Gagal menghitung");
        }
      } finally {
        if (nomor === urutanHitung.current) setMenghitung(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [form]);

  const ubah = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const daftarSaranBbm = useMemo(
    () =>
      (ref?.jenisBbmPopuler || JENIS_BBM_BAWAAN).map((a) => ({
        utama: a.nama,
      })),
    [ref],
  );

  const daftarSaranPegawai = useMemo(
    () =>
      pegawai.map((p) => ({
        utama: p.nama,
      })),
    [pegawai],
  );

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
    setMengunggah(true);
    try {
      const hasilUnggah = [];
      for (const berkas of daftarBerkas.slice(0, 10)) {
        const terkompres = await kompresGambarKeDataUrl(berkas);
        hasilUnggah.push(terkompres);
      }
      setForm((f) => ({
        ...f,
        lampiran: [...(Array.isArray(f.lampiran) ? f.lampiran : []), ...hasilUnggah].slice(0, 10),
      }));
      kabari(`${hasilUnggah.length} bukti pembelian ditambahkan`);
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
      bukaPdfBbmLokal(form);
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
        try {
          await apiKwitansi({
            url: "api/kwitansi/bbm-kepala-biro",
            method: "POST",
            body: { isian: form, bidang },
          });
        } catch (errApi) {
          const hitungan = hasil || hitungLokal(form);
          if (admin && !bidang) throw errApi;
          buatLokal({
            bidang: bidang || operator?.bidang || "TU",
            isian: form,
            hasil: hitungan,
            oleh: operator?.nama || "Operator",
          });
        }
        try {
          localStorage.removeItem(KUNCI_DRAF);
        } catch {
          // abaikan
        }
      } else {
        try {
          await apiKwitansi({
            url: `api/kwitansi/bbm-kepala-biro/${id}`,
            method: "PUT",
            body: { isian: form },
          });
        } catch {
          const hitungan = hasil || hitungLokal(form);
          ubahLokal(id, {
            isian: form,
            hasil: hitungan,
            oleh: operator?.nama || "Operator",
          });
        }
      }
      navigate(jalur("bbm-kepala-biro"));
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
                to={jalur("bbm-kepala-biro")}
                className="p-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 transition-all active:scale-95 shadow-2xs"
                title="Kembali ke daftar BBM Kepala Biro"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold text-navy tracking-tight truncate">
                  {baru ? "BBM Baru" : "Ubah BBM"}
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">
                  {bidang ? `Bidang ${bidang} • ` : ""}Surat Perintah Bayar (SPBY) BBM
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
            {/* ---------- Data BBM & Pembebanan ---------- */}
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
                  <select className={kelasInput} value={form.akun} onChange={(e) => ubah("akun", e.target.value)}>
                    <option value="">— Pilih akun —</option>
                    {(ref?.akun || []).map((a) => (
                      <option key={a.kode} value={a.kode}>
                        {a.kode} — {a.uraian}
                      </option>
                    ))}
                  </select>
                </Medan>

                <Medan
                  label="Jenis BBM"
                  petunjuk="Ketik bebas atau pilih dari daftar jenis BBM"
                >
                  <InputSaranPutih
                    value={form.jenis_bbm}
                    onChange={(v) => ubah("jenis_bbm", v)}
                    onSelect={(v) => ubah("jenis_bbm", v)}
                    daftar={daftarSaranBbm}
                  />
                </Medan>

                <Medan
                  label="SPBU / Penyedia"
                  petunjuk="Ketik bebas atau pilih dari daftar SPBU"
                >
                  <InputSaranPutih
                    value={form.penyedia}
                    onChange={(v) => ubah("penyedia", v)}
                    onSelect={(v) => ubah("penyedia", v)}
                    daftar={PENYEDIA_SPBU_BAWAAN}
                  />
                </Medan>

                <InputMobilMotor
                  value={form.kendaraan}
                  onChange={(v) => ubah("kendaraan", v)}
                  onSelect={(v) => ubah("kendaraan", v)}
                />

                <Medan label="Nomor Polisi">
                  <input
                    className={kelasInput}
                    value={form.nomor_polisi || ""}
                    onChange={(e) => ubah("nomor_polisi", e.target.value)}
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
                        tanggal_selesai: v,
                      }));
                    }}
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
                    Unggah foto/gambar struk SPBU atau kuitansi pembelian BBM untuk dilampirkan ke PDF SPBY.
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
                    Klik untuk memilih foto/gambar struk atau bukti pembelian BBM
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
                      {hasil.jenisBbm}
                      {hasil.kendaraan ? ` (${hasil.kendaraan})` : ""}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      Kepada: {hasil.penyedia || hasil.penerima.nama}
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
                disabled={!hasil || !!galatHitung || membuatPdf}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-navy disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
              >
                {membuatPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Lihat PDF
              </button>
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
