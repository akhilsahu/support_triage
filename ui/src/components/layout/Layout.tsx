import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface LayoutProps { children: React.ReactNode; title: string; subtitle?: string }

export function Layout({ children, title, subtitle }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={title} subtitle={subtitle} />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
