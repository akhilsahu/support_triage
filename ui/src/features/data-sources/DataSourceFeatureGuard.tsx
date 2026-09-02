import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useAppStore } from '../../store/useAppStore'

export function DataSourceFeatureGuard({ children }: { children: ReactNode }) {
  const dataSourcesEnabled = useAppStore(state => state.dataSourcesEnabled)

  if (dataSourcesEnabled === null) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400" role="status">
        Loading Data Sources…
      </div>
    )
  }

  if (!dataSourcesEnabled) {
    return (
      <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Data Sources unavailable</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Data Sources has been disabled by an administrator.
        </p>
        <Link className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400" to="/app/agents">
          Back to Agents
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
