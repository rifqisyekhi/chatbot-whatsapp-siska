-- =========================================================
-- REKAP PEMELIHARAAN / SERVICE KENDARAAN DINAS
-- =========================================================
--
-- Dijalankan OTOMATIS oleh bot saat menyala (db/servisKendaraan.js
-- → pastikanSkema). Bisa juga dijalankan tangan:
--
--   psql -h 127.0.0.1 -U siska -d db_siska -w -v ON_ERROR_STOP=1 \
--        -f db/006-servis-kendaraan.sql
--
-- BISA DIJALANKAN BERULANG — semuanya IF NOT EXISTS, dan isian
-- tahun/no. mesin hanya mengisi baris yang masih kosong.
--
-- SENGAJA TANPA FOREIGN KEY KE kendaraan
--
-- Kendaraan yang dihapus dari Master Data tetap harus punya riwayat
-- biaya pemeliharaan. Karena itu nama, nopol, dan jenisnya disalin
-- ke baris service saat dicatat.

BEGIN;

CREATE TABLE IF NOT EXISTS servis_kendaraan (
    id                       BIGSERIAL PRIMARY KEY,
    kendaraan_id             BIGINT,
    nama_kendaraan           TEXT        NOT NULL,
    plat                     TEXT        NOT NULL DEFAULT '',
    jenis                    TEXT        NOT NULL DEFAULT 'Mobil',
    tanggal_servis           DATE        NOT NULL,
    bengkel                  TEXT        NOT NULL DEFAULT '',
    biaya                    BIGINT      NOT NULL CHECK (biaya >= 0),
    keterangan               TEXT        NOT NULL DEFAULT '',
    pelapor_nama             TEXT        NOT NULL DEFAULT '',
    pelapor_nip              TEXT        NOT NULL DEFAULT '',
    pelapor_wa               TEXT        NOT NULL DEFAULT '',
    jumlah_foto_nota         INTEGER     NOT NULL DEFAULT 0,
    jumlah_foto_dokumentasi  INTEGER     NOT NULL DEFAULT 0,
    -- Path relatif terhadap folder reports/, misal
    -- servis-kendaraan/Budi_Santoso/SPBY_Service_....pdf
    berkas_pdf               TEXT        NOT NULL DEFAULT '',
    sumber                   TEXT        NOT NULL DEFAULT 'whatsapp',
    dibuat_pada              TIMESTAMPTZ NOT NULL DEFAULT now(),
    diubah_pada              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS servis_kendaraan_tanggal_idx
    ON servis_kendaraan (tanggal_servis);
CREATE INDEX IF NOT EXISTS servis_kendaraan_kendaraan_idx
    ON servis_kendaraan (kendaraan_id);

-- Kolom yang dibutuhkan lembar Monitoring Pemeliharaan Kendis.
ALTER TABLE kendaraan ADD COLUMN IF NOT EXISTS tahun    INTEGER;
ALTER TABLE kendaraan ADD COLUMN IF NOT EXISTS no_mesin TEXT;

-- Isian awal dari docs/Monitoring Pemeliharaan Kendis.xlsx, dicocokkan
-- lewat nopol tanpa spasi dan titik ("B. 1176 WQ" = "B 1176 WQ").
-- Hanya mengisi yang masih kosong, jadi suntingan admin di Master
-- Data tidak pernah ditimpa.
UPDATE kendaraan k
   SET tahun    = COALESCE(k.tahun, v.tahun),
       no_mesin = COALESCE(NULLIF(k.no_mesin, ''), v.no_mesin)
  FROM (VALUES
        ('B1176WQ',  2005, 'E263321'),
        ('B1613WQ',  2005, 'E272531'),
        ('B2760DQ',  2007, 'E283307'),
        ('B1082SQO', 2011, 'L15A74805435'),
        ('B1814SQO', 2012, 'ITR7377624'),
        ('B1813SQO', 2012, 'ITR7378329'),
        ('B1904SQP', 2015, 'L15Z11207539'),
        ('B1905SQP', 2015, 'L15Z11207546'),
        ('B1907SQP', 2015, 'L15Z11203929'),
        ('B6058SQW', 2011, '31B771871'),
        ('B3962SQA', 2012, 'JB81E1806890'),
        ('B3985SQA', 2012, 'JB81E1806891'),
        ('B3243SQC', 2015, 'JFS1E1189999'),
        ('B3244SQC', 2015, 'JFS1E1190013'),
        ('B3242SQC', 2015, 'JFS1E1189971'),
        ('B3240SQC', 2015, 'JFU1E1208935'),
        ('B3246SQC', 2015, 'KC52E1268148'),
        ('B3241SQC', 2015, 'KC52E1268038'),
        ('B3783SQE', 2017, 'E3R2E1437492'),
        ('B3784SQE', 2018, 'E3R2E1865865'),
        ('B3785SQE', 2018, 'E3R2E1942716'),
        ('B3786SQE', 2018, 'E3R2E1942726')
       ) AS v (plat_bersih, tahun, no_mesin)
 WHERE upper(regexp_replace(k.plat, '[^A-Za-z0-9]', '', 'g')) = v.plat_bersih
   AND (k.tahun IS NULL OR k.no_mesin IS NULL OR k.no_mesin = '');

COMMIT;
