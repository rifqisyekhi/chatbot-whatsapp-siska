// =========================================================
// ABSENSI NON-ASN
// =========================================================
//
// Jembatan antara chatbot SisKA dan backend presensi
// (repo presensi-biro-keuangan-dan-bmn-backend). Bot tidak
// menulis ke koleksi "absensi" secara langsung supaya semua
// validasi, penyimpanan foto, dan aturan "satu absensi per
// hari" tetap dipegang satu tempat: backend.
//
// Isi modul:
//   1. Waktu WIB          — samakan format dengan aplikasi web
//   2. Panggilan API      — today / clock-in / clock-out
//   3. Reverse geocoding  — koordinat menjadi alamat
//   4. Peta OpenStreetMap — thumbnail untuk cap geotag
//   5. Cap geotag         — foto + panel informasi lokasi

// index.js memanggil require("dotenv").config() setelah modul
// ini dimuat, jadi .env harus dibaca sendiri di sini — kalau
// tidak, PRESENSI_API_URL selalu jatuh ke nilai bawaan.
require("dotenv").config();

const axios = require("axios");

// =========================================================
// KONFIGURASI
// =========================================================

const API_URL = (
  process.env.PRESENSI_API_URL || "http://127.0.0.1:5000"
).replace(/\/+$/, "");

// Nominatim dan tile OSM sama-sama mewajibkan User-Agent yang
// bisa diidentifikasi. Tanpa ini permintaan bisa diblokir.
const USER_AGENT =
  process.env.PRESENSI_OSM_UA ||
  "SisKA-Bot/1.0 (Biro Keuangan dan BMN Kemnaker)";

// Peta bisa dimatikan kalau VPS tidak punya akses keluar ke
// tile OSM — cap geotag tetap dibuat, hanya tanpa gambar peta.
const PAKAI_PETA = process.env.PRESENSI_GEOTAG_PETA !== "0";

// Kategori pegawai yang TIDAK boleh memakai menu absensi
// non-ASN. Sengaja daftar-larangan, bukan daftar-izin: saat
// kategori dirombak menjadi ASN / Non-ASN (tenaga ahli,
// outsourcing, magang, dan seterusnya), kategori non-ASN yang
// baru langsung dapat akses tanpa perlu mengubah kode. Cukup
// pastikan kategori ASN-nya terdaftar di sini.
const KATEGORI_ASN = (
  process.env.PRESENSI_KATEGORI_ASN || "Internal,ASN,PNS,PPPK"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ZONA = "Asia/Jakarta";
const ZOOM_PETA = 16;

// Ukuran jendela peta pada cap geotag.
const PETA_W = 240;
const PETA_H = 170;

const TIMEOUT_API = 20000;
const TIMEOUT_GEOCODE = 8000;
const TIMEOUT_TILE = 6000;

// =========================================================
// 0. HAK AKSES MENU
// =========================================================

// Pegawai yang kategorinya belum diisi tetap diberi akses.
// Salah memberi akses ke satu orang jauh lebih ringan
// akibatnya daripada memblokir pegawai non-ASN yang datanya
// kebetulan belum lengkap sehingga tidak bisa absen sama
// sekali.

function bolehAbsenNonASN(pegawai) {
  const kategori = String(pegawai?.kategori_pegawai || "")
    .trim()
    .toLowerCase();

  if (!kategori) return true;

  return !KATEGORI_ASN.includes(kategori);
}

// =========================================================
// 1. WAKTU WIB
// =========================================================

// Bot berjalan di VPS yang jamnya bisa saja UTC, sedangkan
// aplikasi web memakai jam perangkat pegawai (WIB). Supaya
// satu baris absensi tidak berisi jam dari dua zona berbeda,
// semuanya dipaksa ke Asia/Jakarta.

function tanggalHariIni() {
  // en-CA menghasilkan YYYY-MM-DD, format yang dipakai
  // backend sebagai kunci "tanggal".
  return new Date().toLocaleDateString("en-CA", {
    timeZone: ZONA,
  });
}

function jamSekarang() {
  // id-ID menghasilkan "08.15" (titik, bukan titik dua) —
  // sama persis dengan getCurrentTime() di Attendance.jsx,
  // jadi data dari bot dan dari web tampil seragam.
  return new Date().toLocaleTimeString("id-ID", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function tanggalPanjang() {
  return new Date().toLocaleDateString("id-ID", {
    timeZone: ZONA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// =========================================================
// 2. PANGGILAN API BACKEND
// =========================================================

function pesanError(err, bawaan) {
  return err?.response?.data?.message || err?.message || bawaan;
}

async function ambilAbsensiHariIni(no_wa) {
  const tanggal = tanggalHariIni();

  const { data } = await axios.get(
    `${API_URL}/api/absensi/today/${encodeURIComponent(no_wa)}`,
    {
      params: { tanggal },
      timeout: TIMEOUT_API,
    },
  );

  return data;
}

async function kirimClockIn(payload) {
  try {
    const { data } = await axios.post(
      `${API_URL}/api/absensi/clock-in`,
      payload,
      {
        timeout: TIMEOUT_API,
        // Foto base64 membuat body besar; jangan dibatasi
        // oleh default axios.
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      pesan: pesanError(err, "Gagal menyimpan Clock In."),
    };
  }
}

async function kirimClockOut(payload) {
  try {
    const { data } = await axios.put(
      `${API_URL}/api/absensi/clock-out`,
      payload,
      {
        timeout: TIMEOUT_API,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      pesan: pesanError(err, "Gagal menyimpan Clock Out."),
    };
  }
}

// =========================================================
// 3. REVERSE GEOCODING
// =========================================================

// Meniru reverseGeocode() di Attendance.jsx supaya alamat
// yang tersimpan dari bot dan dari web berasal dari sumber
// yang sama.

async function cariAlamat(lat, lng) {
  try {
    const { data } = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          format: "jsonv2",
          lat,
          lon: lng,
          zoom: 18,
          addressdetails: 1,
        },
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        timeout: TIMEOUT_GEOCODE,
      },
    );

    return data?.display_name || "Alamat tidak tersedia";
  } catch (err) {
    console.error(
      "[ABSENSI] Reverse geocoding gagal:",
      err?.message || err,
    );

    return "Alamat tidak tersedia";
  }
}

// =========================================================
// 4. PETA OPENSTREETMAP
// =========================================================

// Koordinat menjadi posisi ubin (tile) pecahan. Bagian bulat
// menentukan ubin mana yang diunduh, bagian pecahan menentukan
// posisi piksel titik di dalam ubin itu.

function koordinatKeTile(lat, lng, z) {
  const n = 2 ** z;

  const x = ((lng + 180) / 360) * n;

  const latRad = (lat * Math.PI) / 180;

  const y =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) /
        Math.PI) /
      2) *
    n;

  return { x, y, n };
}

async function unduhTile(z, x, y) {
  const { data } = await axios.get(
    `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    {
      responseType: "arraybuffer",
      headers: { "User-Agent": USER_AGENT },
      timeout: TIMEOUT_TILE,
    },
  );

  return `data:image/png;base64,${Buffer.from(data).toString("base64")}`;
}

// Mengembalikan potongan HTML berisi mozaik 2x2 ubin yang
// digeser sehingga titik koordinat tepat berada di tengah
// jendela peta. Dua kali dua sudah cukup: titiknya dijamin
// berjarak minimal 128 px dari tepi mozaik, sedangkan setengah
// jendela peta hanya 120 px (PETA_W) dan 85 px (PETA_H).

async function buatPetaHTML(lat, lng) {
  if (!PAKAI_PETA) return null;

  try {
    const { x, y, n } = koordinatKeTile(lat, lng, ZOOM_PETA);

    const xt = Math.floor(x);
    const yt = Math.floor(y);

    const px = (x - xt) * 256;
    const py = (y - yt) * 256;

    // Pilih pasangan ubin yang mengapit titik.
    const x0 = px < 128 ? xt - 1 : xt;
    const y0 = py < 128 ? yt - 1 : yt;

    // Baris ubin di luar rentang berarti titiknya ada di dekat
    // kutub — tidak akan terjadi untuk Indonesia, tapi jangan
    // sampai melempar error.
    if (y0 < 0 || y0 + 1 >= n) return null;

    const daftar = [];

    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        // Bujur membungkus di antimeridian.
        const tx = (((x0 + dx) % n) + n) % n;
        const ty = y0 + dy;

        daftar.push({ dx, dy, tx, ty });
      }
    }

    const gambar = await Promise.all(
      daftar.map((t) => unduhTile(ZOOM_PETA, t.tx, t.ty)),
    );

    // Posisi titik di dalam mozaik 512x512.
    const titikX = (x - x0) * 256;
    const titikY = (y - y0) * 256;

    const geserX = titikX - PETA_W / 2;
    const geserY = titikY - PETA_H / 2;

    const ubinHTML = daftar
      .map(
        (t, i) =>
          `<img src="${gambar[i]}" style="position:absolute;` +
          `left:${t.dx * 256}px;top:${t.dy * 256}px;` +
          `width:256px;height:256px;">`,
      )
      .join("");

    return (
      `<div style="position:absolute;left:${-geserX}px;top:${-geserY}px;` +
      `width:512px;height:512px;">${ubinHTML}</div>`
    );
  } catch (err) {
    console.error(
      "[ABSENSI] Gagal mengambil peta OSM:",
      err?.message || err,
    );

    return null;
  }
}

// =========================================================
// 5. CAP GEOTAG
// =========================================================

function escapeHTML(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Baris pertama alamat Nominatim biasanya nama tempat atau
// nomor jalan — dipakai sebagai judul, sisanya jadi detail.
function pecahAlamat(alamat) {
  const bagian = String(alamat || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!bagian.length) {
    return { judul: "Lokasi tidak dikenali", detail: "" };
  }

  return {
    judul: bagian.slice(0, 2).join(", "),
    detail: bagian.slice(2).join(", "),
  };
}

const LABEL_JENIS = {
  WFO: "WFO — Work From Office",
  WFH: "WFH — Work From Home",
  DINAS: "Dinas Luar",
};

function bangunHTML({
  fotoDataUrl,
  petaHTML,
  lat,
  lng,
  alamat,
  nama,
  jenisAbsen,
  jenisKehadiran,
  tanggalTeks,
  jamTeks,
}) {
  const { judul, detail } = pecahAlamat(alamat);

  const koordinat = `${Number(lat).toFixed(6)}°, ${Number(lng).toFixed(6)}°`;

  const petaIsi = petaHTML
    ? petaHTML +
      // Penanda titik lokasi, tepat di tengah jendela peta.
      `<div style="position:absolute;left:50%;top:50%;width:18px;height:18px;` +
      `margin:-9px 0 0 -9px;border-radius:50%;background:#ef4444;` +
      `border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.25);"></div>`
    : `<div style="position:absolute;inset:0;display:flex;align-items:center;` +
      `justify-content:center;background:#1e293b;color:#94a3b8;` +
      `font-size:13px;text-align:center;padding:10px;">Peta tidak tersedia</div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; background:#000;
         font-family:"DejaVu Sans","Liberation Sans",Arial,sans-serif; }
  #kartu { position:relative; width:1080px; }
  #foto { display:block; width:1080px; height:auto; }
</style></head>
<body>
  <div id="kartu">
    <img id="foto" src="${fotoDataUrl}">

    <div style="position:absolute;left:0;right:0;bottom:0;
                display:flex;gap:18px;align-items:stretch;padding:18px;
                background:linear-gradient(to top,rgba(0,0,0,.92),rgba(0,0,0,.72));
                color:#fff;">

      <div style="position:relative;width:${PETA_W}px;height:${PETA_H}px;
                  flex:0 0 ${PETA_W}px;border-radius:10px;overflow:hidden;
                  border:2px solid rgba(255,255,255,.35);">
        ${petaIsi}
      </div>

      <div style="flex:1;min-width:0;display:flex;flex-direction:column;
                  justify-content:center;gap:7px;">

        <div style="font-size:31px;font-weight:700;line-height:1.25;">
          ${escapeHTML(judul)}
        </div>

        <div style="font-size:19px;line-height:1.4;color:#e2e8f0;">
          ${escapeHTML(detail)}
        </div>

        <div style="font-size:19px;color:#cbd5e1;">
          ${escapeHTML(koordinat)}
        </div>

        <div style="font-size:21px;font-weight:600;">
          ${escapeHTML(tanggalTeks)} &nbsp;·&nbsp; ${escapeHTML(jamTeks)} WIB
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;">
          <span style="background:#2563eb;padding:5px 13px;border-radius:999px;
                       font-size:18px;font-weight:600;">
            ${escapeHTML(jenisAbsen)}
          </span>
          <span style="background:rgba(255,255,255,.16);padding:5px 13px;
                       border-radius:999px;font-size:18px;">
            ${escapeHTML(LABEL_JENIS[jenisKehadiran] || jenisKehadiran)}
          </span>
          <span style="background:rgba(255,255,255,.16);padding:5px 13px;
                       border-radius:999px;font-size:18px;">
            ${escapeHTML(nama)}
          </span>
        </div>
      </div>
    </div>

    <div style="position:absolute;right:18px;top:18px;
                background:rgba(0,0,0,.6);color:#fff;padding:7px 15px;
                border-radius:999px;font-size:17px;letter-spacing:.4px;">
      SisKA · Presensi Non-ASN
    </div>
  </div>
</body></html>`;
}

// Menempelkan panel geotag ke foto dan mengembalikan JPEG
// base64 (tanpa prefix data URL).
//
// Perenderan memakai Chromium yang sudah dipakai
// whatsapp-web.js, jadi tidak ada proses browser kedua yang
// memakan memori VPS. Tab yang dibuka selalu ditutup lagi,
// termasuk ketika terjadi error.

async function buatFotoGeotag({
  browser,
  fotoBase64,
  mimetype,
  lat,
  lng,
  alamat,
  nama,
  jenisAbsen,
  jenisKehadiran,
  tanggalTeks,
  jamTeks,
}) {
  if (!browser) {
    throw new Error("Browser Chromium belum siap.");
  }

  const petaHTML = await buatPetaHTML(lat, lng);

  const html = bangunHTML({
    fotoDataUrl: `data:${mimetype || "image/jpeg"};base64,${fotoBase64}`,
    petaHTML,
    lat,
    lng,
    alamat,
    nama,
    jenisAbsen,
    jenisKehadiran,
    tanggalTeks,
    jamTeks,
  });

  let page = null;

  try {
    page = await browser.newPage();

    await page.setViewport({
      width: 1080,
      height: 1200,
      deviceScaleFactor: 1,
    });

    await page.setContent(html, {
      waitUntil: "load",
      timeout: 30000,
    });

    // setContent menunggu resource selesai, tapi jangan
    // memotret sebelum foto benar-benar punya dimensi —
    // hasilnya bisa berupa kartu setinggi 0 piksel.
    await page.waitForFunction(
      () => {
        const img = document.getElementById("foto");
        return img && img.complete && img.naturalHeight > 0;
      },
      { timeout: 20000 },
    );

    const kartu = await page.$("#kartu");

    if (!kartu) {
      throw new Error("Elemen kartu geotag tidak terbentuk.");
    }

    // Memotret elemen, bukan viewport: tinggi foto mengikuti
    // rasio aslinya dan orientasi EXIF dari kamera ponsel
    // sudah ditangani Chromium.
    const hasil = await kartu.screenshot({
      type: "jpeg",
      quality: 88,
      captureBeyondViewport: true,
    });

    return Buffer.from(hasil).toString("base64");
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error(
          "[ABSENSI] Gagal menutup tab geotag:",
          e?.message || e,
        );
      }
    }
  }
}

module.exports = {
  API_URL,
  LABEL_JENIS,
  KATEGORI_ASN,
  bolehAbsenNonASN,
  tanggalHariIni,
  jamSekarang,
  tanggalPanjang,
  ambilAbsensiHariIni,
  kirimClockIn,
  kirimClockOut,
  cariAlamat,
  buatFotoGeotag,
};
