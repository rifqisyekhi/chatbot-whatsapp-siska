// =========================================================
// AKSES DATA ANTRIAN
// =========================================================
//
// Menggantikan models/Antrian.js (Mongoose).
//
// Cadangan keadaan yang hanya ada di memori bot, supaya selamat
// dari restart — dan restart bukan kejadian langka: log VPS 3-9
// September mencatat 13 restart di jam kerja dalam sepekan.
//
// `data` adalah jsonb: isinya objek alur yang bentuknya berbeda
// per tipe dan berubah mengikuti kode, bukan data yang di-query
// medan per medan. Satu-satunya pengecualian ada di
// hapusMilikChat() di bawah.

const { satuBaris, semuaBaris, kueri } = require("./kolam");

const KOLOM = `msg_id, tipe, data`;

function keBentukLama(b) {
  if (!b) return null;

  return {
    _id: b.msg_id,
    msgId: b.msg_id,
    tipe: b.tipe,
    data: b.data,
  };
}

async function semua() {
  const baris = await semuaBaris(`SELECT ${KOLOM} FROM antrian`);

  return baris.map(keBentukLama);
}

// Pengganti Antrian.findOneAndUpdate({msgId}, {...}, {upsert:true}).
//
// ON CONFLICT menggantikan upsert, dan melakukannya dalam satu
// pernyataan — tidak ada celah antara "cek ada" dan "tulis" yang
// bisa diisi permintaan lain.
async function simpan(msgId, tipe, data) {
  const id = String(msgId || "").trim();

  if (!id) throw new Error("msgId wajib diisi.");

  return keBentukLama(
    await satuBaris(
      `INSERT INTO antrian (msg_id, tipe, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (msg_id) DO UPDATE
         SET tipe = EXCLUDED.tipe, data = EXCLUDED.data
       RETURNING ${KOLOM}`,
      [id, tipe ?? null, data === undefined ? null : JSON.stringify(data)],
    ),
  );
}

// Pengganti Antrian.findOneAndDelete({ msgId }).
async function hapus(msgId) {
  const id = String(msgId || "").trim();

  if (!id) return null;

  return keBentukLama(
    await satuBaris(
      `DELETE FROM antrian WHERE msg_id = $1 RETURNING ${KOLOM}`,
      [id],
    ),
  );
}

// Pengganti Antrian.findOneAndDelete({ msgId, tipe }).
//
// Tipe ikut disebut supaya alur foto lembur yang menggantung
// tidak terhapus oleh pembersihan antrian persetujuan yang
// kebetulan memakai chat id yang sama sebagai kunci.
async function hapusPerTipe(msgId, tipe) {
  const id = String(msgId || "").trim();

  if (!id) return null;

  return keBentukLama(
    await satuBaris(
      `DELETE FROM antrian WHERE msg_id = $1 AND tipe = $2 RETURNING ${KOLOM}`,
      [id, tipe],
    ),
  );
}

// Pengganti deleteMany({ $or: [{ msgId: chatId }, { "data.sender": chatId }] }).
//
// Bagian kedua menggali ke dalam blob — "siapa pengirim alur
// ini" — dan jsonb bisa melakukannya langsung lewat ->>, jadi
// tidak perlu menarik seluruh antrian ke memori untuk memeriksa
// satu medan.
//
// Dipakai fitur reset data pengujian: antrian persetujuan dan
// alur unggah foto milik satu orang dibuang sekaligus.
async function hapusMilikChat(chatId) {
  const id = String(chatId || "").trim();

  if (!id) return 0;

  const { rowCount } = await kueri(
    `DELETE FROM antrian WHERE msg_id = $1 OR data->>'sender' = $1`,
    [id],
  );

  return rowCount;
}

module.exports = {
  semua,
  simpan,
  hapus,
  hapusPerTipe,
  hapusMilikChat,
  keBentukLama,
};
