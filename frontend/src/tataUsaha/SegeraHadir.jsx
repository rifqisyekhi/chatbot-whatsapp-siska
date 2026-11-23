// Halaman sementara untuk fitur yang belum dibuat. Dipakai oleh
// fitur/<slug>/index.jsx selama fiturnya masih dikerjakan.

export default function SegeraHadir({ judul, keterangan, Ikon }) {
  return (
    <div className="min-h-screen bg-paper font-sans text-navy">
      <header className="bg-white border-b border-mist">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">{judul}</h1>
            <p className="text-xs text-slate-500 font-medium">Dashboard Tata Usaha Rokeu</p>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="bg-white rounded-3xl border border-mist shadow-2xs p-8 text-center max-w-xl mx-auto">
          {Ikon && <Ikon className="w-10 h-10 mx-auto text-brand" />}
          <h2 className="mt-4 text-lg font-extrabold">Segera hadir</h2>
          <p className="mt-2 text-sm text-slate-500">{keterangan}</p>
          <p className="mt-1 text-sm text-slate-500">Fitur ini sedang disiapkan mengikuti format dokumen yang dipakai Biro.</p>
        </div>
      </main>
    </div>
  );
}
