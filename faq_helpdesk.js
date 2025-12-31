const FAQ = [
  {
    keywords: ["apa itu chatbot"],
    answer:
      "Chatbot adalah sistem otomatis berbasis komputer yang dirancang untuk menjawab pertanyaan atau membantu pengguna melalui percakapan teks."
  },
  {
    keywords: ["pengajuan lembur", "lembur"],
    answer:
      "Pengajuan lembur dilakukan melalui sistem resmi dengan mengisi formulir pengajuan dan mendapatkan persetujuan atasan langsung."
  },
  {
    keywords: ["cuti"],
    answer:
      "Pengajuan cuti dilakukan melalui aplikasi kepegawaian sesuai dengan ketentuan yang berlaku."
  }
];

function cariJawabanFAQ(pertanyaan) {
  const q = pertanyaan.toLowerCase();
  for (const item of FAQ) {
    if (item.keywords.some(k => q.includes(k))) {
      return item.answer;
    }
  }
  return null;
}

module.exports = { cariJawabanFAQ };
