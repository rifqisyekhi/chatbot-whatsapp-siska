// rekap_pdf.js (VERSI SPK POTRAIT - DATA DARI EXCEL)
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { google } = require('googleapis');

// KONFIGURASI
const SPREADSHEET_ID = '197P-VCn1UoYxOvA778wtD9UISC36FccCB5hS_tsijTw'; 
const SHEET_NAME_PNS = 'pns'; 

// Load Database Pegawai (Untuk ambil Jabatan/Golongan yg tidak ada di Excel)
let dbPegawai = [];
try {
    const dbRaw = fs.readFileSync(path.join(__dirname, "database Pegawai Biro keuangan.json"), "utf8");
    dbPegawai = JSON.parse(dbRaw).Internal || [];
} catch (e) { console.error("Gagal load DB Pegawai lokal"); }

function cariDetailPegawai(nip) {
    const found = dbPegawai.find(p => String(p.nip).trim() === String(nip).trim());
    return found ? { jabatan: found.Jabatan, gol: found.Golongan || "-" } : { jabatan: "-", gol: "-" };
}

async function getGoogleSheetClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, "credentials.json"),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    return await auth.getClient();
}

async function generateRekapPDF(bulan, tahun) {
    const fileName = `SPK_Lembur_${bulan}_${tahun}.pdf`;
    const filePath = path.join(__dirname, "reports", fileName);

    // 1. AMBIL DATA EXCEL
    const client = await getGoogleSheetClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    let dataRows = [];
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME_PNS}!A6:AJ100`, // A=No, B=NIP, C=Nama, D=Tgl 1
        });
        dataRows = res.data.values || [];
    } catch (e) {
        return { success: false, message: `Gagal baca Excel: ${e.message}` };
    }

    // 2. SETUP PDF POTRAIT (TEGAK)
    const doc = new PDFDocument({
        size: "LEGAL", // Atau 'A4'
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // --- CONFIG TABEL SPK ---
    const startX = 40;
    const colWidths = {
        no: 30,
        nama: 150, // Nama & NIP
        jab: 120,  // Gol & Jabatan
        tgl: 100,  // Tanggal (List)
        ket: 130   // Keterangan
    };
    
    // --- HEADER DOKUMEN (KOP) ---
    doc.font("Helvetica").fontSize(10);
    doc.text("Lampiran", 40, 40);
    doc.text("Nomor      : 1/1721/KU.02/IX/2025", 100, 55);
    doc.text(`Tanggal    : ${new Date().toLocaleDateString('id-ID')}`, 100, 70);
    
    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(11)
       .text("PEJABAT/PEGAWAI YANG MELAKSANAKAN PERINTAH KERJA LEMBUR", { align: "center" });
    doc.text(`BULAN ${bulan.toUpperCase()} ${tahun}`, { align: "center" });
    doc.moveDown(2);

    let currentY = doc.y;

    // --- GAMBAR HEADER TABEL ---
    function drawHeader(y) {
        doc.font("Helvetica-Bold").fontSize(9);
        
        let cx = startX;
        
        // Helper Kotak Header
        const drawBox = (txt, w) => {
            doc.rect(cx, y, w, 30).stroke(); // Kotak tinggi 30
            doc.text(txt, cx + 2, y + 10, { width: w - 4, align: "center" });
            cx += w;
        };

        drawBox("NO", colWidths.no);
        drawBox("NAMA / NIP", colWidths.nama);
        drawBox("GOL / JABATAN", colWidths.jab);
        drawBox("TANGGAL", colWidths.tgl);
        drawBox("KETERANGAN", colWidths.ket);
    }

    drawHeader(currentY);
    currentY += 30;

    // --- LOOPING ISI DATA ---
    doc.font("Helvetica").fontSize(9);

    dataRows.forEach((row, index) => {
        // Skip baris kosong
        if (!row[1] || !row[2]) return;

        // 1. OLAH DATA DARI EXCEL
        const no = index + 1;
        const nip = row[1];
        const nama = row[2];
        
        // Cari Jabatan dari JSON DB (karena di Excel cuma ada nama & jam)
        const detail = cariDetailPegawai(nip);
        const jabatanText = `${detail.gol}\n${detail.jabatan}`;

        // Cari Tanggal (Cek Kolom D s/d AH)
        let listTanggal = [];
        for (let i = 0; i < 31; i++) {
            const jam = row[3 + i]; // Index 3 = Tanggal 1
            // Kalau ada isinya (angka > 0), catat tanggalnya
            if (jam && jam.trim() !== "" && jam !== "0") {
                listTanggal.push(i + 1);
            }
        }
        // Gabung jadi string: "1, 3, 5, 20"
        const tanggalStr = listTanggal.join(", ");

        // Default Keterangan (Bisa diedit)
        const keterangan = "Menyelesaikan Tugas Biro Keuangan & BMN";

        // 2. HITUNG TINGGI BARIS (Row Height)
        // Kita harus tau teks mana yang paling panjang biar kotak gak tumpang tindih
        const hNama = doc.heightOfString(`${nama}\n${nip}`, { width: colWidths.nama - 4 });
        const hJab = doc.heightOfString(jabatanText, { width: colWidths.jab - 4 });
        const hTgl = doc.heightOfString(tanggalStr, { width: colWidths.tgl - 4 });
        const hKet = doc.heightOfString(keterangan, { width: colWidths.ket - 4 });

        // Ambil tinggi maksimum + padding
        const rowH = Math.max(hNama, hJab, hTgl, hKet) + 10;

        // Cek Pindah Halaman
        if (currentY + rowH > 850) { // Batas bawah Legal
            doc.addPage({ size: "LEGAL" });
            currentY = 40;
            drawHeader(currentY);
            currentY += 30;
        }

        // 3. GAMBAR KOTAK & ISI TEKS
        let cx = startX;

        // Col NO
        doc.rect(cx, currentY, colWidths.no, rowH).stroke();
        doc.text(no.toString(), cx + 2, currentY + 5, { width: colWidths.no - 4, align: 'center' });
        cx += colWidths.no;

        // Col NAMA/NIP
        doc.rect(cx, currentY, colWidths.nama, rowH).stroke();
        doc.text(`${nama}\nNIP. ${nip}`, cx + 2, currentY + 5, { width: colWidths.nama - 4 });
        cx += colWidths.nama;

        // Col JABATAN
        doc.rect(cx, currentY, colWidths.jab, rowH).stroke();
        doc.text(jabatanText, cx + 2, currentY + 5, { width: colWidths.jab - 4 });
        cx += colWidths.jab;

        // Col TANGGAL (Ini yang Mas mau!)
        doc.rect(cx, currentY, colWidths.tgl, rowH).stroke();
        doc.text(tanggalStr, cx + 2, currentY + 5, { width: colWidths.tgl - 4, align: 'center' });
        cx += colWidths.tgl;

        // Col KETERANGAN
        doc.rect(cx, currentY, colWidths.ket, rowH).stroke();
        doc.text(keterangan, cx + 2, currentY + 5, { width: colWidths.ket - 4 });
        cx += colWidths.ket;

        currentY += rowH; // Turun ke bawah
    });

    // --- TANDA TANGAN ---
    if (currentY > 750) doc.addPage({ size: "LEGAL" });
    
    currentY += 30;
    const ttdX = 350; // Kanan bawah
    
    doc.text('Kepala Biro Keuangan dan BMN', ttdX, currentY);
    doc.text('Setjen Kemnaker', ttdX, currentY + 12);
    // (Bisa insert image TTD disini jika mau)
    doc.moveDown(4);
    doc.text('Dian Kreshnadjati', ttdX, doc.y);
    doc.text('NIP 19741006 199903 2 002', ttdX, doc.y);

    doc.end();

    return new Promise((resolve) => {
        stream.on("finish", () => {
            resolve({ success: true, filePath });
        });
    });
}

module.exports = { generateRekapPDF };