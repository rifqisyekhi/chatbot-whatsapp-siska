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

async function buatLaporanLemburDenganFotoAsync(data, fotoPaths, chatId, targetAtasan, client) {
  await ensureDirAsync(REPORTS_DIR);
  await ensureDirAsync(UPLOADS_DIR);

  const tanggalLaporan = new Date().toISOString().split("T")[0];
  const safeSubstansi = (data.substansi || "TU").replace(/[\/\\]/g, "_");
  
  // Format Nama File: Laporan Lembur_Nama_NIP_Subtansi_Tanggal.pdf
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

    doc
      .font("TMR-Bold")
      .fontSize(14)
      .text("KEMENTERIAN KETENAGAKERJAAN RI", { align: "center" });
    doc.text("SEKRETARIAT JENDERAL - BIRO KEUANGAN DAN BMN", { align: "center" });
    doc.moveDown(2);

    doc.font("TMR-Bold").fontSize(13).text("LAPORAN LEMBUR", { align: "center" });
    doc.moveDown(2);

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

    const labelX = doc.x;
    const valueX = doc.x + 150;

    identitas.forEach(([label, value]) => {
      const y = doc.y;
      doc.text(label, labelX, y);
      doc.text(`: ${value}`, valueX, y);
      doc.moveDown(1);
    });

    doc.moveDown(2);
    doc.x = doc.page.margins.left;

    doc.font("TMR-Bold").fontSize(12).text("Dokumentasi Hasil Lembur", { align: "center" });
    doc.font("TMR").moveDown();

    const addImageBlockMemory = (title, imgData) => {
      doc.fontSize(11).text(`${title}:`);
      doc.moveDown(0.5);

      if (imgData && imgData.valid) {
        const imgWidth = imgData.dimensions.width;
        const imgHeight = imgData.dimensions.height;
        const maxWidth = 250;
        const maxHeight = 160;
        const aspectRatio = imgWidth / imgHeight;
        let finalWidth = maxWidth;
        let finalHeight = Math.round(maxWidth / aspectRatio);

        if (finalHeight > maxHeight) {
          finalHeight = maxHeight;
          finalWidth = Math.round(maxHeight * aspectRatio);
        }

        const remainingSpace = doc.page.height - doc.y - doc.page.margins.bottom;
        if (finalHeight + 20 > remainingSpace) {
          doc.addPage();
        }

        try {
          doc.image(imgData.buffer, {
            width: finalWidth,
            height: finalHeight,
            align: "center",
            layout: "landscape",
          });
        } catch (renderErr) {
          doc.text("(Gagal render gambar corrupt)", { align: "center" });
        }
      } else {
        doc.text("(Gambar tidak dapat dimuat/rusak)", { align: "center" });
      }
      doc.moveDown(2);
    };

    addImageBlockMemory("1. Foto Hasil Lembur", loadedImages[0]);
    doc.addPage();
    doc.moveDown(1);
    addImageBlockMemory("2. Foto Pegawai di Tempat Lembur", loadedImages[1]);
    addImageBlockMemory("3. Screenshot Approval", loadedImages[2]);

    const signatureHeight = 120;
    const remainingSpaceForSignature = doc.page.height - doc.y - doc.page.margins.bottom;
    if (signatureHeight > remainingSpaceForSignature) {
      doc.addPage();
    }

    doc.moveDown(4);
    const startY = doc.y;

    doc.fontSize(11).text(`Mengetahui,\n${data.atasan_jabatan}`, 50, startY);
    doc.text(`Dilaksanakan Oleh,\n${data.jabatan}`, 330, startY);

    const [ttdKepalaBuffer, ttdPegawaiBuffer] = await Promise.all([
      getDummySignature(data.atasan_nip),
      getDummySignature(data.nip),
    ]);

    const ttdY = startY + 40;
    const ttdWidth = 120;
    const ttdPegX = 330;
    const ttdKepX = 50;
    const fallbackImgPath = path.join(__dirname, "..", "assets", "images", "contoh-ttd.png");

    const renderTTD = (buffer, x, y) => {
      if (buffer) {
        try {
          doc.image(buffer, x, y, { width: ttdWidth });
        } catch (e) {
          doc.fontSize(10).text("(TTD Error)", x, y);
        }
      } else {
        if (fs.existsSync(fallbackImgPath)) {
          try {
            doc.image(fallbackImgPath, x, y, { width: ttdWidth });
          } catch (e) {}
        } else {
          doc.fontSize(10).text("(TTD Tidak Tersedia)", x, y);
        }
      }
    };

    renderTTD(ttdKepalaBuffer, ttdKepX, ttdY);
    renderTTD(ttdPegawaiBuffer, ttdPegX, ttdY);

    const yNama = ttdY + 70;
    const yNIP = yNama + 14;

    doc.fontSize(11).text(`${data.atasan_nama}`, ttdKepX, yNama);
    doc.text(`NIP. ${data.atasan_nip}`, ttdKepX, yNIP);

    doc.text(`${data.nama}`, ttdPegX, yNama);
    doc.text(`NIP. ${data.nip}`, ttdPegX, yNIP);

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
    const colWidths = [30, 120, 60, 70, 50, 180];
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

        // Load Foto 1
        if (item.fotoPath1) {
          try {
            buf1 = await fsPromises.readFile(item.fotoPath1);
            dim1 = imageSize(buf1);
            validImg1 = true;
          } catch (e) {
            console.error("Gagal memuat foto 1 WFA:", e.message);
          }
        }

        // Load Foto 2
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
        
        // Lebar maksimal gambar diset hampir selebar kolom 5 (dikurangi padding 20)
        const maxImgW = colWidths[5] - 20; 
        const maxImgH = 130; // Batas tinggi agar tidak terlalu makan tempat ke bawah

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

        // Hitung total ruang vertikal yang dibutuhkan untuk semua gambar
        let col5ImagesHeight = 0;
        if (validImg1) col5ImagesHeight += img1Height + 10; // +10 untuk gap bawah gambar
        if (validImg2) col5ImagesHeight += img2Height + 10;

        let textHeight5 = doc.heightOfString(item.keterangan || "-", { width: colWidths[5] - 8 });
        let col5TotalHeight = textHeight5 + (col5ImagesHeight > 0 ? col5ImagesHeight + 10 : 0);

        let textHeights = [
          doc.heightOfString(`${i + 1}.`, { width: colWidths[0] - 4 }),
          doc.heightOfString(item.kegiatan || "-", { width: colWidths[1] - 4 }),
          doc.heightOfString(item.output || "-", { width: colWidths[2] - 4 }),
          doc.heightOfString(item.capaian || "-", { width: colWidths[3] - 4 }),
          doc.heightOfString(item.satuan || "-", { width: colWidths[4] - 4 }),
          col5TotalHeight
        ];
        
        let maxTextHeight = Math.max(...textHeights);
        let rowHeight = Math.max(maxTextHeight + 15, 30);

        // Cek halaman baru jika baris kepanjangan
        if (currentY + rowHeight > doc.page.height - 50) {
          doc.addPage();
          currentY = 50;
          currentY = drawWFAHeaders(currentY);
          doc.font("TMR").fontSize(9);
        }

        let x = startX;

        // Gambar kotak dan isi teks tiap kolom
        doc.rect(x, currentY, colWidths[0], rowHeight).stroke();
        doc.text(`${i + 1}.`, x + 2, currentY + 5, { width: colWidths[0] - 4, align: "center" });
        x += colWidths[0];

        doc.rect(x, currentY, colWidths[1], rowHeight).stroke();
        doc.text(item.kegiatan || "-", x + 2, currentY + 5, { width: colWidths[1] - 4, align: "left" });
        x += colWidths[1];

        doc.rect(x, currentY, colWidths[2], rowHeight).stroke();
        doc.text(item.output || "-", x + 2, currentY + 5, { width: colWidths[2] - 4, align: "center" });
        x += colWidths[2];

        doc.rect(x, currentY, colWidths[3], rowHeight).stroke();
        doc.text(item.capaian || "-", x + 2, currentY + 5, { width: colWidths[3] - 4, align: "center" });
        x += colWidths[3];

        doc.rect(x, currentY, colWidths[4], rowHeight).stroke();
        doc.text(item.satuan || "-", x + 2, currentY + 5, { width: colWidths[4] - 4, align: "center" });
        x += colWidths[4];

        doc.rect(x, currentY, colWidths[5], rowHeight).stroke();
        doc.text(item.keterangan || "-", x + 4, currentY + 5, { width: colWidths[5] - 8, align: "left" });

        // Tumpuk gambar ke bawah (Stacked)
        let currentImgY = currentY + 5 + textHeight5 + 10;

        if (validImg1) {
          let startXCenter = x + (colWidths[5] - img1Width) / 2;
          doc.image(buf1, startXCenter, currentImgY, { width: img1Width, height: img1Height });
          currentImgY += img1Height + 10; // Tambah koordinat Y untuk foto kedua
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

    const remainingSpaceForSignature = doc.page.height - doc.y - doc.page.margins.bottom;
    if (120 > remainingSpaceForSignature) {
      doc.addPage();
    }

    doc.moveDown(2);
    
    doc.fontSize(12).text(tanggalTtd, 50, doc.y); 
    doc.moveDown(1);
    const startY = doc.y;

    doc.fontSize(12).text("Pejabat Penilai/Atasan Langsung", 50, startY);
    doc.text("Pejabat yang dinilai,", 350, startY);

    const yNama = startY + 75; 
    const yNIP = yNama + 14;

    doc.font("TMR-Bold").fontSize(12).text(`${data.atasan_nama}`, 50, yNama);
    doc.font("TMR").fontSize(12).text(`NIP. ${data.atasan_nip}`, 50, yNIP);

    doc.font("TMR-Bold").fontSize(12).text(`${data.nama}`, 350, yNama);
    doc.font("TMR").fontSize(12).text(`NIP. ${data.nip}`, 350, yNIP);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          const media = MessageMedia.fromFilePath(filePath);

          try {
            await client.sendMessage(chatId, media, {
              caption: "Berikut Laporan Kinerja WFA Anda.\n\nMohon berkenan untuk melengkapi tanda tangan Anda beserta Pejabat Penilai/Atasan Langsung pada dokumen ini sebelum diunggah/dilaporkan. Terima kasih.",
            });
          } catch(e) {
             console.error("❌ Gagal kirim WFA ke user:", e);
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
          console.error("❌ Error di dalam stream finish WFA:", err);
          reject(err);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  } catch (err) {
    doc.end();
    console.error("❌ Error fatal saat pembuatan PDF WFA:", err);
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

    const hColNama = hNama + hNip + 15;
    let rowHeight = Math.max(hColNama, hJabatan, hKegiatan, hTanggal) + 10;
    if (rowHeight < 40) rowHeight = 40;

    if (currentY + rowHeight > doc.page.height - 50) {
      doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
      currentY = 30;
      currentY = drawHeader(currentY);
    }

    let currentX = startX;
    doc.rect(currentX, currentY, colWidths[0], rowHeight).stroke();
    doc.text((i + 1).toString(), currentX, currentY + 5, { width: colWidths[0], align: "center" });
    currentX += colWidths[0];

    doc.rect(currentX, currentY, colWidths[1], rowHeight).stroke();
    doc.font("TMR-Bold").text(p.nama.toUpperCase(), currentX + 3, currentY + 5, { width: colWidths[1] - 6, align: "left" });
    const lineY = currentY + hNama + 8;
    doc.moveTo(currentX, lineY).lineTo(currentX + colWidths[1], lineY).stroke();
    doc.font("TMR").text(p.nip, currentX + 3, lineY + 3, { width: colWidths[1] - 6, align: "left" });
    currentX += colWidths[1];

    doc.rect(currentX, currentY, colWidths[2], rowHeight).stroke();
    doc.text(p.gol, currentX, currentY + 5, { width: colWidths[2], align: "center" });
    currentX += colWidths[2];

    doc.rect(currentX, currentY, colWidths[3], rowHeight).stroke();
    const yJab = currentY + (rowHeight - hJabatan) / 2;
    doc.text(p.jabatan, currentX + 3, yJab > currentY ? yJab : currentY + 5, { width: colWidths[3] - 6, align: "center" });
    currentX += colWidths[3];

    doc.rect(currentX, currentY, colWidths[4], rowHeight).stroke();
    doc.text(strTanggal, currentX + 3, currentY + 5, { width: colWidths[4] - 6, align: "center" });
    currentX += colWidths[4];

    doc.rect(currentX, currentY, colWidths[5], rowHeight).stroke();
    doc.text(strKegiatan, currentX + 3, currentY + 5, { width: colWidths[5] - 6, align: "left" });
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

module.exports = {
  buatLaporanLemburDenganFotoAsync,
  buatLaporanWFAAsync,
  buatPDFRekapBulanan,
  calculateDuration
};