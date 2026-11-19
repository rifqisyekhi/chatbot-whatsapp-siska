import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiTU } from "./services/ApiTU";
import { apiKwitansi, bukaPdf } from "./services/sesiKwitansi";
import logoKemnaker from "./assets/logo-kemnaker.png";
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
} from "lucide-react";

// =========================================================
// FORM PERJALANAN DINAS (BARU / UBAH)
// =========================================================
//
// Operator mengisi data kegiatan dan peserta; server menghitung uang
// harian, representasi, penginapan, dan transport menurut PMK 32/2025,
// lalu membuat PDF (SPBY, kwitansi, rincian, SPD, pengeluaran riil per
// peserta + nominatif). "Simpan" mencatatnya ke daftar bidang di
// dashboard. Form baru yang belum disimpan diingat di browser sebagai draf.

const KUNCI_DRAF = "kwitansi-perdin-draf";

const PESERTA_KOSONG = {
  nama: "", nip: "", jabatan: "", golongan: "", tingkat: "es4", menginap: false, luar_biro: false, unit: "",
  tiket: "", malam: "", tarif_hotel: "", taksi_asal: "", taksi_tujuan: "", transport: "", transport_darat: "",
};

const hariIni = () => new Date().toISOString().slice(0, 10);

const FORM_AWAL = () => ({
  jenis: "dalam",
  sampai_8_jam: false,
  akun: "",
  maksud: "",
  tempat: "",
  provinsi: "",
  kota_tujuan: "",
  alat_angkut: "",
  tanggal_spd: hariIni(),
  tanggal_berangkat: hariIni(),
  tanggal_kembali: hariIni(),
  nomor_spd: "",
  no_bku: "",
  peserta: [{ ...PESERTA_KOSONG }],
});

function bacaDraf() {
  try {
    const d = JSON.parse(localStorage.getItem(KUNCI_DRAF) || "null");
    if (d && Array.isArray(d.peserta)) return { ...FORM_AWAL(), ...d };
  } catch {
    // draf rusak atau storage diblokir — mulai dari form kosong
  }
  return FORM_AWAL();
}

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");

const kelasInput =
  "w-full px-3.5 py-2.5 rounded-xl bg-paper/60 hover:bg-paper focus:bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

function Medan({ label, children, petunjuk, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-bold text-slate-600 mb-1.5">{label}</span>
      {children}
      {petunjuk && <span className="block text-[11px] text-slate-400 mt-1">{petunjuk}</span>}
    </label>
  );
}

// Isian rupiah: hanya angka, ditampilkan berpemisah ribuan.
function InputRupiah({ value, onChange, placeholder }) {
  const tampil = value === "" || value === undefined ? "" : Number(value).toLocaleString("id-ID");
  return (
    <input
      inputMode="numeric"
      className={kelasInput + " tabular-nums"}
      value={tampil}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
    />
  );
}

export default function KwitansiPerdin({ operator }) {
  const { id } = useParams();
  const baru = !id || id === "baru";
  const navigate = useNavigate();
  const admin = operator?.peran === "admin";
  const [ref, setRef] = useState(null);
  const [pegawai, setPegawai] = useState([]);
  const [galatMuat, setGalatMuat] = useState("");
  const [form, setForm] = useState(() => (baru ? bacaDraf() : FORM_AWAL()));
  const [tersimpan, setTersimpan] = useState(null); // baris DB yang sedang diubah
  const [bidang, setBidang] = useState(operator?.bidang || "");
  const [menyimpan, setMenyimpan] = useState(false);
  const [hasil, setHasil] = useState(null);
  const [galatHitung, setGalatHitung] = useState("");
  const [menghitung, setMenghitung] = useState(false);
  const [membuatPdf, setMembuatPdf] = useState(false);
  const [toast, setToast] = useState(null);
  const urutanHitung = useRef(0);

  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    Promise.all([apiTU({ url: "api/kwitansi/referensi" }), apiTU({ url: "api/pegawai" }).catch(() => [])])
      .then(([r, p]) => {
        setRef(r);
        setPegawai(Array.isArray(p) ? p : []);
        // Form baru belum punya akun: pilih akun pertama yang sesuai jenis.
        setForm((f) => (f.akun ? f : { ...f, akun: r.akun.find((a) => a.jenis === f.jenis)?.kode || "" }));
      })
      .catch((e) => setGalatMuat(e.message || "Gagal memuat data referensi"));
  }, []);

  // Membuka perjalanan dinas tersimpan untuk diubah.
  useEffect(() => {
    if (baru) return;
    apiKwitansi({ url: `api/kwitansi/perjalanan/${id}` })
      .then((b) => {
        setTersimpan(b);
        setBidang(b.bidang);
        setForm({ ...FORM_AWAL(), ...b.isian });
      })
      .catch((e) => setGalatMuat(e.message || "Gagal memuat perjalanan dinas"));
  }, [id, baru]);

  // Simpan draf setiap isian berubah (hanya form baru).
  useEffect(() => {
    if (!baru) return;
    try {
      localStorage.setItem(KUNCI_DRAF, JSON.stringify(form));
    } catch {
      // storage tidak tersedia — draf tidak diingat, form tetap jalan
    }
  }, [form, baru]);

  // Pratinjau dihitung server (satu sumber aturan PMK), ditunda sebentar
  // supaya tidak memanggil API setiap ketukan.
  useEffect(() => {
    if (!ref) return;
    const nomor = ++urutanHitung.current;
    const t = setTimeout(async () => {
      setMenghitung(true);
      try {
        const h = await apiKwitansi({ url: "api/kwitansi/hitung", method: "POST", body: form });
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
    }, 350);
    return () => clearTimeout(t);
  }, [form, ref]);

  const ubah = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ubahPeserta = (i, k, v) =>
    setForm((f) => ({ ...f, peserta: f.peserta.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));

  // Memilih nama dari daftar pegawai mengisi NIP dan jabatan otomatis.
  const pilihNama = (i, nama) => {
    const peg = pegawai.find((p) => p.nama === nama);
    setForm((f) => ({
      ...f,
      peserta: f.peserta.map((p, j) =>
        j === i ? { ...p, nama, ...(peg ? { nip: String(peg.nip || "").replace(/\s+/g, ""), jabatan: peg.jabatan || "" } : {}) } : p,
      ),
    }));
  };

  // "dalam8" = dalam kota s.d. 8 jam: jenis tetap "dalam", tanpa uang harian.
  const gantiJenis = (pilihan) => {
    const jenis = pilihan === "luar" ? "luar" : "dalam";
    setForm((f) => {
      const akunCocok = ref?.akun.find((a) => a.kode === f.akun)?.jenis === jenis;
      return {
        ...f,
        jenis,
        sampai_8_jam: pilihan === "dalam8",
        akun: akunCocok ? f.akun : ref?.akun.find((a) => a.jenis === jenis)?.kode || "",
      };
    });
  };
  const pilihanJenis = form.jenis === "luar" ? "luar" : form.sampai_8_jam ? "dalam8" : "dalam";

  const akunTersedia = useMemo(() => (ref?.akun || []).filter((a) => a.jenis === form.jenis), [ref, form.jenis]);
  const provinsiDipilih = ref?.provinsi.find((p) => p.nama === form.provinsi);
  const kotaPmk = ref?.kotaTujuan?.[form.provinsi] || [];
  // Rute PMK hasil hitungan server untuk kota yang diketik (lihat kwitansiTransportDarat.js).
  const rute = hasil?.rute || null;
  const sekitar = rute?.jenis === "sekitar";
  // Alat angkut yang berlaku (hasil server, termasuk pilihan "otomatis")
  // dan nilai bawaan isian biaya per peserta.
  const alat = ref?.alatAngkut?.find((a) => a.kode === hasil?.alatAngkut?.kode);
  const bawaan = hasil?.bawaan || null;
  // PMK II.16: transport ke/dari bandara/stasiun/terminal, jenis
  // kendaraannya bebas (taksi, taksi/ojek online mobil, bus bandara).
  const simpul = (hasil?.alatAngkut?.simpul || "Bandara").toLowerCase();
  const petunjukKota = !form.kota_tujuan
    ? undefined
    : !rute
      ? "Belum ada di tabel PMK — transport darat diisi riil bila ada"
      : rute.jenis === "ibukota"
        ? "Ibu kota provinsi — tanpa transport darat"
        : `Transport darat PMK ${rute.asal} → ${rute.tujuan}: ${rupiah(rute.tarif)} sekali jalan${sekitar ? " (lumpsum, ganti tiket & transport bandara)" : ""}`;
  const luar = form.jenis === "luar";

  const buatPdf = async () => {
    setMembuatPdf(true);
    try {
      await bukaPdf({ url: "api/kwitansi/pdf", method: "POST", body: form });
      kabari("PDF kwitansi dibuat");
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
        await apiKwitansi({ url: "api/kwitansi/perjalanan", method: "POST", body: { isian: form, bidang } });
        try {
          localStorage.removeItem(KUNCI_DRAF);
        } catch {
          // abaikan
        }
      } else {
        await apiKwitansi({ url: `api/kwitansi/perjalanan/${id}`, method: "PUT", body: { isian: form } });
      }
      navigate("/admin/kwitansi");
    } catch (e) {
      kabari(e.message || "Gagal menyimpan", "error");
      setMenyimpan(false);
    }
  };

  const ulangi = () => {
    setForm(FORM_AWAL());
    gantiJenis("dalam");
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                to="/admin/kwitansi"
                className="p-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 transition-all active:scale-95 shadow-2xs"
                title="Kembali ke daftar perjalanan dinas"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="w-11 h-11 rounded-2xl bg-paper border border-mist hidden sm:flex items-center justify-center p-1.5 shrink-0">
                <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold text-navy tracking-tight truncate">
                  {baru ? "Perjalanan Dinas Baru" : "Ubah Perjalanan Dinas"}
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">
                  {bidang ? `Bidang ${bidang} • ` : ""}Tarif {ref?.sumber || "PMK 32/2025"}
                </p>
              </div>
            </div>
            {baru && <button
              onClick={ulangi}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 text-sm font-bold transition-all active:scale-95 shadow-2xs cursor-pointer shrink-0"
              title="Kosongkan form"
            >
              <RotateCcw className="w-4 h-4 text-brand" />
              <span className="hidden sm:inline">Kosongkan</span>
            </button>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {galatMuat && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {galatMuat}
          </div>
        )}

        <div className="mb-6 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
          Tahap uji coba: daftar akun masih contoh (menunggu POK/DIPA).
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            {/* ---------- Kegiatan ---------- */}
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6">
              <h2 className="text-base font-extrabold mb-4">Data Kegiatan</h2>

              <div className="inline-flex flex-wrap p-1.5 bg-paper border border-mist rounded-2xl mb-2">
                {[
                  ["dalam", "Dalam Kota (> 8 jam)"],
                  ["dalam8", "Dalam Kota (s.d. 8 jam)"],
                  ["luar", "Luar Kota"],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => gantiJenis(k)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                      pilihanJenis === k ? "bg-brand text-white shadow" : "text-slate-600 hover:text-navy"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mb-5">
                {pilihanJenis === "dalam8"
                  ? "Tanpa uang harian, hanya transport. PDF menyertakan Form Bukti Kehadiran untuk ditandatangani pejabat di tempat tujuan."
                  : pilihanJenis === "dalam"
                    ? "Uang harian dalam kota + transport."
                    : "Uang harian, penginapan, tiket, dan transport menurut PMK."}
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {admin && (
                  <Medan label="Bidang" className="sm:col-span-2" petunjuk={baru ? undefined : "Bidang tidak bisa diubah setelah disimpan"}>
                    <select className={kelasInput} value={bidang} disabled={!baru} onChange={(e) => setBidang(e.target.value)}>
                      <option value="">— Pilih bidang —</option>
                      {(ref?.bidang || []).map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </Medan>
                )}
                <Medan label="Akun" className="sm:col-span-2">
                  <select className={kelasInput} value={form.akun} onChange={(e) => ubah("akun", e.target.value)}>
                    <option value="">— Pilih akun —</option>
                    {akunTersedia.map((a) => (
                      <option key={a.kode} value={a.kode}>
                        {a.kode} — {a.uraian}
                      </option>
                    ))}
                  </select>
                </Medan>

                <Medan label="Dalam rangka" className="sm:col-span-2">
                  <textarea
                    rows={2}
                    className={kelasInput}
                    value={form.maksud}
                    onChange={(e) => ubah("maksud", e.target.value)}
                  />
                </Medan>

                <Medan label="Tempat kegiatan">
                  <input className={kelasInput} value={form.tempat} onChange={(e) => ubah("tempat", e.target.value)} />
                </Medan>

                {luar ? (
                  <>
                    <Medan label="Provinsi tujuan" petunjuk="Menentukan tarif uang harian, hotel, dan transport bandara/stasiun">
                      <select
                        className={kelasInput}
                        value={form.provinsi}
                        // Ganti provinsi = kota lama tidak berlaku lagi.
                        onChange={(e) => setForm((f) => ({ ...f, provinsi: e.target.value, kota_tujuan: e.target.value === f.provinsi ? f.kota_tujuan : "" }))}
                      >
                        <option value="">— Pilih provinsi —</option>
                        {(ref?.provinsi || []).map((p) => (
                          <option key={p.nama} value={p.nama}>{p.nama}</option>
                        ))}
                      </select>
                    </Medan>
                    <Medan label="Kota / kabupaten tujuan" petunjuk={petunjukKota}>
                      <input
                        list="daftar-kota-pmk"
                        className={`${kelasInput} disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed`}
                        value={form.kota_tujuan}
                        disabled={!form.provinsi}
                        placeholder={form.provinsi ? "" : "Pilih provinsi dulu"}
                        onChange={(e) => ubah("kota_tujuan", e.target.value)}
                      />
                      <datalist id="daftar-kota-pmk">
                        {kotaPmk.map((k) => (
                          <option key={k.nama} value={k.nama}>
                            {k.tarif ? `${k.keterangan} • ${rupiah(k.tarif)}` : k.keterangan}
                          </option>
                        ))}
                      </datalist>
                    </Medan>
                    <Medan
                      label="Transportasi"
                      className="sm:col-span-2"
                      petunjuk={
                        alat?.kode === "dinas"
                          ? "Tanpa tiket dan transport bandara — BBM, tol, dan parkir diisi riil per peserta"
                          : undefined
                      }
                    >
                      <select className={kelasInput} value={form.alat_angkut} onChange={(e) => ubah("alat_angkut", e.target.value)}>
                        <option value="">Otomatis ({sekitar ? "kendaraan umum" : "pesawat"})</option>
                        {(ref?.alatAngkut || []).map((a) => (
                          <option key={a.kode} value={a.kode}>{a.label}</option>
                        ))}
                      </select>
                    </Medan>
                  </>
                ) : (
                  <Medan label="Tujuan">
                    <input className={kelasInput + " text-slate-400"} value="Jakarta (dalam kota)" disabled />
                  </Medan>
                )}

                <Medan label="Tanggal berangkat">
                  <input
                    type="date"
                    className={kelasInput}
                    value={form.tanggal_berangkat}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({
                        ...f,
                        tanggal_berangkat: v,
                        tanggal_kembali: !f.tanggal_kembali || f.tanggal_kembali < v ? v : f.tanggal_kembali,
                      }));
                    }}
                  />
                </Medan>
                <Medan label="Tanggal kembali" petunjuk={hasil ? `Lama: ${hasil.hari} hari` : undefined}>
                  <input
                    type="date"
                    className={kelasInput}
                    value={form.tanggal_kembali}
                    min={form.tanggal_berangkat}
                    onChange={(e) => ubah("tanggal_kembali", e.target.value)}
                  />
                </Medan>
                <Medan label="Tanggal SPD">
                  <input type="date" className={kelasInput} value={form.tanggal_spd} onChange={(e) => ubah("tanggal_spd", e.target.value)} />
                </Medan>
                <Medan label="Nomor SPD" petunjuk="Boleh dikosongkan">
                  <input className={kelasInput} value={form.nomor_spd} onChange={(e) => ubah("nomor_spd", e.target.value)} />
                </Medan>
                <Medan label="No. BKU" petunjuk="Boleh dikosongkan">
                  <input className={kelasInput} value={form.no_bku} onChange={(e) => ubah("no_bku", e.target.value)} />
                </Medan>
              </div>
            </section>

            {/* ---------- Peserta ---------- */}
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4 gap-3">
                <h2 className="text-base font-extrabold">Peserta ({form.peserta.length})</h2>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, peserta: [...f.peserta, { ...PESERTA_KOSONG, luar_biro: true }] }))}
                    className="inline-flex items-center gap-2 border-2 border-brand text-brand hover:bg-brand hover:text-white px-3.5 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer"
                    title="Peserta dari luar Biro Keuangan dan BMN — semua data diisi manual"
                  >
                    <Plus className="w-4 h-4" /> Peserta External
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, peserta: [...f.peserta, { ...PESERTA_KOSONG }] }))}
                    className="inline-flex items-center gap-2 bg-brand hover:bg-navy text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Tambah peserta
                  </button>
                </div>
              </div>

              <datalist id="daftar-pegawai">
                {pegawai.map((p) => (
                  <option key={p._id || p.nip || p.nama} value={p.nama} />
                ))}
              </datalist>

              <div className="space-y-4">
                {form.peserta.map((p, i) => {
                  const tingkat = ref?.tingkat.find((t) => t.kode === p.tingkat);
                  const hotelPmk = provinsiDipilih?.hotel[p.tingkat];
                  const taksiJkt = ref?.provinsi.find((x) => x.nama === ref.provinsiAsal)?.taksi;
                  return (
                    <div key={i} className="rounded-2xl border border-mist p-4 bg-paper/30">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black text-brand">
                          PESERTA {i + 1}
                          {p.luar_biro && (
                            <span className="ml-2 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold align-middle">
                              EXTERNAL • isi manual
                            </span>
                          )}
                        </span>
                        {form.peserta.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, peserta: f.peserta.filter((_, j) => j !== i) }))}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="Hapus peserta"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3">
                        {p.luar_biro ? (
                          <Medan label="Nama lengkap">
                            <input className={kelasInput} value={p.nama} onChange={(e) => ubahPeserta(i, "nama", e.target.value)} />
                          </Medan>
                        ) : (
                          <Medan label="Nama" petunjuk="Ketik untuk mencari dari data pegawai">
                            <input
                              list="daftar-pegawai"
                              className={kelasInput}
                              value={p.nama}
                              onChange={(e) => pilihNama(i, e.target.value)}
                            />
                          </Medan>
                        )}
                        <Medan label="NIP">
                          <input className={kelasInput} value={p.nip} onChange={(e) => ubahPeserta(i, "nip", e.target.value.replace(/\s+/g, ""))} />
                        </Medan>
                        <Medan label="Jabatan" className={p.luar_biro ? "" : "sm:col-span-2"}>
                          <input className={kelasInput} value={p.jabatan} onChange={(e) => ubahPeserta(i, "jabatan", e.target.value)} />
                        </Medan>
                        {p.luar_biro && (
                          <Medan label="Unit kerja / instansi">
                            <input className={kelasInput} value={p.unit} onChange={(e) => ubahPeserta(i, "unit", e.target.value)} />
                          </Medan>
                        )}
                        <Medan label="Pangkat / golongan" petunjuk='Contoh: "Penata (III/c)"'>
                          <input className={kelasInput} value={p.golongan} onChange={(e) => ubahPeserta(i, "golongan", e.target.value)} />
                        </Medan>
                        <Medan
                          label="Tingkat (tarif hotel & representasi)"
                          petunjuk={tingkat?.representasi ? "Dapat uang representasi" : undefined}
                        >
                          <select className={kelasInput} value={p.tingkat} onChange={(e) => ubahPeserta(i, "tingkat", e.target.value)}>
                            {(ref?.tingkat || []).map((t) => (
                              <option key={t.kode} value={t.kode}>{t.label}</option>
                            ))}
                          </select>
                        </Medan>

                        {luar ? (
                          <>
                            <Medan
                              label={alat?.isianTiket || "Tiket PP (riil)"}
                              petunjuk={sekitar && alat?.kode !== "dinas" ? "Ke kota sekitar Jakarta biasanya cukup transport darat" : undefined}
                            >
                              <InputRupiah value={p.tiket} onChange={(v) => ubahPeserta(i, "tiket", v)} placeholder="0" />
                            </Medan>
                            <Medan
                              label="Transport darat PP"
                              petunjuk={
                                bawaan?.darat
                                  ? `PMK 2 × ${rupiah(rute.tarif)} — kosong = tarif PMK, 0 = tidak dipakai`
                                  : rute?.tarif
                                    ? `Tarif PMK ${rupiah(2 * rute.tarif)} PP — tidak otomatis untuk transportasi ini`
                                    : "Kosong = tidak ada; isi riil bila ada"
                              }
                            >
                              <InputRupiah
                                value={p.transport_darat}
                                onChange={(v) => ubahPeserta(i, "transport_darat", v)}
                                placeholder={(bawaan?.darat || 0).toLocaleString("id-ID")}
                              />
                            </Medan>
                            <label className="sm:col-span-2 flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-mist bg-white cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-brand cursor-pointer"
                                checked={p.menginap !== false}
                                onChange={(e) => ubahPeserta(i, "menginap", e.target.checked)}
                              />
                              <span className="text-sm font-bold">Menginap (ada biaya penginapan)</span>
                              <span className="text-[11px] text-slate-400 ml-auto hidden sm:inline">
                                {p.menginap !== false ? "Isi jumlah malam dan tarif hotel" : "Centang bila menginap"}
                              </span>
                            </label>
                            {p.menginap !== false && (
                              <>
                                <Medan label="Jumlah malam menginap" petunjuk="Kosong = lama hari − 1">
                                  <input
                                    inputMode="numeric"
                                    className={kelasInput}
                                    value={p.malam}
                                    placeholder={hasil ? String(Math.max(0, hasil.hari - 1)) : ""}
                                    onChange={(e) => ubahPeserta(i, "malam", e.target.value.replace(/[^\d]/g, ""))}
                                  />
                                </Medan>
                                <Medan label="Tarif hotel per malam" petunjuk={hotelPmk ? `Batas PMK ${rupiah(hotelPmk)} — kosong = pakai batas` : "Pilih provinsi dulu"}>
                                  <InputRupiah
                                    value={p.tarif_hotel}
                                    onChange={(v) => ubahPeserta(i, "tarif_hotel", v)}
                                    placeholder={hotelPmk ? hotelPmk.toLocaleString("id-ID") : ""}
                                  />
                                </Medan>
                              </>
                            )}
                            <Medan
                              label={`Transport ${simpul} Jakarta PP`}
                              petunjuk={
                                bawaan && !bawaan.taksiAsal
                                  ? "Tidak otomatis untuk transportasi/tujuan ini"
                                  : taksiJkt
                                    ? `Lumpsum PMK 2 × ${rupiah(taksiJkt)} — taksi, online, atau bus ${simpul}`
                                    : undefined
                              }
                            >
                              <InputRupiah
                                value={p.taksi_asal}
                                onChange={(v) => ubahPeserta(i, "taksi_asal", v)}
                                placeholder={bawaan ? bawaan.taksiAsal.toLocaleString("id-ID") : taksiJkt ? (2 * taksiJkt).toLocaleString("id-ID") : ""}
                              />
                            </Medan>
                            <Medan
                              label={`Transport ${simpul} kota tujuan PP`}
                              petunjuk={
                                bawaan && !bawaan.taksiTujuan && provinsiDipilih?.taksi
                                  ? "Tidak otomatis untuk transportasi/tujuan ini"
                                  : provinsiDipilih
                                  ? provinsiDipilih.taksi
                                    ? `Lumpsum PMK 2 × ${rupiah(provinsiDipilih.taksi)}`
                                    : "Belum ada di tabel PMK — isi riil"
                                  : undefined
                              }
                            >
                              <InputRupiah
                                value={p.taksi_tujuan}
                                onChange={(v) => ubahPeserta(i, "taksi_tujuan", v)}
                                placeholder={bawaan ? bawaan.taksiTujuan.toLocaleString("id-ID") : "0"}
                              />
                            </Medan>
                          </>
                        ) : (
                          <Medan label="Transport PP per hari" petunjuk="Kosong = tarif PMK; isi 0 bila memakai kendaraan dinas">
                            <InputRupiah
                              value={p.transport}
                              onChange={(v) => ubahPeserta(i, "transport", v)}
                              placeholder={(ref?.transporDalamKota || 0).toLocaleString("id-ID")}
                            />
                          </Medan>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ---------- Pratinjau ---------- */}
          <aside className="lg:sticky lg:top-28 space-y-4">
            <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-extrabold flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-brand" /> Rincian
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
                  {hasil.peserta.map((p, i) => (
                    <div key={i} className="border-b border-mist pb-3 last:border-0">
                      <p className="text-sm font-bold truncate">{i + 1}. {p.nama}</p>
                      <table className="w-full text-xs mt-1.5">
                        <tbody>
                          {p.rincian.map((r, j) => (
                            <tr key={j}>
                              <td className="py-0.5 text-slate-500">
                                {r.uraian}
                                {r.keterangan ? ` (${r.keterangan})` : ""}
                                {r.satuan !== "PP" && ` ${r.volume}×${r.tarif.toLocaleString("id-ID")}`}
                              </td>
                              <td className="py-0.5 text-right tabular-nums font-semibold whitespace-nowrap">
                                {r.jumlah.toLocaleString("id-ID")}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td className="pt-1 font-bold">Jumlah</td>
                            <td className="pt-1 text-right tabular-nums font-black">{rupiah(p.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-paper rounded-2xl px-4 py-3">
                    <span className="text-sm font-bold">Total</span>
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
                disabled={!hasil || !!galatHitung || menyimpan || (admin && !bidang) || tersimpan?.status === "dibatalkan"}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 border-2 border-brand text-brand hover:bg-brand hover:text-white disabled:border-slate-300 disabled:text-slate-400 disabled:bg-transparent disabled:cursor-not-allowed px-5 py-2.5 rounded-2xl font-bold text-sm transition-all active:scale-95 cursor-pointer"
              >
                {menyimpan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {baru ? "Simpan ke daftar" : "Simpan perubahan"}
              </button>
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                SPBY, kwitansi, rincian, SPD, pengeluaran riil per peserta + nominatif
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
