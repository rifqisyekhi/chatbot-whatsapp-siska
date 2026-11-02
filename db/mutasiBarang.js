// =========================================================
// AKSES DATA MUTASI BARANG (REKAP & AUDIT PERSEDIAAN)
// =========================================================
//
// Tabelnya dibuat db/005-mutasi-barang.sql.
//
// SATU PINTU UNTUK MENGUBAH STOK
//
// Setiap fungsi tulis di sini mengubah `barang.stok`, mencatat
// mutasinya, dan menulis log — dalam SATU transaksi. Kalau salah
// satunya gagal, ketiganya batal. Tanpa itu stok bisa berubah
// tanpa jejak, dan justru jejak itu alasan fitur ini ada.
//
// Baris barang dikunci (FOR UPDATE) sebelum stoknya dibaca, supaya
// dua mutasi bersamaan atas barang yang sama tidak sama-sama
// membaca stok lama lalu menulis potret `stok_sesudah` yang salah.

const { satuBaris, semuaBaris, dalamTransaksi } = require("./kolam");

const JENIS = ["masuk", "keluar", "pinjam", "kembali", "koreksi"];
const SUMBER = ["wa", "dashboard", "import"];

const KOLOM = `id, tanggal, id_barang, nama_barang, satuan, jenis, jumlah,
  stok_sesudah, pihak, unit, keterangan, rencana_kembali,
  dikembalikan_pada, pinjam_id, sumber, dicatat_oleh, dibuat_pada,
  diubah_pada`;

// Kesalahan isian, bukan kerusakan server. Rute menerjemahkannya
// jadi 400 dengan pesan apa adanya.
class GalatIsian extends Error {
  constructor(pesan) {
    super(pesan);
    this.status = 400;
  }
}

// Arah stok ditentukan jenis, bukan tanda angka. Hanya koreksi
// yang jumlahnya bertanda.
function efek(jenis, jumlah) {
  if (jenis === "masuk" || jenis === "kembali") return jumlah;
  if (jenis === "keluar" || jenis === "pinjam") return -jumlah;
  return jumlah;
}

// Baris RIWAYAT — diimpor dari log bot oleh
// scripts/impor-riwayat-log-barang.js — tidak pernah mengubah stok:
// stok sekarang sudah mencerminkan order-order itu. Penandanya
// stok_sesudah kosong, karena setiap baris yang ditulis lewat modul
// ini selalu mengisinya. Mengedit atau menghapus baris riwayat
// karenanya juga tidak boleh menggeser stok.
function tanpaEfekStok(baris) {
  return baris.stok_sesudah == null;
}

function teks(nilai) {
  return nilai == null ? "" : String(nilai).trim();
}

// Menerima "2026-11-02", "2026-11-02T09:30", objek Date, atau
// kosong (= sekarang). Yang tidak terbaca ditolak, bukan diganti
// diam-diam dengan hari ini: tanggal yang salah di rekap audit
// lebih buruk daripada baris yang gagal disimpan.
function tanggalAtauSekarang(nilai, label = "Tanggal") {
  if (nilai == null || nilai === "") return new Date();

  const d = nilai instanceof Date ? nilai : new Date(nilai);

  if (Number.isNaN(d.getTime())) {
    throw new GalatIsian(`${label} tidak terbaca: ${nilai}`);
  }

  return d;
}

function tanggalAtauNull(nilai) {
  if (nilai == null || nilai === "") return null;

  const d = nilai instanceof Date ? nilai : new Date(nilai);

  if (Number.isNaN(d.getTime())) {
    throw new GalatIsian(`Rencana kembali tidak terbaca: ${nilai}`);
  }

  return d.toISOString().slice(0, 10);
}

// Merapikan isian dari form / Excel / alur WA menjadi bentuk yang
// siap ditulis. Semua pemeriksaan isian ada di sini, supaya ketiga
// jalur itu ditolak dengan aturan yang sama.
function rapikan(data) {
  const jenis = teks(data.jenis).toLowerCase();

  if (!JENIS.includes(jenis)) {
    throw new GalatIsian(
      `Jenis mutasi "${data.jenis}" tidak dikenal. Pilihan: ${JENIS.join(", ")}.`,
    );
  }

  const jumlah = Number(data.jumlah);

  if (!Number.isInteger(jumlah) || jumlah === 0) {
    throw new GalatIsian(`Jumlah harus bilangan bulat dan bukan nol: ${data.jumlah}`);
  }

  if (jenis !== "koreksi" && jumlah < 0) {
    throw new GalatIsian(
      `Jumlah ${jenis} harus positif. Hanya koreksi yang boleh minus.`,
    );
  }

  const idBarang = teks(data.id_barang);

  if (!idBarang) throw new GalatIsian("Kode barang wajib diisi.");

  const sumber = teks(data.sumber) || "dashboard";

  if (!SUMBER.includes(sumber)) throw new GalatIsian(`Sumber tidak dikenal: ${sumber}`);

  return {
    tanggal: tanggalAtauSekarang(data.tanggal),
    id_barang: idBarang,
    jenis,
    jumlah,
    pihak: teks(data.pihak),
    unit: teks(data.unit),
    keterangan: teks(data.keterangan),
    rencana_kembali: jenis === "pinjam" ? tanggalAtauNull(data.rencana_kembali) : null,
    sumber,
  };
}

async function kunciBarang(koneksi, idBarang) {
  const { rows } = await koneksi.query(
    `SELECT id_barang, nama, satuan, stok FROM barang
      WHERE id_barang = $1 FOR UPDATE`,
    [idBarang],
  );

  if (!rows[0]) throw new GalatIsian(`Barang ${idBarang} tidak ada di katalog.`);

  return rows[0];
}

// Mengubah stok di dalam transaksi. CHECK (stok >= 0) di tabel
// barang yang menolak stok minus; pesannya diterjemahkan supaya
// operator tahu barang mana dan berapa sisanya.
async function geserStok(koneksi, barang, selisih) {
  if (barang.stok + selisih < 0) {
    throw new GalatIsian(
      `Stok ${barang.id_barang} (${barang.nama}) tidak cukup: tersisa ` +
        `${barang.stok}, perubahan ${selisih}.`,
    );
  }

  const { rows } = await koneksi.query(
    `UPDATE barang SET stok = stok + $2 WHERE id_barang = $1 RETURNING stok`,
    [barang.id_barang, selisih],
  );

  barang.stok = rows[0].stok;

  return barang.stok;
}

async function tulisLog(koneksi, mutasiId, aksi, lama, baru, oleh) {
  await koneksi.query(
    `INSERT INTO mutasi_barang_log (mutasi_id, aksi, data_lama, data_baru, oleh)
     VALUES ($1, $2, $3, $4, $5)`,
    [mutasiId, aksi, lama, baru, teks(oleh)],
  );
}

async function sisipkan(koneksi, isian, barang, stokSesudah, oleh, tambahan = {}) {
  const { rows } = await koneksi.query(
    `INSERT INTO mutasi_barang
       (tanggal, id_barang, nama_barang, satuan, jenis, jumlah, stok_sesudah,
        pihak, unit, keterangan, rencana_kembali, pinjam_id, sumber, dicatat_oleh)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING ${KOLOM}`,
    [
      isian.tanggal,
      barang.id_barang,
      barang.nama,
      barang.satuan,
      isian.jenis,
      isian.jumlah,
      stokSesudah,
      isian.pihak,
      isian.unit,
      isian.keterangan,
      isian.rencana_kembali,
      tambahan.pinjam_id ?? null,
      isian.sumber,
      teks(oleh),
    ],
  );

  return rows[0];
}

async function catatDalam(koneksi, data, oleh) {
  const isian = rapikan(data);
  const barang = await kunciBarang(koneksi, isian.id_barang);
  const stokSesudah = await geserStok(koneksi, barang, efek(isian.jenis, isian.jumlah));
  const baris = await sisipkan(koneksi, isian, barang, stokSesudah, oleh);

  await tulisLog(koneksi, baris.id, "buat", null, baris, oleh);

  return baris;
}

// =========================================================
// BACA
// =========================================================

// Batas atas jumlah baris supaya rentang tanggal yang terlalu
// lebar tidak menarik ribuan baris ke browser sekaligus.
const BATAS_BARIS = 5000;

async function daftar(saring = {}) {
  const syarat = [];
  const nilai = [];

  const tambah = (sql, v) => {
    nilai.push(v);
    syarat.push(sql.replace("?", `$${nilai.length}`));
  };

  // `sampai` inklusif sehari penuh: "sampai 31 Oktober" berarti
  // sampai 31 Oktober 23:59, bukan 31 Oktober 00:00.
  if (saring.dari) tambah("tanggal >= ?::date", saring.dari);
  if (saring.sampai) tambah("tanggal < ?::date + 1", saring.sampai);
  if (saring.id_barang) tambah("id_barang = ?", saring.id_barang);
  if (saring.jenis && JENIS.includes(saring.jenis)) tambah("jenis = ?", saring.jenis);

  if (saring.cari) {
    nilai.push(`%${saring.cari}%`);

    const n = `$${nilai.length}`;

    syarat.push(
      `(nama_barang ILIKE ${n} OR id_barang ILIKE ${n} OR pihak ILIKE ${n}
        OR unit ILIKE ${n} OR keterangan ILIKE ${n})`,
    );
  }

  if (saring.status === "dipinjam") {
    syarat.push("jenis = 'pinjam' AND dikembalikan_pada IS NULL");
  }

  const where = syarat.length ? `WHERE ${syarat.join(" AND ")}` : "";

  return semuaBaris(
    `SELECT ${KOLOM} FROM mutasi_barang ${where}
      ORDER BY tanggal DESC, id DESC LIMIT ${BATAS_BARIS}`,
    nilai,
  );
}

async function satu(id) {
  return satuBaris(`SELECT ${KOLOM} FROM mutasi_barang WHERE id = $1`, [id]);
}

async function riwayatLog(mutasiId) {
  return semuaBaris(
    `SELECT id, mutasi_id, aksi, data_lama, data_baru, oleh, pada
       FROM mutasi_barang_log WHERE mutasi_id = $1 ORDER BY pada, id`,
    [mutasiId],
  );
}

// Baris order WA yang disetujui milik para pemohon atau unit ini,
// urut waktu. Dipakai features/buktiSerahTerima.js untuk menentukan
// order mana pemilik sebuah PDF serah terima.
async function waktuOrderWa(daftarPihak, daftarUnit = []) {
  if (!daftarPihak.length && !daftarUnit.length) return [];

  return semuaBaris(
    `SELECT pihak, unit, tanggal FROM mutasi_barang
      WHERE jenis = 'keluar' AND sumber = 'wa'
        AND (pihak = ANY($1) OR unit = ANY($2))
      ORDER BY tanggal`,
    [daftarPihak, daftarUnit],
  );
}

// Ringkasan per barang dalam rentang tanggal: total masuk, keluar,
// dan yang masih di tangan peminjam. Dipakai kartu ringkasan di
// tab rekap dan lampiran laporan PDF.
async function ringkasan(saring = {}) {
  const syarat = [];
  const nilai = [];

  if (saring.dari) {
    nilai.push(saring.dari);
    syarat.push(`tanggal >= $${nilai.length}::date`);
  }

  if (saring.sampai) {
    nilai.push(saring.sampai);
    syarat.push(`tanggal < $${nilai.length}::date + 1`);
  }

  const where = syarat.length ? `WHERE ${syarat.join(" AND ")}` : "";

  return semuaBaris(
    `SELECT id_barang,
            max(nama_barang) AS nama_barang,
            max(satuan) AS satuan,
            COALESCE(sum(jumlah) FILTER (WHERE jenis = 'masuk'), 0)::int   AS masuk,
            COALESCE(sum(jumlah) FILTER (WHERE jenis = 'keluar'), 0)::int  AS keluar,
            COALESCE(sum(jumlah) FILTER (WHERE jenis = 'pinjam'), 0)::int  AS pinjam,
            COALESCE(sum(jumlah) FILTER (WHERE jenis = 'kembali'), 0)::int AS kembali,
            COALESCE(sum(jumlah) FILTER (WHERE jenis = 'koreksi'), 0)::int AS koreksi
       FROM mutasi_barang ${where}
      GROUP BY id_barang
      ORDER BY id_barang`,
    nilai,
  );
}

// =========================================================
// TULIS
// =========================================================

async function catat(data, oleh = "") {
  return dalamTransaksi((koneksi) => catatDalam(koneksi, data, oleh));
}

// Mengedit mutasi berarti membatalkan efek lamanya pada stok lalu
// menerapkan efek barunya — termasuk kalau barangnya diganti, yang
// berarti dua barang berbeda yang stoknya bergeser.
async function perbarui(id, data, oleh = "") {
  return dalamTransaksi(async (koneksi) => {
    const { rows } = await koneksi.query(
      `SELECT ${KOLOM} FROM mutasi_barang WHERE id = $1 FOR UPDATE`,
      [id],
    );

    const lama = rows[0];

    if (!lama) return null;

    const isian = rapikan({ ...lama, ...data, sumber: lama.sumber });

    if (lama.jenis === "kembali" && isian.jenis !== "kembali") {
      throw new GalatIsian(
        "Baris pengembalian tidak bisa diubah jenisnya. Hapus barisnya bila salah catat.",
      );
    }

    // Pinjaman yang sudah kembali terikat pada baris `kembali`-nya:
    // mengubah barang atau jumlahnya membuat keduanya tidak cocok.
    if (
      lama.jenis === "pinjam" &&
      lama.dikembalikan_pada &&
      (isian.jenis !== "pinjam" ||
        isian.jumlah !== lama.jumlah ||
        isian.id_barang !== lama.id_barang)
    ) {
      throw new GalatIsian(
        "Pinjaman ini sudah dikembalikan. Hapus dulu baris pengembaliannya bila ingin mengubah barang atau jumlahnya.",
      );
    }

    let barangBaru;
    let stokSesudah = null;

    if (tanpaEfekStok(lama)) {
      // Baris riwayat hanya diperbaiki isinya; stok tidak disentuh.
      // Barang yang tidak diganti boleh sudah hilang dari katalog.
      barangBaru =
        isian.id_barang === lama.id_barang
          ? { id_barang: lama.id_barang, nama: lama.nama_barang, satuan: lama.satuan }
          : await kunciBarang(koneksi, isian.id_barang);
    } else {
      // Kunci keduanya dengan urutan tetap supaya dua edit yang
      // saling menukar barang tidak saling menunggu selamanya.
      const kodeBarang = [...new Set([lama.id_barang, isian.id_barang])].sort();
      const terkunci = {};

      for (const kode of kodeBarang) {
        terkunci[kode] = await kunciBarang(koneksi, kode).catch((err) => {
          // Barang lama boleh sudah dihapus dari katalog; yang baru
          // tidak.
          if (kode === lama.id_barang && kode !== isian.id_barang) return null;
          throw err;
        });
      }

      const barangLama = terkunci[lama.id_barang];
      barangBaru = terkunci[isian.id_barang];

      // Barang yang sama digeser sekali dengan selisih bersihnya.
      // Dua langkah (batalkan lalu terapkan) bisa gagal di tengah
      // jalan tanpa alasan: mengubah "masuk 10" jadi "masuk 12" saat
      // stok tinggal 5 akan sempat menjadi -5.
      if (barangLama === barangBaru) {
        stokSesudah = await geserStok(
          koneksi,
          barangBaru,
          efek(isian.jenis, isian.jumlah) - efek(lama.jenis, lama.jumlah),
        );
      } else {
        if (barangLama) await geserStok(koneksi, barangLama, -efek(lama.jenis, lama.jumlah));

        stokSesudah = await geserStok(koneksi, barangBaru, efek(isian.jenis, isian.jumlah));
      }
    }

    const hasil = await koneksi.query(
      `UPDATE mutasi_barang SET
          tanggal = $2, id_barang = $3, nama_barang = $4, satuan = $5,
          jenis = $6, jumlah = $7, stok_sesudah = $8, pihak = $9, unit = $10,
          keterangan = $11, rencana_kembali = $12,
          dikembalikan_pada = CASE WHEN $6 = 'pinjam' THEN dikembalikan_pada END
        WHERE id = $1 RETURNING ${KOLOM}`,
      [
        id,
        isian.tanggal,
        barangBaru.id_barang,
        barangBaru.nama,
        barangBaru.satuan,
        isian.jenis,
        isian.jumlah,
        stokSesudah,
        isian.pihak,
        isian.unit,
        isian.keterangan,
        isian.rencana_kembali,
      ],
    );

    const baru = hasil.rows[0];

    await tulisLog(koneksi, id, "ubah", lama, baru, oleh);

    return baru;
  });
}

async function hapus(id, oleh = "") {
  return dalamTransaksi(async (koneksi) => {
    const { rows } = await koneksi.query(
      `SELECT ${KOLOM} FROM mutasi_barang WHERE id = $1 FOR UPDATE`,
      [id],
    );

    const lama = rows[0];

    if (!lama) return null;

    if (lama.jenis === "pinjam" && lama.dikembalikan_pada) {
      throw new GalatIsian(
        "Pinjaman ini sudah dikembalikan. Hapus dulu baris pengembaliannya.",
      );
    }

    // Barang yang sudah dihapus dari katalog tidak punya stok lagi
    // untuk dikembalikan; mutasinya tetap boleh dihapus. Baris
    // riwayat tidak pernah mengubah stok, jadi tidak ada yang
    // dikembalikan.
    const barang = tanpaEfekStok(lama)
      ? null
      : await kunciBarang(koneksi, lama.id_barang).catch(() => null);

    if (barang) await geserStok(koneksi, barang, -efek(lama.jenis, lama.jumlah));

    // Pengembalian yang dihapus membuat pinjamannya terbuka lagi.
    if (lama.jenis === "kembali" && lama.pinjam_id) {
      await koneksi.query(
        `UPDATE mutasi_barang SET dikembalikan_pada = NULL WHERE id = $1`,
        [lama.pinjam_id],
      );
    }

    await koneksi.query(`DELETE FROM mutasi_barang WHERE id = $1`, [id]);
    await tulisLog(koneksi, id, "hapus", lama, null, oleh);

    return lama;
  });
}

// Menutup satu pinjaman: mencatat baris `kembali` sejumlah yang
// dipinjam dan menandai pinjamannya selesai.
async function kembalikan(pinjamId, data = {}, oleh = "") {
  return dalamTransaksi(async (koneksi) => {
    const { rows } = await koneksi.query(
      `SELECT ${KOLOM} FROM mutasi_barang WHERE id = $1 FOR UPDATE`,
      [pinjamId],
    );

    const pinjam = rows[0];

    if (!pinjam) return null;

    if (pinjam.jenis !== "pinjam") throw new GalatIsian("Baris ini bukan peminjaman.");

    if (pinjam.dikembalikan_pada) throw new GalatIsian("Pinjaman ini sudah dikembalikan.");

    const isian = rapikan({
      tanggal: data.tanggal,
      id_barang: pinjam.id_barang,
      jenis: "kembali",
      jumlah: pinjam.jumlah,
      pihak: pinjam.pihak,
      unit: pinjam.unit,
      keterangan: teks(data.keterangan) || `Pengembalian pinjaman #${pinjam.id}`,
      sumber: "dashboard",
    });

    const barang = await kunciBarang(koneksi, pinjam.id_barang);
    const stokSesudah = await geserStok(koneksi, barang, isian.jumlah);
    const baris = await sisipkan(koneksi, isian, barang, stokSesudah, oleh, {
      pinjam_id: pinjam.id,
    });

    await tulisLog(koneksi, baris.id, "buat", null, baris, oleh);

    const tutup = await koneksi.query(
      `UPDATE mutasi_barang SET dikembalikan_pada = $2 WHERE id = $1 RETURNING ${KOLOM}`,
      [pinjam.id, isian.tanggal],
    );

    await tulisLog(koneksi, pinjam.id, "ubah", pinjam, tutup.rows[0], oleh);

    return baris;
  });
}

// Import Excel: semua atau tidak sama sekali. Berkas setengah
// masuk lebih menyulitkan daripada berkas yang ditolak utuh —
// operator tidak tahu baris mana yang harus diimpor ulang.
//
// Pesan galatnya menyebut nomor baris Excel (`baris_excel` dari
// browser), supaya bisa langsung dicari di berkasnya.
async function imporBanyak(daftarBaris, oleh = "") {
  if (!Array.isArray(daftarBaris) || !daftarBaris.length) {
    throw new GalatIsian("Tidak ada baris untuk diimpor.");
  }

  if (daftarBaris.length > 2000) {
    throw new GalatIsian("Maksimal 2000 baris per sekali import. Pecah berkasnya.");
  }

  return dalamTransaksi(async (koneksi) => {
    const hasil = [];

    for (let i = 0; i < daftarBaris.length; i++) {
      const b = daftarBaris[i];

      try {
        hasil.push(await catatDalam(koneksi, { ...b, sumber: "import" }, oleh));
      } catch (err) {
        const nomor = b.baris_excel ?? i + 2;
        const galat = new GalatIsian(`Baris ${nomor}: ${err.message}`);

        if (!err.status) galat.status = 500;

        throw galat;
      }
    }

    return hasil;
  });
}

module.exports = {
  JENIS,
  efek,
  daftar,
  satu,
  riwayatLog,
  ringkasan,
  waktuOrderWa,
  catat,
  perbarui,
  hapus,
  kembalikan,
  imporBanyak,
};
