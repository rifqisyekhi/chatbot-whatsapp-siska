// config.js — SisKA Bot Config
require('dotenv').config();

module.exports = {
  HELPDESK_GROUP_ID: process.env.HELPDESK_GROUP_ID,

  NO_KETUA_SUB_TU: process.env.NO_KETUA_SUB_TU ? `${process.env.NO_KETUA_SUB_TU}@c.us` : null,
  NO_ADMIN_SAKEH: process.env.NO_ADMIN_SAKEH ? `${process.env.NO_ADMIN_SAKEH}@c.us` : null,
  
  NIP_KETUA_SUB_TU: process.env.NIP_KETUA_SUB_TU || "-",
  NAMA_KETUA_SUB_TU: process.env.NAMA_KETUA_SUB_TU || "Penanggung Jawab",
  JABATAN_KETUA_SUB_TU: process.env.JABATAN_KETUA_SUB_TU || "Kepala Sub Bagian",

  PORT_WEB: process.env.PORT_WEB || 3000,

  FORM_LEMBUR_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSdBIb4_YafMBUo-RWMfgl9oY_xRKr6E3_A3egH28emysYujKA/viewform',
  FORM_CUTI_URL: 'https://forms.gle/1JJLAFTGCN1McEUJ7',

  LINK_WEB_KATALOG: process.env.LINK_WEB_KATALOG || `http://localhost:3000/`
};