import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Search, Filter, CheckCircle2, AlertCircle, Eye, EyeOff, 
  Check, CheckCheck, Layers, Link as LinkIcon, ShoppingBag, 
  Phone, MapPin, Calendar, Briefcase, RefreshCw, ArrowUpDown,
  Table as TableIcon, SlidersHorizontal, CheckSquare, Square, 
  Maximize2, Minimize2, ChevronDown
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entitiesApi, SpaceEntity, BulkEntityPatch, EntityPatch } from '../api/entities';

interface UnifiedEntityManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName?: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  offering: { label: 'Offering', icon: ShoppingBag, color: 'text-amber-500', bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  action: { label: 'Action Link', icon: LinkIcon, color: 'text-sky-500', bg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' },
  contact_channel: { label: 'Contact', icon: Phone, color: 'text-emerald-500', bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  location: { label: 'Location', icon: MapPin, color: 'text-purple-500', bg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
  portfolio_item: { label: 'Portfolio', icon: Briefcase, color: 'text-indigo-500', bg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  event: { label: 'Event', icon: Calendar, color: 'text-rose-500', bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
};

function getEntityTitle(entity: SpaceEntity): string {
  const p = entity.payload_json || {};
  return p.name || p.label || p.title || p.channel || p.address || p.heading || `Entity ${entity.id.slice(0, 8)}`;
}

function getEntitySubtitle(entity: SpaceEntity): string {
  const p = entity.payload_json || {};
  const parts: string[] = [];
  if (p.price_amount) parts.push(`${p.currency || '₹'}${p.price_amount}`);
  if (p.destination_url) parts.push(p.destination_url);
  if (p.value) parts.push(p.value);
  if (p.description) parts.push(p.description);
  if (p.kind) parts.push(`kind: ${p.kind}`);
  return parts.join(' · ') || '—';
}

export function UnifiedEntityManagerModal({
  isOpen,
  onClose,
  spaceId,
  spaceName = 'Space',
}: UnifiedEntityManagerModalProps) {
  const queryClient = useQueryClient();

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedActive, setSelectedActive] = useState<string>('all');
  const [selectedPublic, setSelectedPublic] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Query all space entities (including inactive/superseded)
  const { data: entities = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['space-entities-full', spaceId],
    queryFn: () => entitiesApi.listEntities(spaceId, true),
    enabled: isOpen && !!spaceId,
  });

  // Single Entity Patch Mutation with optimistic cache update
  const patchMutation = useMutation({
    mutationFn: ({ entityId, patch }: { entityId: string; patch: EntityPatch }) =>
      entitiesApi.updateEntity(spaceId, entityId, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<SpaceEntity[]>(['space-entities-full', spaceId], (old = []) =>
        old.map((e) => (e.id === updated.id ? updated : e))
      );
    },
  });

  // Bulk Update Mutation
  const bulkMutation = useMutation({
    mutationFn: (patch: BulkEntityPatch) => entitiesApi.bulkUpdateEntities(spaceId, patch),
    onSuccess: (updatedList) => {
      const updatedMap = new Map(updatedList.map((e) => [e.id, e]));
      queryClient.setQueryData<SpaceEntity[]>(['space-entities-full', spaceId], (old = []) =>
        old.map((e) => updatedMap.get(e.id) || e)
      );
      setSelectedIds(new Set());
    },
  });

  // Stats calculation
  const stats = useMemo(() => {
    let active = 0;
    let pub = 0;
    let confirmed = 0;
    let superseded = 0;
    entities.forEach((e) => {
      if (e.is_active) active++;
      if (e.is_public) pub++;
      if (e.review_status === 'owner_confirmed' || e.review_status === 'source_authoritative') confirmed++;
      if (e.review_status === 'superseded') superseded++;
    });
    return { total: entities.length, active, pub, confirmed, superseded };
  }, [entities]);

  // Filtered List
  const filteredEntities = useMemo(() => {
    return entities.filter((e) => {
      if (selectedType !== 'all' && e.entity_type !== selectedType) return false;
      if (selectedStatus !== 'all' && e.review_status !== selectedStatus) return false;
      if (selectedActive === 'active' && !e.is_active) return false;
      if (selectedActive === 'inactive' && e.is_active) return false;
      if (selectedPublic === 'public' && !e.is_public) return false;
      if (selectedPublic === 'private' && e.is_public) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const title = getEntityTitle(e).toLowerCase();
        const sub = getEntitySubtitle(e).toLowerCase();
        const type = (e.entity_type || '').toLowerCase();
        const status = (e.review_status || '').toLowerCase();
        return title.includes(query) || sub.includes(query) || type.includes(query) || status.includes(query);
      }
      return true;
    });
  }, [entities, selectedType, selectedStatus, selectedActive, selectedPublic, searchTerm]);

  // Selection helpers
  const allFilteredSelected = filteredEntities.length > 0 && filteredEntities.every((e) => selectedIds.has(e.id));
  const someFilteredSelected = filteredEntities.some((e) => selectedIds.has(e.id)) && !allFilteredSelected;

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntities.map((e) => e.id)));
    }
  }, [allFilteredSelected, filteredEntities]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Bulk Handlers
  const handleBulkSetStatus = (reviewStatus: string, isActive?: boolean, isPublic?: boolean) => {
    if (selectedIds.size === 0) return;
    bulkMutation.mutate({
      entity_ids: Array.from(selectedIds),
      review_status: reviewStatus,
      is_active: isActive,
      is_public: isPublic,
    });
  };

  const handleBulkToggleActive = (active: boolean) => {
    if (selectedIds.size === 0) return;
    bulkMutation.mutate({
      entity_ids: Array.from(selectedIds),
      is_active: active,
    });
  };

  const handleBulkTogglePublic = (pub: boolean) => {
    if (selectedIds.size === 0) return;
    bulkMutation.mutate({
      entity_ids: Array.from(selectedIds),
      is_public: pub,
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.99 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: 0.15 }}
          className={`relative flex flex-col overflow-hidden rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#121214] text-zinc-900 dark:text-zinc-100 shadow-2xl font-[Instrument_Sans] ${
            isFullScreen ? 'h-full w-full rounded-none' : 'h-[94vh] w-[98vw] max-w-[1600px]'
          }`}
        >
          {/* Sheets Title Bar */}
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#18181b] px-4 py-2.5 select-none">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-emerald-600 text-white shadow-xs">
                <TableIcon className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-[Satoshi] text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {spaceName} — Entities & Status Sheet
                </span>
                <span className="rounded bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-mono font-medium text-zinc-600 dark:text-zinc-400">
                  {stats.total} total rows
                </span>
              </div>
            </div>

            {/* Top Sheet Stats summary */}
            <div className="hidden md:flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-zinc-500 dark:text-zinc-400">Active:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.active}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span className="text-zinc-500 dark:text-zinc-400">Public:</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400">{stats.pub}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                <span className="text-zinc-500 dark:text-zinc-400">Confirmed:</span>
                <span className="font-semibold text-teal-600 dark:text-teal-400">{stats.confirmed}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-zinc-400" />
                <span className="text-zinc-500 dark:text-zinc-400">Superseded:</span>
                <span className="font-semibold text-zinc-500">{stats.superseded}</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh sheet data"
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
                onClick={onClose}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer ml-1"
                title="Close sheet"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Sheets Formula / Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-[#161619] px-4 py-2 text-xs">
            {/* Search Box with fx formula style */}
            <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md">
              <div className="flex items-center px-2 py-1 font-mono text-[11px] font-bold text-zinc-400 dark:text-zinc-500 select-none border-r border-zinc-300 dark:border-zinc-700">
                fx
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter by name, price, URL, type, or status..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-3 py-1 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none"
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

            {/* Quick Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="all">All Types</option>
                <option value="offering">Offering</option>
                <option value="action">Action Link</option>
                <option value="contact_channel">Contact</option>
                <option value="location">Location</option>
                <option value="portfolio_item">Portfolio</option>
                <option value="event">Event</option>
              </select>

              <select
                value={selectedActive}
                onChange={(e) => setSelectedActive(e.target.value)}
                className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="all">Active: All</option>
                <option value="active">Active Only (✓)</option>
                <option value="inactive">Inactive Only (✗)</option>
              </select>

              <select
                value={selectedPublic}
                onChange={(e) => setSelectedPublic(e.target.value)}
                className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="all">Public: All</option>
                <option value="public">Public in Aura</option>
                <option value="private">Private (Hidden)</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="all">Status: All</option>
                <option value="owner_confirmed">Confirmed</option>
                <option value="extracted">Extracted</option>
                <option value="superseded">Superseded</option>
                <option value="rejected">Rejected</option>
                <option value="source_authoritative">Authoritative</option>
              </select>

              {(selectedType !== 'all' || selectedStatus !== 'all' || selectedActive !== 'all' || selectedPublic !== 'all' || searchTerm) && (
                <button
                  onClick={() => {
                    setSelectedType('all');
                    setSelectedStatus('all');
                    setSelectedActive('all');
                    setSelectedPublic('all');
                    setSearchTerm('');
                  }}
                  className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Selection Info / Bulk Action Quick Buttons */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-300 dark:border-zinc-700 animate-fadeIn">
                <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => handleBulkSetStatus('owner_confirmed', true, true)}
                  disabled={bulkMutation.isPending}
                  className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                  title="Make all selected active, public, and confirmed"
                >
                  <CheckCheck className="h-3 w-3" /> Make Live
                </button>
                <button
                  onClick={() => handleBulkToggleActive(true)}
                  disabled={bulkMutation.isPending}
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Activate
                </button>
                <button
                  onClick={() => handleBulkToggleActive(false)}
                  disabled={bulkMutation.isPending}
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Deactivate
                </button>
                <button
                  onClick={() => handleBulkSetStatus('superseded', false, false)}
                  disabled={bulkMutation.isPending}
                  className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Supersede
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Sheets Grid Table Container */}
          <div className="flex-1 overflow-auto bg-white dark:bg-[#121214]">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center text-sm font-mono text-zinc-400 animate-pulse">
                Loading spreadsheet data...
              </div>
            ) : filteredEntities.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-sm text-zinc-400">
                <AlertCircle className="h-6 w-6 text-zinc-400 mb-2 opacity-60" />
                <span>No matching rows found in this sheet.</span>
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                {/* Sheets Column Headers */}
                <thead className="sticky top-0 z-20 select-none bg-zinc-100 dark:bg-[#18181b] text-zinc-600 dark:text-zinc-400 font-mono text-[11px] font-semibold">
                  <tr>
                    {/* Row Number Header & Select All Checkbox */}
                    <th className="w-14 min-w-[56px] px-2 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800 bg-zinc-200/70 dark:bg-zinc-900/90">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={toggleSelectAll}
                          className="flex items-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                          title={allFilteredSelected ? 'Deselect all rows' : 'Select all rows'}
                        >
                          {allFilteredSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                          ) : someFilteredSelected ? (
                            <div className="h-3.5 w-3.5 rounded border border-emerald-600 bg-emerald-600/30 flex items-center justify-center">
                              <span className="h-1 w-1 bg-emerald-600 rounded-xs"></span>
                            </div>
                          ) : (
                            <Square className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                        </button>
                        <span className="text-[10px] text-zinc-400">#</span>
                      </div>
                    </th>

                    <th className="w-28 min-w-[110px] px-3 py-2 border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">A</span> Type
                    </th>

                    <th className="min-w-[240px] px-3 py-2 border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">B</span> Name / Title
                    </th>

                    <th className="min-w-[260px] px-3 py-2 border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">C</span> Details / Metadata
                    </th>

                    <th className="w-24 min-w-[96px] px-2 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">D</span> Active
                    </th>

                    <th className="w-24 min-w-[96px] px-2 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">E</span> Public
                    </th>

                    <th className="w-40 min-w-[160px] px-3 py-2 border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">F</span> Review Status
                    </th>

                    <th className="w-28 min-w-[110px] px-2 py-2 text-center border-r border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">G</span> Aura Live
                    </th>

                    <th className="w-28 min-w-[110px] px-3 py-2 text-center border-b border-zinc-300 dark:border-zinc-800">
                      <span className="text-zinc-400 font-normal mr-1">H</span> Action
                    </th>
                  </tr>
                </thead>

                {/* Sheets Table Rows */}
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredEntities.map((entity, index) => {
                    const isSelected = selectedIds.has(entity.id);
                    const typeCfg = TYPE_CONFIG[entity.entity_type] || {
                      label: entity.entity_type,
                      icon: Layers,
                      color: 'text-zinc-500',
                      bg: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
                    };
                    const TypeIcon = typeCfg.icon;
                    const isLive = entity.is_active && entity.is_public && ['owner_confirmed', 'source_authoritative'].includes(entity.review_status);

                    return (
                      <tr
                        key={entity.id}
                        className={`transition-colors group h-9 ${
                          isSelected
                            ? 'bg-blue-50/70 dark:bg-blue-950/30'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                        }`}
                      >
                        {/* Row Index & Select Checkbox */}
                        <td className="w-14 min-w-[56px] px-2 py-1.5 text-center font-mono text-[11px] text-zinc-400 dark:text-zinc-500 border-r border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 select-none">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => toggleSelectRow(entity.id)}
                              className="cursor-pointer text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Square className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400" />
                              )}
                            </button>
                            <span className="w-5 text-right">{index + 1}</span>
                          </div>
                        </td>

                        {/* Column A: Type */}
                        <td className="px-3 py-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${typeCfg.bg}`}>
                            <TypeIcon className="h-3 w-3" />
                            {typeCfg.label}
                          </span>
                        </td>

                        {/* Column B: Name / Title */}
                        <td className="px-3 py-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 max-w-[280px]">
                          <div className="truncate font-medium text-zinc-900 dark:text-zinc-100 text-xs" title={getEntityTitle(entity)}>
                            {getEntityTitle(entity)}
                          </div>
                        </td>

                        {/* Column C: Details / Metadata */}
                        <td className="px-3 py-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 max-w-[320px]">
                          <div className="truncate text-zinc-500 dark:text-zinc-400 text-[11px] font-mono" title={getEntitySubtitle(entity)}>
                            {getEntitySubtitle(entity)}
                          </div>
                        </td>

                        {/* Column D: Active (Space) Checkbox Cell */}
                        <td
                          onClick={() =>
                            patchMutation.mutate({
                              entityId: entity.id,
                              patch: { is_active: !entity.is_active, expected_revision: entity.revision },
                            })
                          }
                          className="px-2 py-1.5 text-center border-r border-b border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors"
                          title="Click cell to toggle Active status"
                        >
                          <input
                            type="checkbox"
                            checked={!!entity.is_active}
                            onChange={() => {}} // Handled by parent td onClick
                            className="h-4 w-4 rounded accent-emerald-600 cursor-pointer align-middle"
                          />
                        </td>

                        {/* Column E: Public (Aura) Checkbox Cell */}
                        <td
                          onClick={() =>
                            patchMutation.mutate({
                              entityId: entity.id,
                              patch: { is_public: !entity.is_public, expected_revision: entity.revision },
                            })
                          }
                          className="px-2 py-1.5 text-center border-r border-b border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition-colors"
                          title="Click cell to toggle Public Aura status"
                        >
                          <input
                            type="checkbox"
                            checked={!!entity.is_public}
                            onChange={() => {}} // Handled by parent td onClick
                            className="h-4 w-4 rounded accent-sky-600 cursor-pointer align-middle"
                          />
                        </td>

                        {/* Column F: Review Status Cell */}
                        <td className="px-2 py-1 border-r border-b border-zinc-200 dark:border-zinc-800">
                          <select
                            value={entity.review_status}
                            onChange={(e) =>
                              patchMutation.mutate({
                                entityId: entity.id,
                                patch: { review_status: e.target.value, expected_revision: entity.revision },
                              })
                            }
                            className={`w-full rounded border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 bg-transparent px-2 py-1 text-xs font-mono focus:bg-white dark:focus:bg-zinc-800 focus:outline-none cursor-pointer transition-colors ${
                              entity.review_status === 'owner_confirmed'
                                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                : entity.review_status === 'source_authoritative'
                                ? 'text-teal-600 dark:text-teal-400 font-semibold'
                                : entity.review_status === 'extracted'
                                ? 'text-amber-600 dark:text-amber-400'
                                : entity.review_status === 'superseded'
                                ? 'text-zinc-400 line-through'
                                : 'text-rose-500'
                            }`}
                          >
                            <option value="owner_confirmed" className="bg-white dark:bg-zinc-900 text-emerald-600 font-normal">
                              owner_confirmed
                            </option>
                            <option value="source_authoritative" className="bg-white dark:bg-zinc-900 text-teal-600 font-normal">
                              source_authoritative
                            </option>
                            <option value="extracted" className="bg-white dark:bg-zinc-900 text-amber-600 font-normal">
                              extracted (candidate)
                            </option>
                            <option value="superseded" className="bg-white dark:bg-zinc-900 text-zinc-400 font-normal">
                              superseded
                            </option>
                            <option value="rejected" className="bg-white dark:bg-zinc-900 text-rose-600 font-normal">
                              rejected
                            </option>
                          </select>
                        </td>

                        {/* Column G: Aura Live Indicator */}
                        <td className="px-2 py-1.5 text-center border-r border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                          {isLive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Live
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                              Hidden
                            </span>
                          )}
                        </td>

                        {/* Column H: Action Button */}
                        <td className="px-2 py-1 text-center border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                          {!isLive ? (
                            <button
                              onClick={() =>
                                patchMutation.mutate({
                                  entityId: entity.id,
                                  patch: {
                                    review_status: 'owner_confirmed',
                                    is_active: true,
                                    is_public: true,
                                    expected_revision: entity.revision,
                                  },
                                })
                              }
                              className="rounded bg-emerald-600/10 hover:bg-emerald-600 text-emerald-600 hover:text-white px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer border border-emerald-500/20"
                              title="Make active, public, and confirmed in one click"
                            >
                              ⚡ Make Live
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono text-zinc-400">
                              ✓ Ready
                            </span>
                          )}
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
                Showing <strong className="text-zinc-800 dark:text-zinc-200">{filteredEntities.length}</strong> of {entities.length} rows
              </span>
              {selectedIds.size > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {selectedIds.size} rows selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span>Tip: Click checkboxes in columns D & E to instantly toggle Active & Public status</span>
              <span>·</span>
              <kbd className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300">
                ESC
              </kbd>{' '}
              to close
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
