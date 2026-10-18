import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formsApi } from '../../api/forms';
import { yulloOnboardingApi } from '../../api/onboarding';
import { useAppStore } from '../../../store/useAppStore';
import { motion, useReducedMotion } from 'motion/react';
import { FormActions } from '../../forms/core/FormActions';
import { IdentityForm, identitySchema, IdentityFormValues } from '../../forms/identity/IdentityForm';
import { X, Trash2, ArrowRight, Loader2 } from 'lucide-react';

export function IdentityFormScreen() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = useAppStore();
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showHandleModal, setShowHandleModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const { data: sources = [] } = useQuery({
    queryKey: ['sources', spaceId],
    queryFn: () => yulloOnboardingApi.getSpaceSources(spaceId!),
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
      }, 300);
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

  const handleAddLink = async (url: string) => {
    if (!spaceId) return;
    await yulloOnboardingApi.addSourceUrl(url, 'url', spaceId);
    queryClient.invalidateQueries({ queryKey: ['sources', spaceId] });
  };

  const handleAddText = async (text: string) => {
    if (!spaceId) return;
    await yulloOnboardingApi.addSourceText(text, spaceId);
    queryClient.invalidateQueries({ queryKey: ['sources', spaceId] });
  };

  const handleUploadFile = async (file: File) => {
    if (!spaceId) return;
    await yulloOnboardingApi.addSourceFile(file, spaceId);
    queryClient.invalidateQueries({ queryKey: ['sources', spaceId] });
  };

  const handleRemoveSource = async (sourceId: string) => {
    if (!spaceId) return;
    await yulloOnboardingApi.deleteSource(sourceId);
    queryClient.invalidateQueries({ queryKey: ['sources', spaceId] });
  };

  const handleToggleConfirmSource = async (sourceId: string, nextState: boolean) => {
    if (!spaceId) return;
    await yulloOnboardingApi.updateSource(sourceId, { is_confirmed: nextState });
    queryClient.invalidateQueries({ queryKey: ['sources', spaceId] });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm w-full">
          <Loader2 className="w-10 h-10 text-[var(--accent-ink)] animate-spin" />
          <div className="flex flex-col gap-1">
            <h3 className="font-[Satoshi] font-semibold text-[18px] text-[var(--text-primary)]">Loading space details...</h3>
            <p className="text-[13px] text-[var(--text-secondary)]">Fetching identity and knowledge sources</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) return <div className="p-8 text-red-500 font-medium">Error loading identity. Please refresh and try again.</div>;
  if (!identity) return null;

  const onSubmit = (data: IdentityFormValues) => {
    setSaveStatus('saving');
    updateMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end max-[899px]:top-0 max-[899px]:h-full min-[900px]:top-[72px] min-[900px]:h-[calc(100dvh-72px)]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[var(--canvas)] opacity-40 transition-opacity cursor-pointer duration-300"
        onClick={() => navigate(`/yullo/spaces/${spaceId}`)}
      />
      
      {/* Sheet */}
      <motion.div 
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={transition}
        className="relative z-10 w-full h-full max-[899px]:w-full max-[899px]:h-full max-[899px]:rounded-none min-[900px]:w-[min(1080px,85vw)] bg-[var(--surface)] shadow-2xl flex flex-col min-[900px]:rounded-l-2xl overflow-hidden"
        style={{ color: 'var(--text-primary)' }}
      >
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-5 min-[900px]:px-8 py-6 flex-1 flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-[32px] font-[Satoshi] font-semibold tracking-tight text-[var(--text-primary)] leading-none">Edit space</h1>
              <button 
                onClick={() => navigate(`/yullo/spaces/${spaceId}`)}
                className="p-2 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <IdentityForm
              form={form}
              spaceId={spaceId}
              slug={identity.slug}
              onChangeHandle={() => {
                setNewHandle(identity.slug);
                setShowHandleModal(true);
              }}
              onSubmit={onSubmit}
              isSubmitting={saveStatus === 'saving' || saveStatus === 'saved'}
              sources={sources}
              onAddLink={handleAddLink}
              onAddText={handleAddText}
              onUploadFile={handleUploadFile}
              onRemoveSource={handleRemoveSource}
              onToggleConfirm={handleToggleConfirmSource}
            />

          </div>
          <FormActions 
            form="identity-form"
            className="px-5 min-[900px]:px-8"
            onCancel={() => navigate(`/yullo/spaces/${spaceId}`)}
            onDelete={() => setShowDeleteModal(true)}
            isSubmitting={saveStatus === 'saving' || saveStatus === 'saved' || isDeleting}
            submitLabel={saveStatus === 'saved' ? 'Saved' : (saveStatus === 'saving' ? 'Saving...' : 'Save changes')}
          />
        </div>
      </motion.div>

      {/* Handle Change Modal */}
      {showHandleModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <h3 className="text-[18px] font-[Satoshi] font-semibold text-[var(--text-primary)]">Change Yullo address</h3>
            <p className="text-[13px] text-[var(--text-secondary)]">
              Changing your handle updates your space URL.
            </p>
            <div className="flex items-center bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl px-3 py-2">
              <span className="text-[14px] font-mono text-[var(--text-muted)]">yullo.com/</span>
              <input
                type="text"
                value={newHandle}
                onChange={(e) => handleHandleChange(e.target.value)}
                className="bg-transparent font-mono text-[14px] text-[var(--text-primary)] outline-none flex-1 ml-1"
                placeholder="new-handle"
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
                  <span className="text-emerald-500">✓ Address is available</span>
                ) : (
                  <span className="text-red-400">✕ {handleCheck.reason || 'Unavailable'}</span>
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={() => { setShowHandleModal(false); setHandleCheck(null); }}
                className="px-4 py-2 text-[14px] text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleHandleSubmit}
                disabled={isChangingHandle || !handleCheck?.valid}
                className="flex items-center gap-2 px-5 py-2 text-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] rounded-xl font-medium disabled:opacity-50 cursor-pointer"
              >
                {isChangingHandle && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{isChangingHandle ? 'Saving...' : 'Change address'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive or Complete Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] p-6 rounded-2xl shadow-2xl text-[var(--text-primary)] font-[Instrument_Sans]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-[var(--surface-soft)] rounded-xl text-[#ef4444]">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-[Satoshi] text-[20px] font-semibold text-[var(--text-primary)]">
                Remove "{identity.display_name}"?
              </h3>
            </div>

            <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-6">
              Choose whether to archive this Space (hides it from your Home dashboard while preserving data) or delete it completely.
            </p>

            <div className="flex flex-col gap-3">
              <button
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await formsApi.archiveOrDelete(spaceId!, 'archive');
                    queryClient.invalidateQueries({ queryKey: ['yullo-home'] });
                    navigate('/yullo/home');
                  } catch (err) {
                    console.error('Failed to archive space:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="w-full py-3 px-4 bg-[var(--surface-soft)] hover:bg-[var(--border)] text-[var(--text-primary)] font-medium text-[15px] rounded-xl transition-colors text-left flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-[15px] text-[var(--text-primary)]">Archive Space</div>
                  <div className="text-[13px] text-[var(--text-secondary)] font-normal">Disappears from your Home dashboard</div>
                </div>
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" /> : <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />}
              </button>

              <button
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await formsApi.archiveOrDelete(spaceId!, 'delete');
                    queryClient.invalidateQueries({ queryKey: ['yullo-home'] });
                    navigate('/yullo/home');
                  } catch (err) {
                    console.error('Failed to delete space:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="w-full py-3 px-4 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] font-medium text-[15px] rounded-xl transition-colors text-left flex items-center justify-between border border-[#ef4444]/20 cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-[15px]">Delete Completely</div>
                  <div className="text-[13px] opacity-80 font-normal">Permanently removes all space data</div>
                </div>
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin opacity-80" /> : <Trash2 className="w-4 h-4 opacity-80" />}
              </button>

              <button
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="w-full py-2.5 px-4 text-[14px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-1 text-center cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
