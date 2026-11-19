import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import logoKemnaker from "./assets/logo-kemnaker.png";
import {
  Plus,
  Search,
  FileText,
  FileX2,
  Pencil,
  Ban,
  RotateCcw,
  Trash2,
  LogOut,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plane,
  X,
} from "lucide-react";
import { apiKwitansi, bukaPdf } from "./services/sesiKwitansi";

// =========================================================
// DASHBOARD PERJALANAN DINAS PER BIDANG
// =========================================================
//
// Daftar perjalanan dinas bidang operator yang masuk (admin: semua bidang),
// dengan aksi buka/ubah, PDF, batalkan/pulihkan, dan hapus.

const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : iso || "-";
};
const rentang = (a, b) => (a === b ? tgl(a) : `${tgl(a)} – ${tgl(b)}`);
const hariIni = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const kelasInput =
  "px-3.5 py-2.5 rounded-xl bg-white border border-mist focus:border-brand focus:ring-4 focus:ring-brand/10 outline-none text-sm font-medium transition-all";

export default function KwitansiDashboard({ operator, keluar }) {
  const admin = operator.peran === "admin";
  const tahunIni = Number(hariIni().slice(0, 4));
  const [daftar, setDaftar] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [tahun, setTahun] = useState(String(tahunIni));
  const [status, setStatus] = useState("semua");
  const [cari, setCari] = useState("");
  const [bidang, setBidang] = useState("");
  const [daftarBidang, setDaftarBidang] = useState([]);
  const [batal, setBatal] = useState(null); // baris yang sedang dibatalkan
  const [toast, setToast] = useState(null);

  const kabari = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Spinner hanya saat muat pertama; muat ulang setelah aksi atau ganti
  // saringan memperbarui tabel di tempat.
  const [putaran, setPutaran] = useState(0);
  const muat = useCallback(() => setPutaran((n) => n + 1), []);

  useEffect(() => {
    let usang = false;
    const q = new URLSearchParams();
    if (tahun) q.set("tahun", tahun);
    if (admin && bidang) q.set("bidang", bidang);
    apiKwitansi({ url: `api/kwitansi/perjalanan?${q}` })
      .then((r) => {
        if (usang) return;
        setDaftar(r);
        setGalat("");
      })
      .catch((e) => !usang && setGalat(e.message || "Gagal memuat daftar"))
      .finally(() => !usang && setMemuat(false));
    return () => {
      usang = true;
    };
  }, [tahun, bidang, admin, putaran]);

  useEffect(() => {
    if (admin) apiKwitansi({ url: "api/kwitansi/saya" }).then((r) => setDaftarBidang(r.bidang || [])).catch(() => {});
  }, [admin]);

  const tersaring = useMemo(() => {
    const c = cari.trim().toLowerCase();
    return daftar.filter(
      (d) =>
        (status === "semua" || d.status === status) &&
        (!c || [d.maksud, d.kota_tujuan, d.provinsi, d.nama_peserta].join(" ").toLowerCase().includes(c)),
    );
  }, [daftar, status, cari]);

  const aktif = daftar.filter((d) => d.status === "aktif");
  const ringkas = {
    aktif: aktif.length,
    batal: daftar.length - aktif.length,
    peserta: aktif.reduce((a, d) => a + d.jumlah_peserta, 0),
    total: aktif.reduce((a, d) => a + Number(d.total), 0),
  };

  const pdf = async (d) => {
    try {
      await bukaPdf({ url: `api/kwitansi/perjalanan/${d.id}/pdf` });
    } catch (e) {
      kabari(e.message || "Gagal membuka PDF", "error");
    }
  };

  const suratBatal = async (d) => {
    try {
      await bukaPdf({ url: `api/kwitansi/perjalanan/${d.id}/surat-batal` });
    } catch (e) {
      kabari(e.message || "Gagal membuka surat pembatalan", "error");
    }
  };

  const pulihkan = async (d) => {
    if (d.status !== "dibatalkan" && !window.confirm(`Kembalikan ${d.peserta_batal} peserta yang dibatalkan ke perjalanan ini?`)) return;
    try {
      await apiKwitansi({ url: `api/kwitansi/perjalanan/${d.id}/pulihkan`, method: "POST", body: {} });
      kabari("Perjalanan dinas dipulihkan");
      muat();
    } catch (e) {
      kabari(e.message, "error");
    }
  };

  const hapus = async (d) => {
    if (!window.confirm(`Hapus permanen perjalanan dinas "${d.maksud || d.kota_tujuan}"? Data tidak bisa dikembalikan.`)) return;
    try {
      await apiKwitansi({ url: `api/kwitansi/perjalanan/${d.id}`, method: "DELETE" });
      kabari("Perjalanan dinas dihapus");
      muat();
    } catch (e) {
      kabari(e.message, "error");
    }
  };

  return (
    <div className="min-h-screen bg-paper font-sans text-navy pb-16">
      <header className="bg-white border-b border-mist sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-paper border border-mist hidden sm:flex items-center justify-center p-1.5 shrink-0">
                <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-extrabold text-navy tracking-tight truncate">
                  Perjalanan Dinas {admin ? "— Semua Bidang" : `— Bidang ${operator.bidang}`}
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">
                  {operator.nama} • {admin ? "Admin" : "Operator"}
                </p>
              </div>
            </div>
            <button
              onClick={keluar}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-mist bg-white hover:bg-paper text-slate-600 text-sm font-bold transition-all active:scale-95 shadow-2xs cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4 text-brand" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            ["Perjalanan aktif", ringkas.aktif],
            ["Dibatalkan", ringkas.batal],
            ["Jumlah peserta", ringkas.peserta],
            ["Total biaya", rupiah(ringkas.total)],
          ].map(([l, v]) => (
            <div key={l} className="bg-white rounded-2xl border border-mist shadow-2xs p-4">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{l}</p>
              <p className="text-xl sm:text-2xl font-black tabular-nums mt-1 truncate">{v}</p>
            </div>
          ))}
        </div>

        <section className="bg-white rounded-3xl border border-mist shadow-2xs p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                className={kelasInput + " w-full pl-10"}
                placeholder="Cari kegiatan, tujuan, peserta…"
                value={cari}
                onChange={(e) => setCari(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {admin && (
                <select className={kelasInput} value={bidang} onChange={(e) => setBidang(e.target.value)}>
                  <option value="">Semua bidang</option>
                  {daftarBidang.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              )}
              <select className={kelasInput} value={tahun} onChange={(e) => setTahun(e.target.value)}>
                {[tahunIni + 1, tahunIni, tahunIni - 1].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="">Semua tahun</option>
              </select>
              <select className={kelasInput} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="semua">Semua status</option>
                <option value="aktif">Aktif</option>
                <option value="dibatalkan">Dibatalkan</option>
              </select>
              <Link
                to="/perjalanan-dinas/baru"
                className="inline-flex items-center gap-2 bg-brand hover:bg-navy text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" /> Perjalanan baru
              </Link>
            </div>
          </div>

          {galat && (
            <p className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {galat}
            </p>
          )}

          {memuat ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 text-brand animate-spin" />
            </div>
          ) : !tersaring.length ? (
            <div className="py-16 text-center text-slate-400">
              <Plane className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">
                {daftar.length ? "Tidak ada yang cocok dengan saringan." : "Belum ada perjalanan dinas. Klik \"Perjalanan baru\"."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-mist">
                    {admin && <th className="py-2.5 px-3 font-bold">Bidang</th>}
                    <th className="py-2.5 px-3 font-bold">Kegiatan</th>
                    <th className="py-2.5 px-3 font-bold">Tujuan</th>
                    <th className="py-2.5 px-3 font-bold">Tanggal</th>
                    <th className="py-2.5 px-3 font-bold">Peserta</th>
                    <th className="py-2.5 px-3 font-bold text-right">Total</th>
                    <th className="py-2.5 px-3 font-bold">Status</th>
                    <th className="py-2.5 px-3 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tersaring.map((d) => {
                    const batalkan = d.status === "dibatalkan";
                    return (
                      <tr key={d.id} className={`border-b border-mist/70 align-top ${batalkan ? "bg-slate-50/70 text-slate-400" : ""}`}>
                        {admin && <td className="py-3 px-3 font-bold">{d.bidang}</td>}
                        <td className="py-3 px-3 max-w-[280px]">
                          <p className={`font-semibold line-clamp-2 ${batalkan ? "line-through" : ""}`}>{d.maksud || "(tanpa nama kegiatan)"}</p>
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold">{d.kota_tujuan}</p>
                          <p className="text-[11px] text-slate-500">{d.jenis === "luar" ? d.provinsi : "Dalam kota"}</p>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">{rentang(d.tanggal_berangkat, d.tanggal_kembali)}</td>
                        <td className="py-3 px-3 max-w-[220px]">
                          <p className="font-semibold">{d.jumlah_peserta} orang</p>
                          <p className="text-[11px] text-slate-500 truncate" title={d.nama_peserta}>{d.nama_peserta}</p>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-bold whitespace-nowrap">{rupiah(d.total)}</td>
                        <td className="py-3 px-3">
                          {batalkan ? (
                            <span title={d.alasan_batal}>
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold">Dibatalkan</span>
                              <p className="text-[11px] mt-1 max-w-[160px] truncate">{d.alasan_batal}</p>
                            </span>
                          ) : (
                            <>
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">Aktif</span>
                              {d.peserta_batal > 0 && (
                                <p className="text-[11px] mt-1 font-semibold text-amber-600">{d.peserta_batal} peserta batal</p>
                              )}
                            </>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex justify-end gap-1">
                            <Aksi judul="PDF" onClick={() => pdf(d)} ikon={FileText} />
                            {d.jumlah_pembatalan > 0 && (
                              <Aksi judul="Surat pembatalan" onClick={() => suratBatal(d)} ikon={FileX2} warna="text-amber-700 hover:bg-amber-50" />
                            )}
                            {!batalkan && (
                              <Link to={`/perjalanan-dinas/${d.id}`} title="Buka / ubah" className="p-2 rounded-lg text-slate-600 hover:bg-paper">
                                <Pencil className="w-4 h-4" />
                              </Link>
                            )}
                            {(batalkan || d.peserta_batal > 0) && (
                              <Aksi judul={batalkan ? "Pulihkan" : "Pulihkan peserta batal"} onClick={() => pulihkan(d)} ikon={RotateCcw} />
                            )}
                            {!batalkan && (
                              <Aksi judul="Batalkan" onClick={() => setBatal(d)} ikon={Ban} warna="text-amber-600 hover:bg-amber-50" />
                            )}
                            <Aksi judul="Hapus" onClick={() => hapus(d)} ikon={Trash2} warna="text-rose-500 hover:bg-rose-50" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {batal && (
        <ModalBatal
          baris={batal}
          tutup={() => setBatal(null)}
          selesai={(seluruh) => {
            setBatal(null);
            kabari(seluruh ? "Perjalanan dinas dibatalkan" : "Peserta dibatalkan");
            muat();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border bg-white border-mist text-navy">
          {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 text-green" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
          <span className="text-xs font-bold">{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function Aksi({ judul, onClick, ikon: Ikon, warna = "text-slate-600 hover:bg-paper" }) {
  return (
    <button type="button" title={judul} onClick={onClick} className={`p-2 rounded-lg cursor-pointer ${warna}`}>
      <Ikon className="w-4 h-4" />
    </button>
  );
}

function Label({ children }) {
  return <span className="block text-xs font-bold text-slate-600 mb-1.5">{children}</span>;
}

// Pembatalan per peserta. Semua dicentang = perjalanan dibatalkan
// seluruhnya; sebagian = peserta itu dikeluarkan dari kwitansi dan
// perjalanan tetap aktif. Isian di sini mengisi Surat Pernyataan
// Pembatalan dan (bila ada biaya hangus) Surat Pembebanan Biaya.
function ModalBatal({ baris, tutup, selesai }) {
  const [peserta, setPeserta] = useState(null); // dari isian tersimpan
  const [pilih, setPilih] = useState([]);
  const [biaya, setBiaya] = useState({});
  const [f, setF] = useState({
    alasan: "",
    tanggal: hariIni(),
    nomor_pernyataan: "",
    nomor_surat_tugas: "",
    tanggal_surat_tugas: "",
    uraian_biaya: "transport berupa tiket pesawat",
    sifat_biaya: "seluruhnya",
    dipa: "",
  });
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState("");
  const ubah = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    apiKwitansi({ url: `api/kwitansi/perjalanan/${baris.id}` })
      .then((r) => {
        const daftar = r.isian?.peserta || [];
        setPeserta(daftar);
        setPilih(daftar.length === 1 ? [0] : []);
        const tSpd = r.isian?.tanggal_spd || r.isian?.tanggal_berangkat || "";
        setF((s) => ({ ...s, tanggal_surat_tugas: s.tanggal_surat_tugas || tSpd }));
      })
      .catch((e) => setGalat(e.message || "Gagal memuat peserta"));
    apiKwitansi({ url: "api/kwitansi/referensi" })
      .then((r) => r.dipa && setF((s) => ({ ...s, dipa: s.dipa || r.dipa })))
      .catch(() => {});
  }, [baris.id]);

  const seluruh = peserta && pilih.length === peserta.length;
  const adaBiaya = pilih.some((i) => Number(biaya[i]) > 0);

  const kirim = async () => {
    setProses(true);
    try {
      await apiKwitansi({
        url: `api/kwitansi/perjalanan/${baris.id}/batal`,
        method: "POST",
        body: { ...f, peserta: pilih, biaya },
      });
      selesai(seluruh);
    } catch (e) {
      setGalat(e.message || "Gagal membatalkan");
      setProses(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-navy/40 flex items-center justify-center px-4 py-6" onClick={tutup}>
      <div className="w-full max-w-lg max-h-full overflow-y-auto bg-white rounded-3xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-extrabold">Batalkan perjalanan dinas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {baris.maksud} • {baris.kota_tujuan}
            </p>
          </div>
          <button onClick={tutup} className="p-1.5 rounded-lg hover:bg-paper cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <Label>Peserta yang dibatalkan</Label>
          {!peserta ? (
            <Loader2 className="w-4 h-4 text-brand animate-spin" />
          ) : (
            <div className="space-y-2">
              {peserta.map((p, i) => {
                const dipilih = pilih.includes(i);
                return (
                  <div key={i} className={`rounded-xl border px-3 py-2.5 ${dipilih ? "border-amber-300 bg-amber-50/50" : "border-mist"}`}>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-amber-600 cursor-pointer"
                        checked={dipilih}
                        onChange={(e) => setPilih((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i)))}
                      />
                      <span className="text-sm font-semibold">{p.nama}</span>
                    </label>
                    {dipilih && (
                      <label className="block mt-2 pl-6">
                        <span className="block text-[11px] text-slate-500 mb-1">Biaya terlanjur dibayar & tidak bisa di-refund (kosong = tidak ada)</span>
                        <input
                          inputMode="numeric"
                          className={kelasInput + " w-full"}
                          placeholder="0"
                          value={biaya[i] ? Number(biaya[i]).toLocaleString("id-ID") : ""}
                          onChange={(e) => setBiaya((s) => ({ ...s, [i]: e.target.value.replace(/[^\d]/g, "") }))}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
              {peserta.length > 1 && (
                <p className="text-[11px] text-slate-500">
                  {seluruh
                    ? "Semua peserta dicentang: perjalanan dinas dibatalkan seluruhnya."
                    : "Peserta yang dicentang dikeluarkan dari kwitansi; perjalanan tetap aktif untuk peserta lain."}
                </p>
              )}
            </div>
          )}
        </div>

        <label className="block mb-3">
          <Label>Alasan pembatalan</Label>
          <textarea
            rows={2}
            className={kelasInput + " w-full"}
            placeholder="mis. sakit dan diharuskan rawat inap di rumah sakit"
            value={f.alasan}
            onChange={(e) => ubah("alasan", e.target.value)}
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <Label>Tanggal surat pernyataan</Label>
            <input type="date" className={kelasInput + " w-full"} value={f.tanggal} onChange={(e) => ubah("tanggal", e.target.value)} />
          </label>
          <label className="block">
            <Label>Nomor surat pernyataan</Label>
            <input className={kelasInput + " w-full"} placeholder="kosong = diisi tangan" value={f.nomor_pernyataan} onChange={(e) => ubah("nomor_pernyataan", e.target.value)} />
          </label>
          <label className="block">
            <Label>Nomor surat tugas</Label>
            <input className={kelasInput + " w-full"} value={f.nomor_surat_tugas} onChange={(e) => ubah("nomor_surat_tugas", e.target.value)} />
          </label>
          <label className="block">
            <Label>Tanggal surat tugas</Label>
            <input type="date" className={kelasInput + " w-full"} value={f.tanggal_surat_tugas} onChange={(e) => ubah("tanggal_surat_tugas", e.target.value)} />
          </label>
        </div>

        {adaBiaya && (
          <div className="rounded-2xl bg-paper border border-mist p-3 mb-3 space-y-3">
            <p className="text-[11px] font-bold text-slate-600">Surat Pernyataan Pembebanan Biaya (ditandatangani PPK)</p>
            <label className="block">
              <Label>Biaya yang hangus</Label>
              <input className={kelasInput + " w-full"} value={f.uraian_biaya} onChange={(e) => ubah("uraian_biaya", e.target.value)} />
            </label>
            <div className="grid sm:grid-cols-[1fr_2fr] gap-3">
              <label className="block">
                <Label>Tidak bisa di-refund</Label>
                <select className={kelasInput + " w-full"} value={f.sifat_biaya} onChange={(e) => ubah("sifat_biaya", e.target.value)}>
                  <option value="seluruhnya">Seluruhnya</option>
                  <option value="sebagian">Sebagian</option>
                </select>
              </label>
              <label className="block">
                <Label>Nomor DIPA</Label>
                <input
                  className={kelasInput + " w-full"}
                  placeholder="SP DIPA-026.01.1.450938/2026 tanggal …"
                  value={f.dipa}
                  onChange={(e) => ubah("dipa", e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-400 mb-4">
          Setelah dibatalkan, surat pernyataan bisa dicetak dari tombol surat di daftar. Bisa dipulihkan kembali bila keliru.
        </p>
        {galat && <p className="mb-3 text-xs font-semibold text-rose-600">{galat}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={tutup} className="px-4 py-2.5 rounded-xl border border-mist text-sm font-bold text-slate-600 hover:bg-paper cursor-pointer">
            Tidak
          </button>
          <button
            onClick={kirim}
            disabled={proses || !f.alasan.trim() || !pilih.length}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-sm font-bold cursor-pointer"
          >
            {proses && <Loader2 className="w-4 h-4 animate-spin" />} {seluruh || !peserta || peserta.length < 2 ? "Batalkan" : `Batalkan ${pilih.length} peserta`}
          </button>
        </div>
      </div>
    </div>
  );
}
