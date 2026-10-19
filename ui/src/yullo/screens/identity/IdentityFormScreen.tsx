import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formsApi } from '../../api/forms';
import { yulloOnboardingApi } from '../../api/onboarding';
import { useAppStore } from '../../../store/useAppStore';
import { motion, useReducedMotion } from 'motion/react';
import { FormActions } from '../../forms/core/FormActions';
import { IdentityForm, identitySchema, IdentityFormValues } from '../../forms/identity/IdentityForm';
import { X, Trash2, ArrowRight, Loader2, Check, AlertTriangle } from 'lucide-react';

export function IdentityFormScreen() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = useAppStore();
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showHandleModal, setShowHandleModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newHandle, setNewHandle] = useState('');
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleCheck, setHandleCheck] = useState<{ valid: boolean; reason?: string } | null>(null);
  const [isChangingHandle, setIsChangingHandle] = useState(false);
  
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  
  const { data: identity, isLoading, error } = useQuery({
    queryKey: ['identity', spaceId],
    queryFn: () => formsApi.getIdentity(spaceId!),
    enabled: !!spaceId,
  });

  const form = useForm<IdentityFormValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      purpose: 'business',
      display_name: '',
      description: '',
      category: '',
      presence: undefined,
      website: '',
      logo_url: '',
    }
  });

  useEffect(() => {
    if (identity) {
      form.reset({
        purpose: identity.purpose,
        display_name: identity.display_name,
        description: identity.description || '',
        description_source: identity.description_source || null,
        description_prompt_version: identity.description_prompt_version || null,
        description_input_fingerprint: identity.description_input_fingerprint || null,
        category: identity.category || '',
        presence: identity.presence || undefined,
        website: identity.website || '',
        logo_url: identity.logo_url || '',
        expected_revision: identity.revision,
      });
    }
  }, [identity, form]);

  const updateMutation = useMutation({
    mutationFn: (values: IdentityFormValues) => {
      const payload = {
        ...values,
        presence: values.presence === '' ? undefined : (values.presence as any),
        expected_revision: identity!.revision,
      };
      return formsApi.updateIdentity(spaceId!, payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['identity', spaceId], data);
      setSaveStatus('saved');
      setTimeout(() => {
        navigate(`/yullo/spaces/${spaceId}`);
      }, 350);
    },
    onError: (err: any) => {
      setSaveStatus('idle');
      const status = err.response?.status;
      if (status === 409) {
        alert('Identity was updated by another session. Please refresh the page to get the latest revision.');
      } else {
        alert(`Error updating identity: ${err.response?.data?.detail || err.message}`);
      }
    }
  });

  const handleHandleChange = (val: string) => {
    const h = val.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setNewHandle(h);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (!h.trim() || !spaceId) {
      setHandleCheck(null);
      setIsCheckingHandle(false);
      return;
    }
    setIsCheckingHandle(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await formsApi.checkHandle(spaceId, h.trim());
        setHandleCheck(res);
      } catch {
        setHandleCheck({ valid: false, reason: 'Failed to check handle' });
      } finally {
        setIsCheckingHandle(false);
      }
    }, 350);
  };

  const handleHandleSubmit = async () => {
    if (!newHandle.trim() || !identity || !spaceId) return;
    setIsChangingHandle(true);
    try {
      const updated = await formsApi.changeHandle(spaceId, newHandle.trim(), identity.revision);
      queryClient.setQueryData(['identity', spaceId], updated);
      setShowHandleModal(false);
      setNewHandle('');
      setHandleCheck(null);
    } catch (err: any) {
      if (err.response?.status === 409) {
        alert('Handle or identity revision changed. Please refresh and try again.');
      } else {
        alert(`Error changing handle: ${err.response?.data?.detail || err.message}`);
      }
    } finally {
      setIsChangingHandle(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm w-full font-[Instrument_Sans]">
          <Loader2 className="w-10 h-10 text-[var(--accent-ink)] animate-spin" />
          <div className="flex flex-col gap-1">
            <h3 className="font-[Satoshi] font-semibold text-[18px] text-[var(--text-primary)]">Loading space details...</h3>
            <p className="text-[13px] text-[var(--text-secondary)]">Fetching identity and profile metadata</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-[var(--surface)] border border-rose-500/20 rounded-2xl p-6 shadow-2xl text-center max-w-md w-full">
          <p className="text-rose-500 font-medium mb-4">Error loading space identity. Please refresh and try again.</p>
          <button 
            onClick={() => navigate(`/yullo/spaces/${spaceId}`)}
            className="px-4 py-2 bg-[var(--surface-soft)] text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-[var(--border)] transition-colors cursor-pointer"
          >
            Back to Space
          </button>
        </div>
      </div>
    );
  }

  if (!identity) return null;

  const onSubmit = (data: IdentityFormValues) => {
    setSaveStatus('saving');
    updateMutation.mutate(data);
  };

  const handleArchiveOrDelete = async (action: 'archive' | 'delete') => {
    if (!spaceId) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await formsApi.archiveOrDelete(spaceId, action);
      queryClient.invalidateQueries({ queryKey: ['yullo-home'] });
      queryClient.removeQueries({ queryKey: ['identity', spaceId] });
      queryClient.removeQueries({ queryKey: ['yullo-entities', spaceId] });
      setShowDeleteModal(false);
      navigate('/yullo/home');
    } catch (err: any) {
      console.error(`Failed to ${action} space:`, err);
      const detail = err.response?.data?.detail || err.message || `Failed to ${action} space. Please try again.`;
      setDeleteError(detail);
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex justify-end max-[899px]:top-0 max-[899px]:h-full min-[900px]:top-[72px] min-[900px]:h-[calc(100dvh-72px)] font-[Instrument_Sans]">
      
      {/* Dark Frosted Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer duration-300"
        onClick={() => navigate(`/yullo/spaces/${spaceId}`)}
      />
      
      {/* Slide-in Sheet Drawer */}
      <motion.div 
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={transition}
        className="yullo-app relative z-10 w-full h-full max-[899px]:w-full max-[899px]:rounded-none min-[900px]:w-[min(1160px,94vw)] bg-[var(--canvas)] shadow-2xl flex flex-col min-[900px]:rounded-l-2xl overflow-hidden border-l border-[var(--border)]"
        style={{ color: 'var(--text-primary)' }}
      >
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-5 sm:px-8 lg:px-10 py-7 flex-1 flex flex-col">
            
            {/* Editorial Drawer Header */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-[var(--border)]">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  Space Configuration
                </div>
                <h1 className="text-[28px] sm:text-[32px] font-[Satoshi] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                  Edit space
                </h1>
                <p className="text-[14px] text-[var(--text-secondary)] mt-1">
                  Shape your public space profile, visual branding, and online presence.
                </p>
              </div>

              <button 
                onClick={() => navigate(`/yullo/spaces/${spaceId}`)}
                className="p-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] border border-transparent hover:border-[var(--border)] transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 2-Column Form with Live Preview */}
            <IdentityForm
              form={form}
              spaceId={spaceId}
              slug={identity.slug}
              isLive={identity.status === 'live'}
              onChangeHandle={() => {
                setNewHandle(identity.slug);
                setShowHandleModal(true);
              }}
              onSubmit={onSubmit}
              isSubmitting={saveStatus === 'saving' || saveStatus === 'saved'}
            />

          </div>

          {/* Sticky Bottom Actions */}
          <FormActions 
            form="identity-form"
            className="px-5 sm:px-8 lg:px-10 py-4 shadow-lg bg-[var(--surface)]"
            onCancel={() => navigate(`/yullo/spaces/${spaceId}`)}
            onDelete={() => setShowDeleteModal(true)}
            isSubmitting={saveStatus === 'saving' || saveStatus === 'saved' || isDeleting}
            submitLabel={saveStatus === 'saved' ? 'Saved' : (saveStatus === 'saving' ? 'Saving...' : 'Save changes')}
          />
        </div>
      </motion.div>

      {/* Handle Change Modal */}
      {showHandleModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl flex flex-col gap-4 font-[Instrument_Sans] animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-[19px] font-[Satoshi] font-semibold text-[var(--text-primary)]">
              Change Yullo Address
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Changing your handle updates the public URL visitors use to access this Space. Old links may stop working.
            </p>
            
            <div className="flex items-center bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 focus-within:border-[var(--accent)] transition-colors">
              <span className="text-[14px] font-mono text-[var(--text-muted)] select-none">yullo.com/</span>
              <input
                type="text"
                value={newHandle}
                onChange={(e) => handleHandleChange(e.target.value)}
                className="bg-transparent font-mono text-[14px] font-semibold text-[var(--text-primary)] outline-none flex-1 ml-1"
                placeholder="new-handle"
                autoFocus
              />
            </div>

            {isCheckingHandle && (
              <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-ink)]" />
                <span>Checking address availability...</span>
              </div>
            )}
            
            {!isCheckingHandle && handleCheck && (
              <div className="text-[13px] font-medium">
                {handleCheck.valid ? (
                  <span className="text-emerald-500 flex items-center gap-1.5">
                    <Check className="w-4 h-4 stroke-[2.5]" /> Address is available
                  </span>
                ) : (
                  <span className="text-rose-500 flex items-center gap-1.5">
                    ✕ {handleCheck.reason || 'Address is unavailable'}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
              <button 
                type="button"
                onClick={() => { setShowHandleModal(false); setHandleCheck(null); }}
                className="px-4 py-2 text-[14px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleHandleSubmit}
                disabled={isChangingHandle || !handleCheck?.valid}
                className="flex items-center gap-2 px-5 py-2.5 text-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
              >
                {isChangingHandle && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isChangingHandle ? 'Updating...' : 'Change address'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive or Delete Space Modal */}
      <Dialog.Root
        open={showDeleteModal}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setShowDeleteModal(false);
            setDeleteError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-xs transition-opacity" />
          <Dialog.Content asChild onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 outline-none">
              <div 
                className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-7 rounded-2xl shadow-2xl text-[var(--text-primary)] font-[Instrument_Sans] animate-in fade-in zoom-in-95 duration-200"
              >
                <div className="flex items-center gap-3.5 mb-3.5">
                  <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <Dialog.Title className="font-[Satoshi] text-[20px] font-semibold text-[var(--text-primary)]">
                    Remove "{identity.display_name}"?
                  </Dialog.Title>
                </div>

                <Dialog.Description className="text-[14px] text-[var(--text-secondary)] leading-relaxed mb-5">
                  Choose whether to archive this Space (hides it from your Home dashboard while preserving knowledge & data) or delete it permanently.
                </Dialog.Description>

                {deleteError && (
                  <div role="alert" className="p-3 mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[13px] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{deleteError}</span>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleArchiveOrDelete('archive')}
                    className="w-full py-3.5 px-4 bg-[var(--surface-soft)] hover:bg-[var(--border)] text-[var(--text-primary)] font-medium text-[14px] rounded-xl transition-colors text-left flex items-center justify-between group cursor-pointer border border-[var(--border)] disabled:opacity-50"
                  >
                    <div>
                      <div className="font-semibold text-[14px]">Archive Space</div>
                      <div className="text-[12px] text-[var(--text-secondary)] font-normal">Hides from home dashboard while saving all data</div>
                    </div>
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" /> : <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />}
                  </button>

                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => handleArchiveOrDelete('delete')}
                    className="w-full py-3.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-medium text-[14px] rounded-xl transition-colors text-left flex items-center justify-between border border-rose-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <div>
                      <div className="font-semibold text-[14px]">Delete Completely</div>
                      <div className="text-[12px] opacity-80 font-normal">Permanently removes space and all connected knowledge</div>
                    </div>
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin opacity-80" /> : <Trash2 className="w-4 h-4 opacity-80" />}
                  </button>

                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteError(null);
                    }}
                    className="w-full py-2.5 px-4 text-[14px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-1 text-center cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
