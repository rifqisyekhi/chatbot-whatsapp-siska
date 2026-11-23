import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import logoKemnaker from "../assets/logo-kemnaker.png";
import { LogOut, Menu, PanelLeftClose } from "lucide-react";
import { MENU_TU } from "./menu";

// =========================================================
// KERANGKA DASHBOARD TATA USAHA ROKEU (SIDEBAR ALA GAJIHUB)
// =========================================================
//
// Satu modul di VPS (:8005), satu login operator/bendahara. Sidebar navy
// berisi fitur dari ./menu.js; tiap fitur di /tata-usaha/<slug>/.... Meniru AppShell
// GajiHub: pil putih untuk menu aktif, bisa diciutkan jadi rel ikon di
// layar lebar, jadi laci (drawer) di HP, akun & keluar di kaki sidebar.


const labelPeran = (op) =>
  op.peran === "bendahara" ? "Bendahara" : op.peran === "admin" ? "Admin" : `Operator ${op.bidang || ""}`.trim();

const inisial = (nama) =>
  String(nama || "")
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export default function KerangkaTataUsaha({ operator, keluar, children }) {
  const [buka, setBuka] = useState(false); // laci di HP
  const [ciut, setCiut] = useState(false); // rel ikon di layar lebar
  const { pathname } = useLocation();
  const aktif = MENU_TU.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));

  return (
    <div className={`min-h-screen bg-paper md:grid ${ciut ? "md:grid-cols-[68px_1fr]" : "md:grid-cols-[264px_1fr]"}`}>
      {/* Bilah atas HP: hamburger + nama menu aktif. */}
      <div className="md:hidden flex items-center gap-2 border-b border-mist bg-white px-4 py-2.5">
        <button
          type="button"
          aria-label="Buka menu"
          onClick={() => setBuka(true)}
          className="grid w-11 h-11 place-items-center rounded-xl border border-mist bg-paper cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-sm font-extrabold text-navy truncate">{aktif?.label || "Dashboard Tata Usaha"}</span>
      </div>

      {buka && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setBuka(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-navy text-white/70 transition-transform duration-200 ${
          buka ? "translate-x-0" : "-translate-x-full"
        } md:sticky md:top-0 md:h-screen md:translate-x-0 ${ciut ? "md:w-[68px]" : ""}`}
      >
        {/* Kepala: logo selalu tampil; teks hilang saat diciutkan. */}
        <div className={`flex items-center pt-5 pb-3 ${ciut ? "flex-col gap-2 px-2" : "gap-3 px-5"}`}>
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 p-1.5 flex items-center justify-center shrink-0">
            <img src={logoKemnaker} alt="Logo Kemnaker" className="w-full h-full object-contain" />
          </div>
          {!ciut && (
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold leading-tight text-white whitespace-nowrap">
                Tata Usaha <span className="font-semibold text-white/70">Rokeu</span>
              </p>
              <p className="text-[11px] font-semibold text-white/60 truncate">Biro Keuangan dan BMN</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCiut((v) => !v)}
            title={ciut ? "Lebarkan menu samping" : "Ciutkan menu samping"}
            aria-label={ciut ? "Lebarkan menu samping" : "Ciutkan menu samping"}
            className="hidden md:grid w-8 h-8 shrink-0 place-items-center rounded-lg border border-white/15 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <PanelLeftClose className={`w-4 h-4 transition-transform ${ciut ? "rotate-180" : ""}`} />
          </button>
        </div>

        <nav className={`flex-1 overflow-y-auto pt-2 pb-3 ${ciut ? "px-2.5" : "px-3"}`}>
          {!ciut && <p className="px-3.5 pb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Menu</p>}
          {MENU_TU.map((m) => (
            <div key={m.path}>
              {m.pisah && <div className={`border-t border-white/10 ${ciut ? "mx-2 my-2.5" : "my-2"}`} />}
              <NavLink
                to={m.path}
                onClick={() => setBuka(false)}
                title={ciut ? m.label : undefined}
                aria-label={ciut ? m.label : undefined}
                className={({ isActive }) =>
                  `mb-1 flex items-center rounded-xl font-bold transition ${
                    ciut ? "h-11 justify-center" : "gap-3 px-3.5 py-2.5 text-[13.5px]"
                  } ${
                    isActive || aktif === m
                      ? "bg-white text-navy shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                      : "hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <m.Ikon className="w-[19px] h-[19px] shrink-0" />
                {!ciut && m.label}
              </NavLink>
            </div>
          ))}
        </nav>

        {/* Kaki: akun + keluar. */}
        <div className={`border-t border-white/10 ${ciut ? "p-2.5" : "p-3.5"}`}>
          <div className={`flex items-center ${ciut ? "flex-col gap-2" : "gap-3"}`}>
            <div
              className="w-10 h-10 rounded-full bg-brand text-white text-sm font-black flex items-center justify-center shrink-0"
              title={ciut ? `${operator.nama} • ${labelPeran(operator)}` : undefined}
            >
              {inisial(operator.nama) || "?"}
            </div>
            {!ciut && (
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white truncate" title={operator.nama}>{operator.nama}</p>
                <p className="text-[11px] text-white/60 truncate">{labelPeran(operator)}</p>
              </div>
            )}
            <button
              type="button"
              onClick={keluar}
              title="Keluar"
              aria-label="Keluar"
              className="grid w-9 h-9 place-items-center rounded-lg border border-white/15 hover:bg-white/10 hover:text-white cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
