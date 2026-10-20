import React, { useState, useEffect } from 'react';
import { Bot, X, Maximize2, Loader2 } from 'lucide-react';

export interface ProcessingState {
  active: boolean;
  title: string;
  subtitle: string;
  estimatedSeconds: number;
}

interface ProcessingLoaderSystemProps {
  state: ProcessingState;
  onCancel?: () => void;
}

export function ProcessingLoaderSystem({ state, onCancel }: ProcessingLoaderSystemProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!state.active) {
      setElapsedMs(0);
      setIsMinimized(false);
      return;
    }
    const interval = setInterval(() => {
      setElapsedMs(prev => prev + 100);
    }, 100);
    return () => clearInterval(interval);
  }, [state.active]);

  if (!state.active) return null;

  const totalMs = Math.max(1000, state.estimatedSeconds * 1000);
  const progressPercent = Math.min(95, Math.round((elapsedMs / totalMs) * 100));
  const remainingSeconds = Math.max(0, Math.ceil((totalMs - elapsedMs) / 1000));

  return (
    <>
      {/* Full Screen / Centered Modal */}
      {!isMinimized && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-[var(--surface-elevated,#1c1f26)] border border-[var(--border,#2e3440)] rounded-2xl p-7 shadow-2xl flex flex-col items-center text-center overflow-hidden">
            
            {/* Top Right Minimize (X) Close Button */}
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="absolute top-4 right-4 p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer z-10"
              title="Minimize to background"
              aria-label="Minimize processing loader"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Glow backdrop pulse */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-[var(--accent,#FACC15)] opacity-20 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-[var(--accent,#FACC15)] opacity-15 blur-3xl rounded-full pointer-events-none" />

            {/* Animated Ring Loader */}
            <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-[var(--border)] opacity-30" />
              <div className="absolute inset-0 rounded-full border-4 border-[var(--accent,#FACC15)] border-t-transparent animate-spin" />
              <Bot className="w-7 h-7 text-[var(--accent,#FACC15)] animate-pulse" />
            </div>

            {/* Title & Subtitle */}
            <h3 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] mb-1.5 font-[Satoshi]">
              {state.title}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-6 max-w-xs leading-relaxed">
              {state.subtitle}
            </p>

            {/* Smooth Progress Bar */}
            <div className="w-full bg-[var(--surface-soft)] h-2.5 rounded-full overflow-hidden mb-3.5 border border-[var(--border)]">
              <div 
                className="h-full bg-gradient-to-r from-[var(--accent,#FACC15)] to-purple-500 transition-all duration-150 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* ETA Counter Badge & Minimize hint */}
            <div className="flex items-center justify-between w-full text-xs font-mono text-[var(--text-muted)] px-1">
              <span>{progressPercent}% Complete</span>
              <span>
                {remainingSeconds > 0 ? `Est. ~${remainingSeconds}s remaining` : 'Finishing up...'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="mt-4 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              Click X or here to minimize & continue editing
            </button>
          </div>
        </div>
      )}

      {/* Minimized Inline Background Processing Banner */}
      {isMinimized && (
        <div className="w-full mb-4 p-4 rounded-xl bg-[var(--surface-soft)] border border-[var(--accent)]/30 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--accent-solid)]/10 text-[var(--accent,#FACC15)] shrink-0">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2 font-[Satoshi]">
                {state.title}
                <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-[var(--accent-solid)]/15 text-[var(--accent,#FACC15)]">
                  Background Task
                </span>
              </span>
              <span className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                {progressPercent}% Complete · {remainingSeconds > 0 ? `Est. ~${remainingSeconds}s remaining` : 'Finishing up...'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            {/* Mini Progress bar */}
            <div className="w-24 bg-[var(--surface)] h-2 rounded-full overflow-hidden border border-[var(--border)] hidden md:block">
              <div 
                className="h-full bg-[var(--accent,#FACC15)] transition-all duration-150"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--border)] text-[var(--text-primary)] rounded-lg text-[12px] font-medium transition-colors border border-[var(--border)] cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Expand Details</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
