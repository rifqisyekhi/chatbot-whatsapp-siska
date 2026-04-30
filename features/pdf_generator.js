const { MessageMedia } = require("whatsapp-web.js");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { imageSize } = require("image-size");
const axios = require("axios");

const REPORTS_DIR = path.join(__dirname, "..", "reports");
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

async function ensureDirAsync(p) {
  try {
    await fsPromises.mkdir(p, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

function ensureDir(p) {
  try {
    fs.mkdirSync(p, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {}
  }
}

function calculateDuration(startStr, endStr) {
  if (!startStr || !endStr || !startStr.includes(":") || !endStr.includes(":"))
    return "N/A";
  try {
    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);

    const startDate = new Date(0, 0, 0, startH, startM, 0);
    let endDate = new Date(0, 0, 0, endH, endM, 0);

    if (endDate < startDate) {
      endDate.setDate(endDate.getDate() + 1);
    }

    const diffMs = endDate - startDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${diffHours} jam ${diffMins} menit`;
  } catch (e) {
    console.error("Error calculating duration:", e);
    return "Error";
  }
}

async function getDummySignature(nip) {
  const url = "https://raw.githubusercontent.com/sandro4132017/dummy-signature-api/main/signature1.png";
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 7000 });
    return Buffer.from(res.data);
  } catch (e) {
    return null;
  }
}

// ==========================================
// PDF LEMBUR (SISTEM TABEL FOTO ANTI-BOCOR)
// ==========================================
async function buatLaporanLemburDenganFotoAsync(data, fotoPaths, chatId, targetAtasan, client) {
  await ensureDirAsync(REPORTS_DIR);
  await ensureDirAsync(UPLOADS_DIR);

  const tanggalLaporan = new Date().toISOString().split("T")[0];
  const safeSubstansi = (data.substansi || "TU").replace(/[\/\\]/g, "_");
  
  const namaFile = `Laporan Lembur_${data.nama}_${data.nip}_${safeSubstansi}_${tanggalLaporan}.pdf`;
  const filePath = path.join(REPORTS_DIR, namaFile);

  const doc = new PDFDocument({
    margins: { top: 57, bottom: 57, left: 57, right: 57 },
  });

  try {
    const fontDir = path.join(__dirname, "..", "assets", "fonts");
    try {
      doc.registerFont("TMR", path.join(fontDir, "times.ttf"));
      doc.registerFont("TMR-Bold", path.join(fontDir, "times-bold.ttf"));
      doc.font("TMR");
    } catch (e) {
      doc.font("Helvetica");
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const loadedImages = await Promise.all(
      fotoPaths.map(async (p) => {
        try {
          const buf = await fsPromises.readFile(p);
          const dim = imageSize(buf);
          return { path: p, buffer: buf, dimensions: dim, valid: true };
        } catch (e) {
          return { path: p, valid: false };
        }
      }),
    );

    // KOP SURAT
    doc.font("TMR-Bold").fontSize(14).text("KEMENTERIAN KETENAGAKERJAAN RI", { align: "center" });
    doc.y += (doc.heightOfString("A") * 0.15);
    doc.text("SEKRETARIAT JENDERAL - BIRO KEUANGAN DAN BMN", { align: "center" });

    // Jarak 1.5 space
    doc.y += (doc.heightOfString("A") * 0.5);
    doc.font("TMR-Bold").fontSize(13).text("LAPORAN LEMBUR", { align: "center", underline: true });

    // Jarak 1.15 space
    doc.y += (doc.heightOfString("A") * 0.15);

    // IDENTITAS PEGAWAI (Spasi 1.15 & Titik Dua Lurus)
    doc.font("TMR").fontSize(11);
    const identitas = [
      ["Nama", data.nama],
      ["NIP", data.nip],
      ["Tanggal", tanggalLaporan],
      ["Jam Mulai", data.jamMasuk],
      ["Jam Selesai", data.jamKeluar],
      ["Total Jam Lembur", calculateDuration(data.jamMasuk, data.jamKeluar)],
      ["Uraian Kegiatan", data.kegiatan], 
    ];

    const labelX = 57;             
    const titikDuaX = 180;         
    const valueX = 190;            
    const maxValWidth = doc.page.width - valueX - 57; 
    const fontHeight = doc.heightOfString("A");
    const spacing115 = fontHeight * 0.15; 

    identitas.forEach(([label, value]) => {
      const startY = doc.y;
      
      doc.text(label, labelX, startY);
      doc.text(":", titikDuaX, startY);
      
      doc.text(value, valueX, startY, { 
        width: maxValWidth, 
        align: "left",
        lineGap: spacing115 
      });
      
      doc.y += spacing115;
    });

    doc.moveDown(1);
    doc.x = doc.page.margins.left;

    doc.font("TMR-Bold").fontSize(12).text("Dokumentasi Hasil Lembur", { align: "center" });
    
    // --- TABEL FOTO ---
    doc.moveDown(0.5);
    doc.font("TMR").fontSize(11);
    const startX = 57;
    const tableWidth = doc.page.width - 114;
    const colWidth = tableWidth / 2;
    const padding = 10;

    // Fungsi canggih untuk Auto-Scale Gambar di dalam kotak
    const getFitDim = (imgData, maxW, maxH) => {
      if (!imgData || !imgData.valid) return { width: 0, height: 0 };
      const ratio = imgData.dimensions.width / imgData.dimensions.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }
      return { width: w, height: h };
    };

    // Batas Max Gambar (Anti-Bocor)
    const maxImgW1 = colWidth - (padding * 2);
    const maxImgH1 = 220; // Tinggi max foto atas (portrait aman)
    const maxImgW3 = tableWidth - (padding * 2);
    const maxImgH3 = 250; // Tinggi max foto bawah

    const dim1 = getFitDim(loadedImages[0], maxImgW1, maxImgH1);
    const dim2 = getFitDim(loadedImages[1], maxImgW1, maxImgH1);
    const dim3 = getFitDim(loadedImages[2], maxImgW3, maxImgH3);

    // Kunci ukuran tinggi sel tabelnya
    const row1Height = maxImgH1 + 35; 
    const row2Height = maxImgH3 + 35;

    // Pengecekan Kertas (Kalau sisa kertas dikit, lempar tabelnya ke halaman 2)
    if (doc.y + row1Height + row2Height > doc.page.height - 57) {
      doc.addPage();
    }

    let currentY = doc.y;

    // ----- BARIS 1 (KIRI - KANAN) -----
    
    // Kotak Kiri (Foto 1)
    doc.rect(startX, currentY, colWidth, row1Height).stroke();
    doc.text("1. Foto Hasil Lembur:", startX, currentY + padding, { width: colWidth, align: 'center' });
    
    if (loadedImages[0] && loadedImages[0].valid) {
      const xOffset = startX + (colWidth - dim1.width) / 2;
      const yOffset = currentY + 25 + (row1Height - 25 - dim1.height) / 2;
      doc.image(loadedImages[0].buffer, xOffset, yOffset, { width: dim1.width, height: dim1.height });
    } else {
      doc.text("(Tidak ada/Rusak)", startX, currentY + row1Height/2, { width: colWidth, align: 'center' });
    }

    // Kotak Kanan (Foto 2)
    doc.rect(startX + colWidth, currentY, colWidth, row1Height).stroke();
    doc.text("2. Foto Pegawai di Tempat Lembur:", startX + colWidth, currentY + padding, { width: colWidth, align: 'center' });
    
    if (loadedImages[1] && loadedImages[1].valid) {
      const xOffset = startX + colWidth + (colWidth - dim2.width) / 2;
      const yOffset = currentY + 25 + (row1Height - 25 - dim2.height) / 2;
      doc.image(loadedImages[1].buffer, xOffset, yOffset, { width: dim2.width, height: dim2.height });
    } else {
      doc.text("(Tidak ada/Rusak)", startX + colWidth, currentY + row1Height/2, { width: colWidth, align: 'center' });
    }

    currentY += row1Height;

    // ----- BARIS 2 (FULL LEBAR) -----
    
    // Kotak Bawah (Foto 3)
    doc.rect(startX, currentY, tableWidth, row2Height).stroke();
    doc.text("3. Screenshot Approval:", startX, currentY + padding, { width: tableWidth, align: 'center' });
    
    if (loadedImages[2] && loadedImages[2].valid) {
      const xOffset = startX + (tableWidth - dim3.width) / 2;
      const yOffset = currentY + 25 + (row2Height - 25 - dim3.height) / 2;
      doc.image(loadedImages[2].buffer, xOffset, yOffset, { width: dim3.width, height: dim3.height });
    } else {
      doc.text("(Tidak ada/Rusak)", startX, currentY + row2Height/2, { width: tableWidth, align: 'center' });
    }

    // Geser kursor ke bawah tabel buat nulis tanda tangan
    doc.y = currentY + row2Height;

    // --- BLOK TANDA TANGAN ---
    const signatureHeight = 150;
    const remainingSpaceForSignature = doc.page.height - doc.y - doc.page.margins.bottom;
    
    if (signatureHeight > remainingSpaceForSignature) {
      doc.addPage();
    }

    doc.moveDown(2);
    const startY = doc.y;

    const colTtdWidth = 230;
    const leftColX = 57;
    const rightColX = doc.page.width - 57 - colTtdWidth;

    doc.fontSize(11);
    doc.text("Mengetahui,", leftColX, startY, { align: "center", width: colTtdWidth });
    doc.text(data.atasan_jabatan, leftColX, doc.y, { align: "center", width: colTtdWidth });

    doc.text("Dilaksanakan Oleh,", rightColX, startY, { align: "center", width: colTtdWidth });
    doc.text(data.jabatan, rightColX, doc.y, { align: "center", width: colTtdWidth });

    const yNama = doc.y + 70; 

    doc.font("TMR-Bold").text(data.atasan_nama, leftColX, yNama, { align: "center", width: colTtdWidth });
    doc.font("TMR").text(`NIP. ${data.atasan_nip}`, leftColX, doc.y, { align: "center", width: colTtdWidth });

    doc.font("TMR-Bold").text(data.nama, rightColX, yNama, { align: "center", width: colTtdWidth });
    doc.font("TMR").text(`NIP. ${data.nip}`, rightColX, doc.y, { align: "center", width: colTtdWidth });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          const media = MessageMedia.fromFilePath(filePath);

          try {
            await client.sendMessage(chatId, media, {
              caption: "Berikut laporan lembur final Anda. File sudah dinamai sesuai format ketentuan.",
            });
          } catch (e) {
            console.error("❌ Gagal kirim PDF Lembur ke user:", e);
          }

          if (targetAtasan && targetAtasan !== "@c.us") {
            try {
              await client.sendMessage(targetAtasan, media, {
                caption: `Laporan Lembur dari:\n*${data.nama}*\nTanggal: ${data.tanggal}`,
              });
            } catch (e) {
              console.error(`❌ Gagal kirim PDF Lembur ke atasan (${targetAtasan}):`, e);
            }
          }

          await Promise.all(
            fotoPaths.map((p) =>
              fsPromises.unlink(p).catch(() => {}),
            ),
          );

          resolve();
        } catch (err) {
          console.error("❌ Error saat proses akhir Lembur PDF:", err);
          reject(err);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  } catch (err) {
    doc.end();
    console.error("❌ Error Fatal di buatLaporanLemburDenganFotoAsync:", err);
    throw err;
  }
}

async function buatLaporanWFAAsync(data, chatId, client) {
  await ensureDirAsync(REPORTS_DIR);
  
  const inputTanggal = data.tanggalWFA || "";
  const tanggalId = inputTanggal;

  let ttdDate = inputTanggal;
  if (typeof ttdDate === "string" && ttdDate.includes(",")) {
    ttdDate = ttdDate.split(",")[1].trim(); 
  }
  const tanggalTtd = `Jakarta, ${ttdDate}`;

  const safeSubstansi = (data.substansi || "TU").replace(/[\/\\]/g, "_");
  const namaFile = `${data.nama}_${data.nip}_${safeSubstansi}.pdf`;
  const filePath = path.join(REPORTS_DIR, namaFile);

  const doc = new PDFDocument({ margins: { top: 50, bottom: 50, left: 50, right: 50 } });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  try {
    const fontDir = path.join(__dirname, "..", "assets", "fonts");
    try {
      doc.registerFont("TMR", path.join(fontDir, "times.ttf"));
      doc.registerFont("TMR-Bold", path.join(fontDir, "times-bold.ttf"));
      doc.font("TMR");
    } catch (e) {
      doc.font("Helvetica");
    }

    doc.font("TMR-Bold").fontSize(12).text("LAPORAN CAPAIAN KINERJA HARIAN", { align: "center" });
    doc.text("PEGAWAI NEGERI SIPIL KEMENTERIAN KETENAGAKERJAAN", { align: "center" });
    doc.moveDown(2);

    doc.font("TMR").fontSize(11);
    const identitas = [
      ["NAMA", data.nama],
      ["NIP", data.nip],
      ["JABATAN", data.jabatan],
      ["UNIT KERJA", "Sekretariat Jenderal"],
      ["UNIT ORGANISASI", "Biro Keuangan dan BMN"],
      ["HARI, TANGGAL", tanggalId]
    ];

    const labelX = doc.x;
    const valueX = doc.x + 130;

    identitas.forEach(([label, value]) => {
      const y = doc.y;
      doc.text(label, labelX, y);
      doc.text(`: ${value}`, valueX, y);
      doc.moveDown(0.5);
    });
    doc.moveDown(1);

    const startX = 50;
    let currentY = doc.y;
    
    const colWidths = [25, 85, 85, 100, 55, 160];
    const headers = ["No.", "KEGIATAN", "OUTPUT", "CAPAIAN KINERJA", "SATUAN", "KETERANGAN\n(Bukti dukung)"];

    function drawWFAHeaders(y) {
      let x = startX;
      doc.font("TMR-Bold").fontSize(9); 
      let headerHeight = 30; 
      headers.forEach((h, i) => {
        doc.rect(x, y, colWidths[i], headerHeight).stroke();
        doc.text(h, x + 2, y + 5, { width: colWidths[i] - 4, align: "center" });
        x += colWidths[i];
      });
      return y + headerHeight;
    }

    currentY = drawWFAHeaders(currentY);

    if (Array.isArray(data.wfaList)) {
      for (let i = 0; i < data.wfaList.length; i++) {
        const item = data.wfaList[i];

        doc.font("TMR").fontSize(9);

        let validImg1 = false, validImg2 = false;
        let buf1 = null, buf2 = null;
        let dim1 = null, dim2 = null;

        if (item.fotoPath1) {
          try {
            buf1 = await fsPromises.readFile(item.fotoPath1);
            dim1 = imageSize(buf1);
            validImg1 = true;
          } catch (e) {
            console.error("Gagal memuat foto 1 WFA:", e.message);
          }
        }

        if (item.fotoPath2) {
          try {
            buf2 = await fsPromises.readFile(item.fotoPath2);
            dim2 = imageSize(buf2);
            validImg2 = true;
          } catch (e) {
            console.error("Gagal memuat foto 2 WFA:", e.message);
          }
        }

        let img1Width = 0, img1Height = 0;
        let img2Width = 0, img2Height = 0;

        const maxImgW = colWidths[5] - 20;
        const maxImgH = 130;

        if (validImg1) {
          img1Width = maxImgW;
          img1Height = (img1Width / dim1.width) * dim1.height;
          if (img1Height > maxImgH) {
            img1Height = maxImgH;
            img1Width = (maxImgH / dim1.height) * dim1.width;
          }
        }

        if (validImg2) {
          img2Width = maxImgW;
          img2Height = (img2Width / dim2.width) * dim2.height;
          if (img2Height > maxImgH) {
            img2Height = maxImgH;
            img2Width = (maxImgH / dim2.height) * dim2.width;
          }
        }

        let col5ImagesHeight = 0;
        if (validImg1) col5ImagesHeight += img1Height + 10;
        if (validImg2) col5ImagesHeight += img2Height + 10;

        let textHeight5 = doc.heightOfString(item.keterangan || "-", { width: colWidths[5] - 8, align: "left" });
        let col5TotalHeight = textHeight5 + (col5ImagesHeight > 0 ? col5ImagesHeight + 10 : 0);

        let textHeight = [
          doc.heightOfString(`${i + 1}.`, { width: colWidths[0] - 4, align: "center" }),
          doc.heightOfString(item.kegiatan || "-", { width: colWidths[1] - 8, align: "left" }),
          doc.heightOfString(item.output || "-", { width: colWidths[2] - 8, align: "left" }),
          doc.heightOfString(item.capaian || "-", { width: colWidths[3] - 8, align: "center" }),
          doc.heightOfString(item.satuan || "-", { width: colWidths[4] - 8, align: "center" }),
          col5TotalHeight
        ];

        let maxTextHeight = Math.max(...textHeight);
        let rowHeight = Math.max(maxTextHeight + 15, 30);

        if (currentY + rowHeight > doc.page.height - 50) {
          doc.addPage();
          currentY = 50;
          currentY = drawWFAHeaders(currentY);
          doc.font("TMR").fontSize(9);
        }

        let x = startX;

        doc.rect(x, currentY, colWidths[0], rowHeight).stroke();
        doc.text(`${i + 1}.`, x + 2, currentY + 5, { width: colWidths[0] - 4, align: "center" });
        x += colWidths[0];

        doc.rect(x, currentY, colWidths[1], rowHeight).stroke();
        doc.text(item.kegiatan || "-", x + 4, currentY + 5, { width: colWidths[1] - 8, align: "left" });
        x += colWidths[1];

        doc.rect(x, currentY, colWidths[2], rowHeight).stroke();
        doc.text(item.output || "-", x + 4, currentY + 5, { width: colWidths[2] - 8, align: "left" });
        x += colWidths[2];

        doc.rect(x, currentY, colWidths[3], rowHeight).stroke();
        doc.text(item.capaian || "-", x + 4, currentY + 5, { width: colWidths[3] - 8, align: "center" });
        x += colWidths[3];

        doc.rect(x, currentY, colWidths[4], rowHeight).stroke();
        doc.text(item.satuan || "-", x + 4, currentY + 5, { width: colWidths[4] - 8, align: "center" });
        x += colWidths[4];

        doc.rect(x, currentY, colWidths[5], rowHeight).stroke();
        
        let ketText = item.keterangan || "-";
        let textOptions = { width: colWidths[5] - 8, align: "left" };
        
        let urlDitemukan = ketText.match(/(https?:\/\/[^\s]+)/);
        if (urlDitemukan) {
          textOptions.link = urlDitemukan[0]; 
          doc.fillColor("blue");
          textOptions.underline = true;
        }
        
        doc.text(ketText, x + 4, currentY + 5, textOptions);
        doc.fillColor("black");

        let currentImgY = currentY + 5 + textHeight5 + 10;

        if (validImg1) {
          let startXCenter = x + (colWidths[5] - img1Width) / 2;
          doc.image(buf1, startXCenter, currentImgY, { width: img1Width, height: img1Height });
          currentImgY += img1Height + 10; 
        } else if (item.fotoPath1) {
          doc.text("(Gambar 1 rusak)", x + 2, currentImgY, { width: colWidths[5] - 4, align: "center" });
          currentImgY += 20;
        }

        if (validImg2) {
          let startXCenter = x + (colWidths[5] - img2Width) / 2;
          doc.image(buf2, startXCenter, currentImgY, { width: img2Width, height: img2Height });
        } else if (item.fotoPath2 && !validImg2) {
          doc.text("(Gambar 2 rusak)", x + 2, currentImgY, { width: colWidths[5] - 4, align: "center" });
        }

        currentY += rowHeight;
      }
    }

    doc.y = currentY + 20;

    const requiredSignatureHeight = 150;
    const remainingSpaceForSignature = doc.page.height - doc.y - doc.page.margins.bottom;

    if (requiredSignatureHeight > remainingSpaceForSignature) {
      doc.addPage();
      doc.y = 50;
    }

    doc.moveDown(2);

    doc.fontSize(12).text(tanggalTtd, 50, doc.y);
    doc.moveDown(1);
    const startY = doc.y;

    doc.fontSize(12).text("Pejabat Penilai/Atasan Langsung", 50, startY);
    doc.text("Pejabat yang dinilai,", 350, startY);

    const yNama = startY + 75; 
    
    const maxLebarKolom = 200;

    const tinggiNamaAtasan = doc.font("TMR-Bold").fontSize(12).heightOfString(`${data.atasan_nama}`, { width: maxLebarKolom });
    const tinggiNamaPegawai = doc.font("TMR-Bold").fontSize(12).heightOfString(`${data.nama}`, { width: maxLebarKolom });

    const maxTinggiNama = Math.max(tinggiNamaAtasan, tinggiNamaPegawai);

    const yNIP = yNama + maxTinggiNama + 2;

    doc.font("TMR-Bold").fontSize(12).text(`${data.atasan_nama}`, 50, yNama, { width: maxLebarKolom });
    doc.font("TMR").fontSize(12).text(`NIP. ${data.atasan_nip}`, 50, yNIP);

    doc.font("TMR-Bold").fontSize(12).text(`${data.nama}`, 350, yNama, { width: maxLebarKolom });
    doc.font("TMR").fontSize(12).text(`NIP. ${data.nip}`, 350, yNIP);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          const media = MessageMedia.fromFilePath(filePath);

          try {
            await client.sendMessage(chatId, media, {
              caption: "Berikut Laporan Kinerja WFH Anda.\n\nMohon berkenan untuk melengkapi tanda tangan Anda beserta Pejabat Penilai/Atasan Langsung pada dokumen ini sebelum diunggah/dilaporkan. Terima kasih.",
            });
          } catch(e) {
             console.error("❌ Gagal kirim WFH ke user:", e);
          }

          if (Array.isArray(data.wfaList)) {
            await Promise.all(
              data.wfaList.flatMap((item) => {
                const unlinks = [];
                if (item.fotoPath1) unlinks.push(fsPromises.unlink(item.fotoPath1).catch(() => {}));
                if (item.fotoPath2) unlinks.push(fsPromises.unlink(item.fotoPath2).catch(() => {}));
                return unlinks;
              })
            );
          }
          
          resolve();
        } catch (err) {
          console.error("❌ Error di dalam stream finish WFH:", err);
          reject(err);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  } catch (err) {
    doc.end();
    console.error("❌ Error fatal saat pembuatan PDF WFH:", err);
    throw err;
  }
}

async function buatPDFRekapBulanan(dataRekap, bulanTahun, chatId, client) {
  ensureDir(REPORTS_DIR);
  const timestamp = Date.now();
  const outputFilename = path.join(REPORTS_DIR, `REKAP_SPK_${bulanTahun.replace(/\s/g, "_")}_${timestamp}.pdf`);

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
  const stream = fs.createWriteStream(outputFilename);
  doc.pipe(stream);

  const fontDir = path.join(__dirname, "..", "assets", "fonts");
  try {
    doc.registerFont("TMR", path.join(fontDir, "times.ttf"));
    doc.registerFont("TMR-Bold", path.join(fontDir, "times-bold.ttf"));
    doc.font("TMR");
  } catch (e) {
    doc.font("Helvetica");
  }

  const startY = 30;
  const leftMargin = 30;
  doc.fontSize(10);
  doc.text("Lampiran", leftMargin, startY);
  doc.text(":", 90, startY);
  doc.text("Surat Perintah Kerja Lembur Pejabat Pembuat Komitmen", 100, startY);
  doc.text("Biro Keuangan dan BMN, Biro Keuangan dan BMN Sekretariat Jenderal", 100, startY + 12);
  doc.text(`Kemnaker Bulan ${bulanTahun}`, 100, startY + 24);
  doc.text("Nomor", leftMargin, startY + 40);
  doc.text(": _________________________", 90, startY + 40);
  doc.text("Tanggal", leftMargin, startY + 54);
  const tglStr = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`: ${tglStr}`, 90, startY + 54);
  doc.moveDown(3);
  doc.font("TMR-Bold").fontSize(11);
  doc.text("PEJABAT/PEGAWAI YANG MELAKSANAKAN PERINTAH KERJA LEMBUR", { align: "center" });
  doc.moveDown(1.5);

  const startX = 30;
  const colWidths = [30, 180, 40, 140, 110, 240];
  const headers = ["NO", "NAMA / NIP", "GOL", "JABATAN", `TANGGAL`, "KETERANGAN"];

  function drawHeader(y) {
    let x = startX;
    doc.font("TMR-Bold").fontSize(9);
    headers.forEach((h, i) => {
      doc.rect(x, y, colWidths[i], 25).stroke();
      doc.text(h, x, y + 8, { width: colWidths[i], align: "center" });
      x += colWidths[i];
    });
    return y + 25;
  }

  let currentY = drawHeader(doc.y);
  doc.font("TMR").fontSize(9);

  for (let i = 0; i < dataRekap.length; i++) {
    const p = dataRekap[i];
    const strTanggal = p.tanggal.join(", ");
    const strKegiatan = p.kegiatan.map((k, idx) => `${idx + 1}. ${k}`).join("\n");
    const hNama = doc.heightOfString(p.nama, { width: colWidths[1] - 6 });
    const hNip = doc.heightOfString(`NIP. ${p.nip}`, { width: colWidths[1] - 6 });
    const hJabatan = doc.heightOfString(p.jabatan, { width: colWidths[3] - 6 });
    const hKegiatan = doc.heightOfString(strKegiatan, { width: colWidths[5] - 6 });
    const hTanggal = doc.heightOfString(strTanggal, { width: colWidths[4] - 6 });

    const hColNamaReal = hNama + hNip + 11;

    let rowHeight = Math.max(hColNamaReal, hJabatan, hKegiatan, hTanggal) + 10;
    if (rowHeight < 40) rowHeight = 40;

    if (currentY + rowHeight > doc.page.height - 50) {
      doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
      currentY = 30;
      currentY = drawHeader(currentY);
    }

    let currentX = startX;
    
    doc.rect(currentX, currentY, colWidths[0], rowHeight).stroke();
    const hNo = doc.heightOfString((i + 1).toString(), { width: colWidths[0] });
    doc.text((i + 1).toString(), currentX, currentY + (rowHeight - hNo) / 2, { width: colWidths[0], align: "center" });
    currentX += colWidths[0];

    doc.rect(currentX, currentY, colWidths[1], rowHeight).stroke();
    const startY_Col2 = currentY + (rowHeight - hColNamaReal) / 2;
    doc.font("TMR-Bold").text(p.nama.toUpperCase(), currentX + 3, startY_Col2, { width: colWidths[1] - 6, align: "left" });
    const lineY = startY_Col2 + hNama + 8;
    doc.moveTo(currentX, lineY).lineTo(currentX + colWidths[1], lineY).stroke();
    doc.font("TMR").text(p.nip, currentX + 3, lineY + 3, { width: colWidths[1] - 6, align: "left" });
    currentX += colWidths[1];

    doc.rect(currentX, currentY, colWidths[2], rowHeight).stroke();
    const hGol = doc.heightOfString(p.gol, { width: colWidths[2] });
    doc.text(p.gol, currentX, currentY + (rowHeight - hGol) / 2, { width: colWidths[2], align: "center" });
    currentX += colWidths[2];

    doc.rect(currentX, currentY, colWidths[3], rowHeight).stroke();
    doc.text(p.jabatan, currentX + 3, currentY + (rowHeight - hJabatan) / 2, { width: colWidths[3] - 6, align: "center" });
    currentX += colWidths[3];

    doc.rect(currentX, currentY, colWidths[4], rowHeight).stroke();
    doc.text(strTanggal, currentX + 3, currentY + (rowHeight - hTanggal) / 2, { width: colWidths[4] - 6, align: "center" });
    currentX += colWidths[4];

    doc.rect(currentX, currentY, colWidths[5], rowHeight).stroke();
    doc.text(strKegiatan, currentX + 3, currentY + (rowHeight - hKegiatan) / 2, { width: colWidths[5] - 6, align: "left" });
    currentX += colWidths[5];

    currentY += rowHeight;
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", async () => {
      try {
        const media = MessageMedia.fromFilePath(outputFilename);
        
        try {
          await client.sendMessage(chatId, media, { caption: `Berikut Rekap SPK Lembur (Format Dinas) bulan ${bulanTahun}` });
        } catch(e) { console.error("Gagal kirim rekap bulanan:", e); }
        
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    stream.on("error", reject);
  });
}

function extractDateTime(dateStr) {
  if (!dateStr) return { tgl: "-", jam: "-" };
  
  const lowerStr = dateStr.toLowerCase();
  if (lowerStr.includes(" pukul ")) {
    const idx = lowerStr.indexOf(" pukul ");
    const tgl = dateStr.substring(0, idx).trim();
    const jam = dateStr.substring(idx + 7).trim();
    return { tgl, jam };
  }
  
  const parts = dateStr.split(/, | /);
  if (parts.length >= 4) {
    return { tgl: parts.slice(0, 3).join(" "), jam: parts.slice(3).join(" ") };
  }
  
  return { tgl: dateStr, jam: "-" };
}

async function buatSuratIzinMobilAwalAsync(data, chatId, client) {
  await ensureDirAsync(REPORTS_DIR);

  const tanggalPembuatan = new Date().toISOString().split("T")[0];
  const namaFile = `${data.pemakai.nama}_${data.pemakai.nip}_Surat Izin Pemakaian Kendaraan_${tanggalPembuatan}.pdf`;
  const filePath = path.join(REPORTS_DIR, namaFile);

  const cm = 28.3465;

  const doc = new PDFDocument({ 
    size: [21 * cm, 33 * cm], 
    margins: { 
      top: 3 * cm, 
      bottom: 2.5 * cm, 
      left: 2.5 * cm, 
      right: 2.5 * cm 
    } 
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  try {
    let fontNormal = "Times-Roman";
    let fontBold = "Times-Bold";
    let fontItalic = "Times-Italic";

    const fontDir = path.join(__dirname, "..", "assets", "fonts");

    const getFontPath = (baseName) => {
      const lower = path.join(fontDir, `${baseName}.ttf`);
      const upper = path.join(fontDir, `${baseName}.TTF`);
      if (fs.existsSync(lower)) return lower;
      if (fs.existsSync(upper)) return upper;
      return null;
    };

    const bookmanPath = getFontPath("BOOKOS");
    const bookmanBoldPath = getFontPath("BOOKOSB");
    const bookmanItalicPath = getFontPath("BOOKOSI");

    if (bookmanPath && bookmanBoldPath && bookmanItalicPath) {
      try {
        doc.registerFont("BookmanCustom", bookmanPath);
        doc.registerFont("BookmanCustom-Bold", bookmanBoldPath);
        doc.registerFont("BookmanCustom-Italic", bookmanItalicPath);
        fontNormal = "BookmanCustom";
        fontBold = "BookmanCustom-Bold";
        fontItalic = "BookmanCustom-Italic";
      } catch (e) {
        console.error("Gagal register font custom, menggunakan fallback bawaan.");
      }
    }

    const marginLeft = doc.page.margins.left;
    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const headerX = 1 * cm; 
    const headerWidth = doc.page.width - (2 * cm); 
    const headerY = 0.2 * cm;

    const kopSuratPath = path.join(__dirname, "..", "assets", "images", "kop-kemnaker.png");
    let yAfterCop = headerY;
    
    if (fs.existsSync(kopSuratPath)) {
      try {
        const bufKop = await fsPromises.readFile(kopSuratPath);
        const dimKop = imageSize(bufKop);
        const aspectRatio = dimKop.width / dimKop.height;
        const imgHeight = headerWidth / aspectRatio;
        
        doc.image(bufKop, headerX, headerY, { width: headerWidth, height: imgHeight });
        yAfterCop = headerY + imgHeight + 5; 
      } catch (err) {
        doc.font(fontBold).fontSize(14).text("KOP SURAT", headerX, headerY, { align: "center", width: headerWidth });
        yAfterCop = headerY + 20;
      }
    } else {
      doc.font(fontBold).fontSize(14).text("KOP SURAT", headerX, headerY, { align: "center", width: headerWidth });
      yAfterCop = headerY + 20;
    }

    doc.lineWidth(1);
    doc.moveTo(headerX, yAfterCop).lineTo(headerX + headerWidth, yAfterCop).stroke(); 
    doc.moveTo(headerX, yAfterCop + 2).lineTo(headerX + headerWidth, yAfterCop + 2).stroke(); 

    doc.y = yAfterCop + 20;

    doc.font(fontNormal).fontSize(12).text("SURAT IZIN PEMAKAIAN KENDARAAN OPERASIONAL", { align: "center" }); 
    doc.font(fontNormal).fontSize(11).text("Nomor: .....................................................", { align: "center" });
    doc.moveDown(0.8);

    const labelX = marginLeft; 
    const valueX = marginLeft + 140; 
    const valWidth = availableWidth - 140;

    const printRow = (label, value) => {
      const startY = doc.y;
      doc.text(label, labelX, startY, { width: valueX - labelX - 10, align: "left" });
      doc.text(`: ${value}`, valueX, startY, { width: valWidth, align: "left" });
      
      const hLabel = doc.heightOfString(label, { width: valueX - labelX - 10 });
      const hValue = doc.heightOfString(`: ${value}`, { width: valWidth });
      doc.y = Math.max(startY + hLabel, startY + hValue) + 2; 
    };

    doc.font(fontNormal).fontSize(11);
    doc.text("Yang bertanda tangan di bawah ini:", marginLeft, doc.y);
    doc.moveDown(0.2);

    printRow("Nama", data.penanggungJawab.nama);
    printRow("NIP", data.penanggungJawab.nip);
    printRow("Jabatan", data.penanggungJawab.jabatan);
    
    doc.text("Selaku penanggung jawab kendaraan dinas.", marginLeft, doc.y);
    doc.moveDown(0.5);

    doc.text("Memberikan izin kepada:", marginLeft, doc.y);
    doc.moveDown(0.2);

    printRow("Nama", data.pemakai.nama);
    printRow("NIP/NIK", data.pemakai.nip);
    printRow("Jabatan", data.pemakai.jabatan);
    doc.moveDown(0.5);

    doc.text("Untuk memakai kendaraan operasional:", marginLeft, doc.y);
    doc.moveDown(0.2);

    printRow("Merek/Type Mobil", data.kendaraan.merek);
    printRow("Nomor TNKB", data.kendaraan.tnkb);
    printRow("Keperluan", data.kendaraan.keperluan);
    
    printRow("Tanggal peminjaman", data.kendaraan.tanggalMulai);
    doc.moveDown(0.8);

    doc.text("Dengan ketentuan pemakai bertanggung jawab terhadap resiko kehilangan, serta kerusakan yang terjadi selama dalam pemakaian dan wajib mengembalikan setelah pemakaian.", marginLeft, doc.y, { align: "justify", width: availableWidth });
    doc.moveDown(1);

    const tglTtd = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const yTtdAtas = doc.y;
    
    const ttdWidth = 200;
    const rightTtdX = marginLeft + availableWidth - ttdWidth;
    
    doc.text(`Jakarta, ${tglTtd}`, rightTtdX, yTtdAtas, { align: "center", width: ttdWidth });
    
    doc.moveDown(1);
    const yTtdJabatan = doc.y;
    
    doc.text("Penanggung Jawab\nKendaraan Dinas,", marginLeft, yTtdJabatan, { align: "center", width: ttdWidth });
    const yAfterJabatanKiri = doc.y;
    
    doc.text("Pemakai,", rightTtdX, yTtdJabatan, { align: "center", width: ttdWidth });
    const yAfterJabatanKanan = doc.y;

    doc.y = Math.max(yAfterJabatanKiri, yAfterJabatanKanan) + 40;
    const yNamaTtd = doc.y;

    doc.text(`(${data.penanggungJawab.nama})`, marginLeft, yNamaTtd, { align: "center", width: ttdWidth });
    const yNipKiri = doc.y;
    doc.text(`NIP. ${data.penanggungJawab.nip}`, marginLeft, yNipKiri, { align: "center", width: ttdWidth });
    const yAkhirKiri = doc.y;

    doc.text(`(${data.pemakai.nama})`, rightTtdX, yNamaTtd, { align: "center", width: ttdWidth });
    const yNipKanan = doc.y;
    doc.text(`NIP/NIK. ${data.pemakai.nip}`, rightTtdX, yNipKanan, { align: "center", width: ttdWidth });
    const yAkhirKanan = doc.y;

    doc.y = Math.max(yAkhirKiri, yAkhirKanan) + 15;

    doc.page.margins.bottom = 0;
    try {
      doc.font(fontItalic).fontSize(9);
    } catch(e) {
      doc.font(fontNormal).fontSize(9);
    }
    
    const footerY = (33 * cm) - (1.5 * cm);
    doc.text("Dokumen ini telah ditandatangani secara elektronik yang diterbitkan oleh Balai Sertifikasi Elektronik (BSrE), BSSN", marginLeft, footerY, { align: "center", width: availableWidth, lineBreak: false });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          const media = MessageMedia.fromFilePath(filePath);
          try {
            await client.sendMessage(chatId, media, {
              caption: "Berikut adalah *Surat Izin Pemakaian Kendaraan Operasional* (Bukti Pinjam). Gunakan surat ini untuk verifikasi pengambilan kunci.",
            });
          } catch(e) {
             console.error("❌ Gagal kirim PDF Mobil ke user:", e);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  } catch (err) {
    doc.end();
    console.error("❌ Error fatal saat pembuatan PDF Mobil Awal:", err);
    throw err;
  }
}

async function buatSuratIzinMobilAkhirAsync(data, chatId, client) {
  await ensureDirAsync(REPORTS_DIR);

  const tanggalPembuatan = new Date().toISOString().split("T")[0];
  const namaFile = `${data.pemakai.nama}_${data.pemakai.nip}_Log Pengembalian Kendaraan_${tanggalPembuatan}.pdf`;
  const filePath = path.join(REPORTS_DIR, namaFile);

  const cm = 28.3465;

  const doc = new PDFDocument({ 
    size: [21 * cm, 33 * cm], 
    margins: { 
      top: 3 * cm, 
      bottom: 2.5 * cm, 
      left: 2.5 * cm, 
      right: 2.5 * cm 
    } 
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  try {
    let fontNormal = "Times-Roman";
    let fontBold = "Times-Bold";
    let fontItalic = "Times-Italic";

    const fontDir = path.join(__dirname, "..", "assets", "fonts");

    const getFontPath = (baseName) => {
      const lower = path.join(fontDir, `${baseName}.ttf`);
      const upper = path.join(fontDir, `${baseName}.TTF`);
      if (fs.existsSync(lower)) return lower;
      if (fs.existsSync(upper)) return upper;
      return null;
    };

    const bookmanPath = getFontPath("BOOKOS");
    const bookmanBoldPath = getFontPath("BOOKOSB");
    const bookmanItalicPath = getFontPath("BOOKOSI");

    if (bookmanPath && bookmanBoldPath && bookmanItalicPath) {
      try {
        doc.registerFont("BookmanCustom", bookmanPath);
        doc.registerFont("BookmanCustom-Bold", bookmanBoldPath);
        doc.registerFont("BookmanCustom-Italic", bookmanItalicPath);
        fontNormal = "BookmanCustom";
        fontBold = "BookmanCustom-Bold";
        fontItalic = "BookmanCustom-Italic";
      } catch (e) {
        console.error("Gagal register font custom, menggunakan fallback bawaan.");
      }
    }

    const marginLeft = doc.page.margins.left;
    const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const headerX = 1 * cm; 
    const headerWidth = doc.page.width - (2 * cm); 
    const headerY = 0.2 * cm;

    const kopSuratPath = path.join(__dirname, "..", "assets", "images", "kop-kemnaker.png");
    let yAfterCop = headerY;
    
    if (fs.existsSync(kopSuratPath)) {
      try {
        const bufKop = await fsPromises.readFile(kopSuratPath);
        const dimKop = imageSize(bufKop);
        const aspectRatio = dimKop.width / dimKop.height;
        const imgHeight = headerWidth / aspectRatio;
        
        doc.image(bufKop, headerX, headerY, { width: headerWidth, height: imgHeight });
        yAfterCop = headerY + imgHeight + 5; 
      } catch (err) {
        doc.font(fontBold).fontSize(14).text("KOP SURAT", headerX, headerY, { align: "center", width: headerWidth });
        yAfterCop = headerY + 20;
      }
    } else {
      doc.font(fontBold).fontSize(14).text("KOP SURAT", headerX, headerY, { align: "center", width: headerWidth });
      yAfterCop = headerY + 20;
    }

    doc.lineWidth(1);
    doc.moveTo(headerX, yAfterCop).lineTo(headerX + headerWidth, yAfterCop).stroke(); 
    doc.moveTo(headerX, yAfterCop + 2).lineTo(headerX + headerWidth, yAfterCop + 2).stroke(); 

    doc.y = yAfterCop + 20;

    doc.font(fontNormal).fontSize(12).text("SURAT IZIN PEMAKAIAN KENDARAAN OPERASIONAL", { align: "center" }); 
    doc.font(fontNormal).fontSize(11).text("Nomor: .....................................................", { align: "center" });
    doc.moveDown(0.8);

    const labelX = marginLeft; 
    const valueX = marginLeft + 140; 
    const valWidth = availableWidth - 140;

    const printRow = (label, value) => {
      const startY = doc.y;
      doc.text(label, labelX, startY, { width: valueX - labelX - 10, align: "left" });
      doc.text(`: ${value}`, valueX, startY, { width: valWidth, align: "left" });
      
      const hLabel = doc.heightOfString(label, { width: valueX - labelX - 10 });
      const hValue = doc.heightOfString(`: ${value}`, { width: valWidth });
      doc.y = Math.max(startY + hLabel, startY + hValue) + 2; 
    };

    doc.font(fontNormal).fontSize(11);
    doc.text("Yang bertanda tangan di bawah ini:", marginLeft, doc.y);
    doc.moveDown(0.2);

    printRow("Nama", data.penanggungJawab.nama);
    printRow("NIP", data.penanggungJawab.nip);
    printRow("Jabatan", data.penanggungJawab.jabatan);
    
    doc.text("Selaku penanggung jawab kendaraan dinas.", marginLeft, doc.y);
    doc.moveDown(0.5);

    doc.text("Memberikan izin kepada:", marginLeft, doc.y);
    doc.moveDown(0.2);

    printRow("Nama", data.pemakai.nama);
    printRow("NIP/NIK", data.pemakai.nip);
    printRow("Jabatan", data.pemakai.jabatan);
    doc.moveDown(0.5);

    doc.text("Untuk memakai kendaraan operasional:", marginLeft, doc.y);
    doc.moveDown(0.2);

    printRow("Merek/Type Mobil", data.kendaraan.merek);
    printRow("Nomor TNKB", data.kendaraan.tnkb);
    printRow("Keperluan", data.kendaraan.keperluan);

    const pinjamObj = extractDateTime(data.kendaraan.tanggalMulai);
    const kembaliObj = extractDateTime(data.kendaraan.tanggalSelesai);
    const textTanggalPemakaian = `${pinjamObj.tgl} pukul ${pinjamObj.jam} s.d. ${kembaliObj.tgl} pukul ${kembaliObj.jam}`;
    
    printRow("Tanggal pemakaian", textTanggalPemakaian);
    doc.moveDown(0.8);

    doc.text("Dengan ketentuan pemakai bertanggung jawab terhadap resiko kehilangan, serta kerusakan yang terjadi selama dalam pemakaian dan wajib mengembalikan setelah pemakaian.", marginLeft, doc.y, { align: "justify", width: availableWidth });
    doc.moveDown(1);

    const tglTtd = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const yTtdAtas = doc.y;
    
    const ttdWidth = 200;
    const rightTtdX = marginLeft + availableWidth - ttdWidth;
    
    doc.text(`Jakarta, ${tglTtd}`, rightTtdX, yTtdAtas, { align: "center", width: ttdWidth });
    
    doc.moveDown(1);
    const yTtdJabatan = doc.y;
    
    doc.text("Penanggung Jawab\nKendaraan Dinas,", marginLeft, yTtdJabatan, { align: "center", width: ttdWidth });
    const yAfterJabatanKiri = doc.y;
    
    doc.text("Pemakai,", rightTtdX, yTtdJabatan, { align: "center", width: ttdWidth });
    const yAfterJabatanKanan = doc.y;

    doc.y = Math.max(yAfterJabatanKiri, yAfterJabatanKanan) + 40;
    const yNamaTtd = doc.y;

    doc.text(`(${data.penanggungJawab.nama})`, marginLeft, yNamaTtd, { align: "center", width: ttdWidth });
    const yNipKiri = doc.y;
    doc.text(`NIP. ${data.penanggungJawab.nip}`, marginLeft, yNipKiri, { align: "center", width: ttdWidth });
    const yAkhirKiri = doc.y;

    doc.text(`(${data.pemakai.nama})`, rightTtdX, yNamaTtd, { align: "center", width: ttdWidth });
    const yNipKanan = doc.y;
    doc.text(`NIP/NIK. ${data.pemakai.nip}`, rightTtdX, yNipKanan, { align: "center", width: ttdWidth });
    const yAkhirKanan = doc.y;

    doc.y = Math.max(yAkhirKiri, yAkhirKanan) + 15;

    const doubleLineY = doc.y;
    doc.moveTo(marginLeft, doubleLineY).lineTo(marginLeft + availableWidth, doubleLineY).stroke();
    doc.moveTo(marginLeft, doubleLineY + 2).lineTo(marginLeft + availableWidth, doubleLineY + 2).stroke();
    
    doc.y = doubleLineY + 10;

    doc.page.margins.bottom = 0; 
    
    doc.font(fontNormal).text("PENGEMBALIAN KENDARAAN OPERASIONAL", marginLeft, doc.y, { align: "center", width: availableWidth });
    doc.moveDown(0.5);

    const tableY = doc.y;
    
    const col1Width = availableWidth * 0.40; 
    const col2Width = availableWidth * 0.30;
    const col3Width = availableWidth * 0.30;
    
    const rowHeight = 170; 
    const headerHeight = 35; 

    doc.rect(marginLeft, tableY, col1Width, rowHeight).stroke();
    doc.rect(marginLeft + col1Width, tableY, col2Width, rowHeight).stroke();
    doc.rect(marginLeft + col1Width + col2Width, tableY, col3Width, rowHeight).stroke();

    doc.moveTo(marginLeft + col1Width, tableY + headerHeight)
       .lineTo(marginLeft + availableWidth, tableY + headerHeight)
       .stroke();

    doc.text("Kendaraan operasional tersebut diatas telah selesai digunakan dan dikembalikan kepada penanggung jawab kendaraan dinas dalam", marginLeft + 5, tableY + 10, { width: col1Width - 10, align: "left" });
    doc.text(`kondisi: ${data.pengembalian.kondisi}`, marginLeft + 5, tableY + rowHeight - 20, { width: col1Width - 10, align: "left" });

    const col2X = marginLeft + col1Width;
    doc.font(fontNormal).text("Pemakai", col2X + 5, tableY + 10, { width: col2Width - 10, align: "center" });
    
    doc.text("Dikembalikan", col2X + 5, tableY + headerHeight + 10, { width: col2Width - 10, align: "left" });
    doc.text(`tanggal: ${kembaliObj.tgl}`, col2X + 5, tableY + headerHeight + 25, { width: col2Width - 10, align: "left" });
    doc.text(`pukul: ${kembaliObj.jam}`, col2X + 5, tableY + headerHeight + 40, { width: col2Width - 10, align: "left" });
    
    const namePemakai = `(${data.pemakai.nama})`;
    const hPemakai = doc.heightOfString(namePemakai, { width: col2Width - 10 });
    doc.text(namePemakai, col2X + 5, tableY + rowHeight - hPemakai - 15, { width: col2Width - 10, align: "center" });

    const col3X = marginLeft + col1Width + col2Width;
    doc.font(fontNormal).text("Penanggung Jawab\nKendaraan Dinas", col3X + 5, tableY + 5, { width: col3Width - 10, align: "center" });
    
    doc.text("Diterima", col3X + 5, tableY + headerHeight + 10, { width: col3Width - 10, align: "left" });
    doc.text(`tanggal: ${kembaliObj.tgl}`, col3X + 5, tableY + headerHeight + 25, { width: col3Width - 10, align: "left" });
    doc.text(`pukul: ${kembaliObj.jam}`, col3X + 5, tableY + headerHeight + 40, { width: col3Width - 10, align: "left" });

    const namePJ = `(${data.penanggungJawab.nama})`;
    const hPJ = doc.heightOfString(namePJ, { width: col3Width - 10 });
    doc.text(namePJ, col3X + 5, tableY + rowHeight - hPJ - 15, { width: col3Width - 10, align: "center" });

    try {
      doc.font(fontItalic).fontSize(9);
    } catch(e) {
      doc.font(fontNormal).fontSize(9);
    }
    
    const footerY = (33 * cm) - (1.5 * cm);
    doc.text("Dokumen ini telah ditandatangani secara elektronik yang diterbitkan oleh Balai Sertifikasi Elektronik (BSrE), BSSN", marginLeft, footerY, { align: "center", width: availableWidth, lineBreak: false });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          const media = MessageMedia.fromFilePath(filePath);
          try {
            await client.sendMessage(chatId, media, {
              caption: "Berikut adalah *Log Pengembalian Kendaraan Operasional* Anda yang telah otomatis dibuat oleh sistem beserta tabel laporan kondisinya di bawah.",
            });
          } catch(e) {
             console.error("❌ Gagal kirim PDF Mobil Akhir ke user:", e);
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  } catch (err) {
    doc.end();
    console.error("❌ Error fatal saat pembuatan PDF Mobil Akhir:", err);
    throw err;
  }
}

module.exports = {
  buatLaporanLemburDenganFotoAsync,
  buatLaporanWFAAsync,
  buatPDFRekapBulanan,
  buatSuratIzinMobilAwalAsync,
  buatSuratIzinMobilAkhirAsync,
  calculateDuration
};