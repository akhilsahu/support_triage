import { isAxiosError } from 'axios';
import { spaceBranch, spaceItemLabel, useSpaceHierarchy } from '../api/spaces';
import React, { useState } from 'react';
import { useSpaceEntities } from '../api/entityQueries';
import { useParams, Link, useNavigate, Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useYulloAppStore } from '../store/useYulloAppStore';
import { IconTooltip } from '../forms/core/IconTooltip';
import { formsApi } from '../api/forms';
import { yulloOnboardingApi } from '../api/onboarding';
import { useAppStore } from '../../store/useAppStore';
import { Card } from '../../components/ui/Card';
import { CalendarDays, Clock3, MapPin, ArrowLeft, ArrowRight, Eye, Layers, Table, Database, SlidersHorizontal, Info } from 'lucide-react';
import { YulloAppHeader } from '../components/YulloAppHeader';
import { Locations } from '../forms/Locations';
import { BookingLinks } from '../forms/BookingLinks';
import { Subspaces } from '../forms/subspaces/Subspaces';
import { BeaconControl } from '../forms/beacon/BeaconForm';
import { FullSpaceKnowledgePreviewModal } from '../components/FullSpaceKnowledgePreviewModal';
import { UnifiedEntityManagerModal } from '../components/UnifiedEntityManagerModal';
import { VectorChunksManagerModal } from '../components/VectorChunksManagerModal';
import { getBaseDomain } from '../config';
import { presentationAccent } from './appearance/presentation/themeTokens';
import { SubspaceInfo } from '../forms/subspaces/SubspaceInfo';
import { useArtworkAccent } from './appearance/hooks/useArtworkAccent';

export function SpaceDashboard() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { token } = useAppStore();
  const ownerId = useYulloAppStore(state => state.user?.id);
  const [discoveryError, setDiscoveryError] = useState<{ spaceId: string; message: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [publicationError, setPublicationError] = useState<{ spaceId?: string; message: string } | null>(null);
  const [isEntityManagerOpen, setIsEntityManagerOpen] = useState(false);
  const [isVectorChunksOpen, setIsVectorChunksOpen] = useState(false);
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);

  const { data: identity, isLoading } = useQuery({
    queryKey: ['identity', spaceId],
    queryFn: () => formsApi.getIdentity(spaceId!),
    enabled: !!spaceId,
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['space-sources', spaceId],
    queryFn: () => yulloOnboardingApi.getSpaceSources(spaceId!),
    enabled: !!spaceId,
  });

  const queryClient = useQueryClient();
  const toggleLiveMutation = useMutation({
    mutationFn: (live: boolean) => formsApi.toggleLive(spaceId!, live),
    onMutate: () => setPublicationError(null),
    onSuccess: (data) => {
      queryClient.setQueryData(['identity', spaceId], data);
    },
    onError: error => {
      const detail = isAxiosError(error) && error.response?.status === 409 ? error.response.data?.detail : null;
      setPublicationError({ spaceId, message: typeof detail === 'string' ? detail : 'Could not update visibility. Try again shortly.' });
    },
  });

  const discoveryMutation = useMutation({
    mutationFn: (request: { spaceId: string; revision: number; enabled: boolean; ownerId: string }) => {
      if (useYulloAppStore.getState().user?.id !== request.ownerId) throw new Error('Account changed');
      return formsApi.updateIdentity(request.spaceId, { explore_discovery: request.enabled, expected_revision: request.revision }, request.ownerId);
    },
    onMutate: () => setDiscoveryError(null),
    onSuccess: (data, request) => {
      if (useYulloAppStore.getState().user?.id !== request.ownerId) return;
      queryClient.setQueryData(['identity', request.spaceId], data);
      void queryClient.invalidateQueries({ queryKey: ['yullo-public-directory'] });
    },
    onError: (error, request) => {
      if (useYulloAppStore.getState().user?.id !== request.ownerId) return;
      const conflict = isAxiosError(error) && error.response?.status === 409;
      if (conflict) void queryClient.invalidateQueries({ queryKey: ['identity', request.spaceId] });
      setDiscoveryError({ spaceId: request.spaceId, message: conflict ? 'Settings changed. Please try again.' : 'Could not save app discovery. Please try again.' });
    },
  });

  const entities = useSpaceEntities(spaceId!);
  const hierarchy = useSpaceHierarchy();
  const branch = spaceBranch(hierarchy.data ?? [], spaceId);
  const publicPath = branch.length ? branch.map(node => node.slug).join('/') : identity?.slug;

  const currentNode = branch[branch.length - 1];
  const isChild = !!currentNode?.parent_space_id;
  const isEvent = isChild && currentNode.space_type === 'event';
  const itemLabel = spaceItemLabel(currentNode?.space_type || 'item', currentNode?.type_label || identity?.type_label);
  const itemTitle = itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1);
  const approved = (entities.data ?? []).filter(item => item.is_active && ['owner_confirmed', 'source_authoritative'].includes(item.review_status));
  const event = approved.find(item => item.entity_type === 'event' && item.identity_key === 'space-event')
    ?? approved.find(item => item.entity_type === 'event' && item.payload_json.title === identity?.display_name);
  const venue = approved.find(item => item.entity_type === 'location' && item.id === event?.payload_json.location_entity_id)
    ?? approved.find(item => item.entity_type === 'location' && item.identity_key === 'event-venue');
  const savedContext = identity?.event_context;
  const startValue = event?.payload_json.starts_at || savedContext?.starts_at;
  const start = startValue ? new Date(startValue) : null;
  const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
  const venueLabel = venue ? (venue.payload_json.is_remote ? 'Online / Remote' : venue.payload_json.address)
    : savedContext?.location_mode === 'online' ? 'Online / Remote' : savedContext?.place;

  const isLive = identity?.status === 'live';
  const appearance = identity?.presentation_config;
  const inferredAccent = useArtworkAccent(isChild && (!appearance || appearance.presentationSource === 'default') && !appearance?.accentColor ? identity?.logo_url : null);
  const artworkAccent = isChild && appearance && (appearance.presentationSource !== 'default' || appearance.accentColor)
    ? presentationAccent(appearance).solid : inferredAccent;

  return (
    <div className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans]">
      <YulloAppHeader spaceId={spaceId} />
      <div key={spaceId} className="yullo-dashboard-enter max-w-4xl mx-auto p-6 pt-12 pb-24" style={{ '--space-accent': artworkAccent || 'var(--border)' } as React.CSSProperties}>

        <div className={`mb-8 flex flex-col gap-6 sm:flex-row sm:items-center ${isChild ? 'rounded-2xl border border-[color-mix(in_srgb,var(--space-accent)_24%,var(--border))] bg-[linear-gradient(125deg,color-mix(in_srgb,var(--space-accent)_28%,var(--surface))_0%,color-mix(in_srgb,var(--space-accent)_12%,var(--surface))_55%,var(--surface)_100%)] p-5 sm:p-6' : ''}`}>
        {identity?.logo_url && identity.logo_url !== failedCoverUrl && (
            <img
              key={identity.logo_url}
              src={identity.logo_url}
              alt={`${identity.display_name || 'Space'} cover`}
              className="max-h-64 w-auto max-w-full shrink-0 self-center rounded-xl object-contain sm:max-w-[40%]"
              onError={() => setFailedCoverUrl(identity.logo_url!)}
            />
        )}
        <div className={`relative min-w-0 w-full flex-1 ${isChild ? "pr-28" : "pr-14"}`}>
          {spaceId && identity && <div className="absolute right-0 top-0 flex items-center gap-2">{isChild && <BeaconControl spaceId={spaceId} title={identity.display_name} cover={identity.logo_url} locations={approved} />}<Subspaces key={`subspaces:${spaceId}`} spaceId={spaceId} /></div>}
          <h1 className="text-[28px] md:text-[36px] font-[Satoshi] font-medium tracking-tight text-[var(--text-primary)]">
            {isLoading ? 'Loading Space...' : identity?.display_name || 'Unnamed Space'}
          </h1>
          {identity?.slug && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mt-3">
              <a 
                href={`/${publicPath}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`${getBaseDomain()}/${publicPath}`}
                className="inline-flex min-w-0 max-w-full items-center text-[15px] font-[Instrument_Sans] text-[var(--network-cyan,var(--accent-solid))] hover:underline"
              >
                <span className="truncate">{getBaseDomain()}/{publicPath}</span>
                <ArrowRight className="shrink-0 w-4 h-4 ml-1 opacity-70 transform -rotate-45" />
              </a>

              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 text-[14px] font-[Instrument_Sans] font-medium ${isLive ? 'text-[#10b981]' : 'text-[var(--text-secondary)]'}`}>
                  {isLive ? (
                    <><span className="w-2 h-2 rounded-full bg-[#10b981]"></span> Live</>
                  ) : (
                    <><span className="w-2 h-2 rounded-full border border-current"></span> Private</>
                  )}
                </span>
                
                <button
                  onClick={() => toggleLiveMutation.mutate(!isLive)}
                  disabled={toggleLiveMutation.isPending || discoveryMutation.isPending}
                  className="text-[13px] font-[Instrument_Sans] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 ml-1"
                >
                  [{isLive ? 'Hide' : 'Make live'}]
                </button>
              </div>
            </div>
          )}
          {identity && spaceId && <div className="mt-5 max-w-sm border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2">
              <span id={`app-discovery-${spaceId}`} className="text-sm font-medium">App discovery</span>
              <IconTooltip label="Who can discover this app?" description="When enabled, this page can appear in Explore apps once it and its parent pages are live. Turning it off removes the Explore listing; the public link still works. Each subspace has its own setting.">
                <button type="button" aria-label="About app discovery" className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Info size={15} /></button>
              </IconTooltip>
              <button type="button" role="switch" aria-checked={identity.explore_discovery === true} aria-labelledby={`app-discovery-${spaceId}`} aria-describedby={`app-discovery-description-${spaceId}`} aria-busy={discoveryMutation.isPending || undefined}
                disabled={!ownerId || discoveryMutation.isPending || toggleLiveMutation.isPending}
                onClick={() => { if (ownerId) discoveryMutation.mutate({ spaceId, ownerId, revision: identity.revision, enabled: !identity.explore_discovery }); }}
                className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-50">
                <span className={`flex h-6 w-11 items-center rounded-full border p-0.5 ${identity.explore_discovery ? 'border-[var(--accent)] bg-[var(--accent-solid)]' : 'border-[var(--border-hover)] bg-[var(--surface-soft)]'}`}>
                  <span className={`h-4 w-4 rounded-full shadow-sm motion-safe:transition-transform motion-safe:duration-150 ${identity.explore_discovery ? 'translate-x-5 bg-[var(--accent-on-solid)]' : 'translate-x-0 bg-[var(--text-secondary)]'}`} />
                </span>
              </button>
            </div>
            <p id={`app-discovery-description-${spaceId}`} className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{discoveryMutation.isPending ? 'Saving discovery setting…' : 'Let people find this page in Explore apps when it’s live.'}</p>
            {discoveryError?.spaceId === spaceId && <p role="alert" className="mt-2 text-xs text-[var(--critical)]">{discoveryError.message}</p>}
          </div>}
        </div>
        </div>

        {publicationError && publicationError.spaceId === spaceId && <p role="alert" className="mb-5 text-sm text-[var(--critical)]">{publicationError.message}</p>}
        {isChild && <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">{isEvent && <CalendarDays size={16} aria-hidden="true" />}{currentNode.space_type.charAt(0).toUpperCase() + currentNode.space_type.slice(1)} · Part of {branch[branch.length - 2]?.name}</p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">Changes here apply only to this {itemLabel}.</p>
          {identity?.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{identity.description}</p>}
          <div className="mt-4"><SubspaceInfo fields={identity?.subspace_fields} /></div>
          {isEvent && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" />{validStart ? validStart.toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Date to be confirmed'}</span>
            {validStart && <span className="inline-flex items-center gap-2"><Clock3 size={16} aria-hidden="true" />{validStart.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' })}</span>}
            <span className="inline-flex min-w-0 items-center gap-2"><MapPin size={16} className="shrink-0" aria-hidden="true" />{venueLabel || 'Location to be confirmed'}</span>
          </div>}
        </section>}
        <div className="space-y-0 divide-y divide-[var(--border)] border-t border-b border-[var(--border)]">
          

          {/* Row 1: Identity */}
          <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-[Satoshi] font-medium text-[18px] text-[var(--text-primary)]">{isChild ? `${itemTitle} details` : 'Identity'}</h3>
                {identity?.display_name && (
                  <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                )}
              </div>
              <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
                {isChild ? `Update this ${itemLabel}’s name, description and public link.` : 'Manage your space name, handle, description, and presence.'}
              </p>
            </div>
            <button 
              onClick={() => navigate(`/yullo/spaces/${spaceId}/identity/edit`)}
              className="px-5 py-2.5 rounded-lg text-[15px] font-[Instrument_Sans] font-medium bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 border border-transparent transition-colors self-start md:self-auto"
            >
              {isChild ? `Edit ${itemLabel}` : 'Edit'}
            </button>
          </div>
          
          {/* Row 2: Knowledge & Details */}
          <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4 border-t border-[var(--border)]">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-[Satoshi] font-medium text-[18px] text-[var(--text-primary)]">{isChild ? `What Aura knows about this ${itemLabel}` : 'What Aura knows'}</h3>
              </div>
              <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
                {isChild ? `Add information, files and FAQs so Aura can answer questions about this ${itemLabel}.` : 'Manage links, files, text notes, and FAQs for Aura to learn from.'}
              </p>
            </div>
            <div className="flex items-center gap-2 self-start md:self-auto">
              <button 
                onClick={() => setIsEntityManagerOpen(true)}
                className="h-10 w-10 rounded-lg bg-[var(--surface-soft)] text-[var(--text-primary)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors cursor-pointer flex items-center justify-center"
                title="All Entities & Statuses (Sheets View)"
                aria-label="All Entities & Statuses Sheet"
              >
                <Table className="w-4 h-4 text-emerald-500" />
              </button>
              <button 
                onClick={() => setIsVectorChunksOpen(true)}
                className="h-10 w-10 rounded-lg bg-[var(--surface-soft)] text-[var(--text-primary)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors cursor-pointer flex items-center justify-center"
                title="Vector Chunks & Embeddings (Sheets View)"
                aria-label="Vector Chunks Sheet"
              >
                <Database className="w-4 h-4 text-sky-500" />
              </button>
              <button 
                onClick={() => setIsPreviewOpen(true)}
                className="h-10 w-10 rounded-lg bg-[var(--surface-soft)] text-[var(--text-primary)] hover:bg-[var(--border)] border border-[var(--border)] transition-colors cursor-pointer flex items-center justify-center"
                title="Preview Full Space Knowledge"
                aria-label="Preview Knowledge"
              >
                <Eye className="w-4 h-4 text-[var(--accent-ink,#3b82f6)]" />
              </button>
              <button 
                onClick={() => navigate(`/yullo/spaces/${spaceId}/aura-knowledge`)}
                className="h-10 w-10 rounded-lg bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 border border-transparent transition-colors cursor-pointer flex items-center justify-center"
                title="Manage Knowledge Sources"
                aria-label="Manage Sources"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {spaceId && identity && <BookingLinks key={`booking:${spaceId}`} spaceId={spaceId} spaceName={identity.display_name} itemLabel={isChild ? itemLabel : undefined} />}




          {/* Row 3: Appearance */}
          <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-[Satoshi] font-medium text-[18px] text-[var(--text-primary)]">{isChild ? `${itemTitle} page design` : 'Appearance'}</h3>
              </div>
              <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
                {isChild ? `Customize how this ${itemLabel} looks to visitors.` : 'Shape the visual personality of your public Yullo Link.'}
              </p>
            </div>
            <button
              onClick={() => navigate(`/yullo/spaces/${spaceId}/appearance`)}
              className="px-5 py-2.5 rounded-lg text-[15px] font-[Instrument_Sans] font-medium transition-colors self-start md:self-auto bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
            >
              {isChild ? `Customize ${itemLabel}` : 'Open studio'}
            </button>
          </div>

          {spaceId && identity && <Subspaces key={`content:${spaceId}`} spaceId={spaceId} display="sections" />}


        </div>
        {spaceId && identity && <Locations key={`locations:${spaceId}`} spaceId={spaceId} eventContext={isEvent ? savedContext : undefined} itemLabel={isChild ? itemLabel : undefined} />}
      </div>
      <Outlet />

      <FullSpaceKnowledgePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        spaceName={identity?.display_name || 'Space Knowledge'}
        slug={identity?.slug}
        purpose={identity?.purpose}
        category={identity?.category}
        presence={identity?.presence}
        website={identity?.website}
        description={identity?.description}
        logoUrl={identity?.logo_url}
        sources={sources}
      />

      {spaceId && (
        <UnifiedEntityManagerModal
          isOpen={isEntityManagerOpen}
          onClose={() => setIsEntityManagerOpen(false)}
          spaceId={spaceId}
          spaceName={identity?.display_name || 'Space'}
        />
      )}

      {spaceId && (
        <VectorChunksManagerModal
          isOpen={isVectorChunksOpen}
          onClose={() => setIsVectorChunksOpen(false)}
          spaceId={spaceId}
          spaceName={identity?.display_name || 'Space'}
        />
      )}
    </div>
  );
}
