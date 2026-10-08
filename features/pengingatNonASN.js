// =========================================================
// PENGINGAT ABSEN GRUP (ASN & NON-ASN DIGABUNG)
// =========================================================
//
// Mengirimkan satu pesan tunggal ke grup WhatsApp unit (Biro Keuangan dan BMN),
// di mana daftar pegawai ASN (dari Gajihub) dan Non-ASN (dari sistem SisKA)
// dilebur menjadi satu daftar urutan alfabet (A–Z) tanpa dibeda-bedakan statusnya.
//
// FORMAT PESAN:
//   - Urut alfabet (A–Z) untuk seluruh pegawai yang belum absen
//   - Format bullet: "• Nama Pegawai"
//   - Check-out menyertakan jam boleh pulang: "• Nama Pegawai — *16.00 WIB*"
//   - Jika semua sudah absen, pesan tidak dikirim (null).
// =========================================================

require("dotenv").config();

const absensiNonASN = require("./absensi");
const pengingatGajihub = require("./pengingatGajihub");

// =========================================================
// FUNGSI BANTU WAKTU & JADWAL
// =========================================================

function menitDariJam(nilai) {
  const cocok = /^(\d{1,2})[.:](\d{2})$/.exec(String(nilai || "").trim());
  if (!cocok) return null;

  const jam = Number(cocok[1]);
  const menit = Number(cocok[2]);
  if (jam > 23 || menit > 59) return null;

  return jam * 60 + menit;
}

function uraiJadwal(teks) {
  return String(teks || "")
    .split(",")
    .map((b) => menitDariJam(b))
    .filter((m) => m !== null)
    .sort((a, b) => a - b);
}

function jamTeks(menit) {
  return (
    `${String(Math.floor(menit / 60)).padStart(2, "0")}.` +
    `${String(menit % 60).padStart(2, "0")}`
  );
}

function formatJamTitik(jamStr) {
  if (!jamStr) return "";
  return String(jamStr).trim().replace(":", ".");
}

function saatnyaKirim({ sekarang, jadwal, sudahTerkirim, jendela }) {
  if (sekarang === null || jadwal === null) return false;
  if (sudahTerkirim) return false;
  return sekarang >= jadwal && sekarang - jadwal <= jendela;
}

// =========================================================
// KONFIGURASI
// =========================================================

const NON_ASN_GRUP_ID = (
  process.env.NON_ASN_GRUP_ID ||
  process.env.GAJIHUB_GRUP_ID ||
  ""
).trim();

const JADWAL_CHECKIN = uraiJadwal(
  process.env.NON_ASN_JAM_CHECKIN ||
  process.env.GAJIHUB_JAM_CHECKIN ||
  "08.20"
);

const JADWAL_CHECKOUT = uraiJadwal(
  process.env.NON_ASN_JAM_CHECKOUT ||
  process.env.GAJIHUB_JAM_CHECKOUT ||
  "16.35,17.05"
);

const SCAN_MENIT = Number(process.env.NON_ASN_SCAN_MENIT || 5);

const BATAS_NAMA_PER_PESAN = 40;

const AKTIF =
  process.env.NON_ASN_PENGINGAT !== "0" &&
  Boolean(NON_ASN_GRUP_ID);

// =========================================================
// FORMAT PESAN (SKENARIO 1: DIGABUNG MENJADI SATU DAFTAR)
// =========================================================

const KEPALA = "🔔 *PENGINGAT ABSEN HARIAN*";
const PENUTUP = "Jika sedang *cuti, dinas, atau izin*, silakan abaikan pesan ini.";
const FOOTER = "*Pastikan presensi Anda tercatat dengan benar.*";

function daftarBerbintang(baris) {
  if (baris.length <= BATAS_NAMA_PER_PESAN) {
    return baris.map((b) => `• ${b}`);
  }
  const tampil = baris.slice(0, BATAS_NAMA_PER_PESAN).map((b) => `• ${b}`);
  tampil.push(`_...dan ${baris.length - BATAS_NAMA_PER_PESAN} pegawai lainnya_`);
  return tampil;
}

function pesanCheckin({ tanggalTeks, batasJam = "08.30", daftarNama }) {
  if (!daftarNama || daftarNama.length === 0) return null;

  return [
    KEPALA,
    `*Biro Keuangan dan BMN • ${tanggalTeks}*`,
    "",
    "👤 *Belum melakukan Check-in:*",
    ...daftarBerbintang(daftarNama),
    "",
    `⏰ *Batas Check-in: ${batasJam} WIB*`,
    "",
    PENUTUP,
    "",
    FOOTER,
  ].join("\n");
}

function pesanCheckout({ tanggalTeks, daftarBaris }) {
  if (!daftarBaris || daftarBaris.length === 0) return null;

  return [
    KEPALA,
    `*Biro Keuangan dan BMN • ${tanggalTeks}*`,
    "",
    "👤 *Belum melakukan Check-out:*",
    ...daftarBerbintang(
      daftarBaris.map((b) => `${b.nama} — *${formatJamTitik(b.bolehPulang)} WIB*`)
    ),
    "",
    "🕐 *Jam boleh pulang* tercantum di samping nama masing-masing.",
    "",
    PENUTUP,
    "",
    FOOTER,
  ].join("\n");
}

// =========================================================
// PENGAMBILAN DATA ASN (GAJIHUB)
// =========================================================

async function ambilDataASN() {
  if (!pengingatGajihub.AKTIF) {
    return { belumCheckin: [], belumCheckout: [] };
  }

  try {
    const data = await pengingatGajihub.ambilPengingat();
    if (!data) return { belumCheckin: [], belumCheckout: [] };

    let belumCheckin = [];
    let belumCheckout = [];

    // 1. Baca langsung dari objek daftar terstruktur jika tersedia
    if (data.daftar) {
      if (Array.isArray(data.daftar.belumCheckin)) {
        belumCheckin = data.daftar.belumCheckin.filter(Boolean);
      }
      if (Array.isArray(data.daftar.belumCheckout)) {
        belumCheckout = data.daftar.belumCheckout.map((b) => ({
          nama: b.nama || "",
          bolehPulang: formatJamTitik(b.bolehPulang || "16.00"),
        }));
      }
    }

    // 2. Fallback: Ekstraksi dari teks pesan jika objek mentah tidak ada
    if (belumCheckin.length === 0 && data.pesanCheckin) {
      const lines = data.pesanCheckin.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
          const nama = trimmed.slice(2).trim();
          if (!nama.startsWith("...dan ")) belumCheckin.push(nama);
        }
      }
    }

    if (belumCheckout.length === 0 && data.pesanCheckout) {
      const lines = data.pesanCheckout.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
          const isi = trimmed.slice(2).trim();
          const match = /^(.+?)\s*(?:—|-)\s*(?:\*|boleh pulang\s*)?(\d{1,2}[.:]\d{2})/i.exec(isi);
          if (match) {
            belumCheckout.push({
              nama: match[1].trim(),
              bolehPulang: formatJamTitik(match[2].trim()),
            });
          } else if (!isi.startsWith("...dan ")) {
            belumCheckout.push({
              nama: isi,
              bolehPulang: "16.00",
            });
          }
        }
      }
    }

    return { belumCheckin, belumCheckout };
  } catch (err) {
    console.error("[PENGINGAT GRUP] Gajihub ASN tidak dapat diakses:", err?.message || err);
    return { belumCheckin: [], belumCheckout: [] };
  }
}

// =========================================================
// PEMINDAIAN & PENGIRIMAN
// =========================================================

const sudahDikirim = new Map();

async function pindaiPengingatGrup({ kirim, sekarangMenit }) {
  if (!AKTIF) return;

  const waktuWIB = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
  );

  // Akhir pekan (Sabtu & Minggu) tidak ada pengingat presensi
  const hari = waktuWIB.getDay();
  if (hari === 0 || hari === 6) return;

  const sekarang =
    sekarangMenit !== undefined
      ? sekarangMenit
      : waktuWIB.getHours() * 60 + waktuWIB.getMinutes();

  const jendela = Math.max(SCAN_MENIT, 5);

  const adaYangDekat = [...JADWAL_CHECKIN, ...JADWAL_CHECKOUT].some(
    (j) => sekarang >= j && sekarang - j <= jendela
  );

  if (!adaYangDekat) return;

  const tanggal = absensiNonASN.tanggalHariIni();
  const tanggalTeks = absensiNonASN.tanggalPanjang();

  // Bersihkan penanda hari sebelumnya
  for (const kunci of sudahDikirim.keys()) {
    if (!kunci.startsWith(`${tanggal}|`)) sudahDikirim.delete(kunci);
  }

  // Ambil data ASN sekali jika ada jadwal yang dekat
  const dataASN = await ambilDataASN();

  // -------------------------------------------------------
  // 1. PENGINGAT CHECK-IN (PAGI)
  // -------------------------------------------------------
  for (const j of JADWAL_CHECKIN) {
    const kunci = `${tanggal}|checkin|${j}`;

    if (
      !saatnyaKirim({
        sekarang,
        jadwal: j,
        sudahTerkirim: sudahDikirim.get(kunci) === true,
        jendela,
      })
    ) {
      continue;
    }

    sudahDikirim.set(kunci, true);

    try {
      // Ambil daftar Non-ASN yang belum masuk
      let nonAsnBelum = [];
      try {
        nonAsnBelum = await absensiNonASN.ambilBelumMasuk(tanggal);
      } catch (err) {
        console.error("[PENGINGAT GRUP] Gagal mengambil belum-masuk Non-ASN:", err?.message || err);
      }

      const nonAsnNamaList = (nonAsnBelum || []).map((p) => p.nama).filter(Boolean);

      // GABUNGKAN ASN & Non-ASN ke dalam satu daftar
      const namaSet = new Set();
      const gabungCheckin = [];

      for (const nama of [...(dataASN.belumCheckin || []), ...nonAsnNamaList]) {
        const norm = String(nama || "").trim();
        if (norm && !namaSet.has(norm.toLowerCase())) {
          namaSet.add(norm.toLowerCase());
          gabungCheckin.push(norm);
        }
      }

      // Urutkan alfabet A–Z
      gabungCheckin.sort((a, b) => a.localeCompare(b, "id"));

      const teks = pesanCheckin({
        tanggalTeks,
        batasJam: "08.30",
        daftarNama: gabungCheckin,
      });

      if (!teks) {
        console.log(`[PENGINGAT GRUP] ${tanggal} check-in: seluruh pegawai (ASN & Non-ASN) sudah masuk.`);
        continue;
      }

      await kirim(NON_ASN_GRUP_ID, teks);
      console.log(
        `[PENGINGAT GRUP] ${tanggal} check-in terkirim ke grup — total ${gabungCheckin.length} pegawai belum check-in.`
      );
    } catch (err) {
      console.error("[PENGINGAT GRUP] Gagal mengirim pengingat check-in:", err?.message || err);
    }
  }

  // -------------------------------------------------------
  // 2. PENGINGAT CHECK-OUT (SORE)
  // -------------------------------------------------------
  for (const j of JADWAL_CHECKOUT) {
    const kunci = `${tanggal}|checkout|${j}`;

    if (
      !saatnyaKirim({
        sekarang,
        jadwal: j,
        sudahTerkirim: sudahDikirim.get(kunci) === true,
        jendela,
      })
    ) {
      continue;
    }

    sudahDikirim.set(kunci, true);

    try {
      // Ambil daftar Non-ASN yang belum pulang
      let nonAsnBelumPulang = [];
      try {
        nonAsnBelumPulang = await absensiNonASN.ambilBelumPulang(tanggal);
      } catch (err) {
        console.error("[PENGINGAT GRUP] Gagal mengambil belum-pulang Non-ASN:", err?.message || err);
      }

      const nonAsnCheckoutList = [];

      for (const orang of nonAsnBelumPulang || []) {
        if (orang.lemburDisetujui || orang.lemburOtomatis || orang.bebasJamKerja) {
          continue;
        }

        const jamBoleh = orang.jamHarusCheckout || orang.jamPulangJadwal || "16.00";
        const menitBoleh = menitDariJam(jamBoleh);

        if (menitBoleh !== null && sekarang < menitBoleh) {
          continue; // Belum waktunya pulang
        }

        nonAsnCheckoutList.push({
          nama: orang.nama,
          bolehPulang: jamBoleh,
        });
      }

      // GABUNGKAN ASN & Non-ASN ke dalam satu daftar
      const checkoutMap = new Map();

      for (const item of [...(dataASN.belumCheckout || []), ...nonAsnCheckoutList]) {
        const nama = String(item.nama || "").trim();
        if (!nama) continue;
        const norm = nama.toLowerCase();

        if (!checkoutMap.has(norm)) {
          checkoutMap.set(norm, {
            nama,
            bolehPulang: formatJamTitik(item.bolehPulang || "16.00"),
          });
        }
      }

      // Urutkan alfabet A–Z
      const gabungCheckout = [...checkoutMap.values()].sort((a, b) =>
        a.nama.localeCompare(b.nama, "id")
      );

      const teks = pesanCheckout({
        tanggalTeks,
        daftarBaris: gabungCheckout,
      });

      if (!teks) {
        console.log(`[PENGINGAT GRUP] ${tanggal} check-out: seluruh pegawai (ASN & Non-ASN) sudah pulang.`);
        continue;
      }

      await kirim(NON_ASN_GRUP_ID, teks);
      console.log(
        `[PENGINGAT GRUP] ${tanggal} check-out terkirim ke grup — total ${gabungCheckout.length} pegawai belum check-out.`
      );
    } catch (err) {
      console.error("[PENGINGAT GRUP] Gagal mengirim pengingat check-out:", err?.message || err);
    }
  }
}

let timer = null;

function mulaiPengingatGrup({ kirim }) {
  if (timer) return;

  if (!AKTIF) {
    console.log(
      "[PENGINGAT GRUP] Nonaktif — NON_ASN_PENGINGAT bernilai 0 atau ID grup belum diisi di .env."
    );
    return;
  }

  if (NON_ASN_GRUP_ID.includes("xxxx")) {
    console.warn(
      `[PENGINGAT GRUP] PERINGATAN: NON_ASN_GRUP_ID masih placeholder "${NON_ASN_GRUP_ID}". ` +
      `Ganti dengan ID grup WhatsApp yang sebenarnya agar pesan terkirim.`
    );
  }

  console.log(
    `[PENGINGAT GRUP] Aktif (ASN & Non-ASN digabung) — grup "${NON_ASN_GRUP_ID}", checkin ` +
      `${JADWAL_CHECKIN.map(jamTeks).join(", ")}, checkout ` +
      `${JADWAL_CHECKOUT.map(jamTeks).join(", ")}, pindai tiap ` +
      `${SCAN_MENIT} menit.`
  );

  timer = setInterval(() => {
    pindaiPengingatGrup({ kirim }).catch((err) =>
      console.error("[PENGINGAT GRUP] Kesalahan tak tertangani:", err)
    );
  }, SCAN_MENIT * 60 * 1000);
}

module.exports = {
  AKTIF,
  NON_ASN_GRUP_ID,
  JADWAL_CHECKIN,
  JADWAL_CHECKOUT,
  menitDariJam,
  uraiJadwal,
  jamTeks,
  saatnyaKirim,
  pesanCheckin,
  pesanCheckout,
  ambilDataASN,
  pindaiPengingatGrup,
  mulaiPengingatNonASN: mulaiPengingatGrup,
  mulaiPengingatGrup,
};
