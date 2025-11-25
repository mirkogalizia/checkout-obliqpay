// src/app/admin/stripe-dashboard/page.tsx
'use client'

import { useEffect, useState } from 'react'
import Stripe from 'stripe'

type AccountStat = {
  label: string
  order: number
  active: boolean
  isCurrentlyActive: boolean
  stats: {
    totalEur: number
    totalCents: number
    transactionCount: number
    currency: string
  }
  error?: string
}

type DashboardData = {
  date: string
  dateLocal: string
  rotation: {
    currentAccount: string
    slotNumber: number
    totalSlots: number
    nextRotation: string
    nextRotationLocal: string
  }
  accounts: AccountStat[]
  totals: {
    totalEur: number
    transactionCount: number
    currency: string
  }
  transactions?: Array<{
    id: string
    amount: number
    currency: string
    status: string
    created: number
    email: string
    errorCode?: string
    declineCode?: string
  }>
}

export default function StripeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [secretKey, setSecretKey] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeTab, setActiveTab] = useState<'stats' | 'transactions'>('stats')
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')

  const fetchData = async (key: string) => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/admin/stripe-stats?key=${encodeURIComponent(key)}`)
      
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Password non valida')
        }
        throw new Error('Errore nel caricamento dati')
      }

      const json = await res.json()
      setData(json)
      setIsAuthenticated(true)
      localStorage.setItem('adminKey', key)
    } catch (err: any) {
      setError(err.message)
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const savedKey = localStorage.getItem('adminKey')
    if (savedKey) {
      fetchData(savedKey)
    } else {
      setLoading(false)
    }
  }, [])

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    fetchData(secretKey)
  }

  const handleRefresh = () => {
    const savedKey = localStorage.getItem('adminKey')
    if (savedKey) {
      fetchData(savedKey)
    }
  }

  const formatMoney = (cents: number, currency: string) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getErrorLabel = (errorCode?: string, declineCode?: string) => {
    const errors: Record<string, string> = {
      card_declined: 'Carta rifiutata',
      insufficient_funds: 'Fondi insufficienti',
      expired_card: 'Carta scaduta',
      incorrect_cvc: 'CVV errato',
      incorrect_number: 'Numero carta errato',
      processing_error: 'Errore temporaneo',
      card_not_supported: 'Carta non supportata',
      fraudulent: 'Transazione fraudolenta',
      do_not_honor: 'Rifiutata dalla banca',
      generic_decline: 'Rifiutata generica',
      lost_card: 'Carta smarrita',
      stolen_card: 'Carta rubata',
    }
    if (declineCode) return errors[declineCode] || declineCode
    if (errorCode) return errors[errorCode] || errorCode
    return 'Errore sconosciuto'
  }

  const transactions = data?.transactions || []
  const isSuccess = (tx: any) => tx.status === 'succeeded'
  const isFailed = (tx: any) => tx.status === 'failed' || tx.errorCode || tx.declineCode

  const filteredTransactions = transactions.filter(tx => {
    if (filter === 'success') return isSuccess(tx)
    if (filter === 'failed') return isFailed(tx)
    return true
  })

  const successCount = transactions.filter(isSuccess).length
  const failedCount = transactions.filter(isFailed).length
  const successRate = transactions.length > 0 
    ? ((successCount / transactions.length) * 100).toFixed(1) 
    : '0'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-6 text-center">🔒 Admin Dashboard</h1>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password Admin
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Inserisci la password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Accedi
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Nessun dato disponibile</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold text-gray-900">📊 Stripe Dashboard</h1>
            <button
              onClick={handleRefresh}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Aggiorna
            </button>
          </div>
          
          <p className="text-gray-600">📅 {data.dateLocal}</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📊 Statistiche
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'transactions'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📋 Transazioni ({transactions.length})
            </button>
          </div>
        </div>

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <>
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-lg p-6 mb-6 text-white">
              <h2 className="text-xl font-bold mb-4">🔄 Rotazione Account</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-blue-100 text-sm">Account Attivo</p>
                  <p className="text-2xl font-bold">{data.rotation.currentAccount}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Slot</p>
                  <p className="text-2xl font-bold">
                    {data.rotation.slotNumber} / {data.rotation.totalSlots}
                  </p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Prossima Rotazione</p>
                  <p className="text-lg font-bold">{data.rotation.nextRotationLocal}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">💰 Totale Incassato Oggi</h3>
                <p className="text-4xl font-bold text-green-600">
                  €{data.totals.totalEur.toFixed(2)}
                </p>
              </div>
              
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">📈 Transazioni Oggi</h3>
                <p className="text-4xl font-bold text-blue-600">
                  {data.totals.transactionCount}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">📊 Dettaglio per Account</h2>
              
              <div className="space-y-4">
                {data.accounts.map((account) => (
                  <div
                    key={account.label}
                    className={`border rounded-lg p-4 ${
                      account.isCurrentlyActive
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900">
                          {account.label}
                        </h3>
                        {account.isCurrentlyActive && (
                          <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                            ATTIVO
                          </span>
                        )}
                        {!account.active && (
                          <span className="bg-gray-400 text-white text-xs px-2 py-1 rounded-full">
                            INATTIVO
                          </span>
                        )}
                      </div>
                      
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-600">
                          €{account.stats.totalEur.toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {account.stats.transactionCount} transazioni
                        </p>
                      </div>
                    </div>

                    {account.error && (
                      <p className="text-sm text-red-600 mt-2">⚠️ {account.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-sm text-gray-600 font-medium">Totale</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{transactions.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-sm text-gray-600 font-medium">Successo</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{successCount}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-sm text-gray-600 font-medium">Falliti</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{failedCount}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-sm text-gray-600 font-medium">Tasso successo</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{successRate}%</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Tutte ({transactions.length})
                </button>
                <button
                  onClick={() => setFilter('success')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    filter === 'success' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ✓ Successo ({successCount})
                </button>
                <button
                  onClick={() => setFilter('failed')}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    filter === 'failed' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ✗ Falliti ({failedCount})
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Data</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Importo</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredTransactions.map((tx: any) => {
                      const success = isSuccess(tx)
                      const failed = isFailed(tx)
                      
                      return (
                        <tr 
                          key={tx.id} 
                          className={`hover:bg-gray-50 transition ${
                            success ? 'bg-green-50' : failed ? 'bg-red-50' : ''
                          }`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(tx.created)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{tx.email}</div>
                            {failed && (
                              <div className="mt-1 inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                                🚫 {getErrorLabel(tx.errorCode, tx.declineCode)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                            {formatMoney(tx.amount, tx.currency)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {success && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                                ✓ Completato
                              </span>
                            )}
                            {failed && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                                ✗ Fallito
                              </span>
                            )}
                            {!success && !failed && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                                ⏳ In sospeso
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <a
                              href={`https://dashboard.stripe.com/payments/${tx.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Vedi →
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

