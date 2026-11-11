import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isAxiosError } from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Search, AlertCircle, Database, Layers,
  RefreshCw, Maximize2, Minimize2, CheckSquare, Square, 
  ExternalLink, Image as ImageIcon, Code2,
  Link2, Copy, Check
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { chunksApi, VectorChunkItem } from '../api/chunks';

interface VectorChunksManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName?: string;
  initialSourceId?: string;
}

export function VectorChunksManagerModal({
  isOpen,
  onClose,
  spaceId,
  spaceName = 'Space',
  initialSourceId,
}: VectorChunksManagerModalProps) {
  // State
  const [selectedSourceId, setSelectedSourceId] = useState<string>(initialSourceId || 'all');

  React.useEffect(() => {
    if (initialSourceId) {
      setSelectedSourceId(initialSourceId);
    } else if (isOpen && !initialSourceId) {
      setSelectedSourceId('all');
    }
  }, [initialSourceId, isOpen, spaceId]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'images' | 'links' | 'tables'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');

  // Inspector & Lightbox Modals
  const [inspectingChunk, setInspectingChunk] = useState<VectorChunkItem | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; alt?: string; destination?: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch Vector Chunks
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['space-vector-chunks', spaceId, selectedSourceId],
    queryFn: () => chunksApi.getSpaceVectorChunks(spaceId, selectedSourceId, 800),
    enabled: isOpen && !!spaceId,
    refetchInterval: query => query.state.data?.sources.some(source =>
      ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(source.ingestion_status || '')
    ) ? 2500 : false,
  });

  const sources = useMemo(() => data?.sources || [], [data?.sources]);
  const allChunks = useMemo(() => data?.chunks || [], [data?.chunks]);
  const rawJson = useMemo(() => viewMode === 'raw' && data ? JSON.stringify(data, null, 2) : '', [viewMode, data]);
  const httpStatus = isAxiosError(error) ? error.response?.status : undefined;
  // A refresh failure can coexist with a successful cached response.
  // Access revocation and deleted sources must still hide cached content.
  const countsKnown = data !== undefined && !(isError && [401, 403, 404].includes(httpStatus || 0));
  const blockingError = isError && !countsKnown;
  const countLabel = (value: number) => countsKnown ? value : '—';
  const requestFailure = httpStatus === 401
    ? 'Your session expired. Sign in again to load chunks.'
    : httpStatus === 403
      ? 'You do not have access to this Space.'
      : httpStatus === 404 && selectedSourceId !== 'all'
        ? 'The selected source is no longer available. Select All Sources to view current sources.'
        : httpStatus === 404
          ? 'The chunks endpoint was not found. Reload the backend and try again.'
          : isAxiosError(error) && !error.response
            ? 'Unable to reach the server. Check that the backend is running.'
            : 'The server could not load chunks. Use Refresh to try again.';
  const selectedSources = selectedSourceId === 'all' ? sources : sources.filter(source => source.source_id === selectedSourceId);
  const isPreparing = selectedSources.some(source => ['uploaded', 'queued', 'running', 'processing', 'parsing_preview'].includes(source.ingestion_status || ''));
  const preparationFailed = selectedSources.some(source => source.indexing_status === 'failed'
    || ['failed', 'preview_failed'].includes(source.ingestion_status || ''));

  React.useEffect(() => {
    if (!isOpen) return;
    setSearchTerm('');
    setViewMode('table');
    setFilterType('all');
    setSelectedIds(new Set());
    setInspectingChunk(null);
    setLightboxImage(null);
  }, [isOpen, initialSourceId, spaceId]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      if (lightboxImage) setLightboxImage(null);
      else if (inspectingChunk) setInspectingChunk(null);
      else onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, lightboxImage, inspectingChunk]);

  // Filtered Chunks
  const filteredChunks = useMemo(() => {
    return allChunks.filter((chunk) => {
      // Filter Type
      if (filterType === 'images' && chunk.images.length === 0) return false;
      if (filterType === 'links' && chunk.links.length === 0) return false;
      if (filterType === 'tables' && !chunk.is_table && !chunk.is_table_row) return false;

      // Search Query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const textMatch = (chunk.text || '').toLowerCase().includes(query);
        const sectionMatch = (chunk.section || '').toLowerCase().includes(query);
        const docMatch = (chunk.doc_id || '').toLowerCase().includes(query);
        const sourceMatch = (chunk.source_title || '').toLowerCase().includes(query);
        const linkMatch = chunk.links.some((l) => l.url.toLowerCase().includes(query) || l.title.toLowerCase().includes(query));
        const imgMatch = chunk.images.some((img) => img.url.toLowerCase().includes(query) || img.alt.toLowerCase().includes(query));
        return textMatch || sectionMatch || docMatch || sourceMatch || linkMatch || imgMatch;
      }
      return true;
    });
  }, [allChunks, filterType, searchTerm]);

  // Overall statistics
  const stats = useMemo(() => {
    let withImages = 0;
    let withLinks = 0;
    let tableRows = 0;
    allChunks.forEach((c) => {
      if (c.images.length > 0) withImages++;
      if (c.links.length > 0) withLinks++;
      if (c.is_table || c.is_table_row) tableRows++;
    });
    return {
      total: allChunks.length,
      withImages,
      withLinks,
      tableRows,
      sourcesCount: sources.length,
    };
  }, [allChunks, sources]);

  // Row selection helpers
  const allFilteredSelected = filteredChunks.length > 0 && filteredChunks.every((c) => selectedIds.has(c.id));
  const someFilteredSelected = filteredChunks.some((c) => selectedIds.has(c.id)) && !allFilteredSelected;

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredChunks.map((c) => c.id)));
    }
  }, [allFilteredSelected, filteredChunks]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="yullo-app" style={{ display: 'contents' }}>
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vector-chunks-title"
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: 0.15 }}
          className={`relative flex flex-col overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#121214] text-zinc-900 dark:text-zinc-100 shadow-2xl font-[Instrument_Sans] ${
            isFullScreen ? 'h-full w-full rounded-none' : 'h-full max-h-[94dvh] w-full max-w-[1600px]'
          }`}
        >
          {/* Sheets Title Bar */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181b] px-3 sm:px-4 py-2.5 select-none">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-sky-600 text-white shadow-xs">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span id="vector-chunks-title" className="block truncate font-[Satoshi] text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {spaceName} — Vector Chunks & Embeddings Sheet
                </span>
                <span className="hidden sm:inline-block rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-400">
                  {blockingError ? 'Chunks unavailable' : isLoading ? 'Loading chunks…' : `${stats.total} chunks in vector DB`}
                </span>
              </div>
            </div>

            {/* Top Sheet Stats summary */}
            <div className="hidden 2xl:flex shrink-0 items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span className="text-zinc-500 dark:text-zinc-400">Total:</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400">{countLabel(stats.total)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-zinc-500 dark:text-zinc-400">With Images:</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{countLabel(stats.withImages)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-zinc-500 dark:text-zinc-400">With Links:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{countLabel(stats.withLinks)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                <span className="text-zinc-500 dark:text-zinc-400">Sources:</span>
                <span className="font-semibold text-purple-600 dark:text-purple-400">{countLabel(sources.length)}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh chunks from vector store"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                title={isFullScreen ? 'Exit full screen' : 'Full screen'}
              >
                {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="ml-1 inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Close sheet"
                aria-label="Close vector chunks"
              >
                <X className="h-4 w-4" />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Sheets Formula & Source Selection Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-[#161619] px-4 py-2 text-xs">
            {/* Source Selection Dropdown */}
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 whitespace-nowrap">
                <Layers className="h-3.5 w-3.5 text-sky-500" />
                Source:
              </span>
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="min-w-0 max-w-[320px] truncate rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
              >
                <option value="all">
                  All Sources ({countLabel(sources.reduce((acc, s) => acc + s.chunk_count, 0) || stats.total)} chunks)
                </option>
                {selectedSourceId !== 'all' && !sources.some(source => source.source_id === selectedSourceId) && (
                  <option value={selectedSourceId}>Selected source ({isError ? 'unavailable' : 'loading…'})</option>
                )}
                {sources.map((src) => (
                  <option key={src.source_id} value={src.source_id}>
                    {src.title} ({src.chunk_count} chunks{src.images_count > 0 ? ` · ${src.images_count} imgs` : ''})
                  </option>
                ))}
              </select>
            </div>

            <div role="group" aria-label="Chunk view" className="inline-flex shrink-0 gap-1">
              {(['table', 'raw'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}
                  className={`rounded border px-2.5 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${viewMode === mode
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'}`}
                >
                  {mode === 'raw' ? 'Raw' : 'Table'}
                </button>
              ))}
            </div>

            {/* Search Box with fx formula style */}
            <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
              <div className="flex items-center px-2 py-1 font-mono text-[11px] font-bold text-zinc-400 dark:text-zinc-500 select-none border-r border-zinc-300 dark:border-zinc-700">
                fx
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter chunk text, section, images, or metadata..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-3 py-1 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-sky-500 focus:outline-none"
                />
              </div>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Toggle Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-sky-600 text-white'
                    : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                All ({countLabel(allChunks.length)})
              </button>
              <button
                onClick={() => setFilterType('images')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
                  filterType === 'images'
                    ? 'bg-amber-600 text-white'
                    : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <ImageIcon className="h-3 w-3" />
                With Images ({countLabel(stats.withImages)})
              </button>
              <button
                onClick={() => setFilterType('links')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1 ${
                  filterType === 'links'
                    ? 'bg-emerald-600 text-white'
                    : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Link2 className="h-3 w-3" />
                With Links ({countLabel(stats.withLinks)})
              </button>
            </div>
          </div>

          {/* Sheets Grid Table Container */}
          {isError && countsKnown && (
            <div role="status" className="shrink-0 border-b border-zinc-200 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              Could not refresh. Showing the last loaded results. Use Refresh to try again.
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto bg-white dark:bg-[#121214]">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center text-sm font-mono text-zinc-400 animate-pulse">
                Loading vector store chunks and embeddings...
              </div>
            ) : blockingError ? (
              <div role="alert" className="flex h-64 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                <AlertCircle className="h-6 w-6" />
                <span>{requestFailure}</span>
                {httpStatus && <span className="font-mono text-xs">HTTP {httpStatus}</span>}
              </div>
            ) : viewMode === 'raw' ? (
              <section aria-label="Raw chunks and metadata" className="p-4">
                <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Loaded response for the selected source, including chunks and metadata. Text and image filters apply to Table view.
                </p>
                <pre tabIndex={0} className="overflow-auto rounded border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  {rawJson}
                </pre>
              </section>
            ) : filteredChunks.length === 0 ? (
              <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-2 px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                <AlertCircle className="h-6 w-6 text-zinc-400 mb-2 opacity-60" />
                {allChunks.length > 0 ? (
                  <><span>No passages match your search or filters.</span><span>Try another search or filter.</span></>
                ) : isPreparing ? (
                  <><span>This source is still being prepared.</span><span>Chunks will appear here when they’re ready.</span></>
                ) : preparationFailed ? (
                  <><span>Search preparation did not finish.</span><span>Retry the source from the sources list.</span></>
                ) : sources.length === 0 ? (
                  <span>Add a source to prepare searchable content.</span>
                ) : (
                  <>
                    <span>No searchable chunks have been indexed for this selection.</span>
                    {!!data?.source_images.length && (
                      <span>{data.source_images.length} scraped images are available in the source preview.</span>
                    )}
                    <span>Use Re-extract in the sources list to prepare searchable chunks. Approval is not required.</span>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                {/* Column Headers */}
                <thead className="sticky top-0 z-20 select-none bg-zinc-100 dark:bg-[#18181b] text-zinc-600 dark:text-zinc-400 font-mono text-[11px] font-semibold">
                  <tr>
                    {/* Row Index */}
                    <th className="w-14 min-w-[56px] px-2 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800 bg-zinc-200/70 dark:bg-zinc-900/90">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={toggleSelectAll}
                          className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                          title={allFilteredSelected ? 'Deselect all rows' : 'Select all rows'}
                        >
                          {allFilteredSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-sky-600" />
                          ) : someFilteredSelected ? (
                            <div className="h-3.5 w-3.5 rounded border border-sky-600 bg-sky-600/30 flex items-center justify-center">
                              <span className="h-1 w-1 bg-sky-600 rounded-xs"></span>
                            </div>
                          ) : (
                            <Square className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                        </button>
                        <span className="text-[10px] text-zinc-400">#</span>
                      </div>
                    </th>

                    <th className="w-20 min-w-[70px] px-2.5 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">A</span> Chunk
                    </th>

                    <th className="w-48 min-w-[160px] px-3 py-2 border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">B</span> Section / Path
                    </th>

                    <th className="min-w-[340px] px-3 py-2 border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">C</span> Chunk Text Snippet
                    </th>

                    <th className="w-36 min-w-[130px] px-2 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">D</span> Images in Vector
                    </th>

                    <th className="w-40 min-w-[140px] px-2.5 py-2 border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">E</span> Links / Citations
                    </th>

                    <th className="w-28 min-w-[100px] px-2 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">F</span> Page & Strategy
                    </th>

                    <th className="w-28 min-w-[90px] px-2 py-2 text-center border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">G</span> Metadata
                    </th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-[Instrument_Sans]">
                  {filteredChunks.map((chunk, index) => {
                    const isSelected = selectedIds.has(chunk.id);

                    return (
                      <tr
                        key={chunk.id}
                        className={`transition-colors group h-10 ${
                          isSelected
                            ? 'bg-sky-50/70 dark:bg-sky-950/30'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                        }`}
                      >
                        {/* Row Index */}
                        <td className="w-14 min-w-[56px] px-2 py-1.5 text-center font-mono text-[11px] text-zinc-400 dark:text-zinc-500 border-r border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 select-none">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => toggleSelectRow(chunk.id)}
                              className="cursor-pointer text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-3.5 w-3.5 text-sky-600" />
                              ) : (
                                <Square className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400" />
                              )}
                            </button>
                            <span className="w-5 text-right">{index + 1}</span>
                          </div>
                        </td>

                        {/* Column A: Chunk Index */}
                        <td className="px-2.5 py-1.5 text-center border-r border-b border-zinc-200 dark:border-zinc-800 font-mono text-[11px] whitespace-nowrap">
                          <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300 font-semibold">
                            #{chunk.chunk_index}
                          </span>
                        </td>

                        {/* Column B: Section / Path */}
                        <td className="px-3 py-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 max-w-[200px]">
                          <div className="truncate font-medium text-zinc-800 dark:text-zinc-200 text-xs" title={chunk.section || 'General content'}>
                            {chunk.section || <span className="text-zinc-400 italic">Overview</span>}
                          </div>
                          <div className="truncate text-[10px] text-zinc-400 font-mono" title={chunk.source_title}>
                            {chunk.source_title}
                          </div>
                        </td>

                        {/* Column C: Chunk Text Snippet */}
                        <td
                          onClick={() => setInspectingChunk(chunk)}
                          className="px-3 py-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 max-w-[420px] cursor-pointer hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-colors"
                          title="Click to inspect full text & metadata"
                        >
                          <div className="line-clamp-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-mono">
                            {chunk.text}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400 font-mono">
                            <span>~{chunk.token_estimate} words</span>
                            {chunk.is_table_row && (
                              <span className="text-amber-500 font-medium">· table row</span>
                            )}
                          </div>
                        </td>

                        {/* Column D: Images in Vector / Chunk */}
                        <td className="px-2 py-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 text-center">
                          {chunk.images.length > 0 ? (
                            <div className="flex items-center justify-center gap-1.5 overflow-x-auto max-w-[130px] mx-auto py-0.5">
                              {chunk.images.slice(0, 3).map((img, i) => (
                                <button
                                  key={i}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxImage({
                                      url: img.url,
                                      alt: img.alt || `Image in chunk #${chunk.chunk_index}`,
                                      destination: img.destination_url,
                                    });
                                  }}
                                  className="relative h-7 w-7 rounded overflow-hidden border border-zinc-300 dark:border-zinc-700 hover:scale-110 transition-transform cursor-pointer shadow-xs shrink-0"
                                  title={img.alt || 'Click to view full image'}
                                >
                                  <img
                                    src={img.url}
                                    alt={img.alt || 'chunk asset'}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      // Hide broken image
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                </button>
                              ))}
                              {chunk.images.length > 3 && (
                                <span className="font-mono text-[10px] text-zinc-400 font-semibold">
                                  +{chunk.images.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 text-[11px] font-mono">—</span>
                          )}
                        </td>

                        {/* Column E: Links / Citations */}
                        <td className="px-2.5 py-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 max-w-[160px]">
                          {chunk.links.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {chunk.links.slice(0, 2).map((l, i) => (
                                <a
                                  key={i}
                                  href={l.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="truncate text-[11px] text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
                                  title={l.url}
                                >
                                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{l.title || l.url}</span>
                                </a>
                              ))}
                              {chunk.links.length > 2 && (
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  +{chunk.links.length - 2} more links
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 text-[11px] font-mono">—</span>
                          )}
                        </td>

                        {/* Column F: Page & Strategy */}
                        <td className="px-2 py-1.5 text-center border-r border-b border-zinc-200 dark:border-zinc-800 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                          <span>p.{chunk.page}</span>
                          <span className="text-zinc-400 block text-[10px]">
                            {chunk.metadata.strategy || 'structure'}
                          </span>
                        </td>

                        {/* Column G: Metadata Inspect Button */}
                        <td className="px-2 py-1 text-center border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                          <button
                            onClick={() => setInspectingChunk(chunk)}
                            className="rounded bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer inline-flex items-center gap-1"
                            title="Inspect full ChromaDB metadata and raw text"
                          >
                            <Code2 className="h-3 w-3 text-sky-500" /> Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Sheets Bottom Status Bar */}
          <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#18181b] px-4 py-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 select-none">
            <div className="flex items-center gap-4">
              <span>
                Showing <strong className="text-zinc-800 dark:text-zinc-200">{filteredChunks.length}</strong> of {allChunks.length} vector chunks
              </span>
              {selectedIds.size > 0 && (
                <span className="text-sky-600 dark:text-sky-400 font-semibold">
                  {selectedIds.size} chunks selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span>Tip: Click any chunk text or "Inspect" button to see full raw text & ChromaDB metadata</span>
              <span>·</span>
              <kbd className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300">
                ESC
              </kbd>{' '}
              to close
            </div>
          </div>
        </motion.div>
      </div>

      {/* Inspect Chunk Drawer / Modal */}
      {inspectingChunk && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col h-[85vh] w-[90vw] max-w-4xl rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#18181b] text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden font-[Instrument_Sans]"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-sky-500" />
                <h3 className="font-semibold text-sm">
                  Chunk #{inspectingChunk.chunk_index} — Details & Metadata
                </h3>
                <span className="rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  {inspectingChunk.doc_id}
                </span>
              </div>
              <button
                onClick={() => setInspectingChunk(null)}
                className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* Images in chunk */}
              {inspectingChunk.images.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Images In This Vector Chunk ({inspectingChunk.images.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {inspectingChunk.images.map((img, i) => (
                      <div
                        key={i}
                        onClick={() =>
                          setLightboxImage({
                            url: img.url,
                            alt: img.alt,
                            destination: img.destination_url,
                          })
                        }
                        className="group rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-50 dark:bg-zinc-900 p-2 cursor-pointer hover:border-sky-500 transition-colors"
                      >
                        <div className="h-28 w-full overflow-hidden rounded bg-black/10 flex items-center justify-center">
                          <img
                            src={img.url}
                            alt={img.alt}
                            className="h-full w-full object-contain group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div className="mt-1.5 truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-300" title={img.alt}>
                          {img.alt || 'Image asset'}
                        </div>
                        {img.destination_url && (
                          <div className="truncate text-[10px] text-sky-500 font-mono" title={img.destination_url}>
                            🔗 {img.destination_url}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Text Snippet */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Chunk Clean Text (Indexed in ChromaDB)
                  </h4>
                  <button
                    onClick={() => handleCopyText(inspectingChunk.text, 'clean')}
                    className="flex items-center gap-1 text-xs text-sky-500 hover:underline cursor-pointer"
                  >
                    {copiedId === 'clean' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedId === 'clean' ? 'Copied' : 'Copy Text'}
                  </button>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-3 font-mono text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap max-h-56 overflow-auto">
                  {inspectingChunk.text}
                </div>
              </div>

              {/* Raw Source Text (if different) */}
              {inspectingChunk.source_text && inspectingChunk.source_text !== inspectingChunk.text && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Original Pre-Indexing Markdown Text
                    </h4>
                    <button
                      onClick={() => handleCopyText(inspectingChunk.source_text || '', 'raw')}
                      className="flex items-center gap-1 text-xs text-sky-500 hover:underline cursor-pointer"
                    >
                      {copiedId === 'raw' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedId === 'raw' ? 'Copied' : 'Copy Markdown'}
                    </button>
                  </div>
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 p-3 font-mono text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap max-h-56 overflow-auto">
                    {inspectingChunk.source_text}
                  </div>
                </div>
              )}

              {/* ChromaDB Metadata JSON */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  ChromaDB Scalar Metadata
                </h4>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-zinc-200 p-3 font-mono text-xs overflow-auto max-h-48">
                  <pre>{JSON.stringify(inspectingChunk.metadata, null, 2)}</pre>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Lightbox Image Preview Modal */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md cursor-zoom-out"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl max-h-[85vh] rounded-xl overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col cursor-default"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 p-3 px-4">
              <span className="font-medium text-xs truncate max-w-md">{lightboxImage.alt || 'Vector Image Preview'}</span>
              <button
                onClick={() => setLightboxImage(null)}
                className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-zinc-100 dark:bg-black/40 overflow-auto">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.alt || 'vector image'}
                className="max-h-[60vh] max-w-full object-contain rounded"
              />
            </div>
            {lightboxImage.destination && (
              <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 text-xs flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
                <span className="text-zinc-500 truncate mr-2">Link: {lightboxImage.destination}</span>
                <a
                  href={lightboxImage.destination}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-sky-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-sky-500 inline-flex items-center gap-1 shrink-0"
                >
                  <ExternalLink className="h-3 w-3" /> Visit Target URL
                </a>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </div>,
    document.body,
  );
}
