// =========================================================
// PEMERIKSAAN ISIAN & HITUNGAN FOTOKOPI (SATU SUMBER)
// =========================================================
//
// periksaIsian()  : membersihkan isian kiriman form. Isian salah dilempar
//                   sebagai GalatKwitansi (balasan 400 dengan pesan jelas).
// hitungFotokopi(): subtotal, PPh, dan netto. Dipakai ringkasan tabel
//                   (db/fotokopi.js) DAN PDF, jadi angka selalu sama.

const { GalatKwitansi } = require("../../kwitansiTarif");

// Label sama persis dengan pilihan di FormFotokopi.jsx.
const STATUS_PAJAK = [
  { label: "UMKM / Fotokopi Eceran Tanpa Potongan Pajak", persen: 0 },
  { label: "Ber-NPWP — Jasa Percetakan/Fotokopi (PPh Pasal 23: 2%)", persen: 2 },
  { label: "Non-NPWP — Jasa Percetakan/Fotokopi (PPh Pasal 23: 4%)", persen: 4 },
  { label: "PPh Pasal 22 Belanja Barang Pemerintah (1.5%)", persen: 1.5 },
];
const PILIHAN_PPH = STATUS_PAJAK.map((s) => s.persen);

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

// Angka ≥ 0, dibulatkan. Kosong dianggap 0.
function angkaSah(v, nama) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new GalatKwitansi(`${nama} harus berupa angka.`);
  if (n < 0) throw new GalatKwitansi(`${nama} tidak boleh kurang dari 0.`);
  if (n > BATAS_ANGKA) throw new GalatKwitansi(`${nama} terlalu besar.`);
  return Math.round(n);
}

// Persen PPh hanya dari pilihan resmi.
function pajakSah(label, persen) {
  const opsi = STATUS_PAJAK.find((s) => s.label === label);
  if (opsi) return opsi;
  const ada = persen !== "" && persen !== null && persen !== undefined;
  const cocok = ada && STATUS_PAJAK.find((s) => s.persen === Number(persen));
  if (cocok) return cocok;
  throw new GalatKwitansi(`Status pajak tidak dikenal. Pilih PPh ${PILIHAN_PPH.join("/")}%.`);
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
  if (!penyedia) throw new GalatKwitansi("Nama rekanan / penyedia fotokopi wajib diisi.");

  const pajak = pajakSah(isian.status_pajak, isian.persen_pph);

  const itemMentah = Array.isArray(isian.items) ? isian.items : [];
  if (!itemMentah.length) throw new GalatKwitansi("Minimal harus ada satu rincian pekerjaan.");
  if (itemMentah.length > BATAS_ITEM) throw new GalatKwitansi(`Rincian pekerjaan paling banyak ${BATAS_ITEM}.`);
  const items = itemMentah.map((it, i) => {
    const ke = `item ${i + 1}`;
    const o = it && typeof it === "object" ? it : {};
    const jenis = teks(o.jenis, 100) || "Lainnya";
    return {
      jenis,
      uraianMenu: teks(o.uraianMenu || o.namaItem, 200) || jenis,
      volume: angkaSah(o.volume ?? o.porsi, `Volume ${ke}`),
      satuan: teks(o.satuan, 30) || "Lembar",
      hargaSatuan: angkaSah(o.hargaSatuan ?? o.harga_satuan, `Harga satuan ${ke}`),
    };
  });

  return {
    akun: teks(isian.akun, 200),
    dalam_rangka: dalamRangka,
    tempat_kegiatan: teks(isian.tempat_kegiatan || isian.lokasi_detail, 200),
    lokasi_provinsi: teks(isian.lokasi_provinsi, 100) || "D.K.I. Jakarta",
    tanggal_kegiatan: tanggalKegiatan,
    tanggal_spby: tanggalSpby,
    penyedia,
    status_pajak: pajak.label,
    persen_pph: pajak.persen,
    nomor_spby: teks(isian.nomor_spby, 100),
    no_bku: teks(isian.no_bku, 50),
    ttd_penerima_nama: teks(isian.ttd_penerima_nama, 150),
    ttd_penerima_nip: teks(isian.ttd_penerima_nip, 30),
    items,
  };
}

// Hitungan dari isian yang sudah diperiksa (toleran untuk baris lama).
function hitungFotokopi(isian = {}) {
  const items = (Array.isArray(isian.items) ? isian.items : []).map((it) => {
    const volume = Math.max(0, Math.round(Number(it.volume ?? it.porsi) || 0));
    const hargaSatuan = Math.max(0, Math.round(Number(it.hargaSatuan ?? it.harga_satuan) || 0));
    return { ...it, volume, hargaSatuan, subtotal: volume * hargaSatuan };
  });
  const persen = PILIHAN_PPH.includes(Number(isian.persen_pph)) ? Number(isian.persen_pph) : 0;
  const total = items.reduce((a, it) => a + it.subtotal, 0);
  const pph = Math.round((total * persen) / 100);
  return {
    items,
    jumlahVolume: items.reduce((a, it) => a + it.volume, 0),
    total,
    persenPph: persen,
    pph,
    netto: total - pph,
  };
}

module.exports = { STATUS_PAJAK, periksaIsian, hitungFotokopi, tanggalSah };
