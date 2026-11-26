-- =========================================================
-- BBM KEPALA BIRO PER BIDANG
-- =========================================================
--
-- Dijalankan OTOMATIS saat server menyala (db/bbmKepalaBiro.js →
-- pastikanSkema). Bisa juga dijalankan tangan:
--
--   psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 \
--        -f db/010-bbm-kepala-biro.sql
--
-- BISA DIJALANKAN BERULANG — semuanya IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS bbm_kepala_biro (
    id                  BIGSERIAL PRIMARY KEY,
    bidang              TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'aktif'
                                    CHECK (status IN ('aktif', 'dibatalkan')),
    jenis_bbm           TEXT        NOT NULL DEFAULT '',
    penyedia            TEXT        NOT NULL DEFAULT '',
    kendaraan           TEXT        NOT NULL DEFAULT '',
    keperluan           TEXT        NOT NULL DEFAULT '',
    tanggal_mulai       DATE        NOT NULL,
    tanggal_selesai     DATE        NOT NULL,
    tanggal_bayar       DATE        NOT NULL,
    jumlah_liter        INTEGER     NOT NULL DEFAULT 1,
    penerima_nama       TEXT        NOT NULL DEFAULT '',
    penerima_nip        TEXT        NOT NULL DEFAULT '',
    total               BIGINT      NOT NULL DEFAULT 0,
    isian               JSONB       NOT NULL,
    alasan_batal        TEXT        NOT NULL DEFAULT '',
    tanggal_batal       DATE,
    dibatalkan_oleh     TEXT        NOT NULL DEFAULT '',
    dibuat_oleh         TEXT        NOT NULL DEFAULT '',
    diubah_oleh         TEXT        NOT NULL DEFAULT '',
    riwayat             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
    diubah_pada         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bbm_kepala_biro_bidang_idx
    ON bbm_kepala_biro (bidang, tanggal_bayar DESC);

COMMIT;
