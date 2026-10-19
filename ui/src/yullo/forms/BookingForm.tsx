import React, { useRef, useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Calendar, Globe, AlertCircle, Sparkles, ExternalLink } from 'lucide-react';
import { useCreateEntity, useUpdateEntity } from '../api/entityQueries';
import type { SpaceEntity } from '../api/entities';
import { TextField } from './core/TextField';
import { FormActions } from './core/FormActions';

const bookingSchema = z.object({
  label: z.string().trim().min(1, 'Enter a button label.').max(200, 'Use 200 characters or fewer.'),
  url: z.string().trim().refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
    } catch { return false; }
  }, 'Enter a valid HTTPS booking URL without login credentials.'),
  enabled: z.boolean(),
});

type BookingValues = z.infer<typeof bookingSchema>;

export function BookingForm({ spaceId, spaceName, entity, onClose, onSaved }: {
  spaceId: string;
  spaceName: string;
  entity?: SpaceEntity;
  onClose: () => void;
  onSaved: () => void;
}) {
  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    mode: 'onBlur',
    defaultValues: {
      label: entity?.payload_json.label ?? 'Book a call',
      url: entity?.payload_json.destination_url ?? '',
      enabled: entity?.is_public ?? false,
    },
  });

  const { isDirty } = form.formState;
  const currentUrl = useWatch({ control: form.control, name: 'url' });
  const currentLabel = useWatch({ control: form.control, name: 'label' });
  const isEnabled = useWatch({ control: form.control, name: 'enabled' });

  const create = useCreateEntity(spaceId);
  const update = useUpdateEntity(spaceId);
  const isPending = create.isPending || update.isPending;
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const identityKey = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Compute live parsed hostname for preview
  const parsedHost = useMemo(() => {
    try {
      if (!currentUrl) return null;
      const parsed = new URL(currentUrl);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.hostname) {
        return parsed.hostname;
      }
    } catch {
      return null;
    }
    return null;
  }, [currentUrl]);

  const requestClose = () => {
    if (submitting.current) return;
    if (isDirty) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  };

  const save = form.handleSubmit(async values => {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      if (entity) {
        await update.mutateAsync({
          entityId: entity.id,
          patch: {
            expected_revision: entity.revision,
            payload_json: { ...entity.payload_json, label: values.label, destination_url: values.url },
            is_public: values.enabled,
          },
        });
      } else {
        await create.mutateAsync({
          identity_key: identityKey.current,
          entity_type: 'action',
          payload_json: { label: values.label, kind: 'booking', destination_url: values.url },
          is_public: values.enabled,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['yullo-home'] });
      onSaved();
    } catch (failure) {
      const status = (failure as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['yullo-entities', spaceId] });
        setError('This booking link changed elsewhere. Close and reopen it to review the latest version before saving.');
      } else {
        setError('Could not save the booking link. Your details are still here. Try again.');
      }
    } finally {
      submitting.current = false;
    }
  });

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs transition-opacity" />
        <Dialog.Content asChild onOpenAutoFocus={event => { event.preventDefault(); form.setFocus('label'); }}>
          <motion.section
            initial={reducedMotion ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 right-0 z-[61] flex h-[100dvh] w-full max-w-[min(640px,100vw)] flex-col bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans] shadow-2xl border-l border-[var(--border)] min-[720px]:rounded-l-2xl overflow-hidden outline-none"
          >
            {/* Editorial Drawer Header */}
            <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-6 sm:p-8 shrink-0 bg-[var(--surface-soft)]">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-solid)] text-[var(--accent-on-solid)] flex items-center justify-center shrink-0 shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-0.5">
                    Booking Configuration
                  </div>
                  <Dialog.Title className="font-[Satoshi] text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--text-primary)] truncate">
                    {entity ? 'Edit booking option' : 'Add booking option'}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-[13px] text-[var(--text-secondary)]">
                    Give visitors a booking link for {spaceName}.
                  </Dialog.Description>
                </div>
              </div>
              <button
                type="button"
                onClick={requestClose}
                disabled={isPending}
                aria-label="Close booking editor"
                className="p-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--border)] transition-all cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Scrollable Form Body */}
            <form id="booking-form" onSubmit={save} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6" noValidate>
              <fieldset disabled={isPending} className="space-y-6">
                {/* Button Label Field */}
                <div>
                  <TextField
                    label="Button label"
                    aria-label="Button label"
                    registration={form.register('label')}
                    maxLength={200}
                    placeholder="e.g. Book a call, Schedule consultation"
                    error={form.formState.errors.label?.message}
                    aria-invalid={!!form.formState.errors.label}
                  />
                </div>

                {/* Booking URL Field */}
                <div>
                  <TextField
                    label="Booking URL"
                    aria-label="Booking URL"
                    registration={form.register('url')}
                    type="url"
                    inputMode="url"
                    placeholder="https://calendly.com/your-name, https://cal.com/..."
                    error={form.formState.errors.url?.message}
                    aria-invalid={!!form.formState.errors.url}
                    helperText="Enter a valid HTTPS booking URL without login credentials."
                  />
                  {parsedHost && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[var(--surface-soft)] text-[var(--text-secondary)] border border-[var(--border)]">
                      <Globe className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                      <span>Opens destination: <strong className="text-[var(--text-primary)] font-semibold">{parsedHost}</strong></span>
                      <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
                    </div>
                  )}
                </div>

                {/* Visitor Enable Toggle Switch Card */}
                <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="booking-enable-switch"
                          className="font-semibold text-[15px] text-[var(--text-primary)] cursor-pointer select-none"
                        >
                          Enable for visitors
                        </label>
                        {isEnabled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                            Public
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]">
                            Private
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                        Allows your public page and Aura to use this link. Leave off to keep it private.
                      </p>
                    </div>

                    <input
                      id="booking-enable-switch"
                      type="checkbox"
                      role="switch"
                      aria-label="Enable for visitors"
                      {...form.register('enabled')}
                      className="h-6 w-6 rounded-md accent-[var(--accent-solid)] cursor-pointer shrink-0"
                    />
                  </div>
                </div>

                {/* Live Visitor Button Preview Card */}
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col gap-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent-ink)]" />
                    <span>Live Public Visitor Preview</span>
                  </div>
                  <div className="pt-1">
                    <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-[14px] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] shadow-xs">
                      <Calendar className="w-4 h-4" />
                      <span>{currentLabel || 'Book a call'}</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                    </span>
                  </div>
                </div>
              </fieldset>

              {/* Error Message Alert */}
              {error && (
                <div role="alert" className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400 text-sm flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Discard Unsaved Changes Confirmation Card */}
              {confirmClose && (
                <div role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-5 animate-in fade-in duration-150">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[15px] text-[var(--text-primary)]">
                        Discard your unsaved booking link?
                      </p>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-1">
                        Any edits made to this booking link will be lost if you leave now.
                      </p>
                      <div className="mt-3.5 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setConfirmClose(false)}
                          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[var(--surface)] hover:bg-[var(--surface-soft)] text-[var(--text-primary)] border border-[var(--border)] shadow-xs transition-colors cursor-pointer"
                        >
                          Keep editing
                        </button>
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-red-600/15 hover:bg-red-600/25 text-red-700 dark:text-red-300 border border-red-500/30 transition-colors cursor-pointer"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </form>

            {/* Bottom Form Actions */}
            <FormActions
              form="booking-form"
              submitLabel="Save booking link"
              onCancel={requestClose}
              isSubmitting={isPending}
              className="shrink-0 px-6 sm:px-8 bg-[var(--surface-soft)] border-t border-[var(--border)]"
            />
          </motion.section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
