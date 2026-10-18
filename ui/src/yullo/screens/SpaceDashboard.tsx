import React, { useState } from 'react';
import { useParams, Link, useNavigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formsApi } from '../api/forms';
import { yulloOnboardingApi } from '../api/onboarding';
import { useAppStore } from '../../store/useAppStore';
import { Card } from '../../components/ui/Card';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { YulloAppHeader } from '../components/YulloAppHeader';
import { FullSpaceKnowledgePreviewModal } from '../components/FullSpaceKnowledgePreviewModal';

export function SpaceDashboard() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const { token } = useAppStore();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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

  return (
    <div className="yullo-app min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] font-[Instrument_Sans]">
      <YulloAppHeader spaceId={spaceId} />
      <div className="max-w-4xl mx-auto p-6 pt-12 pb-24">

        <div className="mb-8">
          <h1 className="text-[28px] md:text-[36px] font-[Satoshi] font-medium tracking-tight text-[var(--text-primary)]">
            {isLoading ? 'Loading Space...' : identity?.display_name || 'Unnamed Space'}
          </h1>
          {identity?.slug && (
            <div className="flex items-center gap-3 mt-3">
              <a 
                href={`/yullo/${identity.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] font-[Instrument_Sans] text-[var(--network-cyan,var(--accent-solid))] hover:underline flex items-center"
              >
                yullo.com/{identity.slug}
                <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
              </a>
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
                onClick={() => setIsPreviewOpen(true)}
                className="px-4 py-2.5 rounded-lg text-[14px] font-[Instrument_Sans] font-medium bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 border border-transparent transition-colors cursor-pointer flex items-center gap-1.5"
                title="Preview full space knowledge"
              >
                <Eye className="w-4 h-4 text-[var(--accent-ink)]" /> Preview
              </button>
              <button 
                onClick={() => navigate(`/yullo/spaces/${spaceId}/aura-knowledge`)}
                className="px-5 py-2.5 rounded-lg text-[15px] font-[Instrument_Sans] font-medium bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90 border border-transparent transition-colors cursor-pointer"
              >
                Manage
              </button>
            </div>
          </div>

          {/* Row 3: Appearance */}
          <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4 opacity-50 pointer-events-none">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-[Satoshi] font-medium text-[18px] text-[var(--text-primary)]">Appearance</h3>
              </div>
              <p className="text-[15px] font-[Instrument_Sans] text-[var(--text-secondary)]">
                Customize colors, layout, and visual presets for your space. (Coming soon)
              </p>
            </div>
            <button 
              className="px-5 py-2.5 rounded-lg text-[15px] font-[Instrument_Sans] font-medium transition-colors self-start md:self-auto bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
            >
              Manage
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
    </div>
  );
}
