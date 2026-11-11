import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, Monitor, Sun, Moon } from 'lucide-react';
import { useYulloAppStore } from '../store/useYulloAppStore';
import { useQuery } from '@tanstack/react-query';
import { formsApi } from '../api/forms';

export function YulloAppHeader({ spaceId }: { spaceId?: string }) {
  const { appTheme, setTheme, appAccent, setAccent, user } = useYulloAppStore();
  
  const { data: identity } = useQuery({
    queryKey: ['identity', spaceId],
    queryFn: () => spaceId ? formsApi.getIdentity(spaceId) : Promise.resolve(null),
    enabled: !!spaceId,
  });

  return (
    <header className="relative z-[60] hidden md:flex items-center justify-between h-[72px] px-8 bg-[var(--canvas)] border-b border-[var(--border)]">
      <div className="flex items-center gap-6">
        <div className="text-[20px] font-black tracking-tight text-[var(--text-primary)]">
          YULLO
        </div>
        <div className="h-4 w-px bg-[var(--border)]" />
        <div className="flex items-center gap-2 text-[14px] font-[Instrument_Sans] font-medium">
          <a href="/yullo/home" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            Home
          </a>
          {spaceId && identity?.display_name && (
            <>
              <span className="text-[var(--text-muted)]">/</span>
              <a href={`/yullo/spaces/${spaceId}`} className="text-[var(--text-primary)]">
                {identity.display_name}
              </a>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <ThemeMenu />
        <div className="h-4 w-px bg-[var(--border)]" />
        
        <div className="w-8 h-8 rounded-full bg-[var(--surface-soft)] flex items-center justify-center text-[13px] font-semibold text-[var(--text-primary)] border border-[var(--border)]">
          {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
        </div>
      </div>
    </header>
  );
}

function ThemeMenu() {
  const { appTheme, setTheme, appAccent, setAccent } = useYulloAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themes = [
    { id: 'system', label: 'System', icon: Monitor },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'warm', label: 'Warm', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'dark-warm', label: 'Dark Warm', icon: Moon }
  ] as const;

  const accents = [
    { id: 'yullo', color: '#FACC15' },
    { id: 'cyan', color: '#06B6D4' },
    { id: 'blue', color: '#3B82F6' },
    { id: 'violet', color: '#8B5CF6' },
    { id: 'coral', color: '#F43F5E' },
    { id: 'forest', color: '#10B981' },
    { id: 'graphite', color: '#334155' },
    { id: 'plum', color: '#D946EF' }
  ] as const;

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-[Instrument_Sans] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors"
      >
        <Palette className="w-4 h-4" />
        Interface theme
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-64 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl p-4 flex flex-col gap-6 z-50">
          
          {/* Theme Section */}
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold tracking-wider uppercase text-[var(--text-muted)] font-[Instrument_Sans]">
              Theme
            </span>
            <div className="grid grid-cols-2 gap-2">
              {themes.map(t => {
                const Icon = t.icon;
                const active = appTheme === t.id;
                return (
                  <button 
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium font-[Instrument_Sans] transition-colors border ${active ? 'bg-[var(--surface-soft)] border-[var(--border)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]'}`}
                  >
                    <Icon className="w-3.5 h-3.5 opacity-70" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-[var(--border)]" />

          {/* Accent Section */}
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold tracking-wider uppercase text-[var(--text-muted)] font-[Instrument_Sans]">
              Accent Color
            </span>
            <div className="flex flex-wrap gap-2">
              {accents.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  className="relative w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{ backgroundColor: a.color }}
                  title={a.id}
                >
                  {appAccent === a.id && (
                    <Check className="w-4 h-4 text-[var(--accent-on-solid)] drop-shadow-md" />
                  )}
                </button>
              ))}
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}
