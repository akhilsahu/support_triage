import React, { useState } from 'react';
import { useParams, Link, useNavigate, Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formsApi } from '../api/forms';
import { yulloOnboardingApi } from '../api/onboarding';
import { useAppStore } from '../../store/useAppStore';
import { Card } from '../../components/ui/Card';
import { ArrowLeft, ArrowRight, Eye, Layers, Table, Database, SlidersHorizontal } from 'lucide-react';
import { YulloAppHeader } from '../components/YulloAppHeader';
import { Locations } from '../forms/Locations';
import { BookingLinks } from '../forms/BookingLinks';
import { FullSpaceKnowledgePreviewModal } from '../components/FullSpaceKnowledgePreviewModal';
import { UnifiedEntityManagerModal } from '../components/UnifiedEntityManagerModal';
import { VectorChunksManagerModal } from '../components/VectorChunksManagerModal';
import { getBaseDomain } from '../config';

export function SpaceDashboard() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { token } = useAppStore();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEntityManagerOpen, setIsEntityManagerOpen] = useState(false);
  const [isVectorChunksOpen, setIsVectorChunksOpen] = useState(false);

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
    onSuccess: (data) => {
      queryClient.setQueryData(['identity', spaceId], data);
    }
  });

  const isLive = identity?.status === 'live';

  return (
    <div className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans]">
      <YulloAppHeader spaceId={spaceId} />
      <div className="max-w-4xl mx-auto p-6 pt-12 pb-24">

        <div className="mb-8">
          <h1 className="text-[28px] md:text-[36px] font-[Satoshi] font-medium tracking-tight text-[var(--text-primary)]">
            {isLoading ? 'Loading Space...' : identity?.display_name || 'Unnamed Space'}
          </h1>
          {identity?.slug && (
            <div className="flex items-center gap-4 mt-3">
              <a 
                href={`/${identity.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] font-[Instrument_Sans] text-[var(--network-cyan,var(--accent-solid))] hover:underline flex items-center"
              >
                {getBaseDomain()}/{identity.slug}
                <ArrowRight className="w-4 h-4 ml-1 opacity-70 transform -rotate-45" />
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
                  disabled={toggleLiveMutation.isPending}
                  className="text-[13px] font-[Instrument_Sans] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 ml-1"
                >
                  [{isLive ? 'Hide' : 'Make live'}]
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-0 divide-y divide-[var(--border)] border-t border-b border-[var(--border)]">
          
          {/* Row 1: Identity */}
          <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-[Satoshi] font-medium text-[18px] text-[var(--text-primary)]">Identity</h3>
                {identity?.display_name && (
                  <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                )}
              </div>
              <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
                Manage your space name, handle, description, and presence.
              </p>
            </div>
            <button 
              onClick={() => navigate(`/yullo/spaces/${spaceId}/identity/edit`)}
              className="px-5 py-2.5 rounded-lg text-[15px] font-[Instrument_Sans] font-medium bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 border border-transparent transition-colors self-start md:self-auto"
            >
              Edit
            </button>
          </div>
          
          {/* Row 2: Knowledge & Details */}
          <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4 border-t border-[var(--border)]">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-[Satoshi] font-medium text-[18px] text-[var(--text-primary)]">What Aura knows</h3>
              </div>
              <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
                Manage links, files, text notes, and FAQs for Aura to learn from.
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

          {spaceId && identity && <BookingLinks key={spaceId} spaceId={spaceId} spaceName={identity.display_name} />}

          {spaceId && identity && <Locations key={spaceId} spaceId={spaceId} />}

          {/* Row 3: Appearance */}
          <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-[Satoshi] font-medium text-[18px] text-[var(--text-primary)]">Appearance</h3>
              </div>
              <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
                Shape the visual personality of your public Yullo Link.
              </p>
            </div>
            <button
              onClick={() => navigate(`/yullo/spaces/${spaceId}/appearance`)}
              className="px-5 py-2.5 rounded-lg text-[15px] font-[Instrument_Sans] font-medium transition-colors self-start md:self-auto bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
            >
              Open studio
            </button>
          </div>

        </div>
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
