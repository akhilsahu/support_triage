import React, { ReactNode, useState } from 'react';
import { useYulloAppStore } from '../../store/useYulloAppStore';
import { yulloApiClient } from '../../api/client';
import { useNavigate } from 'react-router-dom';

export const YulloLayout = ({ children }: { children: ReactNode }) => {
  const { user } = useYulloAppStore();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleLogout = async () => {
    try {
      await yulloApiClient.post('/auth/logout');
      useYulloAppStore.getState().clearAuth();
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  const navItems = [
    { name: 'Home', path: '/yullo/home', icon: (
      <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )},
    { name: 'Spaces', path: '#', icon: (
      <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )},
    { name: 'Network', path: '#', icon: (
      <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    )},
    { name: 'Settings', path: '#', icon: (
      <svg className="w-[20px] h-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )}
  ];

  return (
    <div className="min-h-screen bg-[var(--canvas-bg)] flex">
      
      {/* ── Desktop Slim Rail ────────────────────────────────────────────── */}
      <aside 
        className={`hidden md:flex flex-col fixed inset-y-0 left-0 z-40 bg-[var(--canvas-bg)] transition-all duration-300 ease-[var(--easing-spring)] ${isExpanded ? 'w-[240px] shadow-[1px_0_0_var(--border-subtle)]' : 'w-[72px]'}`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className="flex items-center h-[72px] px-5">
          <div className="w-[32px] h-[32px] rounded bg-[var(--accent-solid)] flex shrink-0 items-center justify-center text-[var(--accent-on-solid)] font-medium text-[15px]">
            Y
          </div>
          <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'ml-3 opacity-100 w-auto' : 'ml-0 opacity-0 w-0'}`}>
            <span className="font-semibold font-satoshi text-[var(--text-primary)] tracking-wide">Yullo</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map(item => {
            const isActive = item.name === 'Home';
            return (
              <a 
                key={item.name}
                href={item.path} 
                className={`flex items-center h-[44px] rounded-lg transition-colors overflow-hidden ${isActive ? 'text-[var(--accent-ink)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)]'}`}
              >
                <div className="flex shrink-0 items-center justify-center w-[40px]">
                  {item.icon}
                </div>
                <div className={`whitespace-nowrap transition-all duration-300 ${isExpanded ? 'opacity-100 translate-x-0 ml-1' : 'opacity-0 -translate-x-2 w-0'}`}>
                  <span className="font-medium text-[14px]">{item.name}</span>
                </div>
              </a>
            );
          })}
        </nav>
        
        <div className="p-4 mb-4">
          <button 
            onClick={handleLogout}
            className="flex items-center w-full h-[44px] rounded-lg hover: hover: transition-colors overflow-hidden bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
          >
            <div className="flex shrink-0 items-center justify-center w-[40px]">
              <div className="w-[24px] h-[24px] rounded-full bg-[var(--border-strong)] text-[var(--text-primary)] flex items-center justify-center font-medium text-[11px]">
                {user?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'Y'}
              </div>
            </div>
            <div className={`flex flex-1 items-center justify-between whitespace-nowrap transition-all duration-300 ${isExpanded ? 'opacity-100 translate-x-0 ml-1 w-auto' : 'opacity-0 -translate-x-2 w-0'}`}>
              <span className="font-medium text-[14px]">Sign out</span>
              <svg className="w-[16px] h-[16px] mr-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ──────────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 h-[64px] bg-[var(--canvas-bg)] border-b border-[var(--border-subtle)] z-40 flex items-center justify-between px-4">
        <div className="w-[32px] h-[32px] rounded bg-[var(--accent-solid)] flex items-center justify-center text-[var(--accent-on-solid)] font-medium text-[15px]">
          Y
        </div>
        <button onClick={handleLogout} className="text-[14px] font-medium bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90">
          Sign out
        </button>
      </header>

      {/* ── Main Content Area ───────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 md:pl-[72px] pt-[64px] md:pt-0">
        <div className="h-full overflow-y-auto">
          {children}
        </div>
      </main>

    </div>
  );
};
