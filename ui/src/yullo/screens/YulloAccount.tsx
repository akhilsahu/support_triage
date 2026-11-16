import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Loader2, LogOut } from 'lucide-react';
import { isAxiosError } from 'axios';
import { YulloAppHeader } from '../components/YulloAppHeader';
import { useYulloAppStore } from '../store/useYulloAppStore';
import { accountApi } from '../api/account';
import { useYulloSignOut } from '../hooks/useYulloSignOut';

export function YulloAccount() {
  const user = useYulloAppStore(state => state.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { signOut, signingOut, error: signOutError } = useYulloSignOut();
  const profileKey = ['yullo-account', user?.id];
  const profile = useQuery({ queryKey: profileKey, queryFn: accountApi.getProfile, enabled: !!user?.id });
  const [name, setName] = useState(user?.full_name || '');
  const edited = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [resetChecked, setResetChecked] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const busy = saving || resetting || signingOut;
  const savedName = (profile.data ? profile.data.full_name : user?.full_name) || '';
  const dirty = name.trim() !== savedName.trim();
  const details = profile.data || user;
  const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]';
  const action = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-black bg-[var(--accent)] px-5 text-base font-medium text-[var(--accent-on-solid)] transition-opacity hover:opacity-90 disabled:opacity-40 ${focus}`;

  useEffect(() => { document.title = 'Account settings — Yullo'; }, []);
  useEffect(() => {
    if (!profile.data) return;
    const current = useYulloAppStore.getState();
    if (current.user?.id !== profile.data.id) return;
    useYulloAppStore.setState({ user: profile.data });
    if (!edited.current) setName(profile.data.full_name || '');
  }, [profile.data]);
  useEffect(() => {
    if (!dirty || !edited.current) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !profile.data || !dirty) return;
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const saved = await accountApi.updateProfile(name.trim(), profile.data.updated_at);
      if (useYulloAppStore.getState().user?.id !== saved.id) return;
      edited.current = false;
      setName(saved.full_name || '');
      queryClient.setQueryData(profileKey, saved);
      useYulloAppStore.setState({ user: saved });
      setSaveMessage('Name saved.');
    } catch (reason) {
      setSaveError(isAxiosError(reason) && reason.response?.status === 409
        ? 'Your account changed elsewhere. Reload the latest details, then save again.'
        : 'Could not save your name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetOnboarding = async () => {
    if (!resetChecked || busy) return;
    setResetting(true);
    setResetError('');
    try {
      await accountApi.resetOnboarding();
      const current = useYulloAppStore.getState();
      if (!current.user || current.user.id !== user?.id) return;
      useYulloAppStore.setState({ user: { ...current.user, onboarding_completed: false } });
      navigate('/yullo/onboarding', { replace: true });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    } catch {
      setResetError('Could not reset onboarding. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  const created = details?.created_at ? new Date(details.created_at) : null;
  const memberSince = created && !Number.isNaN(created.getTime())
    ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(created) : null;

  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--text-primary)]">
      <YulloAppHeader />
      <main className="mx-auto max-w-[720px] px-5 py-8 sm:px-8 sm:py-12">
        <Link to="/yullo/home" className={`mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${focus}`}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to Home
        </Link>
        <h1 className="font-[Satoshi] text-[32px] font-semibold leading-tight tracking-tight sm:text-[36px]">Account settings</h1>
        <p className="mt-3 text-base text-[var(--text-secondary)]">Manage your name, sign-in details, and onboarding.</p>

        {profile.isPending && <p role="status" className="mt-6 text-sm text-[var(--text-secondary)]">Loading account details…</p>}
        {profile.isError && <div role="alert" className="mt-6 text-sm">
          <p>Could not load your latest account details.</p>
          <button type="button" onClick={() => void profile.refetch()} className={`mt-2 min-h-11 underline ${focus}`}>Try again</button>
        </div>}

        <section aria-labelledby="profile-heading" className="mt-10 border-t border-[var(--border)] pt-6">
          <div className="mb-6 flex items-center gap-4">
            <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] text-xl font-semibold">{(details?.full_name?.trim() || 'You').charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <h2 id="profile-heading" className="text-lg font-semibold">Your profile</h2>
              <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">The name shown in your account and at the centre of Home.</p>
            </div>
          </div>
          <form onSubmit={saveProfile} className="space-y-3" aria-busy={saving}>
            <label htmlFor="account-name" className="block text-sm font-medium">Name</label>
            <input id="account-name" name="full_name" autoComplete="name" maxLength={200} value={name} disabled={busy || profile.isPending || profile.isError}
              onChange={event => { edited.current = true; setName(event.target.value); setSaveMessage(''); setSaveError(''); }}
              aria-describedby="account-name-help" aria-invalid={!!saveError}
              className="min-h-[52px] w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50" />
            <p id="account-name-help" className="text-sm text-[var(--text-secondary)]">Leave blank to show “You” on Home.</p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button type="submit" disabled={!dirty || busy || !profile.data || profile.isError} className={action}>
                {saving && <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}{saving ? 'Saving…' : 'Save name'}
              </button>
              {dirty && <button type="button" disabled={busy} onClick={() => { edited.current = false; setName(savedName); setSaveError(''); }} className={`min-h-11 px-2 text-sm text-[var(--text-secondary)] ${focus}`}>Discard edits</button>}
            </div>
            {saveMessage && <p role="status" className="flex items-center gap-2 text-sm"><Check aria-hidden="true" className="h-4 w-4" />{saveMessage}</p>}
            {saveError && <div role="alert" className="text-sm">
              <p>{saveError}</p>
              <button type="button" disabled={busy || profile.isFetching} onClick={() => void profile.refetch()} className={`mt-1 min-h-11 underline ${focus}`}>Reload latest details</button>
            </div>}
          </form>
        </section>

        <section aria-labelledby="signin-heading" className="mt-10 border-t border-[var(--border)] pt-6">
          <h2 id="signin-heading" className="text-lg font-semibold">Sign-in details</h2>
          <dl className="mt-3 divide-y divide-[var(--border)]">
            <div className="grid gap-2 py-5 sm:grid-cols-[160px_1fr]"><dt className="text-sm text-[var(--text-secondary)]">Email</dt><dd className="break-words text-base">{details?.email || 'Not added'}</dd></div>
            <div className="grid gap-2 py-5 sm:grid-cols-[160px_1fr]"><dt className="text-sm text-[var(--text-secondary)]">Phone</dt><dd className="break-words text-base">{details?.phone || 'Not added'}</dd></div>
            {memberSince && <div className="grid gap-2 py-5 sm:grid-cols-[160px_1fr]"><dt className="text-sm text-[var(--text-secondary)]">Member since</dt><dd className="text-base">{memberSince}</dd></div>}
          </dl>
        </section>

        <section aria-labelledby="onboarding-settings" className="mt-10 border-t border-[var(--border)] pt-6">
          <h2 id="onboarding-settings" className="text-lg font-semibold">Onboarding</h2>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">Status: {user?.onboarding_completed ? 'Completed' : 'Not completed'}</p>
          <label className="mt-5 flex min-h-12 cursor-pointer items-center gap-3 text-base">
            <input type="checkbox" checked={resetChecked} disabled={busy} onChange={event => { setResetChecked(event.target.checked); setResetError(''); }} aria-describedby="reset-onboarding-help" className={`h-5 w-5 shrink-0 accent-[var(--accent)] ${focus}`} />Reset onboarding status
          </label>
          <p id="reset-onboarding-help" className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Your Spaces and sources will stay saved. You’ll return to step 1 of onboarding.</p>
          {dirty && <p className="mt-2 text-sm text-[var(--text-secondary)]">Save or discard your name change before restarting onboarding.</p>}
          <button type="button" disabled={!resetChecked || busy || dirty} onClick={resetOnboarding} className={`mt-6 ${action}`}>
            {resetting && <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}{resetting ? 'Resetting…' : 'Reset onboarding'}
          </button>
          {resetError && <p role="alert" className="mt-4 text-sm">{resetError}</p>}
        </section>

        <section aria-labelledby="session-heading" className="mt-10 border-t border-[var(--border)] pb-6 pt-6">
          <h2 id="session-heading" className="text-lg font-semibold">Sign out</h2>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">End your session on this browser.</p>
          <button type="button" disabled={busy || dirty} onClick={signOut} className={`mt-5 inline-flex min-h-[52px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 font-medium transition-colors hover:border-[var(--accent)] disabled:opacity-40 ${focus}`}>
            {signingOut ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}{signingOut ? 'Signing out…' : 'Sign out'}
          </button>
          {dirty && <p className="mt-2 text-sm text-[var(--text-secondary)]">Save or discard your name change before signing out.</p>}
          {signOutError && <p role="alert" className="mt-4 text-sm">{signOutError}</p>}
        </section>
      </main>
    </div>
  );
}
