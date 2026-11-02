// =========================================================
// IMPOR RIWAYAT ORDER BARANG DARI EKSPOR CHAT WHATSAPP
// =========================================================
//
// Log bot di VPS hanya tersisa sejak 19 Agustus 2026. Order
// sebelumnya masih ada di HP nomor SisKA: setiap chat pegawai,
// diekspor lewat WhatsApp → Ekspor chat → Tanpa media, berisi
// pesanan pegawai itu dan jawaban bot atasnya.
//
// YANG DIBACA (per chat pegawai)
//
//   <pegawai>: !ORDER_BARANG ...         isi pesanan
//   SisKA: ✅ *ORDER DISETUJUI*           atasan setuju, stok
//                                        dikurangi → `keluar`
//   SisKA: 🔔 *BARANG SIAP DIAMBIL*       pasti sudah disetujui
//   SisKA: ❌ *BARANG KENDALA / KOSONG*   gudang membatalkan, stok
//                                        dikembalikan → `koreksi` +
//
// Pesanan tanpa "ORDER DISETUJUI" sebelum pesanan berikutnya tidak
// pernah mengurangi stok (kebanyakan dikirim ulang beberapa menit
// kemudian), jadi tidak dicatat.
//
// Nama pemohon diambil dari sapaan bot ("Halo *Nama*!") — nama yang
// sama dengan di tabel pegawai — dan unitnya dari tabel pegawai.
//
// Waktu di ekspor chat adalah waktu HP (WIB), hanya sampai menit.
//
// STOK TIDAK DIUBAH, BATAS WAKTU, DAN DUPLIKAT
//
// Sama dengan impor-riwayat-log-barang.js (lihat scripts/lib/
// riwayatBarang.js): baris ditulis tanpa stok_sesudah, hanya order
// sebelum bot mulai mencatat sendiri, dan order yang sudah masuk
// dari log VPS dilewati. Kedua skrip boleh dijalankan dalam urutan
// mana pun dan berulang kali.
//
// PEMAKAIAN
//
//   node scripts/impor-riwayat-chat-barang.js --chat=/jalur/folder-txt           (uji coba)
//   node scripts/impor-riwayat-chat-barang.js --chat=/jalur/folder-txt --apply   (simpan)
//
//   --dari=2026-05-01   order sebelum tanggal ini diabaikan (bawaan:
//                       1 Mei 2026, peluncuran; order April adalah
//                       uji coba)
//   --sampai=<ISO>      ganti batas akhir otomatis

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { semuaBaris, tutup } = require("../db/kolam");
const { PENANDA_UMUM, tglWib, batasWaktu, saringSudahAda, simpan } = require("./lib/riwayatBarang");

const argumen = process.argv.slice(2);
const nilaiArg = (nama) => (argumen.find((a) => a.startsWith(`--${nama}=`)) || "").split("=").slice(1).join("=");

const DIR_CHAT = nilaiArg("chat");
const DARI = new Date(`${nilaiArg("dari") || "2026-05-01"}T00:00:00+07:00`);
const SIMPAN = argumen.includes("--apply");
const PENANDA = `${PENANDA_UMUM} ekspor chat WA`;
const OLEH = "Impor riwayat chat";

// "12/05/26, 9:37 am - Yoga: isi". Spasi sebelum am/pm bisa spasi
// sempit (U+202F) — \s menangkapnya.
const AWAL_PESAN = /^(\d{1,2})\/(\d{1,2})\/(\d{2}), (\d{1,2}):(\d{2})\s?([ap]m) - ([^:]+?): /i;

function bacaPesan(berkas) {
  const pesan = [];

  for (const baris of fs.readFileSync(berkas, "utf8").replace(/\r/g, "").split("\n")) {
    const m = baris.match(AWAL_PESAN);

    if (m) {
      const [, d, bln, th, j, mnt, ampm, dari] = m;
      const jam = (Number(j) % 12) + (ampm.toLowerCase() === "pm" ? 12 : 0);
      const waktu = new Date(
        `20${th}-${bln.padStart(2, "0")}-${d.padStart(2, "0")}T${String(jam).padStart(2, "0")}:${mnt}:00+07:00`,
      );

      pesan.push({ waktu, dari: dari.trim(), isi: baris.slice(m[0].length) });
    } else if (pesan.length) {
      pesan[pesan.length - 1].isi += `\n${baris}`;
    }
  }

  return pesan;
}

// "- [ATK-003] Kertas A4 (2 Rim)", per baris atau berjajar dalam satu
// baris. Pesanan April belum memakai kode barang.
const POLA_BARANG = /(?:^|\s)- (?:\[([^\]]*)\] )?(.+?) \((\d+) ([^)]+)\)/gm;

function uraiBarang(isi) {
  return [...isi.matchAll(POLA_BARANG)].map((m) => ({
    id: (m[1] || "").trim(),
    nama: m[2].trim(),
    jumlah: parseInt(m[3], 10),
    satuan: m[4].trim(),
  }));
}

function uraiChat(berkas) {
  const pesan = bacaPesan(berkas);
  const order = [];
  let nama = "";

  for (let i = 0; i < pesan.length; i++) {
    const p = pesan[i];
    const sapaan = p.dari === "SisKA" && p.isi.match(/Halo \*([^*]+)\*!/);

    if (sapaan) nama = sapaan[1].trim();
    if (p.dari === "SisKA" || !p.isi.trim().startsWith("!ORDER_BARANG")) continue;

    const o = { pemohon: nama, kontak: path.basename(berkas), waktuPesan: p.waktu, barang: uraiBarang(p.isi) };

    for (let k = i + 1; k < pesan.length; k++) {
      const q = pesan[k];

      if (q.dari !== "SisKA") {
        if (q.isi.trim().startsWith("!ORDER_BARANG")) break;
        continue;
      }
      // Pesan bot kadang tiba tidak berurutan ("siap diambil" lebih
      // dulu daripada "disetujui"), jadi pemindaian jalan terus
      // sampai pesanan berikutnya.
      if (q.isi.includes("ORDER DISETUJUI") && !o.waktu) o.waktu = q.waktu;
      if (q.isi.includes("BARANG SIAP DIAMBIL") && !o.siap) o.siap = q.waktu;
      if (q.isi.includes("BARANG KENDALA") && !o.batal) o.batal = q.waktu;
    }

    // Siap diambil berarti sudah disetujui, walau pesan
    // persetujuannya tidak ada di chat.
    o.waktu ||= o.siap;
    if (o.waktu) order.push(o);
  }

  return order;
}

(async () => {
  if (!DIR_CHAT || !fs.existsSync(DIR_CHAT)) {
    throw new Error("Sebutkan folder berisi berkas .txt ekspor chat: --chat=/jalur/folder");
  }

  const sampai = await batasWaktu(argumen);

  const semuaOrder = fs
    .readdirSync(DIR_CHAT)
    .filter((n) => n.toLowerCase().endsWith(".txt"))
    .flatMap((n) => uraiChat(path.join(DIR_CHAT, n)))
    .sort((a, b) => a.waktu - b.waktu);

  const order = semuaOrder.filter((o) => o.waktu >= DARI && o.waktu < sampai);

  // --- KATALOG DAN PEGAWAI ---
  const katalogList = await semuaBaris(`SELECT id_barang, nama, satuan FROM barang`);
  const katalog = new Map(katalogList.map((b) => [b.id_barang, b]));
  const katalogNama = new Map(katalogList.map((b) => [b.nama.trim().toLowerCase(), b]));
  const unitPegawai = new Map(
    (await semuaBaris(`SELECT nama, sub_unit FROM pegawai`)).map((p) => [
      String(p.nama || "").trim().toLowerCase(),
      p.sub_unit || "",
    ]),
  );

  // --- SUSUN BARIS MUTASI ---
  const baris = [];
  const peringatan = [];

  for (const o of order) {
    if (!o.pemohon) peringatan.push(`${tglWib(o.waktu)} ${o.kontak}: nama pemohon tidak terbaca — dilewati`);
    if (!o.barang.length) peringatan.push(`${tglWib(o.waktu)} ${o.pemohon}: daftar barang tidak terbaca — dilewati`);
    if (!o.pemohon || !o.barang.length) continue;

    const unit = unitPegawai.get(o.pemohon.toLowerCase()) ?? "";
    if (!unitPegawai.has(o.pemohon.toLowerCase())) {
      peringatan.push(`${tglWib(o.waktu)} ${o.pemohon} tidak ada di tabel pegawai — unit dikosongkan`);
    }

    for (const b of o.barang) {
      const k = b.id ? katalog.get(b.id) : katalogNama.get(b.nama.toLowerCase());

      if (!b.id && !k) {
        peringatan.push(`${tglWib(o.waktu)} ${o.pemohon}: "${b.nama}" tanpa kode dan tidak ada di katalog — dilewati`);
        continue;
      }
      if (b.id && !k) peringatan.push(`${tglWib(o.waktu)} ${b.id} tidak ada lagi di katalog — tetap dicatat dengan nama dari chat`);

      const dasar = {
        id_barang: k?.id_barang || b.id,
        nama_barang: k?.nama || b.nama,
        satuan: k?.satuan || b.satuan,
        pihak: o.pemohon,
        unit,
      };

      baris.push({
        ...dasar,
        tanggal: o.waktu,
        jenis: "keluar",
        jumlah: b.jumlah,
        keterangan: `Order WA disetujui atasan. ${PENANDA}.`,
      });

      if (o.batal) {
        baris.push({
          ...dasar,
          tanggal: o.batal,
          jenis: "koreksi",
          jumlah: b.jumlah,
          keterangan: `Order WA dibatalkan, fisik kosong/kendala. ${PENANDA}.`,
        });
      }
    }
  }

  const baru = await saringSudahAda(baris);

  // --- PRATINJAU ---
  const diluar = semuaOrder.length - order.length;

  console.log(`\nChat dibaca          : ${DIR_CHAT}`);
  console.log(`Rentang diambil      : ${tglWib(DARI)} s.d. ${tglWib(sampai)} WIB`);
  console.log(`Order disetujui      : ${order.length} (di luar rentang: ${diluar})`);
  console.log(`Order dibatalkan     : ${order.filter((o) => o.batal).length}`);
  console.log(`Baris mutasi         : ${baris.length} (baru: ${baru.length}, sudah ada di rekap: ${baris.length - baru.length})\n`);

  const perBulan = {};
  for (const o of order) {
    const bln = tglWib(o.waktu).slice(0, 7);
    perBulan[bln] = (perBulan[bln] || 0) + 1;
  }
  console.log("Order per bulan:", perBulan, "\n");

  const kunciBaru = new Set(baru);
  for (const o of order) {
    const sudah = baris.filter((b) => b.pihak === o.pemohon && b.tanggal === o.waktu).every((b) => !kunciBaru.has(b));
    console.log(
      `${tglWib(o.waktu)}  ${o.pemohon}${o.batal ? "  [DIBATALKAN]" : ""}${sudah ? "  (sudah ada)" : ""}`,
    );
    for (const b of o.barang) console.log(`      - [${b.id || "?"}] ${b.nama} × ${b.jumlah} ${b.satuan}`);
  }

  if (peringatan.length) {
    console.log("\nPERINGATAN:");
    for (const p of peringatan) console.log(`  ! ${p}`);
  }

  if (!SIMPAN) {
    console.log("\nUji coba saja — tidak ada yang disimpan. Tambahkan --apply untuk menyimpan.\n");
    return;
  }

  if (!baru.length) {
    console.log("\nTidak ada baris baru untuk disimpan.\n");
    return;
  }

  await simpan(baru, OLEH);

  console.log(`\n${baru.length} baris riwayat disimpan. Stok barang tidak diubah.\n`);
})()
  .catch((err) => {
    console.error("\nGAGAL:", err.message);
    process.exitCode = 1;
  })
  .finally(() => tutup());
