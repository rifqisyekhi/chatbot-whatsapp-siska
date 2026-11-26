-- =========================================================
-- LANGGANAN APLIKASI / LAYANAN DARING PER BIDANG
-- =========================================================
--
-- Dijalankan OTOMATIS saat server menyala (db/langgananAplikasi.js →
-- pastikanSkema). Bisa juga dijalankan tangan:
--
--   psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 \
--        -f db/009-langganan-aplikasi.sql
--
-- BISA DIJALANKAN BERULANG — semuanya IF NOT EXISTS.
--
-- Satu baris = satu pengajuan pembayaran SPBY & kwitansi langganan
-- aplikasi/layanan daring. Isian form disimpan utuh di `isian` (JSONB)
-- dan PDF disusun ulang dari situ setiap kali diminta. Kolom ringkasan
-- disalin dari hasil hitungan saat disimpan untuk daftar dan saringan.

BEGIN;

CREATE TABLE IF NOT EXISTS langganan_aplikasi (
    id                  BIGSERIAL PRIMARY KEY,
    bidang              TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'aktif'
                                    CHECK (status IN ('aktif', 'dibatalkan')),
    nama_aplikasi       TEXT        NOT NULL DEFAULT '',
    penyedia            TEXT        NOT NULL DEFAULT '',
    paket               TEXT        NOT NULL DEFAULT '',
    periode             TEXT        NOT NULL DEFAULT 'Bulanan',
    keperluan           TEXT        NOT NULL DEFAULT '',
    tanggal_mulai       DATE        NOT NULL,
    tanggal_selesai     DATE        NOT NULL,
    tanggal_bayar       DATE        NOT NULL,
    jumlah_lisensi      INTEGER     NOT NULL DEFAULT 1,
    penerima_nama       TEXT        NOT NULL DEFAULT '',
    penerima_nip        TEXT        NOT NULL DEFAULT '',
    total               BIGINT      NOT NULL DEFAULT 0,
    isian               JSONB       NOT NULL,
    alasan_batal        TEXT        NOT NULL DEFAULT '',
    tanggal_batal       DATE,
    dibatalkan_oleh     TEXT        NOT NULL DEFAULT '',
    dibuat_oleh         TEXT        NOT NULL DEFAULT '',
    diubah_oleh         TEXT        NOT NULL DEFAULT '',
    -- Jejak perubahan: [{waktu, oleh, aksi, catatan}]
    riwayat             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
    diubah_pada         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS langganan_aplikasi_bidang_idx
    ON langganan_aplikasi (bidang, tanggal_bayar DESC);

COMMIT;
