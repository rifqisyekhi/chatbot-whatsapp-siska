# Membuat PANDUAN-MAGANG.pdf (root repo) dari isi.md di folder ini.
# Dari root repo: python scripts/panduan-magang/buat_pdf.py scripts/panduan-magang/isi.md PANDUAN-MAGANG.pdf assets/fonts
# (butuh: pip install reportlab)
import re
import sys
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, ListFlowable, ListItem, Paragraph,
                                Preformatted, SimpleDocTemplate, Spacer, Table, TableStyle)

sumber, keluaran, folder_font = sys.argv[1:4]
pdfmetrics.registerFont(TTFont("Arial", f"{folder_font}/arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", f"{folder_font}/arialbd.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial", boldItalic="Arial-Bold")

NAVY = colors.HexColor("#123B5D")
BRAND = colors.HexColor("#3473A7")
MIST = colors.HexColor("#E5E9EE")
PAPER = colors.HexColor("#F6F6F6")

gaya = {
    "judul": ParagraphStyle("judul", fontName="Arial-Bold", fontSize=20, leading=25, textColor=NAVY, spaceAfter=4),
    "sub": ParagraphStyle("sub", fontName="Arial", fontSize=10, leading=14, textColor=colors.HexColor("#64748B"), spaceAfter=10),
    "h2": ParagraphStyle("h2", fontName="Arial-Bold", fontSize=13.5, leading=18, textColor=NAVY, spaceBefore=12, spaceAfter=5),
    "p": ParagraphStyle("p", fontName="Arial", fontSize=10, leading=14.5, textColor=colors.HexColor("#1F2937"), spaceAfter=5, alignment=TA_LEFT),
    "sel": ParagraphStyle("sel", fontName="Arial", fontSize=9, leading=12),
    "selJudul": ParagraphStyle("selJudul", fontName="Arial-Bold", fontSize=9, leading=12, textColor=colors.white),
    "kode": ParagraphStyle("kode", fontName="Courier", fontSize=8.8, leading=12, textColor=NAVY),
}


def sebaris(teks):
    """Markdown sebaris → markup reportlab (kode, tebal)."""
    t = escape(teks)
    t = re.sub(r"`([^`]+)`", lambda m: f'<font face="Courier" color="#123B5D" backColor="#EEF2F6">{m.group(1)}</font>', t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(https?://[^\s<,)]+)", r'<font color="#3473A7">\1</font>', t)
    return t


def tabel(baris):
    data = []
    for i, b in enumerate(baris):
        sel = [s.strip() for s in b.strip().strip("|").split("|")]
        data.append([Paragraph(sebaris(s), gaya["selJudul"] if i == 0 else gaya["sel"]) for s in sel])
    lebar = A4[0] - 40 * mm
    t = Table(data, colWidths=[lebar * w for w in ([0.32, 0.38, 0.30] if len(data[0]) == 3 else [1 / len(data[0])] * len(data[0]))], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
        ("GRID", (0, 0), (-1, -1), 0.5, MIST),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def daftar(item, bernomor):
    # item: [(level, teks)] → ListFlowable bertingkat (level 0 / 1)
    hasil, i = [], 0
    while i < len(item):
        lvl, teks = item[i]
        anak = []
        j = i + 1
        while j < len(item) and item[j][0] > lvl:
            anak.append((item[j][0] - 1, item[j][1]))
            j += 1
        isi = [Paragraph(sebaris(teks), gaya["p"])]
        if anak:
            isi.append(daftar(anak, False))
        hasil.append(ListItem(isi, leftIndent=14))
        i = j
    return ListFlowable(hasil, bulletType="1" if bernomor else "bullet", start="1" if bernomor else None,
                        bulletFontName="Arial-Bold" if bernomor else "Arial", bulletFontSize=9.5,
                        bulletColor=BRAND, leftIndent=14, bulletDedent=12)


baris = open(sumber, encoding="utf-8").read().splitlines()
cerita = []
i = 0
paragraf = []


def lepas_paragraf():
    if paragraf:
        cerita.append(Paragraph(sebaris(" ".join(paragraf)), gaya["p"]))
        paragraf.clear()


while i < len(baris):
    b = baris[i]
    if b.startswith("# "):
        lepas_paragraf()
        cerita.append(Paragraph(sebaris(b[2:]), gaya["judul"]))
        cerita.append(Paragraph("Biro Keuangan dan BMN • Kementerian Ketenagakerjaan", gaya["sub"]))
    elif b.startswith("## "):
        lepas_paragraf()
        cerita.append(Paragraph(sebaris(b[3:]), gaya["h2"]))
    elif b.startswith("```"):
        lepas_paragraf()
        kode = []
        i += 1
        while i < len(baris) and not baris[i].startswith("```"):
            kode.append(baris[i])
            i += 1
        blok = Table([[Preformatted("\n".join(kode), gaya["kode"])]], colWidths=[A4[0] - 40 * mm])
        blok.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PAPER), ("BOX", (0, 0), (-1, -1), 0.5, MIST),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        cerita += [blok, Spacer(1, 6)]
    elif b.startswith("|"):
        lepas_paragraf()
        t = []
        while i < len(baris) and baris[i].startswith("|"):
            if not re.match(r"^\|[\s|:-]+\|$", baris[i]):
                t.append(baris[i])
            i += 1
        cerita += [tabel(t), Spacer(1, 8)]
        continue
    elif re.match(r"^\s*(\d+\.|-)\s", b):
        lepas_paragraf()
        bernomor = bool(re.match(r"^\d+\.", b))
        item = []
        while i < len(baris) and (re.match(r"^\s*(\d+\.|-)\s", baris[i]) or (baris[i].startswith("  ") and baris[i].strip())):
            m = re.match(r"^(\s*)(\d+\.|-)\s+(.*)$", baris[i])
            if m:
                item.append((1 if len(m.group(1)) >= 2 else 0, m.group(3)))
            else:  # lanjutan baris item sebelumnya
                lvl, teks = item[-1]
                item[-1] = (lvl, teks + " " + baris[i].strip())
            i += 1
        cerita += [daftar(item, bernomor), Spacer(1, 4)]
        continue
    elif not b.strip():
        lepas_paragraf()
    else:
        paragraf.append(b.strip())
    i += 1
lepas_paragraf()


def kaki(canvas, doc):
    canvas.saveState()
    canvas.setFont("Arial", 8)
    canvas.setFillColor(colors.HexColor("#94A3B8"))
    canvas.drawString(20 * mm, 12 * mm, "Panduan Magang — Administrasi Rokeu")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Halaman {doc.page}")
    canvas.setStrokeColor(BRAND)
    canvas.setLineWidth(2)
    canvas.line(20 * mm, A4[1] - 14 * mm, A4[0] - 20 * mm, A4[1] - 14 * mm)
    canvas.restoreState()


doc = SimpleDocTemplate(keluaran, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
                        title="Panduan Magang — Administrasi Rokeu", author="Biro Keuangan dan BMN")
doc.build(cerita, onFirstPage=kaki, onLaterPages=kaki)
print("ok", keluaran)
