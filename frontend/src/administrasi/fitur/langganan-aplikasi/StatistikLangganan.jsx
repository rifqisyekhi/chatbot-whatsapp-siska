import { useMemo, useState } from "react";

// =========================================================
// STATISTIK LANGGANAN APLIKASI (MONITORING BENDAHARA / ADMIN)
// =========================================================
//
// Dihitung dari daftar yang sudah dimuat dashboard (tahun & bidang yang
// dipilih), hanya langganan berstatus aktif.

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const rupiah = (n) => "Rp " + Math.floor(Number(n) || 0).toLocaleString("id-ID");

function singkat(n) {
  const v = Number(n) || 0;
  const f = (x) => x.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  if (v >= 1e9) return `${f(v / 1e9)} M`;
  if (v >= 1e6) return `${f(v / 1e6)} jt`;
  if (v >= 1e3) return `${f(v / 1e3)} rb`;
  return String(v);
}

function kelompok(daftar, kunci) {
  const peta = new Map();
  for (const d of daftar) {
    const k = kunci(d);
    const g = peta.get(k) || { kunci: k, total: 0, jumlah: 0, lisensi: 0 };
    g.total += Number(d.total) || 0;
    g.jumlah += 1;
    g.lisensi += Number(d.jumlah_lisensi) || 0;
    peta.set(k, g);
  }
  return [...peta.values()];
}

export default function StatistikLangganan({ daftar, tahun, tampilBidang = true }) {
  const aktif = useMemo(() => daftar.filter((d) => d.status === "aktif"), [daftar]);

  const perBidang = useMemo(() => kelompok(aktif, (d) => d.bidang).sort((a, b) => b.total - a.total), [aktif]);

  const perPeriode = useMemo(
    () => kelompok(aktif, (d) => d.periode || "Bulanan").sort((a, b) => b.total - a.total),
    [aktif],
  );

  const perWaktu = useMemo(() => {
    if (tahun) {
      const g = kelompok(aktif, (d) => Number(String(d.tanggal_bayar).slice(5, 7)) - 1);
      return BULAN.map((label, i) => ({
        label,
        ...(g.find((x) => x.kunci === i) || { total: 0, jumlah: 0, lisensi: 0 }),
      }));
    }
    return kelompok(aktif, (d) => String(d.tanggal_bayar).slice(0, 4))
      .sort((a, b) => a.kunci.localeCompare(b.kunci))
      .map((g) => ({ label: g.kunci, ...g }));
  }, [aktif, tahun]);

  const perAplikasi = useMemo(
    () =>
      kelompok(aktif, (d) => d.nama_aplikasi || "-")
        .sort((a, b) => b.total - a.total || b.jumlah - a.jumlah)
        .slice(0, 6),
    [aktif],
  );

  if (!aktif.length) {
    return (
      <section className="bg-white rounded-3xl border border-mist shadow-2xs p-5 text-sm text-slate-400 font-semibold">
        Statistik muncul setelah ada langganan aplikasi aktif {tahun ? `pada ${tahun}` : ""}.
      </section>
    );
  }

  return (
    <section className="grid lg:grid-cols-2 gap-4">
      {tampilBidang && (
        <Kartu judul="Porsi biaya per bidang" sub="Dari total biaya langganan aktif">
          <Pie
            data={perBidang.map((g) => ({
              label: g.kunci,
              nilai: g.total,
              warna: warnaBidang(g.kunci),
              keterangan: `${g.jumlah} langganan • ${g.lisensi} lisensi`,
            }))}
          />
        </Kartu>
      )}

      <Kartu judul="Menurut periode langganan" sub="Dari total biaya langganan aktif">
        <Pie
          data={perPeriode.map((g, i) => ({
            label: g.kunci,
            nilai: g.total,
            warna: WARNA[i % WARNA.length],
            keterangan: `${g.jumlah} langganan • ${g.lisensi} lisensi`,
          }))}
        />
      </Kartu>

      <Kartu judul={tahun ? `Biaya per bulan (${tahun})` : "Biaya per tahun"} sub="Menurut tanggal pembayaran">
        <Kolom
          data={perWaktu.map((g) => ({
            label: g.label,
            nilai: g.total,
            tip: [
              tahun ? `${g.label} ${tahun}` : g.label,
              rupiah(g.total),
              `${g.jumlah} langganan • ${g.lisensi} lisensi`,
            ],
          }))}
        />
      </Kartu>

      <Kartu judul="Aplikasi biaya terbesar" sub="Enam aplikasi teratas">
        <BatangMendatar
          data={perAplikasi.map((g) => ({
            label: g.kunci,
            nilai: g.total,
            labelNilai: singkat(g.total),
            tip: [g.kunci, `${g.jumlah} langganan • ${g.lisensi} lisensi`, rupiah(g.total)],
          }))}
        />
      </Kartu>
    </section>
  );
}

const WARNA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const URUTAN_BIDANG = ["BMN", "PTUK", "TU", "AKLAP", "PA"];
const warnaBidang = (b) => WARNA[URUTAN_BIDANG.indexOf(b) >= 0 ? URUTAN_BIDANG.indexOf(b) : WARNA.length - 1];

function Pie({ data }) {
  const { tip, tampil, sembunyi } = useTip();
  const isi = data.filter((d) => d.nilai > 0);
  const total = isi.reduce((a, d) => a + d.nilai, 0);
  const R = 70;
  const TEBAL = 26;
  const r = R - TEBAL / 2;
  const KELILING = 2 * Math.PI * r;
  const irisan = isi.reduce((acc, d) => {
    const awal = acc.length ? acc[acc.length - 1].awal + acc[acc.length - 1].panjang : 0;
    return [...acc, { ...d, awal, panjang: total ? (d.nilai / total) * KELILING : 0 }];
  }, []);
  const persen = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const persenTeks = (n) => `${persen(n).toLocaleString("id-ID")}%`;

  return (
    <div className="relative flex flex-col sm:flex-row items-center gap-5" data-wadah-grafik>
      <svg
        viewBox={`0 0 ${2 * R} ${2 * R}`}
        className="w-40 h-40 shrink-0 -rotate-90"
        role="img"
        aria-label={isi.map((d) => `${d.label} ${persenTeks(d.nilai)}`).join(", ")}
      >
        {irisan.map(({ awal, panjang, ...d }) => {
          const celah = isi.length > 1 ? Math.min(2, panjang / 2) : 0;
          return (
            <circle
              key={d.label}
              cx={R}
              cy={R}
              r={r}
              fill="none"
              stroke={d.warna}
              strokeWidth={TEBAL}
              strokeDasharray={`${Math.max(0, panjang - celah)} ${KELILING}`}
              strokeDashoffset={-awal}
              className="cursor-default outline-none"
              tabIndex={0}
              onMouseEnter={(e) => tampil(e, [d.label, `${rupiah(d.nilai)} (${persenTeks(d.nilai)})`, d.keterangan])}
              onFocus={(e) => tampil(e, [d.label, `${rupiah(d.nilai)} (${persenTeks(d.nilai)})`, d.keterangan])}
              onMouseLeave={sembunyi}
              onBlur={sembunyi}
            />
          );
        })}
      </svg>
      <div className="absolute left-0 top-0 w-40 h-40 hidden sm:flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Total</span>
        <span className="text-sm font-black tabular-nums">{singkat(total)}</span>
      </div>
      <ul className="flex-1 w-full space-y-2">
        {data.map((d) => (
          <li key={d.label} className="flex items-start gap-2.5 text-xs">
            <span className="mt-0.5 w-3 h-3 rounded-sm shrink-0" style={{ background: d.warna }} />
            <span className="flex-1 min-w-0">
              <span className="flex justify-between gap-2">
                <span className="font-bold text-navy truncate">{d.label}</span>
                <span className="font-black tabular-nums">{persenTeks(d.nilai)}</span>
              </span>
              <span className="flex justify-between gap-2 text-slate-500">
                <span className="truncate">{d.keterangan}</span>
                <span className="tabular-nums whitespace-nowrap">{rupiah(d.nilai)}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  );
}

function Kartu({ judul, sub, children }) {
  return (
    <div className="bg-white rounded-3xl border border-mist shadow-2xs p-5">
      <h3 className="text-sm font-extrabold">{judul}</h3>
      <p className="text-[11px] text-slate-500 mb-4">{sub}</p>
      {children}
    </div>
  );
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-navy text-white px-3 py-2 text-[11px] shadow-lg whitespace-nowrap"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <p className="font-bold">{tip.baris[0]}</p>
      {tip.baris.slice(1).map((b) => (
        <p key={b} className="text-white/80 tabular-nums">
          {b}
        </p>
      ))}
    </div>
  );
}

function useTip() {
  const [tip, setTip] = useState(null);
  const tampil = (e, baris) => {
    const wadah = e.currentTarget.closest("[data-wadah-grafik]").getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left - wadah.left + r.width / 2, y: r.top - wadah.top, baris });
  };
  return { tip, tampil, sembunyi: () => setTip(null) };
}

function BatangMendatar({ data }) {
  const { tip, tampil, sembunyi } = useTip();
  const maks = Math.max(...data.map((d) => d.nilai), 1);
  return (
    <div className="relative space-y-2" data-wadah-grafik>
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[100px_1fr] items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 truncate" title={d.label}>
            {d.label}
          </span>
          <div
            className="flex items-center gap-2 py-1 cursor-default outline-none"
            tabIndex={0}
            aria-label={d.tip.join(", ")}
            onMouseEnter={(e) => tampil(e, d.tip)}
            onFocus={(e) => tampil(e, d.tip)}
            onMouseLeave={sembunyi}
            onBlur={sembunyi}
          >
            <div className="h-5 rounded-r bg-brand" style={{ width: `${Math.max(1, (d.nilai / maks) * 85)}%` }} />
            <span className="text-[11px] font-bold text-slate-600 tabular-nums whitespace-nowrap">{d.labelNilai}</span>
          </div>
        </div>
      ))}
      <Tooltip tip={tip} />
    </div>
  );
}

function Kolom({ data }) {
  const { tip, tampil, sembunyi } = useTip();
  const maks = Math.max(...data.map((d) => d.nilai), 1);
  const iMaks = data.findIndex((d) => d.nilai === maks);
  const TINGGI = 160;
  return (
    <div className="relative" data-wadah-grafik>
      <div className="relative" style={{ height: TINGGI }}>
        {[0.5, 1].map((t) => (
          <div
            key={t}
            className="absolute inset-x-0 border-t border-dashed border-mist"
            style={{ bottom: TINGGI * t * 0.85 }}
          />
        ))}
        <div className="absolute inset-0 flex items-end gap-1 border-b border-slate-300">
          {data.map((d, i) => (
            <div
              key={d.label}
              className="flex-1 h-full flex flex-col justify-end items-center cursor-default outline-none"
              tabIndex={0}
              aria-label={d.tip.join(", ")}
              onMouseEnter={(e) => tampil(e, d.tip)}
              onFocus={(e) => tampil(e, d.tip)}
              onMouseLeave={sembunyi}
              onBlur={sembunyi}
            >
              {i === iMaks && d.nilai > 0 && (
                <span className="text-[10px] font-bold text-slate-600 tabular-nums mb-1 whitespace-nowrap">
                  {singkat(d.nilai)}
                </span>
              )}
              <div
                className="w-full max-w-6 rounded-t bg-brand"
                style={{ height: d.nilai ? `${Math.max(2, (d.nilai / maks) * 85)}%` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1 mt-1.5">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[10px] text-slate-500">
            {d.label}
          </span>
        ))}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}
