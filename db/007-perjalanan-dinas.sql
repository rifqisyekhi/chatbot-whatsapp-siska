-- =========================================================
-- PERJALANAN DINAS (KWITANSI PERDIN) PER BIDANG
-- =========================================================
--
-- Dijalankan OTOMATIS saat server menyala (db/perjalananDinas.js →
-- pastikanSkema). Bisa juga dijalankan tangan:
--
--   psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 \
--        -f db/007-perjalanan-dinas.sql
--
-- BISA DIJALANKAN BERULANG — semuanya IF NOT EXISTS.
--
-- Satu baris = satu nota dinas / satu perjalanan beserta seluruh
-- pesertanya. Isian form disimpan utuh di `isian` (JSONB) dan PDF
-- disusun ulang dari situ setiap kali diminta, jadi tidak ada berkas
-- PDF yang perlu dijaga. Kolom ringkasan (tujuan, tanggal, total)
-- disalin dari hasil hitungan saat disimpan, untuk daftar dan filter.

BEGIN;

CREATE TABLE IF NOT EXISTS perjalanan_dinas (
    id                  BIGSERIAL PRIMARY KEY,
    bidang              TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'aktif'
                                    CHECK (status IN ('aktif', 'dibatalkan')),
    nomor_nota_dinas    TEXT        NOT NULL DEFAULT '',
    jenis               TEXT        NOT NULL CHECK (jenis IN ('dalam', 'luar')),
    maksud              TEXT        NOT NULL DEFAULT '',
    provinsi            TEXT        NOT NULL DEFAULT '',
    kota_tujuan         TEXT        NOT NULL DEFAULT '',
    tanggal_berangkat   DATE        NOT NULL,
    tanggal_kembali     DATE        NOT NULL,
    jumlah_peserta      INTEGER     NOT NULL DEFAULT 0,
    nama_peserta        TEXT        NOT NULL DEFAULT '',
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

CREATE INDEX IF NOT EXISTS perjalanan_dinas_bidang_idx
    ON perjalanan_dinas (bidang, tanggal_berangkat DESC);

-- Pembatalan per peserta (dasar Surat Pernyataan Pembatalan dan
-- Pembebanan Biaya): [{tanggal, alasan, nomor_pernyataan,
-- nomor_surat_tugas, tanggal_surat_tugas, uraian_biaya, sifat_biaya,
-- dipa, seluruh, oleh, peserta: [isian peserta + biaya_hangus]}].
-- Pembatalan sebagian memindahkan peserta dari `isian` ke sini;
-- pembatalan seluruhnya membiarkan `isian` utuh dan status 'dibatalkan'.
ALTER TABLE perjalanan_dinas
    ADD COLUMN IF NOT EXISTS pembatalan JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
