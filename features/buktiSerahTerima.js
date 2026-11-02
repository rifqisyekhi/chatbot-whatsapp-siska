// =========================================================
// BUKTI SERAH TERIMA UNTUK BARIS REKAP MUTASI
// =========================================================
//
// Surat serah terima (features/pdf_generator.js) dibuat saat tim
// gudang menjawab "ya", jadi sesudah baris mutasi "keluar" dicatat
// waktu atasan menyetujui. Tabel mutasi tidak menyimpan path PDF-nya,
// dan baris riwayat hasil impor log pun tidak mungkin punya. Jadi
// pasangannya dicari dari berkas yang ada:
//
//   1. reports/barang/<nama pemohon>/Serah_Terima_Barang_*_YYYYMMDD-HHMM.pdf
//      (sejak 29 September 2026), lewat cap waktu di namanya.
//   2. reports/Serah_Terima_Barang_<bidang>_YYYY-MM-DD.pdf, berkas
//      lama yang ditaruh datar dan tanpa nama pemohon. Dicocokkan
//      lewat unit dan waktu ubah berkasnya.
//
// Berkas yang dipilih adalah yang PERTAMA dibuat sejak order ini
// disetujui dan sebelum order WA berikutnya dari orang yang sama.
// Order yang dibatalkan gudang tidak pernah punya PDF, dan batas
// itu mencegahnya meminjam PDF order sesudahnya.
//
// Berkas datar lama tidak memuat nama, dan order kedua unit yang
// sama di hari yang sama menimpanya. Jadi berkas datar hanya
// diakui milik order TERAKHIR unit itu sebelum berkasnya ditulis;
// order sebelumnya dilaporkan tanpa bukti alih-alih ditunjukkan
// surat milik orang lain.

const fs = require("fs");
const path = require("path");
const penyimpanan = require("./penyimpananLaporan");

const AWALAN = "Serah_Terima_Barang_";
const TOLERANSI_MS = 2 * 60 * 1000; // cap waktu berkas hanya sampai menit
const BATAS_MAKS_MS = 14 * 24 * 60 * 60 * 1000;

// "20261029-1435" (WIB) → Date.
function dariCapWaktu(cap) {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(cap);
  if (!m) return null;

  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+07:00`);
}

function samakan(teks) {
  return String(teks || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function isiFolder(folder) {
  try {
    return await fs.promises.readdir(folder, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

async function waktuUbah(berkas) {
  return (await fs.promises.stat(berkas)).mtime;
}

async function berkasPemohon(pihak) {
  const folder = path.join(penyimpanan.folderJenis("barang"), penyimpanan.namaAman(pihak, ""));
  if (folder === penyimpanan.folderJenis("barang")) return [];

  const hasil = [];

  for (const isi of await isiFolder(folder)) {
    if (!isi.isFile() || !isi.name.startsWith(AWALAN) || !isi.name.endsWith(".pdf")) continue;

    const berkas = path.join(folder, isi.name);
    const cap = /_(\d{8}-\d{4})\.pdf$/.exec(isi.name);

    hasil.push({
      berkas,
      nama: isi.name,
      waktu: (cap && dariCapWaktu(cap[1])) || (await waktuUbah(berkas)),
    });
  }

  return hasil;
}

async function berkasDatar() {
  const hasil = [];

  for (const isi of await isiFolder(penyimpanan.AKAR_LAPORAN)) {
    const m = /^Serah_Terima_Barang_(.+)_\d{4}-\d{2}-\d{2}\.pdf$/.exec(isi.name);
    if (!isi.isFile() || !m) continue;

    const berkas = path.join(penyimpanan.AKAR_LAPORAN, isi.name);

    hasil.push({ berkas, nama: isi.name, bidang: samakan(m[1]), waktu: await waktuUbah(berkas) });
  }

  return hasil;
}

function bisaPunyaBukti(m) {
  return m.jenis === "keluar" && m.sumber === "wa" && Boolean(m.pihak);
}

// Map id mutasi → { berkas, nama } untuk baris yang buktinya ada.
async function pasangkan(daftarMutasi, dbMutasi) {
  const calon = daftarMutasi.filter(bisaPunyaBukti);
  const hasil = new Map();
  if (!calon.length) return hasil;

  const daftarPihak = [...new Set(calon.map((m) => m.pihak))];
  const daftarUnit = [...new Set(calon.map((m) => m.unit).filter(Boolean))];
  const semuaOrder = (await dbMutasi.waktuOrderWa(daftarPihak, daftarUnit)).map((o) => ({
    pihak: o.pihak,
    unit: samakan(o.unit),
    t: new Date(o.tanggal).getTime(),
  }));

  const orderPerPihak = new Map();
  for (const o of semuaOrder) {
    if (!orderPerPihak.has(o.pihak)) orderPerPihak.set(o.pihak, []);
    orderPerPihak.get(o.pihak).push(o.t);
  }

  // Pemilik berkas datar: order terakhir unitnya sebelum berkas itu
  // ditulis (semuaOrder sudah urut waktu).
  const pemilikDatar = (b) => {
    let pemilik = null;
    for (const o of semuaOrder) {
      if (o.t > b.waktu.getTime() + TOLERANSI_MS) break;
      if (o.unit === b.bidang) pemilik = o;
    }
    return pemilik;
  };

  const berkasPerPihak = new Map();
  for (const pihak of daftarPihak) berkasPerPihak.set(pihak, await berkasPemohon(pihak));

  const datar = await berkasDatar();

  for (const m of calon) {
    const mulai = new Date(m.tanggal).getTime();

    // Baris satu order dicatat beruntun dalam hitungan detik, jadi
    // "order berikutnya" baru dihitung lewat toleransi.
    const berikut = (orderPerPihak.get(m.pihak) || []).find((t) => t > mulai + TOLERANSI_MS);
    const batas = Math.min(berikut ?? Infinity, mulai + BATAS_MAKS_MS);

    const dalamBatas = (b) => {
      const t = b.waktu.getTime();
      return t >= mulai - TOLERANSI_MS && t < batas;
    };
    const tertua = (daftar) =>
      daftar.filter(dalamBatas).sort((a, b) => a.waktu - b.waktu)[0];

    const unit = samakan(m.unit);
    const cocok =
      tertua(berkasPerPihak.get(m.pihak)) ||
      (unit
        ? tertua(
            datar.filter((b) => {
              const pemilik = b.bidang === unit && pemilikDatar(b);
              return pemilik && pemilik.pihak === m.pihak && Math.abs(pemilik.t - mulai) <= TOLERANSI_MS;
            }),
          )
        : undefined);

    if (cocok) hasil.set(m.id, { berkas: cocok.berkas, nama: cocok.nama });
  }

  return hasil;
}

// Menambah `ada_bukti` ke setiap baris daftar.
async function tandai(daftarMutasi, dbMutasi) {
  const pasangan = await pasangkan(daftarMutasi, dbMutasi);

  for (const m of daftarMutasi) m.ada_bukti = pasangan.has(m.id);

  return daftarMutasi;
}

async function cari(mutasi, dbMutasi) {
  if (!mutasi) return null;

  return (await pasangkan([mutasi], dbMutasi)).get(mutasi.id) || null;
}

module.exports = { tandai, cari };
