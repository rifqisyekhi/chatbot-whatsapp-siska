// Konfigurasi PM2 untuk bot SisKA.
// Jalankan dengan: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "bot-siska",
      script: "index.js",
      cwd: __dirname,

      // WAJIB fork, JANGAN cluster. Cluster akan menjalankan beberapa proses
      // sekaligus, artinya beberapa Chromium berebut satu sesi LocalAuth yang
      // sama dan beberapa proses berebut PORT_WEB yang sama.
      exec_mode: "fork",
      instances: 1,

      // Restart terjadwal tiap hari pukul 00:00 waktu server, untuk memangkas
      // memori Chromium yang menggelembung pelan-pelan pada proses 24 jam.
      // PENTING: cron ini memakai zona waktu server, bukan WIB. Pastikan
      // `timedatectl` menunjukkan Asia/Jakarta; kalau server masih UTC,
      // ganti ke "0 17 * * *" (17:00 UTC = 00:00 WIB).
      cron_restart: "0 0 * * *",

      autorestart: true,
      restart_delay: 5000,

      // Kalau proses mati kurang dari 60 detik setelah start sebanyak 10 kali,
      // PM2 berhenti mencoba. Ini rem darurat supaya crash-loop tidak
      // menghabiskan CPU seperti kejadian restart beruntun sebelumnya.
      min_uptime: "60s",
      max_restarts: 10,

      // Catatan jujur: PM2 hanya mengukur memori proses Node, TIDAK menghitung
      // proses Chromium yang dilahirkan Puppeteer — padahal justru Chromium
      // yang paling rakus. Jadi ambang ini hanya jaring pengaman untuk
      // kebocoran di sisi Node, bukan pengaman memori browser.
      max_memory_restart: "1G",

      time: true, // Tambahkan timestamp di setiap baris log
      merge_logs: true,

      env: {
        NODE_ENV: "production",
        TZ: "Asia/Jakarta",
      },
    },
  ],
};
