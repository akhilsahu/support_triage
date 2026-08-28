import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, X, Loader2, Save, RefreshCw, Send, Copy, Check, ShieldCheck, Trash2, Undo2, Network } from 'lucide-react'
import { apiClient } from '../../api/client'
import { HierarchyEditor } from './HierarchyEditor'

export function ExtractedFactsModal({
  docId,
  docName,
  kbId,
  onClose
}: {
  docId: string
  docName: string
  kbId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState('')
  const [editedFacts, setEditedFacts] = useState<any[] | null>(null)

  const [chatHistory, setChatHistory] = useState<{ id: string, role: 'user' | 'system', text: string, showTable?: boolean, tableSnapshot?: any[], hierarchyTree?: any, timestamp?: string }[]>([])
  const [lastSavedFacts, setLastSavedFacts] = useState<any[] | null>(null)
  
  const [activeTab, setActiveTab] = useState<'extraction' | 'hierarchy'>('extraction')

  // 1. Poll the status
  const { data: statusData, refetch, isLoading } = useQuery<{ status: string, facts?: any[], progress?: number, total?: number, eta_seconds?: number, message?: string, chat_history?: any[], saved_facts?: any[], hierarchy_tree?: any }>({
    queryKey: ['extract-facts-v2-status', kbId, docId],
    queryFn: () => apiClient.getExtractFactsV2Status(kbId, docId),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return (s === 'processing' || s === 'none') ? 3000 : false
    },
    refetchOnWindowFocus: false,
  })

  const status = statusData?.status || 'none'
  const originalFacts = statusData?.facts || []

  // Initialize edited facts and chat history once loaded
  useEffect(() => {
    if (status === 'completed' && editedFacts === null && originalFacts.length > 0) {
      // Find the most recent table state in the chat history
      const history = statusData?.chat_history || []
      let latestSnapshot = originalFacts
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].tableSnapshot) {
          latestSnapshot = history[i].tableSnapshot
          break
        }
      }
      
      setEditedFacts(JSON.parse(JSON.stringify(latestSnapshot)))
      if (history.length > 0 && chatHistory.length === 0) {
        setChatHistory(history)
      }
      if (statusData?.saved_facts && lastSavedFacts === null) {
        setLastSavedFacts(statusData.saved_facts)
      }
    }
  }, [status, originalFacts, editedFacts, statusData?.chat_history, chatHistory.length, statusData?.saved_facts, lastSavedFacts])

  // Sync chat history to backend
  const syncChatMutation = useMutation({
    mutationFn: (newHistory: any[]) => apiClient.syncExtractFactsChat(kbId, docId, newHistory)
  })

  // We wrap setChatHistory so it automatically syncs
  const updateChatHistory = (updater: any) => {
    setChatHistory(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      syncChatMutation.mutate(next)
      return next
    })
  }

  // 2. Trigger Extraction (Initial or Regenerate)
  const extractMutation = useMutation({
    mutationFn: (f?: string) => apiClient.extractFactsV2(kbId, docId, f),
    onSuccess: () => {
      setEditedFacts(null)
      setChatHistory([])
      refetch()
    }
  })

  // Start extraction if it's the first time
  useEffect(() => {
    if (!isLoading && status === 'none' && !extractMutation.isPending) {
      extractMutation.mutate(undefined)
    }
  }, [status, isLoading])

  const commitMutation = useMutation({
    mutationFn: () => apiClient.commitExtractFactsV2(kbId, docId, editedFacts || originalFacts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-facts', kbId] })
      setLastSavedFacts(editedFacts || originalFacts)
      // Optional: Add a subtle toast or message to chat history
      updateChatHistory((prev: any) => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: 'Facts successfully committed to the database.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
    }
  })

  // 4. Verify Mutation
  const verifyMutation = useMutation({
    mutationFn: ({ text, useOriginal }: { text: string, useOriginal?: boolean }) => 
      apiClient.verifyExtractFactsV2(kbId, docId, useOriginal ? originalFacts : (editedFacts || originalFacts), text),
    onSuccess: (res: any) => {
      if (res.facts) {
        setEditedFacts(res.facts)
      }
      updateChatHistory((prev: any) => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: res.message || 'Verification complete! I have updated the table based on the agentic pass. Here are the new results:',
        showTable: true,
        tableSnapshot: res.facts,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
      refetch()
    }
  })

  // 5. Graphify Mutation
  const graphifyMutation = useMutation({
    mutationFn: () => apiClient.graphifyExtractFactsV2(kbId, docId, editedFacts || originalFacts),
    onSuccess: (res: any) => {
      if (res.facts) {
        setEditedFacts(res.facts)
      }
      updateChatHistory((prev: any) => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: res.message || 'Graph generation complete!',
        showTable: true,
        tableSnapshot: res.facts,
        hierarchyTree: res.hierarchy_tree,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
      setActiveTab('hierarchy')
      refetch()
    }
  })

  const handleUpdateFact = (index: number, field: string, value: string, msgId?: string) => {
    let current;
    if (msgId) {
      const msg = chatHistory.find(m => m.id === msgId)
      current = msg?.tableSnapshot || originalFacts
    } else {
      current = editedFacts || originalFacts
    }
    
    const newFacts = [...current]
    newFacts[index] = { ...newFacts[index], [field]: value }
    
    setEditedFacts(newFacts)
    
    if (msgId) {
      setChatHistory(prev => prev.map(m => m.id === msgId ? { ...m, tableSnapshot: newFacts } : m))
    }
  }

  const handleDeleteFacts = (indices: number[], msgId?: string) => {
    let current;
    if (msgId) {
      const msg = chatHistory.find(m => m.id === msgId)
      current = msg?.tableSnapshot || originalFacts
    } else {
      current = editedFacts || originalFacts
    }
    
    const newFacts = current.filter((_, idx) => !indices.includes(idx))
    
    setEditedFacts(newFacts)
    
    if (msgId) {
      setChatHistory(prev => prev.map(m => m.id === msgId ? { ...m, tableSnapshot: newFacts } : m))
    }
  }

  const handleRegenerate = () => {
    if (!feedback.trim()) return
    extractMutation.mutate(feedback)
    setFeedback('')
  }

  const handleRestoreOriginal = () => {
    if (window.confirm("Are you sure? All changes done after this point will be dropped and the facts will be restored to this point.")) {
      setEditedFacts(JSON.parse(JSON.stringify(originalFacts)))
      updateChatHistory((prev: any) => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: 'Reverted table back to the originally extracted facts.',
        showTable: true,
        tableSnapshot: JSON.parse(JSON.stringify(originalFacts)),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }])
    }
  }

  const handleRestoreSnapshot = (snapshot: any[], msgId?: string) => {
    if (window.confirm("Are you sure? All changes done after this point will be dropped and the facts will be restored to this point.")) {
      setEditedFacts(JSON.parse(JSON.stringify(snapshot)))
      if (msgId) {
        updateChatHistory((prev: any[]) => {
          const idx = prev.findIndex(m => m.id === msgId)
          if (idx !== -1) {
            return prev.slice(0, idx + 1)
          }
          return prev
        })
      } else {
        updateChatHistory([])
      }
    }
  }



  const isWorking = status === 'processing' || status === 'none' || extractMutation.isPending || verifyMutation.isPending || graphifyMutation.isPending

  const handleSend = (isButtonAction = false, fromScratch = false) => {
    const textToSend = feedback.trim()
    if (!textToSend && !isButtonAction && !fromScratch) return
    if (isWorking) return
    
    if (fromScratch && !window.confirm("Are you sure? Regenerating from scratch will completely wipe your current table and chat history progress, and trigger a full re-extraction from the document source.")) {
      return
    }
    
    // Add user message to chat
    updateChatHistory((prev: any) => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend 
        ? (fromScratch ? `[Re-Extracting from source] ${textToSend}` : textToSend)
        : (fromScratch ? 'Re-extract facts from document.' : 'Yes, verify the facts.'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }])
    
    if (fromScratch) {
      extractMutation.mutate(textToSend)
    } else {
      verifyMutation.mutate({ text: textToSend, useOriginal: false })
    }
    setFeedback('')
  }

  const handleGraphify = () => {
    if (isWorking) return
    
    updateChatHistory((prev: any) => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      text: 'Please generate a product hierarchy graph and normalize the aliases.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }])
    
    graphifyMutation.mutate()
  }

  // Auto-scroll to bottom of chat when new content appears
  const chatEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [status, isWorking, editedFacts])

  return (
    <div className="fixed inset-0 z-[60] bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
      <div className="w-full h-full max-w-6xl mx-auto flex flex-col overflow-hidden shadow-2xl bg-white dark:bg-gray-900 sm:border-x border-gray-200 dark:border-gray-800 animate-slide-up-modal">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl flex items-center justify-center text-xl shadow-2xs">
              ✨
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Fact Extraction Agent</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Document: <strong>{docName}</strong></p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('extraction')}
                className={`pb-2 text-sm font-bold transition-colors ${activeTab === 'extraction' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                Fact Extraction
              </button>
              <button
                onClick={() => setActiveTab('hierarchy')}
                className={`pb-2 text-sm font-bold transition-colors flex items-center gap-1.5 ${activeTab === 'hierarchy' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`}
              >
                <Network className="w-4 h-4" /> Hierarchy Review
              </button>
            </div>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestoreOriginal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 rounded-lg transition-colors border border-amber-200 dark:border-amber-800 shadow-2xs"
                title="Restore Original Extracted Facts"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Restore Original</span>
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Chat Message Area */}
        {activeTab === 'extraction' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* AI Initial Processing Message */}
              {(status === 'processing' || status === 'none' || extractMutation.isPending) && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex flex-col gap-2 max-w-[80%]">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm text-gray-800 dark:text-gray-200">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                        <span className="font-medium">{statusData?.message || 'Extracting facts from the document...'}</span>
                      </div>
                      {statusData?.total && statusData.total > 0 && (
                        <div className="mt-4 w-64">
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-2 overflow-hidden">
                            <div
                              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${(statusData.progress || 0) / statusData.total * 100}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between w-full text-xs text-gray-500 font-medium">
                            <span>Batch {statusData.progress} of {statusData.total}</span>
                            <span>~{statusData.eta_seconds || 0}s remaining</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Failed Message */}
              {status === 'failed' && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
                    <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex flex-col gap-2 max-w-[80%]">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm text-red-800 dark:text-red-200">
                      <p className="font-semibold">Extraction Failed</p>
                      <p className="text-sm mt-1">{statusData?.message || "The AI engine encountered an error."}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Success Message + Data Table */}
              {status === 'completed' && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0 mt-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex flex-col gap-3 w-full overflow-hidden">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-none px-5 py-3 shadow-sm inline-block max-w-fit text-gray-800 dark:text-gray-200">
                      <p>I've finished scanning the document! Here are the extracted facts:</p>
                    </div>

                    {(editedFacts || originalFacts).length === 0 ? (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center text-gray-500 shadow-sm max-w-md">
                        No lookup facts found in this document.
                      </div>
                    ) : (
                      <FactsTable 
                        facts={editedFacts || originalFacts} 
                        handleUpdateFact={(idx, field, val) => handleUpdateFact(idx, field, val)} 
                        handleDeleteFacts={(indices) => handleDeleteFacts(indices)}
                        onRestore={() => handleRestoreSnapshot(originalFacts, undefined)}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* AI Verification Prompt Message / Chat History */}
              {status === 'completed' && (editedFacts || originalFacts).length > 0 && (
                <div className="flex flex-col gap-6">
                  {/* Chat History */}
                  {chatHistory.map((msg, index) => {
                    const isLatest = index === chatHistory.length - 1;
                    return (
                    <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-gray-200 dark:bg-gray-800' : 'bg-indigo-100 dark:bg-indigo-900/50'
                        }`}>
                        {msg.role === 'user' ? (
                          <span className="text-gray-600 dark:text-gray-400 text-xs font-bold">You</span>
                        ) : (
                          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div className={`flex items-center gap-2 mb-0.5 px-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {msg.role === 'user' ? (
                            <>
                              {msg.timestamp && <span className="text-[10px] text-gray-400">{msg.timestamp}</span>}
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">You</span>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] font-medium text-indigo-500 uppercase tracking-wider">Agent</span>
                              {msg.timestamp && <span className="text-[10px] text-gray-400">{msg.timestamp}</span>}
                            </>
                          )}
                        </div>
                        <div className={`border rounded-2xl px-5 py-4 shadow-sm w-fit max-w-[80%] ${msg.role === 'user'
                            ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-tr-none text-gray-800 dark:text-gray-200 self-end'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-tl-none text-gray-800 dark:text-gray-200 self-start'
                          }`}>
                          <p className="text-sm">{msg.text}</p>
                        </div>
                        {msg.showTable && (
                          <div className="mt-2 w-full">
                            <FactsTable
                              facts={msg.tableSnapshot || originalFacts}
                              handleUpdateFact={(idx, field, val) => handleUpdateFact(idx, field, val, msg.id)}
                              handleDeleteFacts={(indices) => handleDeleteFacts(indices, msg.id)}
                              onRestore={msg.tableSnapshot ? () => handleRestoreSnapshot(msg.tableSnapshot!, msg.id) : undefined}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )})}
                </div>
              )}

              {/* Verifying Loading State */}
              {(verifyMutation.isPending || graphifyMutation.isPending) && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex flex-col gap-2 max-w-[80%]">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm text-gray-800 dark:text-gray-200">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                        <span className="font-medium text-amber-700 dark:text-amber-500">
                          {graphifyMutation.isPending ? 'Agent is building product hierarchy...' :
                           verifyMutation.variables && verifyMutation.variables.text.trim() !== '' 
                            ? 'Agent is processing your request...' 
                            : 'Agent is verifying and deduplicating facts...'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
            
            {/* Chat Input Footer */}
            <div className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shrink-0 flex flex-col gap-4">
              <div className="w-full flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    disabled={isWorking}
                    placeholder="Instruct the agent (e.g. 'Remove all utility fees')"
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-shadow"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                  />
                  <button
                    onClick={() => handleSend(false)}
                    disabled={!feedback.trim() || isWorking}
                    className="absolute right-1.5 top-1.5 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => handleSend(false, true)}
                    disabled={isWorking || status !== 'completed' || originalFacts.length === 0}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                    title="Regenerate from original extracted facts"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate
                  </button>
                  <button
                    onClick={() => handleSend(true)}
                    disabled={isWorking || status !== 'completed' || (editedFacts || originalFacts).length === 0}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                    title="Run automatic deduplication and cleanup"
                  >
                    {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Auto Verify
                  </button>
                  <button
                    onClick={handleGraphify}
                    disabled={isWorking || status !== 'completed' || (editedFacts || originalFacts).length === 0}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                    title="Build Hierarchy Graph"
                  >
                    {graphifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                    Graphify
                  </button>
                  <button
                    onClick={() => commitMutation.mutate()}
                    disabled={isWorking || commitMutation.isPending || status !== 'completed' || (editedFacts || originalFacts).length === 0 || JSON.stringify(editedFacts || originalFacts) === JSON.stringify(lastSavedFacts)}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-xl text-sm font-medium shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-80 whitespace-nowrap"
                  >
                    {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : JSON.stringify(editedFacts || originalFacts) === JSON.stringify(lastSavedFacts) ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {JSON.stringify(editedFacts || originalFacts) === JSON.stringify(lastSavedFacts) ? 'Saved' : 'Save to DB'}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center w-full px-1">
                <div className="text-xs text-gray-400">
                  Type custom instructions or click Auto Verify to let the agent clean up the facts.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden p-4">
            <HierarchyEditor
              facts={originalFacts}
              hierarchyTree={chatHistory.slice().reverse().find((m) => m.hierarchyTree)?.hierarchyTree || statusData?.hierarchy_tree}
              onFeedbackSubmitted={() => setActiveTab('extraction')}
              onGraphify={handleGraphify}
              isGraphifying={graphifyMutation.isPending}
            />
          </div>
        )}

      </div>
    </div>
  )
}

function FactsTable({ facts, handleUpdateFact, handleDeleteFacts, onRestore }: { facts: any[], handleUpdateFact: (idx: number, field: string, val: string) => void, handleDeleteFacts: (indices: number[]) => void, onRestore?: () => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  const toggleRow = (idx: number) => {
    const next = new Set(selected)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === facts.length && facts.length > 0) setSelected(new Set())
    else setSelected(new Set(facts.map((_, i) => i)))
  }

  const handleCopy = () => {
    if (!facts || facts.length === 0) return
    const header = "| # | Subject | Category | Confidence | Label | Value | Note/Condition |\n|---|---|---|---|---|---|---|";
    const text = facts.map((f: any, idx: number) => {
      const escape = (str: string) => (str || "").replace(/\|/g, "\\|");
      return `| ${idx + 1} | ${escape(f.subject)} | ${escape(f.category)} | ${escape(f.confidence)} | ${escape(f.label)} | ${escape(f.value)} | ${escape(f.note)} |`;
    }).join('\n');

    navigator.clipboard.writeText(`${header}\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      <div className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center z-10">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {selected.size > 0 ? (
            <span className="text-red-600 dark:text-red-400">{selected.size} row(s) selected</span>
          ) : (
            <span>{facts.length} facts extracted</span>
          )}
        </span>

        <div className="flex items-center gap-4">
          {selected.size > 0 && (
            <button
              onClick={() => { handleDeleteFacts(Array.from(selected)); setSelected(new Set()); }}
              className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove Selected
            </button>
          )}

          {onRestore && (
            <button
              onClick={onRestore}
              title="Restore to this point"
              className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-900/30 rounded transition-colors"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy Table"}
            className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:text-indigo-300 dark:hover:bg-indigo-900/30 rounded transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 dark:bg-gray-900/80 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium w-8">
                <input
                  type="checkbox"
                  checked={selected.size === facts.length && facts.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="px-3 py-3 border-b border-gray-200 dark:border-gray-700 font-medium w-8 text-center">#</th>
              <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium">Subject</th>
              <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium w-1/6">Category</th>
              <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium w-1/12">Confidence</th>
              <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium w-1/5">Label</th>
              <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium w-1/5">Value</th>
              <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium w-1/5">Note / Condition</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {facts.map((fact, idx) => (
              <tr key={idx} className={`hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors group ${selected.has(idx) ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}>
                <td className="px-4 py-3 align-top border-r border-gray-100 dark:border-gray-700/50 w-8">
                  <input
                    type="checkbox"
                    checked={selected.has(idx)}
                    onChange={() => toggleRow(idx)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1.5"
                  />
                </td>
                <td className="px-3 py-3 align-top border-r border-gray-100 dark:border-gray-700/50 w-8 text-center text-gray-400 dark:text-gray-500 font-medium text-xs">
                  {idx + 1}
                </td>
                <td className="px-4 py-3 align-top border-r border-gray-100 dark:border-gray-700/50">
                  <input 
                    type="text" 
                    value={fact.subject || ''}
                    onChange={(e) => handleUpdateFact(idx, 'subject', e.target.value)}
                    className="w-32 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-0 p-0 focus:ring-0"
                  />
                </td>
                <td className="px-4 py-3 align-top border-r border-gray-100 dark:border-gray-700/50">
                  <input 
                    type="text" 
                    value={fact.category || ''}
                    onChange={(e) => handleUpdateFact(idx, 'category', e.target.value)}
                    className="w-24 bg-transparent text-xs font-semibold text-indigo-700 dark:text-indigo-400 border-0 p-0 focus:ring-0"
                  />
                </td>
                <td className="px-4 py-3 align-top border-r border-gray-100 dark:border-gray-700/50">
                  <select 
                    value={fact.confidence || 'Medium'}
                    onChange={(e) => handleUpdateFact(idx, 'confidence', e.target.value)}
                    className={`bg-transparent text-[10px] font-bold border-0 p-0 focus:ring-0 uppercase tracking-wide cursor-pointer ${fact.confidence === 'High' ? 'text-emerald-600 dark:text-emerald-400' :
                      fact.confidence === 'Medium' ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-600 dark:text-red-400'
                    }`}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </td>
                <td className="px-4 py-3 align-top border-r border-gray-100 dark:border-gray-700/50">
                  <textarea
                    value={fact.label || ''}
                    onChange={(e) => handleUpdateFact(idx, 'label', e.target.value)}
                    className="w-full text-sm font-bold text-gray-900 dark:text-white bg-transparent border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-indigo-500 rounded p-1 resize-y min-h-[40px] transition-colors"
                    placeholder="Label"
                  />
                </td>
                <td className="px-4 py-3 align-top border-r border-gray-100 dark:border-gray-700/50">
                  <textarea
                    value={fact.value || ''}
                    onChange={(e) => handleUpdateFact(idx, 'value', e.target.value)}
                    className="w-full text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-transparent border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-indigo-500 rounded p-1 resize-y min-h-[40px] transition-colors"
                    placeholder="Value"
                  />
                </td>
                <td className="px-4 py-3 align-top">
                  <textarea
                    value={fact.note || ''}
                    onChange={(e) => handleUpdateFact(idx, 'note', e.target.value)}
                    className="w-full text-xs text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/10 border-2 border-transparent hover:border-amber-200 dark:hover:border-amber-900 focus:border-amber-400 rounded p-2 resize-y min-h-[40px] transition-colors"
                    placeholder="Condition / Note"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

