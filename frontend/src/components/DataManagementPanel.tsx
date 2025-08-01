import React, { useState, useCallback } from 'react'
import { useSessionPersistence } from '../hooks/useSessionPersistence'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useViewState } from '../hooks/useViewState'

interface DataManagementPanelProps {
  isOpen: boolean
  onClose: () => void
}

export const DataManagementPanel: React.FC<DataManagementPanelProps> = ({
  isOpen,
  onClose
}) => {
  const sessionPersistence = useSessionPersistence()
  const userPreferences = useUserPreferences()
  const viewState = useViewState()
  
  const [activeTab, setActiveTab] = useState<'overview' | 'backup' | 'preferences' | 'cleanup'>('overview')
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importData, setImportData] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const storageStats = sessionPersistence.getStorageStats()

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }, [])

  const handleExportData = useCallback(async () => {
    setIsExporting(true)
    try {
      const data = sessionPersistence.exportData()
      if (data) {
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `claude-cli-backup-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showMessage('success', 'Data exported successfully')
      } else {
        showMessage('error', 'Failed to export data')
      }
    } catch (error) {
      showMessage('error', 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsExporting(false)
    }
  }, [sessionPersistence, showMessage])

  const handleImportData = useCallback(async () => {
    if (!importData.trim()) {
      showMessage('error', 'Please paste backup data')
      return
    }

    setIsImporting(true)
    try {
      const success = sessionPersistence.importData(importData)
      if (success) {
        showMessage('success', 'Data imported successfully')
        setImportData('')
        // Refresh current state
        window.location.reload()
      } else {
        showMessage('error', 'Failed to import data')
      }
    } catch (error) {
      showMessage('error', 'Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsImporting(false)
    }
  }, [importData, sessionPersistence, showMessage])

  const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setImportData(content)
      }
      reader.readAsText(file)
    }
  }, [])

  const handleClearData = useCallback((dataType: 'all' | 'history' | 'preferences' | 'viewState') => {
    if (!confirm(`Are you sure you want to clear ${dataType === 'all' ? 'all data' : dataType}? This action cannot be undone.`)) {
      return
    }

    try {
      switch (dataType) {
        case 'all':
          sessionPersistence.clearSessionData()
          showMessage('success', 'All data cleared')
          break
        case 'history':
          sessionPersistence.saveCommandHistory([])
          showMessage('success', 'Command history cleared')
          break
        case 'preferences':
          userPreferences.resetToDefaults()
          showMessage('success', 'Preferences reset to defaults')
          break
        case 'viewState':
          viewState.resetToDefaults()
          showMessage('success', 'View state reset to defaults')
          break
      }
    } catch (error) {
      showMessage('error', 'Clear operation failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }, [sessionPersistence, userPreferences, viewState, showMessage])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Data Management
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'backup', label: 'Backup & Restore' },
            { id: 'preferences', label: 'Preferences' },
            { id: 'cleanup', label: 'Cleanup' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-96">
          {/* Message */}
          {message && (
            <div className={`mb-4 p-3 rounded-md ${
              message.type === 'success' 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
            }`}>
              {message.text}
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Storage Statistics
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Total Storage Used</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {storageStats ? formatBytes(storageStats.totalSize) : 'N/A'}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Storage Items</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {storageStats?.itemCount || 0}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Session Information
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Session ID:</span>
                      <span className="text-sm font-mono text-gray-900 dark:text-white">
                        {sessionPersistence.loadSessionData()?.sessionId || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Last Activity:</span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {sessionPersistence.loadSessionData()?.lastActivity 
                          ? formatDate(sessionPersistence.loadSessionData()!.lastActivity)
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Command History:</span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {sessionPersistence.loadCommandHistory().length} commands
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Backup Tab */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Export Data
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Download a complete backup of your session data, preferences, and command history.
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isExporting ? 'Exporting...' : 'Export Data'}
                </button>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Import Data
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Restore data from a previous backup. This will overwrite current data.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Upload Backup File
                    </label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileImport}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Or Paste Backup Data
                    </label>
                    <textarea
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder="Paste your backup JSON data here..."
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                  
                  <button
                    onClick={handleImportData}
                    disabled={isImporting || !importData.trim()}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {isImporting ? 'Importing...' : 'Import Data'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Current Preferences
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                  <pre className="text-sm text-gray-900 dark:text-white overflow-x-auto">
                    {JSON.stringify(userPreferences.preferences, null, 2)}
                  </pre>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  View State
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
                  <pre className="text-sm text-gray-900 dark:text-white overflow-x-auto">
                    {JSON.stringify(viewState.viewState, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Cleanup Tab */}
          {activeTab === 'cleanup' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Data Cleanup Options
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Remove specific types of data to free up storage space. These actions cannot be undone.
                </p>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">Clear Command History</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Remove all saved command history ({sessionPersistence.loadCommandHistory().length} commands)
                      </p>
                    </div>
                    <button
                      onClick={() => handleClearData('history')}
                      className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700"
                    >
                      Clear History
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">Reset Preferences</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Reset all user preferences to default values
                      </p>
                    </div>
                    <button
                      onClick={() => handleClearData('preferences')}
                      className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700"
                    >
                      Reset Preferences
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">Reset View State</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Reset all layout and view settings to defaults
                      </p>
                    </div>
                    <button
                      onClick={() => handleClearData('viewState')}
                      className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700"
                    >
                      Reset View State
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900 rounded-md border border-red-200 dark:border-red-800">
                    <div>
                      <h4 className="font-medium text-red-900 dark:text-red-300">Clear All Data</h4>
                      <p className="text-sm text-red-700 dark:text-red-400">
                        Permanently remove all stored data and reset to factory defaults
                      </p>
                    </div>
                    <button
                      onClick={() => handleClearData('all')}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                    >
                      Clear All Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DataManagementPanel