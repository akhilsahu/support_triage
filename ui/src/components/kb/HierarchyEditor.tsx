import React, { useState } from 'react'
import { MoreVertical, Network, CornerDownRight, Save, ShieldCheck, Loader2 } from 'lucide-react'
import { apiClient } from '../../api/client'

export function HierarchyEditor({ 
  facts, 
  hierarchyTree,
  onFeedbackSubmitted,
  onGraphify,
  isGraphifying
}: { 
  facts: any[], 
  hierarchyTree?: any,
  onFeedbackSubmitted?: () => void,
  onGraphify?: () => void,
  isGraphifying?: boolean
}) {
  console.log("HierarchyEditor props:", { hierarchyTree, factsLength: facts.length });
  const [editedTree, setEditedTree] = useState<any>(
    hierarchyTree ? JSON.parse(JSON.stringify(hierarchyTree)) : { nodes: [] }
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  React.useEffect(() => {
    if (hierarchyTree) {
      setEditedTree(JSON.parse(JSON.stringify(hierarchyTree)))
    }
  }, [hierarchyTree])

  // Get raw subjects
  const originalSubjects = Array.from(new Set(facts.map(f => f.subject).filter(Boolean))) as string[]

  const handlePromoteToCanonical = (nodeIndex: number, alias: string) => {
    const newTree = { ...editedTree }
    // Remove alias from current parent
    newTree.nodes[nodeIndex].aliases = newTree.nodes[nodeIndex].aliases.filter((a: string) => a !== alias)
    // Create new canonical node
    newTree.nodes.push({
      product_name: alias,
      parent_product: null,
      aliases: []
    })
    setEditedTree(newTree)
  }

  const handleMakeChild = (nodeIndex: number, alias: string) => {
    const newTree = { ...editedTree }
    const parentName = newTree.nodes[nodeIndex].product_name
    
    // Remove alias from current parent
    newTree.nodes[nodeIndex].aliases = newTree.nodes[nodeIndex].aliases.filter((a: string) => a !== alias)
    // Create new child node
    newTree.nodes.push({
      product_name: alias,
      parent_product: parentName,
      aliases: []
    })
    setEditedTree(newTree)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await apiClient.submitTrainingFeedback(originalSubjects, editedTree)
      setIsSuccess(true)
      if (onFeedbackSubmitted) onFeedbackSubmitted()
      setTimeout(() => setIsSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      alert("Failed to submit training feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!editedTree.nodes || editedTree.nodes.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center h-full">
        <Network className="w-12 h-12 text-gray-300 mb-4" />
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">No Hierarchy Available</p>
        <p className="text-sm mt-1 mb-6 max-w-md">The product hierarchy graph has not been generated yet. Click the button below to analyze your extracted facts and cluster them into a graph.</p>
        
        {onGraphify && (
          <button
            onClick={onGraphify}
            disabled={isGraphifying}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isGraphifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Graph...
              </>
            ) : (
              <>
                <Network className="w-4 h-4" />
                Graphify
              </>
            )}
          </button>
        )}
        
        {/* DEBUG INFO */}
        <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-left text-xs font-mono w-full max-w-2xl overflow-auto text-gray-500">
          <p className="font-bold mb-2">Debug Info:</p>
          <p>hierarchyTree prop received: {hierarchyTree ? 'YES' : 'NO'}</p>
          <p className="mt-2">editedTree state:</p>
          <pre>{JSON.stringify(editedTree, null, 2)}</pre>
          <p className="mt-2">raw hierarchyTree prop:</p>
          <pre>{JSON.stringify(hierarchyTree, null, 2)}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col md:flex-row border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
      
      {/* Left Pane: Original Subjects */}
      <div className="w-full md:w-1/3 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/50 dark:bg-gray-900/50">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Source Extraction</h3>
          <p className="text-xs text-gray-500 mt-0.5">Raw subjects found in document</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-1">
            {originalSubjects.map((sub, i) => (
              <li key={i} className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-md shadow-sm">
                {sub}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right Pane: Interactive Tree */}
      <div className="flex-1 flex flex-col relative">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0 flex justify-between items-center bg-white dark:bg-gray-950">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">
              <Network className="w-4 h-4 text-indigo-500" /> AI Generated Hierarchy
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Correct any clustering mistakes to train the model</p>
          </div>
          <div className="flex items-center gap-2">
            {onGraphify && (
              <button
                onClick={onGraphify}
                disabled={isGraphifying}
                className="px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                title="Regenerate the hierarchy graph"
              >
                {isGraphifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Network className="w-4 h-4" />
                    Regenerate Graph
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isSuccess}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                isSuccess 
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
              }`}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : isSuccess ? <ShieldCheck className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {isSuccess ? 'Saved to Pipeline' : 'Submit Correction'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {editedTree.nodes.map((node: any, idx: number) => (
            <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Canonical</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{node.product_name}</span>
                </div>
                {node.parent_product && (
                  <span className="text-xs text-gray-500 font-medium">
                    Child of <strong className="text-gray-700 dark:text-gray-300">{node.parent_product}</strong>
                  </span>
                )}
              </div>
              
              {node.aliases && node.aliases.length > 0 ? (
                <div className="p-2 space-y-1">
                  {node.aliases.map((alias: string, aIdx: number) => (
                    <div key={aIdx} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md group transition-colors">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <CornerDownRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                        <span className="italic">{alias}</span>
                      </div>
                      
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button 
                          onClick={() => handleMakeChild(idx, alias)}
                          className="text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 bg-amber-50 hover:bg-amber-100 rounded"
                        >
                          Make Child Variant
                        </button>
                        <button 
                          onClick={() => handlePromoteToCanonical(idx, alias)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded"
                        >
                          Promote
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-3 text-sm text-gray-400 italic">No aliases clustered.</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
