-- =========================================================
-- ADMINISTRASI ROKEU — FITUR KONSUMSI
-- =========================================================
--
-- Dijalankan OTOMATIS saat server menyala (db/konsumsi.js -> pastikanSkema).
-- BISA DIJALANKAN BERULANG — IF NOT EXISTS.
--
-- Satu baris = satu kegiatan konsumsi beserta SPBY, kwitansi, dan rincian item.
-- Isian lengkap disimpan di `isian` (JSONB) untuk menyusun ulang PDF dan form edit.
-- Kolom ringkasan untuk pencarian dan filter di daftar.

BEGIN;

CREATE TABLE IF NOT EXISTS konsumsi (
    id                  BIGSERIAL PRIMARY KEY,
    bidang              TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'aktif'
                                    CHECK (status IN ('aktif', 'dibatalkan')),
    nama_kegiatan       TEXT        NOT NULL DEFAULT '',
    tanggal_kegiatan    DATE        NOT NULL,
    lokasi_provinsi     TEXT        NOT NULL DEFAULT 'D.K.I. Jakarta',
    lokasi_detail       TEXT        NOT NULL DEFAULT '',
    nomor_spby          TEXT        NOT NULL DEFAULT '',
    sbm_kategori        TEXT        NOT NULL DEFAULT 'SBM PMK 32/2025',
    penyedia            TEXT        NOT NULL DEFAULT '',
    nama_penerima       TEXT        NOT NULL DEFAULT '',
    jumlah_porsi        INTEGER     NOT NULL DEFAULT 0,
    total               BIGINT      NOT NULL DEFAULT 0,
    pajak_pph23         BIGINT      NOT NULL DEFAULT 0,
    netto               BIGINT      NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS konsumsi_bidang_idx
    ON konsumsi (bidang, tanggal_kegiatan DESC);

COMMIT;
