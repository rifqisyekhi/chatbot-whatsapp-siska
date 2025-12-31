// sheets_helper.js (VERSI CERDAS & DEBUGGING)
const { google } = require('googleapis');
const path = require('path');

// [KONFIGURASI] Pastikan ID ini benar untuk File DESEMBER
const SPREADSHEET_ID = '197P-VCn1UoYxOvA778wtD9UISC36FccCB5hS_tsijTw'; 
const SHEET_NAME_PNS = 'pns';

async function getGoogleSheetClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return await auth.getClient();
}

function indexToColumnLetter(idx) {
  let letter = '';
  while (idx >= 0) {
    letter = String.fromCharCode((idx % 26) + 65) + letter;
    idx = Math.floor(idx / 26) - 1;
  }
  return letter;
}

// Hanya ambil angka dari NIP
function normalisasiNIP(nip) {
  if (!nip) return "";
  return String(nip).replace(/[^0-9]/g, '').trim(); 
}

function getDurationNumber(start, end) {
  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  let duration = (eH + eM / 60) - (sH + sM / 60);
  if (duration < 0) duration += 24; 
  return parseFloat(duration.toFixed(1)); 
}

async function inputJamLemburKeSheet(dataPegawai, tanggalStr, jamMasuk, jamKeluar) {
  try {
    console.log(`[SHEETS] 🔍 Memulai pencarian untuk NIP: ${dataPegawai.nip}...`);
    
    const client = await getGoogleSheetClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // 1. Baca Data Sheet (Area Luas)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME_PNS}!A1:AH200`, // Baca sampai kolom Tanggal 31 (AH) & Baris 200
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      console.log('[SHEETS ERROR] Data Excel kosong/tidak terbaca.');
      return;
    }

    // 2. Cari Lokasi Kolom Tanggal (Otomatis Deteksi Header)
    // Kita cari baris yang isinya angka "1", "2", "3" secara berurutan (Header Tanggal)
    const tglObj = new Date(tanggalStr);
    const targetHari = String(tglObj.getDate()); // "2"
    
    let colIndexTanggal = -1;
    let headerRowIndex = -1;

    // Scanning Header (Biasanya di baris ke-5 atau 6)
    for (let r = 0; r < 10; r++) { // Cek 10 baris pertama
        if (rows[r]) {
            // Cari kolom yang isinya sama dengan targetHari (misal "2")
            const foundIdx = rows[r].findIndex(val => String(val).trim() === targetHari);
            if (foundIdx !== -1) {
                // Verifikasi sederhana: cek apakah sebelahnya ada tanggal +1/-1
                colIndexTanggal = foundIdx;
                headerRowIndex = r;
                console.log(`[SHEETS] 📅 Header Tanggal ditemukan di Baris ${r+1}, Kolom Index ${colIndexTanggal} (Untuk Tgl ${targetHari})`);
                break;
            }
        }
    }

    // Fallback jika header tidak ketemu (Pakai rumus manual Anda: Hari + 2)
    if (colIndexTanggal === -1) {
        console.log(`[SHEETS] ⚠️ Header tanggal tidak terdeteksi otomatis. Menggunakan rumus manual.`);
        colIndexTanggal = parseInt(targetHari) + 3; // ASUMSI BARU: Biasanya ada kolom No, Nama, NIP, Gol -> Tanggal 1 di Index 4 (Kolom E)
        // Coba sesuaikan angka '+ 3' ini jika meleset ke kiri/kanan
    }

    const colLetter = indexToColumnLetter(colIndexTanggal);

    // 3. Cari Baris NIP (Scanning Menyeluruh)
    const targetNIP = normalisasiNIP(dataPegawai.nip);
    let targetRow = -1;

    for (let i = 0; i < rows.length; i++) {
        // Gabungkan semua isi sel di baris itu jadi satu string biar gampang dicari
        const rowString = rows[i].map(c => normalisasiNIP(c)).join(" ");
        
        if (rowString.includes(targetNIP)) {
            targetRow = i + 1; // Row Excel (1-based)
            console.log(`[SHEETS] 👤 NIP ditemukan di Baris ${targetRow}: ${rows[i][1] || rows[i][2]}`); // Print nama utk konfirmasi
            break;
        }
    }

    if (targetRow === -1) {
      console.log(`[SHEETS WARNING] ❌ NIP ${targetNIP} TIDAK DITEMUKAN di Sheet '${SHEET_NAME_PNS}'.`);
      // Debug: Tampilkan 5 baris pertama kolom B agar user tau isinya apa
      console.log(`[DEBUG] Isi 5 baris pertama Kolom B: ${rows.slice(0,5).map(r => r[1]).join(', ')}`);
      return;
    }

    // 4. Tulis Data
    const durasi = getDurationNumber(jamMasuk, jamKeluar);
    const targetCell = `${SHEET_NAME_PNS}!${colLetter}${targetRow}`;
    
    console.log(`[SHEETS] ✍️ Menulis durasi ${durasi} jam di sel ${targetCell}...`);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: targetCell,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[durasi]] },
    });

    console.log(`[SHEETS] ✅ SUKSES UPDATE SPREADSHEET!`);

  } catch (error) {
    console.error('[SHEETS ERROR]', error.message);
  }
}

module.exports = { inputJamLemburKeSheet };