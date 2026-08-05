import { useState } from 'react'
import InventoryTaking from './InventoryTaking'
import AdminMasterDataTU from './MasterDataTU'
import './App.css'

function App() {
  const [page, setPage] = useState('inventory')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">SisKA Dashboard</h1>
            <p className="text-sm text-slate-500">Pilih Inventory Taking atau Master Data TU</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPage('inventory')}
              className={`px-4 py-2 rounded-xl font-semibold transition ${page === 'inventory' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Inventory Taking
            </button>
            <button
              type="button"
              onClick={() => setPage('masterdata')}
              className={`px-4 py-2 rounded-xl font-semibold transition ${page === 'masterdata' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Master Data TU
            </button>
          </div>
        </div>
      </header>

      <main>
        {page === 'inventory' ? <InventoryTaking /> : <AdminMasterDataTU />}
      </main>
    </div>
  )
}

export default App
