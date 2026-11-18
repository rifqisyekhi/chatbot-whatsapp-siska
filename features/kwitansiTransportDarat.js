// =========================================================
// TRANSPORT DARAT PERJALANAN DINAS — PMK 32 TAHUN 2025
// =========================================================
//
// DISALIN OTOMATIS dari lampiran PMK 32/2025 (sekali jalan / one way):
//   II.1 Transportasi darat dari ibu kota provinsi ke kabupaten/kota
//        dalam provinsi yang sama (361 rute).
//   II.2 Transportasi dari DKI Jakarta ke kabupaten/kota sekitar —
//        metode lumpsum (9 rute).
//
// Provinsi yang tidak tercantum (Kalimantan Utara, Maluku, empat
// provinsi Papua pemekaran) dibayar sesuai harga pasar (at cost).

// provinsi → { ibukota, tujuan: [[kabupaten/kota, tarif sekali jalan], ...] }
const DARI_IBUKOTA = {
  "Aceh": {
    ibukota: "Banda Aceh",
    tujuan: [
      ["Kab. Aceh Barat", 275000],
      ["Kab. Aceh Barat Daya", 298000],
      ["Kab. Aceh Besar", 183000],
      ["Kab. Aceh Jaya", 238000],
      ["Kab. Aceh Selatan", 325000],
      ["Kab. Aceh Singkil", 420000],
      ["Kab. Aceh Tamiang", 315000],
      ["Kab. Aceh Tengah", 293000],
      ["Kab. Aceh Tenggara", 460000],
      ["Kab. Aceh Timur", 289000],
      ["Kab. Aceh Utara", 270000],
      ["Kab. Bener Meriah", 278000],
      ["Kab. Bireuen", 220000],
      ["Kab. Gayo Lues", 370000],
      ["Kab. Nagan Raya", 275000],
      ["Kab. Pidie", 190000],
      ["Kab. Pidie Jaya", 205000],
      ["Kota Langsa", 301000],
      ["Kota Lhokseumawe", 240000],
      ["Kota Subulussalam", 400000],
    ],
  },
  "Sumatera Utara": {
    ibukota: "Medan",
    tujuan: [
      ["Kab. Asahan", 259000],
      ["Kab. Batubara", 225000],
      ["Kab. Dairi", 270000],
      ["Kab. Deli Serdang", 186000],
      ["Kab. Humbang Hasundutan", 300000],
      ["Kab. Karo", 200000],
      ["Kab. Labuhan Batu", 287000],
      ["Kab. Labuhan Batu Selatan", 360000],
      ["Kab. Labuhan Batu Utara", 300000],
      ["Kab. Langkat", 186000],
      ["Kab. Mandailing Natal", 420000],
      ["Kab. Padang Lawas", 420000],
      ["Kab. Padang Lawas Utara", 420000],
      ["Kab. Pakpak Bharat", 300000],
      ["Kab. Samosir", 330000],
      ["Kab. Serdang Bedagai", 200000],
      ["Kab. Simalungun", 264000],
      ["Kab. Tapanuli Selatan", 328000],
      ["Kab. Tapanuli Tengah", 345000],
      ["Kab. Tapanuli Utara", 330000],
      ["Kab. Toba Samosir", 300000],
      ["Kota Binjai", 180000],
      ["Kota Pematang Siantar", 225000],
      ["Kota Sibolga", 345000],
      ["Kota Tanjung Balai", 285000],
      ["Kota Tebing Tinggi", 203000],
    ],
  },
  "Riau": {
    ibukota: "Pekanbaru",
    tujuan: [
      ["Kab. Indragiri Hilir", 380000],
      ["Kab. Indragiri Hulu", 315000],
      ["Kab. Kampar", 200000],
      ["Kab. Kuantan Singingi", 300000],
      ["Kab. Pelalawan", 225000],
      ["Kab. Rokan Hilir", 350000],
      ["Kab. Rokan Hulu", 322000],
      ["Kab. Siak", 350000],
      ["Kota Dumai", 400000],
    ],
  },
  "Kepulauan Riau": {
    ibukota: "Tanjung Pinang",
    tujuan: [
      ["Kab. Bintan", 185000],
    ],
  },
  "Jambi": {
    ibukota: "Jambi",
    tujuan: [
      ["Kab. Batanghari", 175000],
      ["Kab. Bungo", 270000],
      ["Kab. Kerinci", 325000],
      ["Kab. Merangin", 260000],
      ["Kab. Muaro Jambi", 170000],
      ["Kab. Sarolangun", 241000],
      ["Kab. Tanjung Jabung Barat", 225000],
      ["Kab. Tanjung Jabung Timur", 190000],
      ["Kab. Tebo", 250000],
      ["Kota Sungai Penuh", 308000],
    ],
  },
  "Sumatera Barat": {
    ibukota: "Padang",
    tujuan: [
      ["Kab. Agam", 225000],
      ["Kab. Dharmasraya", 250000],
      ["Kab. Lima Puluh Kota", 225000],
      ["Kab. Padang Pariaman", 205000],
      ["Kab. Pasaman", 250000],
      ["Kab. Pasaman Barat", 250000],
      ["Kab. Pesisir Selatan", 205000],
      ["Kab. Sijunjung", 225000],
      ["Kab. Solok", 210000],
      ["Kab. Solok Selatan", 250000],
      ["Kab. Tanah Datar", 220000],
      ["Kota Bukit Tinggi", 215000],
      ["Kota Padang Panjang", 210000],
      ["Kota Pariaman", 200000],
      ["Kota Payakumbuh", 225000],
      ["Kota Sawahlunto", 215000],
      ["Kota Solok", 210000],
    ],
  },
  "Sumatera Selatan": {
    ibukota: "Palembang",
    tujuan: [
      ["Kab. Banyuasin", 203000],
      ["Kab. Empat Lawang", 315000],
      ["Kab. Lahat", 250000],
      ["Kab. Muara Enim", 235000],
      ["Kab. Musi Banyuasin", 235000],
      ["Kab. Musi Rawas", 320000],
      ["Kab. Musi Rawas Utara", 325000],
      ["Kab. Ogan Ilir", 205000],
      ["Kab. Ogan Komering Ilir", 205000],
      ["Kab. Ogan Komering Ulu", 248000],
      ["Kab. Ogan Komering Ulu Selatan", 250000],
      ["Kab. Ogan Komering Ulu Timur", 245000],
      ["Kab. Pali", 265000],
      ["Kota Lubuk Linggau", 290000],
      ["Kota Pagar Alam", 280000],
      ["Kota Prabumulih", 205000],
    ],
  },
  "Lampung": {
    ibukota: "Bandar Lampung",
    tujuan: [
      ["Kab. Lampung Barat", 270000],
      ["Kab. Lampung Selatan", 234000],
      ["Kab. Lampung Tengah", 246000],
      ["Kab. Lampung Timur", 246000],
      ["Kab. Lampung Utara", 252000],
      ["Kab. Mesuji", 276000],
      ["Kab. Pesawaran", 216000],
      ["Kab. Pesisir Barat", 270000],
      ["Kab. Pringsewu", 222000],
      ["Kab. Tanggamus", 240000],
      ["Kab. Tulang Bawang", 252000],
      ["Kab. Tulang Bawang Barat", 267000],
      ["Kab. Way Kanan", 270000],
      ["Kota Metro", 234000],
    ],
  },
  "Bengkulu": {
    ibukota: "Bengkulu",
    tujuan: [
      ["Kab. Bengkulu Selatan", 344000],
      ["Kab. Bengkulu Tengah", 232000],
      ["Kab. Bengkulu Utara", 313000],
      ["Kab. Kaur", 385000],
      ["Kab. Kepahiang", 298000],
      ["Kab. Lebong", 375000],
      ["Kab. Mukomuko", 423000],
      ["Kab. Rejang Lebong", 313000],
      ["Kab. Seluma", 282000],
    ],
  },
  "Bangka Belitung": {
    ibukota: "Pangkalpinang",
    tujuan: [
      ["Kab. Bangka", 250000],
      ["Kab. Bangka Barat", 275000],
      ["Kab. Bangka Selatan", 275000],
      ["Kab. Bangka Tengah", 250000],
    ],
  },
  "Banten": {
    ibukota: "Serang",
    tujuan: [
      ["Kab. Lebak", 208000],
      ["Kab. Pandeglang", 138000],
      ["Kab. Serang", 160000],
      ["Kab. Tangerang", 254000],
      ["Kota Cilegon", 160000],
      ["Kota Tangerang", 313000],
      ["Kota Tangerang Selatan", 347000],
    ],
  },
  "Jawa Barat": {
    ibukota: "Bandung",
    tujuan: [
      ["Kab. Bandung", 183000],
      ["Kab. Bandung Barat", 275000],
      ["Kab. Bekasi", 265000],
      ["Kab. Bogor", 275000],
      ["Kab. Ciamis", 245000],
      ["Kab. Cianjur", 215000],
      ["Kab. Cirebon", 280000],
      ["Kab. Garut", 243000],
      ["Kab. Indramayu", 275000],
      ["Kab. Karawang", 248000],
      ["Kab. Kuningan", 275000],
      ["Kab. Majalengka", 235000],
      ["Kab. Pangadaran", 283000],
      ["Kab. Purwakarta", 218000],
      ["Kab. Subang", 208000],
      ["Kab. Sukabumi", 245000],
      ["Kab. Sumedang", 230000],
      ["Kab. Tasikmalaya", 245000],
      ["Kota Banjar", 283000],
      ["Kota Bekasi", 265000],
      ["Kota Bogor", 285000],
      ["Kota Cimahi", 168000],
      ["Kota Cirebon", 270000],
      ["Kota Depok", 275000],
      ["Kota Sukabumi", 226000],
      ["Kota Tasikmalaya", 245000],
    ],
  },
  "Jawa Tengah": {
    ibukota: "Semarang",
    tujuan: [
      ["Kab. Banjarnegara", 260000],
      ["Kab. Banyumas", 257000],
      ["Kab. Batang", 240000],
      ["Kab. Blora", 270000],
      ["Kab. Boyolali", 240000],
      ["Kab. Brebes", 263000],
      ["Kab. Cilacap", 280000],
      ["Kab. Demak", 230000],
      ["Kab. Grobogan", 235000],
      ["Kab. Jepara", 240000],
      ["Kab. Karanganyar", 250000],
      ["Kab. Kebumen", 260000],
      ["Kab. Kendal", 230000],
      ["Kab. Klaten", 250000],
      ["Kab. Kudus", 235000],
      ["Kab. Magelang", 240000],
      ["Kab. Pati", 240000],
      ["Kab. Pekalongan", 245000],
      ["Kab. Pemalang", 250000],
      ["Kab. Purbalingga", 270000],
      ["Kab. Purworejo", 250000],
      ["Kab. Rembang", 250000],
      ["Kab. Semarang", 230000],
      ["Kab. Sragen", 250000],
      ["Kab. Sukoharjo", 250000],
      ["Kab. Tegal", 260000],
      ["Kab. Temanggung", 240000],
      ["Kab. Wonogiri", 250000],
      ["Kab. Wonosobo", 250000],
      ["Kota Magelang", 240000],
      ["Kota Pekalongan", 245000],
      ["Kota Salatiga", 235000],
      ["Kota Surakarta", 245000],
      ["Kota Tegal", 260000],
    ],
  },
  "DI Yogyakarta": {
    ibukota: "Yogyakarta",
    tujuan: [
      ["Kab. Bantul", 250000],
      ["Kab. Gunung Kidul", 350000],
      ["Kab. Kulon Progo", 350000],
      ["Kab. Sleman", 200000],
    ],
  },
  "Jawa Timur": {
    ibukota: "Surabaya",
    tujuan: [
      ["Kab. Bangkalan", 225000],
      ["Kab. Banyuwangi", 285000],
      ["Kab. Blitar", 255000],
      ["Kab. Bojonegoro", 225000],
      ["Kab. Bondowoso", 255000],
      ["Kab. Gresik", 225000],
      ["Kab. Jember", 261000],
      ["Kab. Jombang", 235000],
      ["Kab. Kediri", 235000],
      ["Kab. Lamongan", 225000],
      ["Kab. Lumajang", 261000],
      ["Kab. Madiun", 245000],
      ["Kab. Magetan", 253000],
      ["Kab. Malang", 228000],
      ["Kab. Mojokerto", 225000],
      ["Kab. Nganjuk", 245000],
      ["Kab. Ngawi", 253000],
      ["Kab. Pacitan", 285000],
      ["Kab. Pamekasan", 243000],
      ["Kab. Pasuruan", 228000],
      ["Kab. Ponorogo", 255000],
      ["Kab. Probolinggo", 228000],
      ["Kab. Sampang", 235000],
      ["Kab. Sidoarjo", 240000],
      ["Kab. Situbondo", 255000],
      ["Kab. Sumenep", 255000],
      ["Kab. Trenggalek", 245000],
      ["Kab. Tuban", 245000],
      ["Kab. Tulungagung", 245000],
      ["Kota Batu", 242000],
      ["Kota Blitar", 255000],
      ["Kota Bojonegoro", 225000],
      ["Kota Kediri", 235000],
      ["Kota Madiun", 245000],
      ["Kota Malang", 228000],
      ["Kota Mojokerto", 225000],
      ["Kota Probolinggo", 228000],
    ],
  },
  "Bali": {
    ibukota: "Denpasar",
    tujuan: [
      ["Kab. Badung", 188000],
      ["Kab. Bangli", 225000],
      ["Kab. Buleleng", 265000],
      ["Kab. Gianyar", 225000],
      ["Kab. Jembrana", 270000],
      ["Kab. Karangasem", 263000],
      ["Kab. Tabanan", 225000],
    ],
  },
  "Nusa Tenggara Barat": {
    ibukota: "Mataram",
    tujuan: [
      ["Kab. Lombok Barat", 325000],
      ["Kab. Lombok Tengah", 450000],
      ["Kab. Lombok Timur", 350000],
    ],
  },
  "Nusa Tenggara Timur": {
    ibukota: "Kupang",
    tujuan: [
      ["Kab. Belu", 325000],
      ["Kab. Kupang", 175000],
      ["Kab. Timor Tengah Selatan", 218000],
      ["Kab. Timor Tengah Utara", 275000],
    ],
  },
  "Kalimantan Barat": {
    ibukota: "Pontianak",
    tujuan: [
      ["Kab. Bengkayang", 270000],
      ["Kab. Kapuas Hulu", 550000],
      ["Kab. Kayong Utara", 550000],
      ["Kab. Ketapang", 550000],
      ["Kab. Kubu Raya", 185000],
      ["Kab. Landak", 270000],
      ["Kab. Melawi", 430000],
      ["Kab. Mempawah", 230000],
      ["Kab. Sambas", 300000],
      ["Kab. Sanggau", 303000],
      ["Kab. Sekadau", 343000],
      ["Kab. Sintang", 392000],
      ["Kota Singkawang", 257000],
    ],
  },
  "Kalimantan Tengah": {
    ibukota: "Palangkaraya",
    tujuan: [
      ["Kab. Barito Selatan", 290000],
      ["Kab. Barito Timur", 333000],
      ["Kab. Barito Utara", 425000],
      ["Kab. Gunung Mas", 300000],
      ["Kab. Kapuas", 275000],
      ["Kab. Katingan", 250000],
      ["Kab. Kotawaringin Barat", 425000],
      ["Kab. Kotawaringin Timur", 300000],
      ["Kab. Lamandau", 525000],
      ["Kab. Murung Raya", 448000],
      ["Kab. Pulau Pisau", 250000],
      ["Kab. Seruyan", 328000],
      ["Kab. Sukamara", 525000],
    ],
  },
  "Kalimantan Selatan": {
    ibukota: "Banjarmasin",
    tujuan: [
      ["Kab. Balangan", 230000],
      ["Kab. Banjar", 170000],
      ["Kab. Barito Kuala", 200000],
      ["Kab. Hulu Sungai Selatan", 200000],
      ["Kab. Hulu Sungai Tengah", 212000],
      ["Kab. Hulu Sungai Utara", 218000],
      ["Kab. Kota Baru", 290000],
      ["Kab. Tabalong", 234000],
      ["Kab. Tanah Bumbu", 300000],
      ["Kab. Tanah Laut", 200000],
      ["Kab. Tapin", 189000],
      ["Kota Banjarbaru", 225000],
    ],
  },
  "Kalimantan Timur": {
    ibukota: "Samarinda",
    tujuan: [
      ["Kab. Kutai Barat", 1500000],
      ["Kab. Kutai Kartanegara", 500000],
      ["Kab. Kutai Timur", 1350000],
      ["Kab. Paser", 1650000],
      ["Kab. Penajam Paser Utara", 650000],
      ["Kota Balikpapan", 550000],
      ["Kota Bontang", 600000],
    ],
  },
  "Sulawesi Utara": {
    ibukota: "Manado",
    tujuan: [
      ["Kab. Bolaang Mongondow", 250000],
      ["Kab. Bolaang Mongondow Selatan", 275000],
      ["Kab. Bolaang Mongondow Timur", 250000],
      ["Kab. Bolaang Mongondow Utara", 300000],
      ["Kab. Minahasa", 180000],
      ["Kab. Minahasa Selatan", 180000],
      ["Kab. Minahasa Tenggara", 200000],
      ["Kab. Minahasa Utara", 175000],
      ["Kota Bitung", 175000],
      ["Kota Kotamobagu", 250000],
      ["Kota Tomohon", 170000],
    ],
  },
  "Gorontalo": {
    ibukota: "Gorontalo",
    tujuan: [
      ["Kab. Boalemo", 400000],
      ["Kab. Gorontalo", 300000],
      ["Kab. Gorontalo Utara", 350000],
      ["Kab. Pahuwato", 650000],
    ],
  },
  "Sulawesi Barat": {
    ibukota: "Mamuju",
    tujuan: [
      ["Kab. Majene", 240000],
      ["Kab. Mamasa", 359000],
      ["Kab. Mamuju Tengah", 200000],
      ["Kab. Mamuju utara", 270000],
      ["Kab. Polewali Mandar", 260000],
    ],
  },
  "Sulawesi Selatan": {
    ibukota: "Makassar",
    tujuan: [
      ["Kab. Bantaeng", 235000],
      ["Kab. Barru", 210000],
      ["Kab. Bone", 240000],
      ["Kab. Bulukumba", 240000],
      ["Kab. Enrekang", 250000],
      ["Kab. Gowa", 175000],
      ["Kab. Jeneponto", 230000],
      ["Kab. Luwu", 350000],
      ["Kab. Luwu Timur", 375000],
      ["Kab. Luwu Utara", 365000],
      ["Kab. Maros", 170000],
      ["Kab. Pinrang", 230000],
      ["Kab. Sidenreng Rappang", 230000],
      ["Kab. Sinjai", 235000],
      ["Kab. Soppeng", 235000],
      ["Kab. Takalar", 190000],
      ["Kab. Tanatoraja", 350000],
      ["Kab. Toraja Utara", 350000],
      ["Kab. Wajo", 230000],
      ["Kota Palopo", 350000],
      ["Kota Pare-Pare", 225000],
    ],
  },
  "Sulawesi Tengah": {
    ibukota: "Palu",
    tujuan: [
      ["Kab. Luwuk", 400000],
      ["Kab. Buol", 472000],
      ["Kab. Donggala", 130000],
      ["Kab. Morowali", 400000],
      ["Kab. Morowali Utara", 400000],
      ["Kab. Parigi Moutong", 250000],
      ["Kab. Poso", 280000],
      ["Kab. Sigi", 219000],
      ["Kab. Tojouna-Una", 350000],
      ["Kab. Toli-Toli", 412000],
    ],
  },
  "Sulawesi Tenggara": {
    ibukota: "Kendari",
    tujuan: [
      ["Kab. Bombana", 355000],
      ["Kab. Kolaka", 370000],
      ["Kab. Kolaka Timur", 300000],
      ["Kab. Kolaka Utara", 425000],
      ["Kab. Konawe", 300000],
      ["Kab. Konawe Selatan", 305000],
      ["Kab. Konawe Utara", 300000],
    ],
  },
  "Maluku Utara": {
    ibukota: "Sofifi",
    tujuan: [
      ["Kab. Halmahera Barat", 850000],
      ["Kab. Halmahera Tengah", 1000000],
      ["Kab. Halmahera Timur", 1250000],
      ["Kab. Halmahera Utara", 900000],
    ],
  },
  "Papua": {
    ibukota: "Jayapura",
    tujuan: [
      ["Kab. Jayapura", 600000],
      ["Kab. Keerom", 900000],
      ["Kab. Sarmi", 2700000],
    ],
  },
  "Papua Barat": {
    ibukota: "Manokwari",
    tujuan: [
      ["Kab. Teluk Bintuni", 900000],
      ["Kab. Manokwari Selatan", 750000],
      ["Kab. Pegunungan Arfak", 2650000],
    ],
  },
};

// Jakarta → kota sekitar: [kabupaten/kota, provinsi, tarif sekali jalan]
const DARI_JAKARTA = [
  ["Kota Bekasi", "Jawa Barat", 256000],
  ["Kab. Bekasi", "Jawa Barat", 256000],
  ["Kab. Bogor", "Jawa Barat", 270000],
  ["Kota Bogor", "Jawa Barat", 270000],
  ["Kota Depok", "Jawa Barat", 248000],
  ["Kota Tangerang", "Banten", 258000],
  ["Kota Tangerang Selatan", "Banten", 258000],
  ["Kab. Tangerang", "Banten", 279000],
  ["Kepulauan Seribu", "DKI Jakarta", 386000],
];

const rapat = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Mencari rute untuk kota tujuan yang diketik (tidak peka huruf besar,
// spasi, dan titik: "kab tabanan" = "Kab. Tabanan").
//   { jenis: "sekitar",  asal: "Jakarta",  tujuan, tarif }  lumpsum dari Jakarta
//   { jenis: "provinsi", asal: ibukota,    tujuan, tarif }  dari ibu kota provinsi
//   { jenis: "ibukota",  asal: ibukota,    tujuan }         tujuan = ibu kota itu sendiri
//   null                                                    belum ada di PMK
function cariRute(provinsi, kota) {
  const k = rapat(kota);
  if (!k) return null;

  const sekitar = DARI_JAKARTA.find(([nama, prov]) => prov === provinsi && rapat(nama) === k);
  if (sekitar) return { jenis: "sekitar", asal: "Jakarta", tujuan: sekitar[0], tarif: sekitar[2] };

  const p = DARI_IBUKOTA[provinsi];
  if (!p) return null;
  if (rapat(p.ibukota) === k || rapat(`Kota ${p.ibukota}`) === k) {
    return { jenis: "ibukota", asal: p.ibukota, tujuan: p.ibukota };
  }
  const t = p.tujuan.find(([nama]) => rapat(nama) === k);
  return t ? { jenis: "provinsi", asal: p.ibukota, tujuan: t[0], tarif: t[1] } : null;
}

// Daftar pilihan kota tujuan per provinsi untuk dropdown dashboard.
function pilihanKota() {
  const hasil = {};
  for (const [prov, p] of Object.entries(DARI_IBUKOTA)) {
    hasil[prov] = [
      { nama: p.ibukota, keterangan: "Ibu kota provinsi" },
      ...p.tujuan.map(([nama, tarif]) => ({ nama, keterangan: `Dari ${p.ibukota}`, tarif })),
    ];
  }
  for (const [nama, prov, tarif] of DARI_JAKARTA) {
    (hasil[prov] ||= []).unshift({ nama, keterangan: "Dari Jakarta (lumpsum)", tarif });
  }
  return hasil;
}

module.exports = { cariRute, pilihanKota };
