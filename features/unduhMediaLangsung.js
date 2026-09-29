// =========================================================
// UNDUH MEDIA LANGSUNG DARI CDN WHATSAPP
// =========================================================
//
// 29 September 2026: foto absensi berhenti bisa diunduh. Setelah
// diagnosa, penyebabnya bukan media yang rusak dan bukan sesi
// yang bermasalah:
//
//   stage=RESOLVED, directPath=ada, mediaKey=ada, encFilehash=ada,
//   filehash=ada, type=image,
//   lastErr=Unexpected mimetype application/octet-stream
//          for media type image
//
// Semua bahan untuk mengunduh ADA. Yang menolak justru pemeriksa
// milik WhatsApp Web sendiri: HP mengunggah foto dengan
// content-type "application/octet-stream", dan validator di
// downloadAndMaybeDecrypt menolak mimetype itu untuk media
// bertipe image.
//
// Karena penolakannya ada di dalam validator itu, SETIAP jalur
// yang memanggilnya akan gagal — termasuk jalur bawaan pustaka
// dan jalur dekripsi manual kita. Tidak ada urutan percobaan yang
// bisa menembusnya.
//
// KENAPA TIDAK SEKADAR MENGGANTI PARAMETER type
//
// Menyebut media ini "document" memang melewati validatornya,
// tapi kunci dekripsi WhatsApp DITURUNKAN dari jenis medianya —
// info HKDF untuk gambar berbeda dari dokumen. Kuncinya akan
// salah, pemeriksaan MAC gagal, dan yang didapat cuma kegagalan
// lain dengan sebab yang lebih sulit dibaca.
//
// JALAN YANG DIPAKAI
//
// Mengunduh berkas terenkripsinya sendiri dari CDN WhatsApp, lalu
// mendekripsinya di Node. Skema medianya terdokumentasi dan stabil
// bertahun-tahun (dipakai juga oleh pustaka lain seperti Baileys):
//
//   1. 112 byte diturunkan dari mediaKey lewat HKDF-SHA256
//      dengan info sesuai jenis media
//   2. iv = 16 byte pertama, kunci sandi = 32 berikutnya,
//      kunci MAC = 32 berikutnya
//   3. 10 byte terakhir berkas adalah MAC — diperiksa sebelum
//      didekripsi, supaya berkas yang berubah di tengah jalan
//      tidak diam-diam menghasilkan sampah
//   4. AES-256-CBC, lalu sha256 hasilnya dibandingkan dengan
//      filehash dari WhatsApp
//
// Tidak ada satu pun langkah di atas yang melihat mimetype, jadi
// content-type dari HP tidak lagi bisa menggagalkan apa pun.
// Mimetype hasilnya ditentukan dari angka penanda di awal berkas
// — lebih jujur daripada menebak dari jenis medianya.

const crypto = require("crypto");

// Info HKDF per jenis media. Salah memilih ini membuat kunci yang
// diturunkan salah, dan kegagalannya muncul sebagai MAC tidak
// cocok — bukan sebagai gambar yang rusak.
const INFO_HKDF = {
  image: "WhatsApp Image Keys",
  sticker: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  gif: "WhatsApp Video Keys",
  audio: "WhatsApp Audio Keys",
  ptt: "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
};

const CDN = "https://mmg.whatsapp.net";

// Panjang bahan kunci yang diminta dari HKDF. 80 byte pertama
// yang dipakai; sisanya diminta karena begitulah skema aslinya.
const PANJANG_KUNCI = 112;

const PANJANG_MAC = 10;

// =========================================================
// PENURUNAN KUNCI
// =========================================================

function hkdfSha256(kunci, info, panjang) {
  // Salt kosong 32 byte: itu yang dipakai skema media WhatsApp.
  const prk = crypto
    .createHmac("sha256", Buffer.alloc(32, 0))
    .update(kunci)
    .digest();

  const potongan = [];

  let t = Buffer.alloc(0);
  let terkumpul = 0;

  for (let i = 1; terkumpul < panjang; i++) {
    t = crypto
      .createHmac("sha256", prk)
      .update(Buffer.concat([t, Buffer.from(info, "utf8"), Buffer.from([i])]))
      .digest();

    potongan.push(t);
    terkumpul += t.length;
  }

  return Buffer.concat(potongan).subarray(0, panjang);
}

function turunkanKunci(mediaKey, tipe) {
  const info = INFO_HKDF[String(tipe || "").toLowerCase()];

  if (!info) {
    throw new Error(`Jenis media tidak dikenali untuk penurunan kunci: ${tipe}`);
  }

  const bahan = hkdfSha256(mediaKey, info, PANJANG_KUNCI);

  return {
    iv: bahan.subarray(0, 16),
    kunciSandi: bahan.subarray(16, 48),
    kunciMac: bahan.subarray(48, 80),
  };
}

// =========================================================
// DEKRIPSI
// =========================================================

// `filehash` boleh dikosongkan. Kalau ada, dipakai sebagai
// pemeriksaan terakhir bahwa yang didapat benar-benar berkas yang
// dimaksud WhatsApp — bukan sekadar sesuatu yang berhasil
// didekripsi.
function dekripsiMedia({ enc, mediaKey, tipe, filehash = "" }) {
  if (!Buffer.isBuffer(enc) || enc.length <= PANJANG_MAC) {
    throw new Error(`Berkas terenkripsi terlalu pendek (${enc?.length} byte)`);
  }

  const { iv, kunciSandi, kunciMac } = turunkanKunci(mediaKey, tipe);

  const sandi = enc.subarray(0, enc.length - PANJANG_MAC);
  const mac = enc.subarray(enc.length - PANJANG_MAC);

  const macHitung = crypto
    .createHmac("sha256", kunciMac)
    .update(Buffer.concat([iv, sandi]))
    .digest()
    .subarray(0, PANJANG_MAC);

  // timingSafeEqual, bukan perbandingan biasa. Keduanya sama
  // benarnya di sini, tapi kebiasaan yang benar tidak perlu
  // dikecualikan hanya karena kasus ini tidak kritis.
  if (!crypto.timingSafeEqual(mac, macHitung)) {
    throw new Error(
      "MAC tidak cocok — kunci salah atau berkasnya berubah saat diunduh",
    );
  }

  const pembuka = crypto.createDecipheriv("aes-256-cbc", kunciSandi, iv);

  const isi = Buffer.concat([pembuka.update(sandi), pembuka.final()]);

  if (filehash) {
    const hash = crypto.createHash("sha256").update(isi).digest("base64");

    if (hash !== filehash) {
      throw new Error(
        `filehash tidak cocok (WhatsApp: ${filehash}, hasil: ${hash})`,
      );
    }
  }

  return isi;
}

// =========================================================
// MIMETYPE DARI ISI BERKAS
// =========================================================
//
// Justru mimetype dari HP-lah yang menyebabkan masalah ini, jadi
// jangan dipercaya lagi. Angka penanda di awal berkas tidak bisa
// berbohong.
function tebakMime(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return "";

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }

  if (buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }

  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";

  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";

  if (buf.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";

  return "";
}

// =========================================================
// MEMBACA KETERANGAN MEDIA DARI HALAMAN
// =========================================================

// Nilai biner di halaman bisa berupa string base64 atau berupa
// array byte, tergantung build WhatsApp. Keduanya dinormalkan ke
// base64 supaya sisi Node tidak perlu peduli.
const PEMBACA_HALAMAN = `(id) => {
  const K = window.require("WAWebCollections");

  const msg = K && K.Msg ? K.Msg.get(id) : null;

  if (!msg) return null;

  const keBase64 = (v) => {
    if (!v) return "";
    if (typeof v === "string") return v;

    try {
      const byte = new Uint8Array(v.buffer || v);
      let s = "";
      for (let i = 0; i < byte.length; i++) s += String.fromCharCode(byte[i]);
      return btoa(s);
    } catch (e) {
      return "";
    }
  };

  const md = msg.mediaData || {};

  return {
    directPath: msg.directPath || md.directPath || "",
    mediaKey: keBase64(msg.mediaKey || md.mediaKey),
    filehash: keBase64(msg.filehash || md.filehash),
    encFilehash: keBase64(msg.encFilehash || md.encFilehash),
    type: String(msg.type || md.type || ""),
    mimetype: String(msg.mimetype || ""),
    filename: String(msg.filename || ""),
    size: Number(msg.size || 0),
  };
}`;

async function bacaKeteranganMedia(waClient, msgId) {
  return waClient.pupPage.evaluate(
    // Fungsi pembacanya ditulis sebagai teks lalu dihidupkan di
    // halaman. Ditulis biasa, bundler Vite/esbuild tidak pernah
    // menyentuh berkas ini — tapi menulisnya begini membuat
    // isinya bisa diuji dari Node tanpa membuka Chrome.
    new Function(`return ${PEMBACA_HALAMAN}`)(),
    msgId,
  );
}

// =========================================================
// UNDUH
// =========================================================

function alamatMedia(directPath) {
  const jalur = String(directPath || "");

  if (!jalur) throw new Error("directPath kosong");

  if (/^https?:\/\//i.test(jalur)) return jalur;

  return CDN + (jalur.startsWith("/") ? jalur : `/${jalur}`);
}

async function ambilBerkasTerenkripsi(url, timeoutMs = 30000) {
  const pembatal = new AbortController();

  const jam = setTimeout(() => pembatal.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: pembatal.signal,

      // CDN WhatsApp melayani media tanpa autentikasi, tapi
      // menolak permintaan yang tidak menyebut asalnya.
      headers: {
        Origin: "https://web.whatsapp.com",
        Referer: "https://web.whatsapp.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      throw new Error(`CDN menjawab ${res.status} ${res.statusText}`);
    }

    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(jam);
  }
}

// Mengembalikan { data, mimetype, filename, filesize, via } atau
// melempar dengan sebab yang bisa dibaca.
async function unduhMediaLangsung(waClient, msgId, opsi = {}) {
  const info = await bacaKeteranganMedia(waClient, msgId);

  if (!info) throw new Error("Pesan tidak ditemukan di koleksi WhatsApp Web");

  if (!info.directPath || !info.mediaKey) {
    throw new Error(
      `Keterangan media tidak lengkap (directPath=${
        info.directPath ? "ada" : "KOSONG"
      }, mediaKey=${info.mediaKey ? "ada" : "KOSONG"})`,
    );
  }

  const enc = await ambilBerkasTerenkripsi(
    alamatMedia(info.directPath),
    opsi.timeoutMs,
  );

  // encFilehash memeriksa berkas SEBELUM didekripsi. Kalau ini
  // yang tidak cocok, yang bermasalah adalah unduhannya; kalau
  // filehash yang tidak cocok, yang bermasalah dekripsinya. Dua
  // sebab berbeda, dan keduanya layak dibedakan di log.
  if (info.encFilehash) {
    const hash = crypto.createHash("sha256").update(enc).digest("base64");

    if (hash !== info.encFilehash) {
      throw new Error(
        `encFilehash tidak cocok — unduhan tidak utuh ` +
          `(${enc.length} byte diterima)`,
      );
    }
  }

  const isi = dekripsiMedia({
    enc,
    mediaKey: Buffer.from(info.mediaKey, "base64"),
    tipe: info.type,
    filehash: info.filehash,
  });

  return {
    via: "cdn-langsung",
    data: isi.toString("base64"),

    // Isi berkas yang menentukan, bukan keterangan dari HP —
    // keterangan itulah yang menyebabkan kegagalan ini.
    mimetype: tebakMime(isi) || info.mimetype || "application/octet-stream",
    filename: info.filename || undefined,
    filesize: isi.length,
  };
}

module.exports = {
  INFO_HKDF,
  CDN,
  hkdfSha256,
  turunkanKunci,
  dekripsiMedia,
  tebakMime,
  alamatMedia,
  bacaKeteranganMedia,
  ambilBerkasTerenkripsi,
  unduhMediaLangsung,
  PEMBACA_HALAMAN,
};
