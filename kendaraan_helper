const { google } = require('googleapis');
const path = require('path');

// ID Spreadsheet Anda (Pastikan Benar)
const SPREADSHEET_ID_MOBIL = '';

// AUTH GOOGLE
async function getGoogleSheetClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, 'credentials.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return await auth.getClient();
}

async function inputLogMobilKeSheet(data) {

    const targetSheetName = 'Sheet2';

    try {
        console.log(`[SHEETS] ⏳ Memulai proses input ke ${targetSheetName}...`);

        const client = await getGoogleSheetClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        const rowData = [
            data.tanggal,
            data.nama_pegawai,
            "'" + data.nip,
            data.mobil,
            data.km_awal,
            data.km_akhir,
            data.jarak,
            data.bbm_akhir,
            data.kondisi,
            data.jam_pinjam,
            data.jam_akhir
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID_MOBIL,

            range: `'${targetSheetName}'!A:A`,

            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [ rowData ]
            },
        });

        console.log(`[SHEETS] ✅ Data berhasil ditambahkan ke ${targetSheetName}`);

    } catch (error) {
        console.error("[SHEET MOBIL ERROR]", error.message);
        throw error;
    }
}

module.exports = { inputLogMobilKeSheet };
