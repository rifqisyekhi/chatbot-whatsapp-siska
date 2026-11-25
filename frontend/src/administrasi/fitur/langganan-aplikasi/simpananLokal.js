// Penyimpanan cadangan di browser apabila database PostgreSQL lokal belum
// dinyalakan atau server pengembangan belum direstart.

const KUNCI_DAFTAR = "kwitansi-langganan-daftar-lokal";
let memoriLampiran = new Map();

function bacaSemua() {
  try {
    const data = JSON.parse(localStorage.getItem(KUNCI_DAFTAR) || "[]");
    if (!Array.isArray(data)) return [];
    return data.map((d) => ({
      ...d,
      isian: {
        ...(d.isian || {}),
        lampiran: memoriLampiran.get(Number(d.id)) || d.isian?.lampiran || [],
      },
    }));
  } catch {
    return [];
  }
}

function tulisSemua(daftar) {
  for (const d of daftar) {
    if (d.isian?.lampiran?.length) {
      memoriLampiran.set(Number(d.id), d.isian.lampiran);
    }
  }
  try {
    localStorage.setItem(KUNCI_DAFTAR, JSON.stringify(daftar));
  } catch {
    // Bila lampiran gambar terlalu besar untuk localStorage, simpan teksnya saja di localStorage
    // dan gambarnya tetap di memori sesi.
    try {
      const ringan = daftar.map((d) => ({
        ...d,
        isian: { ...(d.isian || {}), lampiran: [] },
      }));
      localStorage.setItem(KUNCI_DAFTAR, JSON.stringify(ringan));
    } catch {
      // abaikan
    }
  }
}

function ringkasDari(isian, hasil) {
  const daftarRincian = Array.isArray(hasil?.rincian) ? hasil.rincian : [];
  const jumlahLisensi = daftarRincian.reduce((a, r) => a + (Number(r.volume) || 1), 0) || 1;
  return {
    nama_aplikasi: hasil?.namaAplikasi || isian.nama_aplikasi || "",
    penyedia: hasil?.penyedia || isian.penyedia || "",
    paket: hasil?.paket || isian.paket || "",
    periode: hasil?.periode || isian.periode || "Bulanan",
    keperluan: hasil?.keperluan || isian.keperluan || "",
    tanggal_mulai: isian.tanggal_mulai || isian.tanggal_bayar || "",
    tanggal_selesai: isian.tanggal_selesai || isian.tanggal_mulai || "",
    tanggal_bayar: isian.tanggal_bayar || "",
    jumlah_lisensi: jumlahLisensi,
    penerima_nama: hasil?.penerima?.nama || isian.penerima_nama || "",
    penerima_nip: hasil?.penerima?.nip || isian.penerima_nip || "",
    total: Number(hasil?.total) || 0,
  };
}

export function daftarLokal({ bidang = null, tahun = null } = {}) {
  return bacaSemua()
    .filter(
      (d) =>
        (!bidang || d.bidang === bidang) &&
        (!tahun || String(d.tanggal_bayar || "").startsWith(String(tahun))),
    )
    .sort((a, b) => String(b.tanggal_bayar || "").localeCompare(String(a.tanggal_bayar || "")) || b.id - a.id);
}

export function satuLokal(id) {
  return bacaSemua().find((d) => Number(d.id) === Number(id)) || null;
}

export function buatLokal({ bidang, isian, hasil, oleh = "Operator" }) {
  const semua = bacaSemua();
  const idBaru = semua.reduce((maks, d) => Math.max(maks, Number(d.id) || 0), 0) + 1;
  const sekarang = new Date().toISOString();
  const baris = {
    id: idBaru,
    lokal: true,
    bidang: bidang || "TU",
    status: "aktif",
    ...ringkasDari(isian, hasil),
    isian,
    alasan_batal: "",
    tanggal_batal: null,
    dibatalkan_oleh: "",
    dibuat_oleh: oleh,
    diubah_oleh: oleh,
    dibuat_pada: sekarang,
    diubah_pada: sekarang,
  };
  semua.push(baris);
  tulisSemua(semua);
  return baris;
}

export function ubahLokal(id, { isian, hasil, oleh = "Operator" }) {
  const semua = bacaSemua();
  const idx = semua.findIndex((d) => Number(d.id) === Number(id));
  if (idx < 0) return null;
  semua[idx] = {
    ...semua[idx],
    ...ringkasDari(isian, hasil),
    isian,
    diubah_oleh: oleh,
    diubah_pada: new Date().toISOString(),
  };
  tulisSemua(semua);
  return semua[idx];
}

export function batalkanLokal(id, { alasan, tanggal, oleh = "Operator" }) {
  const semua = bacaSemua();
  const idx = semua.findIndex((d) => Number(d.id) === Number(id));
  if (idx < 0) return null;
  semua[idx] = {
    ...semua[idx],
    status: "dibatalkan",
    alasan_batal: alasan,
    tanggal_batal: tanggal,
    dibatalkan_oleh: oleh,
    diubah_oleh: oleh,
    diubah_pada: new Date().toISOString(),
  };
  tulisSemua(semua);
  return semua[idx];
}

export function pulihkanLokal(id, { oleh = "Operator" } = {}) {
  const semua = bacaSemua();
  const idx = semua.findIndex((d) => Number(d.id) === Number(id));
  if (idx < 0) return null;
  semua[idx] = {
    ...semua[idx],
    status: "aktif",
    alasan_batal: "",
    tanggal_batal: null,
    dibatalkan_oleh: "",
    diubah_oleh: oleh,
    diubah_pada: new Date().toISOString(),
  };
  tulisSemua(semua);
  return semua[idx];
}

export function hapusLokal(id) {
  const semua = bacaSemua();
  const baru = semua.filter((d) => Number(d.id) !== Number(id));
  memoriLampiran.delete(Number(id));
  tulisSemua(baru);
  return baru.length < semua.length;
}
