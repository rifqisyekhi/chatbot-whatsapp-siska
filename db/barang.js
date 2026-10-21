// =========================================================
// AKSES DATA BARANG (PERSEDIAAN ATK)
// =========================================================
//
// Menggantikan models/Barang.js (Mongoose).
//
// `id_barang` ("ATK-001") adalah primary key — bukan kolom biasa
// dengan index unik seperti di Mongo. Itu memang perannya: ia
// yang diketik pegawai di pesan WhatsApp saat memesan.

const { satuBaris, semuaBaris } = require("./kolam");

const KOLOM = `id_barang, nama, kategori, stok, satuan, img`;

function keBentukLama(b) {
  if (!b) return null;

  // _id disediakan untuk kode lama yang memakainya. Isinya
  // id_barang, karena itulah kunci barisnya sekarang.
  return { ...b, _id: b.id_barang };
}

async function semua() {
  const baris = await semuaBaris(
    `SELECT ${KOLOM} FROM barang ORDER BY id_barang`,
  );

  return baris.map(keBentukLama);
}

async function satu(idBarang) {
  const id = String(idBarang || "").trim();

  if (!id) return null;

  return keBentukLama(
    await satuBaris(`SELECT ${KOLOM} FROM barang WHERE id_barang = $1`, [id]),
  );
}

// Pengganti Barang.find({ kategori }, "id_barang") yang dipakai
// untuk mencari angka urut tertinggi sebelum membuat id baru.
//
// Angka tertingginya dihitung di SQL, bukan dengan mengambil
// seluruh barang lalu mengurainya di JavaScript: hasilnya sama,
// tapi tidak perlu menarik 81 baris untuk mendapatkan satu angka.
//
// split_part mengambil bagian sesudah tanda hubung, lalu
// difilter supaya hanya yang benar-benar angka yang dihitung —
// id yang bentuknya tidak biasa tidak membuat hasilnya NaN
// seperti di versi JavaScript-nya.
async function angkaUrutTertinggi(kategori) {
  const b = await satuBaris(
    `SELECT COALESCE(MAX(split_part(id_barang, '-', 2)::int), 0) AS tertinggi
       FROM barang
      WHERE kategori = $1
        AND split_part(id_barang, '-', 2) ~ '^[0-9]+$'`,
    [String(kategori || "")],
  );

  return b ? Number(b.tertinggi) : 0;
}

const KOLOM_BOLEH_DIUBAH = ["nama", "kategori", "stok", "satuan", "img"];

function saring(data) {
  const keluar = {};

  for (const k of KOLOM_BOLEH_DIUBAH) {
    if (data[k] !== undefined) keluar[k] = data[k];
  }

  return keluar;
}

async function buat(data) {
  const id = String(data.id_barang || "").trim();

  if (!id) throw new Error("id_barang wajib diisi.");

  const kolom = saring(data);

  const nama = ["id_barang", ...Object.keys(kolom)];
  const nilai = [id, ...Object.keys(kolom).map((n) => kolom[n])];

  return keBentukLama(
    await satuBaris(
      `INSERT INTO barang (${nama.join(", ")})
       VALUES (${nama.map((_, i) => `$${i + 1}`).join(", ")})
       RETURNING ${KOLOM}`,
      nilai,
    ),
  );
}

// Pengganti findOneAndUpdate({id_barang}, {$set}, {returnDocument:"after"}).
async function perbarui(idBarang, data) {
  const id = String(idBarang || "").trim();

  if (!id) return null;

  const kolom = saring(data);

  const nama = Object.keys(kolom);

  if (!nama.length) return satu(id);

  return keBentukLama(
    await satuBaris(
      `UPDATE barang SET ${nama.map((n, i) => `${n} = $${i + 2}`).join(", ")}
        WHERE id_barang = $1 RETURNING ${KOLOM}`,
      [id, ...nama.map((n) => kolom[n])],
    ),
  );
}

async function hapus(idBarang) {
  const id = String(idBarang || "").trim();

  if (!id) return null;

  return keBentukLama(
    await satuBaris(
      `DELETE FROM barang WHERE id_barang = $1 RETURNING ${KOLOM}`,
      [id],
    ),
  );
}

// =========================================================
// UBAH STOK
// =========================================================
//
// Pengganti { $inc: { stok: ±n } }.
//
// SATU PERBEDAAN PERILAKU YANG PERLU DIKETAHUI
//
// Tabelnya punya CHECK (stok >= 0). Di Mongo, $inc dengan jumlah
// lebih besar daripada stok membuat stoknya MINUS, diam-diam —
// dan pernah terjadi: dua pegawai memesan barang yang sama
// bersamaan, keduanya lolos pemeriksaan di aplikasi, stok jadi
// negatif.
//
// Sekarang database yang menolak. Artinya pengurangan yang
// melebihi stok GAGAL, bukan menghasilkan angka minus. Pemanggil
// di alur pesanan membungkusnya dengan try/catch dan mencatat
// kegagalannya, jadi tidak ada yang rusak — tapi akibatnya
// berbeda: dulu stok minus, sekarang stok tidak berubah dan ada
// catatan di log.
//
// Pesannya dibuat terbaca supaya catatan itu berguna.
async function ubahStok(idBarang, selisih) {
  const id = String(idBarang || "").trim();

  if (!id) return null;

  const n = Number(selisih);

  if (!Number.isFinite(n)) throw new Error(`Selisih stok tidak valid: ${selisih}`);

  try {
    return keBentukLama(
      await satuBaris(
        `UPDATE barang SET stok = stok + $2 WHERE id_barang = $1
         RETURNING ${KOLOM}`,
        [id, Math.trunc(n)],
      ),
    );
  } catch (err) {
    if (err?.code === "23514") {
      const sekarang = await satu(id);

      throw new Error(
        `Stok ${id} tidak cukup: tersisa ${sekarang?.stok ?? "?"}, ` +
          `diminta ${Math.abs(Math.trunc(n))}. Stok tidak diubah.`,
      );
    }

    throw err;
  }
}

module.exports = {
  semua,
  satu,
  angkaUrutTertinggi,
  buat,
  perbarui,
  hapus,
  ubahStok,
  keBentukLama,
};
