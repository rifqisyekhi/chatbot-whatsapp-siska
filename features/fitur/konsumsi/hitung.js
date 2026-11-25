// =========================================================
// PEMERIKSAAN ISIAN & HITUNGAN KONSUMSI (SATU SUMBER)
// =========================================================
//
// periksaIsian()  : membersihkan isian kiriman form. Isian salah dilempar
//                   sebagai GalatKwitansi (balasan 400 dengan pesan jelas).
// hitungKonsumsi(): menghitung subtotal, PPh 23, dan netto per restoran.
//                   Dipakai ringkasan tabel (db/konsumsi.js) DAN PDF, jadi
//                   angka di daftar dan di dokumen selalu sama.

const { GalatKwitansi } = require("../../kwitansiTarif");

// Persen PPh Pasal 23 yang boleh dipakai. Label sama dengan pilihan di form.
const STATUS_PAJAK = [
  { label: "Ber-NPWP — Jasa Katering (PPh Pasal 23: 2%)", persen: 2 },
  { label: "Non-NPWP — Jasa Katering (PPh Pasal 23: 4%)", persen: 4 },
  { label: "Bebas Pajak / Tidak Dipungut (0%)", persen: 0 },
];
const PILIHAN_PPH = STATUS_PAJAK.map((s) => s.persen);
const PPH_BAWAAN = 2;

const BATAS_ITEM = 100;
const BATAS_ANGKA = 1e12;

const teks = (v, maks = 300) => String(v ?? "").trim().slice(0, maks);

// "2026-02-30" ditolak: tanggal harus ada di kalender.
function tanggalSah(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const [th, bl, hr] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(th, bl - 1, hr));
  if (d.getUTCFullYear() !== th || d.getUTCMonth() !== bl - 1 || d.getUTCDate() !== hr) return null;
  return m[0];
}

// Angka ≥ 0, dibulatkan ke rupiah/porsi utuh. Kosong dianggap 0.
function angkaSah(v, nama) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new GalatKwitansi(`${nama} harus berupa angka.`);
  if (n < 0) throw new GalatKwitansi(`${nama} tidak boleh kurang dari 0.`);
  if (n > BATAS_ANGKA) throw new GalatKwitansi(`${nama} terlalu besar.`);
  return Math.round(n);
}

// Persen PPh dari label status pajak. Angka kiriman klien hanya dipakai
// bila termasuk pilihan resmi (0/2/4).
function persenPph(label, persen, ke) {
  const opsi = STATUS_PAJAK.find((s) => s.label === label);
  if (opsi) return { status: opsi.label, persen: opsi.persen };
  const ada = persen !== "" && persen !== null && persen !== undefined;
  const cocok = ada && STATUS_PAJAK.find((s) => s.persen === Number(persen));
  if (cocok) return { status: cocok.label, persen: cocok.persen };
  throw new GalatKwitansi(`Status pajak restoran ${ke} tidak dikenal. Pilih PPh ${[...PILIHAN_PPH].sort((a, b) => a - b).join("/")}%.`);
}

function periksaIsian(mentah) {
  const isian = mentah && typeof mentah === "object" ? mentah : {};

  const dalamRangka = teks(isian.dalam_rangka || isian.nama_kegiatan);
  if (!dalamRangka) throw new GalatKwitansi("Uraian kegiatan / dalam rangka wajib diisi.");

  const tanggalKegiatan = tanggalSah(isian.tanggal_kegiatan);
  if (!tanggalKegiatan) throw new GalatKwitansi("Tanggal kegiatan tidak valid (format YYYY-MM-DD, tanggal harus ada di kalender).");
  let tanggalSpby = tanggalKegiatan;
  if (isian.tanggal_spby) {
    tanggalSpby = tanggalSah(isian.tanggal_spby);
    if (!tanggalSpby) throw new GalatKwitansi("Tanggal SPBY / kwitansi tidak valid.");
  }

  const penyedia = teks(isian.penyedia, 200);
  if (!penyedia) throw new GalatKwitansi("Nama penyedia / restoran wajib diisi.");
  const duaRestoran = Boolean(isian.dua_restoran);
  const penyedia2 = duaRestoran ? teks(isian.penyedia_2, 200) : "";
  if (duaRestoran && !penyedia2) throw new GalatKwitansi("Nama Restoran 2 wajib diisi saat opsi 2 restoran aktif.");

  const pajak1 = persenPph(isian.status_pajak, isian.persen_pph23, 1);
  const pajak2 = duaRestoran ? persenPph(isian.status_pajak_2, isian.persen_pph23_2, 2) : null;

  const itemMentah = Array.isArray(isian.items) ? isian.items : [];
  if (!itemMentah.length) throw new GalatKwitansi("Minimal harus ada satu item konsumsi.");
  if (itemMentah.length > BATAS_ITEM) throw new GalatKwitansi(`Item konsumsi paling banyak ${BATAS_ITEM}.`);
  const items = itemMentah.map((it, i) => {
    const ke = `item ${i + 1}`;
    const o = it && typeof it === "object" ? it : {};
    return {
      jenis: o.jenis === "Kudapan" ? "Kudapan" : "Makanan",
      uraianMenu: teks(o.uraianMenu || o.namaItem, 200),
      volume: angkaSah(o.volume ?? o.porsi, `Volume ${ke}`),
      satuan: teks(o.satuan, 30) || "Pax",
      hargaSatuan: angkaSah(o.hargaSatuan ?? o.harga_satuan, `Harga satuan ${ke}`),
      resto: duaRestoran && Number(o.resto) === 2 ? 2 : 1,
    };
  });

  return {
    akun: teks(isian.akun, 200),
    dalam_rangka: dalamRangka,
    tempat_kegiatan: teks(isian.tempat_kegiatan || isian.lokasi_detail, 200),
    lokasi_provinsi: teks(isian.lokasi_provinsi, 100) || "D.K.I. Jakarta",
    tanggal_kegiatan: tanggalKegiatan,
    tanggal_spby: tanggalSpby,
    dua_restoran: duaRestoran,
    penyedia,
    status_pajak: pajak1.status,
    persen_pph23: pajak1.persen,
    nomor_spby: teks(isian.nomor_spby, 100),
    no_bku: teks(isian.no_bku, 50),
    ttd_penerima_nama: teks(isian.ttd_penerima_nama, 150),
    ttd_penerima_nip: teks(isian.ttd_penerima_nip, 30),
    ttd_penerima_bawah_tanggal: teks(isian.ttd_penerima_bawah_tanggal, 150),
    penyedia_2: penyedia2,
    status_pajak_2: pajak2 ? pajak2.status : "",
    persen_pph23_2: pajak2 ? pajak2.persen : 0,
    nomor_spby_2: duaRestoran ? teks(isian.nomor_spby_2, 100) : "",
    no_bku_2: duaRestoran ? teks(isian.no_bku_2, 50) : "",
    ttd_penerima_nama_2: duaRestoran ? teks(isian.ttd_penerima_nama_2, 150) : "",
    ttd_penerima_nip_2: duaRestoran ? teks(isian.ttd_penerima_nip_2, 30) : "",
    ttd_penerima_bawah_tanggal_2: duaRestoran ? teks(isian.ttd_penerima_bawah_tanggal_2, 150) : "",
    items,
  };
}

// Hitungan dari isian yang sudah diperiksa (atau baris lama di database —
// karena itu tetap toleran terhadap nilai kosong).
function hitungKonsumsi(isian = {}) {
  const items = (Array.isArray(isian.items) ? isian.items : []).map((it) => {
    const volume = Math.max(0, Math.round(Number(it.volume ?? it.porsi) || 0));
    const hargaSatuan = Math.max(0, Math.round(Number(it.hargaSatuan ?? it.harga_satuan) || 0));
    return { ...it, volume, hargaSatuan, subtotal: volume * hargaSatuan, resto: Number(it.resto) === 2 ? 2 : 1 };
  });
  const duaResto = Boolean(isian.dua_restoran && teks(isian.penyedia_2));
  const persen = (p) => (PILIHAN_PPH.includes(Number(p)) ? Number(p) : PPH_BAWAAN);

  const susun = (ke, daftarItem) => {
    const akhiran = ke === 2 ? "_2" : "";
    const subtotal = daftarItem.reduce((a, it) => a + it.subtotal, 0);
    const p = persen(ke === 2 ? isian.persen_pph23_2 : isian.persen_pph23);
    const pph = Math.round((subtotal * p) / 100);
    return {
      ke,
      penyedia: teks(isian[`penyedia${akhiran}`], 200),
      nomor_spby: teks(isian[`nomor_spby${akhiran}`], 100),
      no_bku: teks(isian[`no_bku${akhiran}`], 50),
      ttd_penerima_nama: teks(isian[`ttd_penerima_nama${akhiran}`], 150),
      ttd_penerima_nip: teks(isian[`ttd_penerima_nip${akhiran}`], 30),
      ttd_penerima_bawah_tanggal: teks(isian[`ttd_penerima_bawah_tanggal${akhiran}`], 150),
      items: daftarItem,
      subtotal,
      persenPph: p,
      pph,
      netto: subtotal - pph,
    };
  };

  const resto = duaResto
    ? [susun(1, items.filter((it) => it.resto === 1)), susun(2, items.filter((it) => it.resto === 2))]
    : [susun(1, items)];

  const total = resto.reduce((a, r) => a + r.subtotal, 0);
  const pph23 = resto.reduce((a, r) => a + r.pph, 0);
  return {
    duaResto,
    resto,
    jumlahPorsi: items.reduce((a, it) => a + it.volume, 0),
    total,
    pph23,
    netto: total - pph23,
  };
}

module.exports = { STATUS_PAJAK, periksaIsian, hitungKonsumsi, tanggalSah };
