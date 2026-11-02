-- =========================================================
-- REKAP MUTASI BARANG (AUDIT PERSEDIAAN)
-- =========================================================
--
--   psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 \
--        -f db/005-mutasi-barang.sql
--
-- Lanjutan dari presensi-non-asn/backend/db/001-004. Disimpan di
-- repo bot karena hanya bot yang memakainya.
--
-- MENGAPA PERLU
--
-- Sampai sekarang `barang.stok` hanya satu angka yang ditimpa:
-- order WhatsApp menguranginya, edit di dashboard menimpanya.
-- Tidak ada jejak siapa mengambil apa dan kapan, jadi audit
-- persediaan tidak bisa dijawab dari sistem.
--
-- DUA TABEL
--
--   mutasi_barang      satu baris = satu kejadian (masuk, keluar,
--                      pinjam, kembali, koreksi). Boleh diedit
--                      dan dihapus dari dashboard.
--   mutasi_barang_log  setiap buat/ubah/hapus atas tabel di atas,
--                      lengkap dengan isi lama dan baru. Hanya
--                      ditambah, tidak pernah diubah aplikasi.
--
-- Karena mutasi boleh diedit, log-lah yang membuat rekap ini
-- layak dipakai audit: perubahan tetap kelihatan.
--
-- SENGAJA TANPA FOREIGN KEY KE barang
--
-- Barang yang dihapus dari katalog tetap harus punya riwayat.
-- Karena itu nama dan satuan barang disalin ke baris mutasi saat
-- dicatat.
--
-- BISA DIJALANKAN BERULANG — semuanya IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS mutasi_barang (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Tanggal kejadian, bukan tanggal dicatat. Barang yang masuk
  -- Senin bisa saja baru diinput Rabu, atau datang dari import
  -- Excel bulan lalu.
  tanggal       timestamptz NOT NULL DEFAULT now(),

  id_barang     text NOT NULL,
  nama_barang   text NOT NULL DEFAULT '',
  satuan        text NOT NULL DEFAULT '',

  --   masuk    stok bertambah (pembelian, hibah, saldo awal)
  --   keluar   stok berkurang (diambil pegawai, habis pakai)
  --   pinjam   stok berkurang, diharapkan kembali
  --   kembali  stok bertambah, pengembalian dari `pinjam`
  --   koreksi  penyesuaian hasil stock opname; jumlahnya
  --            bertanda (boleh minus)
  jenis         text NOT NULL
                CHECK (jenis IN ('masuk', 'keluar', 'pinjam', 'kembali', 'koreksi')),

  -- Selalu positif kecuali untuk koreksi. Arah stoknya ditentukan
  -- jenis, bukan tanda angka — supaya "keluar -5" tidak bisa
  -- diam-diam berarti barang masuk.
  jumlah        integer NOT NULL
                CHECK (jumlah <> 0 AND (jenis = 'koreksi' OR jumlah > 0)),

  -- Stok barang SESUDAH mutasi ini, pada saat dicatat. Ini potret,
  -- bukan saldo berjalan: mengedit mutasi lama tidak menghitung
  -- ulang potret mutasi sesudahnya.
  stok_sesudah  integer,

  -- Pegawai yang mengambil / meminjam / menyerahkan barang.
  pihak         text NOT NULL DEFAULT '',
  unit          text NOT NULL DEFAULT '',
  keterangan    text NOT NULL DEFAULT '',

  -- Untuk jenis `pinjam`: rencana kembali, dan kapan benar-benar
  -- dikembalikan. Untuk jenis `kembali`: id baris pinjamnya.
  rencana_kembali  date,
  dikembalikan_pada timestamptz,
  pinjam_id     bigint,

  --   wa         dicatat otomatis dari order WhatsApp
  --   dashboard  diinput operator
  --   import     dari berkas Excel
  sumber        text NOT NULL DEFAULT 'dashboard'
                CHECK (sumber IN ('wa', 'dashboard', 'import')),

  -- Belum ada login, jadi ini nama yang diketik operator. Bukan
  -- bukti identitas — tapi jauh lebih baik daripada tidak ada.
  dicatat_oleh  text NOT NULL DEFAULT '',

  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  diubah_pada   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mutasi_barang_tanggal_idx ON mutasi_barang (tanggal DESC);
CREATE INDEX IF NOT EXISTS mutasi_barang_barang_idx  ON mutasi_barang (id_barang);

-- Daftar "sedang dipinjam" dibuka tiap kali tab rekap dibuka.
CREATE INDEX IF NOT EXISTS mutasi_barang_pinjam_aktif_idx
  ON mutasi_barang (tanggal)
  WHERE jenis = 'pinjam' AND dikembalikan_pada IS NULL;

DROP TRIGGER IF EXISTS mutasi_barang_diubah ON mutasi_barang;
CREATE TRIGGER mutasi_barang_diubah BEFORE UPDATE ON mutasi_barang
  FOR EACH ROW EXECUTE FUNCTION set_diubah_pada();

CREATE TABLE IF NOT EXISTS mutasi_barang_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Tanpa foreign key: log harus tetap ada setelah mutasinya
  -- dihapus, justru itu yang paling perlu dilihat auditor.
  mutasi_id   bigint NOT NULL,

  aksi        text NOT NULL CHECK (aksi IN ('buat', 'ubah', 'hapus')),
  data_lama   jsonb,
  data_baru   jsonb,
  oleh        text NOT NULL DEFAULT '',
  pada        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mutasi_barang_log_mutasi_idx ON mutasi_barang_log (mutasi_id);

COMMIT;
