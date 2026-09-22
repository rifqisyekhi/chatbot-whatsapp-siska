// =========================================================
// DIAGNOSA JALUR PENGIRIMAN MEDIA WHATSAPP
// =========================================================
//
// Sejak 18 September 2026, semua pengiriman media dari bot gagal —
// foto bercap geotag, PDF laporan WFH, PDF serah terima barang —
// dengan pesan yang tidak menjelaskan apa pun:
//
//   "Data passed to getter must include an id property
//    (it's how we memoize) but got undefined"
//
// Pesan itu hanya error memoize milik WhatsApp; penyebab aslinya ada
// beberapa langkah sebelumnya. Modul ini mengulang langkah-langkah
// pengiriman media DI DALAM halaman, satu per satu, lalu melaporkan
// tepat di tahap mana yang gagal.
//
// Dipakai bersama oleh alur absensi (index.js) dan alur PDF
// (pdf_generator.js) supaya kegagalan di jalur mana pun sama-sama
// meninggalkan keterangan yang bisa dibaca.

const fs = require("fs");
const path = require("path");

// Berkas pustaka yang ditambal scripts/tambal-wwebjs.js.
const BERKAS_PUSTAKA = path.join(
  __dirname,
  "..",
  "node_modules",
  "whatsapp-web.js",
  "src",
  "util",
  "Injected",
  "Utils.js",
);

// Penanda tambalan yang benar-benar menentukan: perbaikan tabrakan
// properti id pada pesan bermedia (lihat scripts/tambal-wwebjs.js).
const PENANDA_TAMBALAN = "delete message.__x_id;";

// =========================================================
// STATUS TAMBALAN
// =========================================================
//
// Tambalan ditulis ke dalam node_modules, sedangkan `git pull` tidak
// pernah menyentuh folder itu. Gampang sekali ketinggalan: kode baru
// tertarik, tambalannya tidak, dan bot tetap memakai pustaka lama
// tanpa ada tanda apa pun.
//
// Karena itu statusnya dicetak setiap kali bot start — tidak perlu
// lagi memeriksanya manual di VPS.

function periksaTambalanPustaka() {
  try {
    const terpasang = fs
      .readFileSync(BERKAS_PUSTAKA, "utf8")
      .includes(PENANDA_TAMBALAN);

    if (terpasang) {
      console.log("[TAMBAL] Perbaikan id pesan media: TERPASANG.");
    } else {
      console.warn(
        "[TAMBAL] Perbaikan id pesan media: BELUM TERPASANG.\n" +
          "         Pengiriman foto dan PDF kemungkinan besar akan gagal.\n" +
          "         Jalankan: node scripts/tambal-wwebjs.js  lalu  pm2 restart bot-siska\n" +
          "         (urutannya penting — berkas pustaka dibaca sekali saat bot start)",
      );
    }

    return terpasang;
  } catch (err) {
    console.warn(
      "[TAMBAL] Tidak bisa memeriksa status tambalan:",
      err?.message || err,
    );

    return null;
  }
}

// =========================================================
// DIAGNOSA
// =========================================================

// Uji kirim ke diri sendiri hanya sekali per proses. Sekali saja sudah
// menjawab pertanyaannya, dan kalau banyak orang memakai bot bersamaan
// jangan sampai chat bot sendiri dibanjiri gambar uji.
let ujiKirimSudahJalan = false;

// `fotoBase64` boleh dikosongkan — kalau tidak ada foto di tangan
// (misalnya yang gagal justru berkas PDF), halaman membuat gambar
// ujinya sendiri. Yang diuji memang jalur medianya, bukan isinya.
async function diagnosaJalurMedia(client, fotoBase64 = "") {
  const waSendiri = client?.info?.wid?._serialized || "";

  const bolehUji = Boolean(waSendiri) && !ujiKirimSudahJalan;

  if (bolehUji) ujiKirimSudahJalan = true;

  try {
    return await client.pupPage.evaluate(
      async (b64, tujuanUji, jalankanUji) => {
        const langkah = [];

        // Gambar uji dibuat di halaman kalau pemanggil tidak
        // memberikan foto.
        const buatGambarUji = (sisi) => {
          const kanvas = document.createElement("canvas");

          kanvas.width = sisi;
          kanvas.height = sisi;

          const ctx = kanvas.getContext("2d");

          ctx.fillStyle = "#123456";
          ctx.fillRect(0, 0, sisi, sisi);

          return kanvas.toDataURL("image/jpeg").split(",")[1];
        };

        const data = b64 || buatGambarUji(200);

        const mediaInfo = {
          data,
          mimetype: "image/jpeg",
          filename: "uji-media.jpg",
        };

        if (!b64) langkah.push("0. memakai gambar uji buatan sendiri");

        // ---- Tahap 1: siapkan dan hitung hash ----
        try {
          const file = window.WWebJS.mediaInfoToFile(mediaInfo);

          const OpaqueData = window.require("WAWebMediaOpaqueData");

          const opaque = await OpaqueData.createFromData(file, "image/jpeg");

          const siap = await window
            .require("WAWebPrepRawMedia")
            .prepRawMedia(opaque, {})
            .waitForPrep();

          langkah.push(
            `1. siapkan+hash: OK (${file?.size ?? "?"} byte, ` +
              `${siap?.fullWidth}x${siap?.fullHeight}, ` +
              `filehash ${siap?.filehash ? "ada" : "KOSONG"})`,
          );
        } catch (e) {
          langkah.push(`1. siapkan+hash: GAGAL — ${String(e?.message || e)}`);

          return { gagalDi: "penyiapan media", langkah };
        }

        // ---- Tahap 2: proses penuh, termasuk unggah ke server WhatsApp ----
        try {
          const hasil = await window.WWebJS.processMediaData(mediaInfo, {});

          langkah.push(
            `2. proses+unggah: OK (clientUrl ${
              hasil?.clientUrl ? "ada" : "KOSONG"
            }, mediaKey ${hasil?.mediaKey ? "ada" : "KOSONG"})`,
          );
        } catch (e) {
          langkah.push(`2. proses+unggah: GAGAL — ${String(e?.message || e)}`);

          return { gagalDi: "unggah media ke server WhatsApp", langkah };
        }

        // ---- Tahap 3: benarkah SEMUA media gagal? ----
        if (!jalankanUji) {
          langkah.push("3. uji kirim: dilewati (sudah pernah dijalankan)");

          return {
            gagalDi: "pengiriman pesannya, sesudah media terunggah",
            langkah,
          };
        }

        try {
          const chat = await window.WWebJS.getChat(tujuanUji, {
            getAsModel: false,
          });

          if (!chat) {
            langkah.push("3. uji kirim: chat bot sendiri tidak ditemukan");
          } else {
            await window.WWebJS.sendMessage(chat, "", {
              media: {
                mimetype: "image/jpeg",
                data: buatGambarUji(1),
                filename: "uji.jpg",
              },
              caption: "uji kirim media (otomatis)",
            });

            langkah.push(
              "3. uji kirim gambar 1x1 ke diri sendiri: BERHASIL — " +
                "jalur medianya sehat, yang ditolak berkas aslinya",
            );
          }
        } catch (e) {
          langkah.push(
            "3. uji kirim gambar 1x1 ke diri sendiri: GAGAL — " +
              `${String(e?.message || e)} — SELURUH pengiriman media sedang rusak`,
          );
        }

        return {
          gagalDi: "pengiriman pesannya, sesudah media terunggah",
          langkah,
        };
      },
      fotoBase64,
      waSendiri,
      bolehUji,
    );
  } catch (e) {
    return { gagalDi: "tidak bisa diperiksa", pesan: String(e?.message || e) };
  }
}

// Mencetak hasil diagnosa baris per baris. Satu blok JSON panjang di
// log sulit dibaca justru pada saat paling dibutuhkan.
function cetakDiagnosa(label, hasil) {
  console.error(`${label} Diagnosa — gagal di: ${hasil?.gagalDi || "?"}`);

  for (const baris of hasil?.langkah || []) {
    console.error(`${label}   ${baris}`);
  }

  if (hasil?.pesan) console.error(`${label}   ${hasil.pesan}`);
}

// Dipakai jalur PDF: menjalankan diagnosa lalu mencetaknya, tanpa
// pernah melempar. Kegagalan mendiagnosa tidak boleh menambah
// kerusakan pada alur yang memang sudah gagal.
async function diagnosaDanCetak(client, label, fotoBase64 = "") {
  try {
    cetakDiagnosa(label, await diagnosaJalurMedia(client, fotoBase64));
  } catch (err) {
    console.error(`${label} Diagnosa gagal dijalankan:`, err?.message || err);
  }
}

module.exports = {
  periksaTambalanPustaka,
  diagnosaJalurMedia,
  cetakDiagnosa,
  diagnosaDanCetak,
};
