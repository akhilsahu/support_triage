import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Trash2, X } from 'lucide-react';

import {
  KnowledgeCleanupAlert,
  yulloOnboardingApi,
} from '../api/onboarding';

interface KnowledgeCleanupReviewDialogProps {
  isOpen: boolean;
  spaceId: string;
  alerts: KnowledgeCleanupAlert[];
  onClose: () => void;
  onResolved: () => void | Promise<void>;
}

export function KnowledgeCleanupReviewDialog({
  isOpen,
  spaceId,
  alerts,
  onClose,
  onResolved,
}: KnowledgeCleanupReviewDialogProps) {
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set());
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAlert = useMemo(
    () => alerts.find(alert => alert.id === activeAlertId) || alerts[0] || null,
    [activeAlertId, alerts],
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveAlertId(alerts[0]?.id || null);
  }, [isOpen, alerts]);

  useEffect(() => {
    setSelectedFactIds(new Set(activeAlert?.facts.map(fact => fact.id) || []));
    setSelectedEntityIds(new Set(activeAlert?.entities.map(entity => entity.id) || []));
    setAcknowledged(false);
    setError(null);
  }, [activeAlert?.id, activeAlert?.revision]);

  if (!isOpen) return null;

  const resolve = async (action: 'delete' | 'keep') => {
    if (!activeAlert) return;
    if (action === 'keep' && !acknowledged) {
      setError('Confirm that you understand these facts may be outdated.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await yulloOnboardingApi.resolveKnowledgeCleanupAlert(spaceId, activeAlert.id, {
        action,
        fact_ids: Array.from(selectedFactIds),
        entity_ids: Array.from(selectedEntityIds),
        expected_revision: activeAlert.revision,
        acknowledge_unverified: action === 'keep' ? acknowledged : false,
      });
      await onResolved();
    } catch (reason: any) {
      setError(reason?.response?.data?.detail || reason?.message || 'Could not update retained knowledge.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close knowledge review" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-cleanup-title"
        className="relative z-10 flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5 sm:p-6">
          <div>
            <h2 id="knowledge-cleanup-title" className="font-[Satoshi] text-[20px] font-semibold text-[var(--text-primary)]">
              Review knowledge without a source
            </h2>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {alerts.length} deleted {alerts.length === 1 ? 'source needs' : 'sources need'} your decision.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 sm:grid-cols-[210px_1fr]">
          <nav className="border-b border-[var(--border)] bg-[var(--surface-soft)] p-3 sm:border-b-0 sm:border-r" aria-label="Deleted sources">
            {alerts.map(alert => (
              <button
                key={alert.id}
                type="button"
                onClick={() => setActiveAlertId(alert.id)}
                className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${activeAlert?.id === alert.id ? 'bg-[var(--surface)] font-semibold text-[var(--text-primary)] shadow-xs' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]'}`}
              >
                <span className="block truncate">{alert.source_title}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-[var(--text-muted)]">
                  {alert.facts.length} facts · {alert.entities.length} details
                </span>
              </button>
            ))}
          </nav>

          <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
            {activeAlert ? (
              <>
                <div className="mb-4 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    The source was deleted. This knowledge may be inaccurate or outdated because Aura can no longer verify it. Deleting it is recommended unless you will maintain it manually.
                  </p>
                </div>

                <div className="space-y-2">
                  {activeAlert.facts.map(fact => {
                    const selected = selectedFactIds.has(fact.id);
                    return (
                      <label key={fact.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3 hover:bg-[var(--surface-soft)]">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setSelectedFactIds(previous => {
                            const next = new Set(previous);
                            if (next.has(fact.id)) next.delete(fact.id); else next.add(fact.id);
                            return next;
                          })}
                          className="mt-0.5 h-4 w-4 accent-[var(--accent-solid)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] text-[var(--text-secondary)]">{fact.subject}</span>
                          <span className="block text-[13px] font-medium text-[var(--text-primary)]">{fact.label}: {fact.value}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {activeAlert.entities.length > 0 && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Structured details</h3>
                    <div className="space-y-2">
                      {activeAlert.entities.map(entity => {
                        const selected = selectedEntityIds.has(entity.id);
                        return (
                          <label key={entity.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3 hover:bg-[var(--surface-soft)]">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => setSelectedEntityIds(previous => {
                                const next = new Set(previous);
                                if (next.has(entity.id)) next.delete(entity.id); else next.add(entity.id);
                                return next;
                              })}
                              className="mt-0.5 h-4 w-4 accent-[var(--accent-solid)]"
                            />
                            <span className="min-w-0">
                              <span className="block text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{entity.entity_type.replace(/_/g, ' ')}</span>
                              <span className="block text-[13px] font-medium text-[var(--text-primary)]">{entity.title}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeAlert.facts.length === 0 && activeAlert.entities.length === 0 && (
                  <p className="rounded-xl border border-[var(--border)] p-4 text-[13px] text-[var(--text-secondary)]">No retained knowledge remains.</p>
                )}

                {(activeAlert.facts.length > 0 || activeAlert.entities.length > 0) && (
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={event => setAcknowledged(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--accent-solid)]"
                    />
                    <span>I understand these facts or details may be outdated or inaccurate, and I want Aura to continue using the selected knowledge.</span>
                  </label>
                )}

                {error && <p className="mt-3 text-[12px] text-rose-600" role="alert">{error}</p>}
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">No pending knowledge reviews.</p>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] p-4 sm:px-6">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-primary)]">
            Later
          </button>
          <button
            type="button"
            onClick={() => resolve('delete')}
            disabled={isSaving || !activeAlert || (selectedFactIds.size === 0 && selectedEntityIds.size === 0)}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete selected
          </button>
          {activeAlert && (activeAlert.facts.length > 0 || activeAlert.entities.length > 0) && (
            <button
              type="button"
              onClick={() => resolve('keep')}
              disabled={isSaving || (selectedFactIds.size === 0 && selectedEntityIds.size === 0) || !acknowledged}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-solid)] px-4 py-2.5 text-[13px] font-semibold text-[var(--accent-on-solid)] disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Continue using selected
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
