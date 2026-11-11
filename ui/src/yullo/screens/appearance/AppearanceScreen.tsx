import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { appearanceApi, type AppearanceAsset, type AppearanceCandidate, type AppearanceRebuildLayoutResponse, type AppearanceResponse } from '../../api/appearance'
import { formsApi } from '../../api/forms'
import { YulloAppHeader } from '../../components/YulloAppHeader'
import { AppearanceCanvas } from './components/AppearanceCanvas'
import { AppearanceHeader } from './components/AppearanceHeader'
import { AppearanceInspector } from './components/inspector/AppearanceInspector'
import { MobileModeSwitcher, type MobileMode } from './components/MobileModeSwitcher'
import type { PreviewDevice } from './components/DeviceSwitcher'
import { useAppearanceHistory } from './hooks/useAppearanceHistory'
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard'
import { defaultPresentationConfig } from './presentation/schema'
import type { SpacePurpose } from './presentation/presets'
import type { AppearancePreviewItem, PreviewSectionType } from './preview/types'
import { useAppearancePreview } from './preview/useAppearancePreview'
import { createAppearancePreviewFixtures } from './preview/fixtures'
import { mergeAppearancePreview } from './preview/mergePreviewContent'
import { SectionDataModal } from './preview/SectionDataModal'
import { LayoutConfirmModal } from './preview/LayoutConfirmModal'
import { AssetPickerModal, type ImagePickerTarget } from './components/AssetPickerModal'
import './appearance.css'
import { SectionEditorContext } from './preview/SectionEditorContext'
import { resolvePresentationConfig } from './presentation/presentationResolver'

export function AppearanceScreen() {
  const { spaceId = '' } = useParams<{ spaceId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['yullo', 'appearance', spaceId],
    queryFn: () => appearanceApi.get(spaceId),
    enabled: Boolean(spaceId),
  })
  const history = useAppearanceHistory(defaultPresentationConfig())
  const loadedRevision = useRef<number | null>(null)
  const loadedSpace = useRef('')
  const loadedConfig = useRef('')
  const currentSpace = useRef(spaceId)
  currentSpace.current = spaceId
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [mobileMode, setMobileMode] = useState<MobileMode>('preview')
  const [isCompactLayout, setIsCompactLayout] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches,
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [assetError, setAssetError] = useState('')
  const [assetNotice, setAssetNotice] = useState('')
  const [imagePickerTarget, setImagePickerTarget] = useState<(ImagePickerTarget & { review?: boolean }) | null>(null)
  const [modifiedSectionTypes, setModifiedSectionTypes] = useState<Set<PreviewSectionType>>(new Set())
  const [discardSavedDraft, setDiscardSavedDraft] = useState(false)

  const spaceSummary = useMemo(() => {
    return { name: query.data?.space.displayName || 'This Space' }
  }, [query.data])

  const {
    state: previewState,
    generatePreview,
    clearPreview,
    clearSectionDraft,
    updateItemImage,
    updateSectionHeading,
    updateSectionItem,
    setPreviewContent,
  } = useAppearancePreview(spaceId, history.draft)
  const [layoutModalData, setLayoutModalData] = useState<AppearanceRebuildLayoutResponse | null>(null)
  const [isRebuildingLayout, setIsRebuildingLayout] = useState(false)
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false)
  const initializedSpace = useRef<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)
  useEffect(() => {
    setIsInitializing(false)
    setModifiedSectionTypes(new Set())
    setDiscardSavedDraft(false)
    setLayoutModalData(null)
    setIsLayoutModalOpen(false)
    setError('')
  }, [spaceId])
  const livePreview = useQuery({
    queryKey: ['yullo', 'appearance-live-preview', spaceId],
    queryFn: () => appearanceApi.getLivePreview(spaceId),
    enabled: Boolean(spaceId),
  })
  const [exampleVisibility, setExampleVisibility] = useState<Partial<Record<PreviewSectionType, boolean>>>({})
  useEffect(() => setExampleVisibility({}), [spaceId])
  const [buildingSection, setBuildingSection] = useState<PreviewSectionType | undefined>()

  const previewContent = useMemo(() => {
    if (!query.data) return undefined
    const fixture = createAppearancePreviewFixtures(query.data.space.purpose as SpacePurpose, spaceSummary)
    // The preview starts with actual live content. Examples are opt-in below;
    // filling missing live sections with fixtures misrepresents the public page.
    const base = livePreview.data || { schemaVersion: 1 as const, sections: [] }
    const withSavedDraft = mergeAppearancePreview(base, discardSavedDraft ? null : query.data.editorDraft?.previewContent || null)
    const withDraft = mergeAppearancePreview(withSavedDraft, previewState.content)
    const sections = withDraft.sections.filter((section) =>
      exampleVisibility[section.type] !== false || section.items.some((item) => item.source === 'grounded'),
    )
    for (const type of Object.keys(exampleVisibility) as PreviewSectionType[]) {
      if (!exampleVisibility[type]) continue
      const example = fixture.sections.find((section) => section.type === type)
      if (!example) continue
      const index = sections.findIndex((section) => section.type === type)
      if (index >= 0) sections[index] = example
      else sections.push(example)
    }
    return {
      ...withDraft,
      sections,
    }
  }, [query.data, spaceSummary, livePreview.data, previewState.content, exampleVisibility, discardSavedDraft])
  const exampleSections = previewContent?.sections
    .filter((section) => section.items.some((item) => item.source === 'example'))
    .map((section) => section.type) || []

  const [activeModalSection, setActiveModalSection] = useState<PreviewSectionType | null>(null)

  const applySection = useMutation({
    mutationFn: (targetSection?: any) => {
      const section = targetSection || (activeModalSection
        ? previewState.content?.sections.find((s) => s.type === activeModalSection)
        : previewState.content?.sections[0])
      if (!section) throw new Error('No generated section to apply')
      return appearanceApi.applyPreviewSection(spaceId, section)
    },
    onSuccess: async (content, targetSection) => {
      queryClient.setQueryData(['yullo', 'appearance-live-preview', spaceId], content)
      const sectionType = targetSection?.type || activeModalSection
      if (sectionType) {
        clearSectionDraft(sectionType)
      } else {
        clearPreview()
      }
      setActiveModalSection(null)
      setError('')
      try {
        const updated = await appearanceApi.get(spaceId)
        // Applying content advances the revision without replacing layout edits.
        loadedRevision.current = updated.revision
        queryClient.setQueryData(['yullo', 'appearance', spaceId], updated)
      } catch {
        setError('Section applied. Refresh before saving appearance changes.')
      }
    },
    onError: (reason: any) => setError(reason?.response?.data?.detail || 'Could not apply this section.'),
  })

  const handlePullSectionData = useCallback((type: PreviewSectionType) => {
    if (!history.draft.sections.some((section) => section.type === type && section.visible)) return
    setExampleVisibility((current) => {
      const next = { ...current }
      delete next[type]
      return next
    })
    setBuildingSection(type)
    void generatePreview(false, type)
      .then(() => {
        setActiveModalSection(type)
      })
      .finally(() => setBuildingSection(undefined))
  }, [history.draft.sections, generatePreview])

  const handleReviewDraft = useCallback((type: PreviewSectionType) => {
    setActiveModalSection(type)
  }, [])

  const handleConfirmSectionData = useCallback(() => {
    applySection.mutate(undefined, {
      onSuccess: () => {
        setActiveModalSection(null)
      },
    })
  }, [applySection])

  const handleCancelSectionData = useCallback(() => {
    if (activeModalSection) {
      clearSectionDraft(activeModalSection)
    }
    setActiveModalSection(null)
  }, [activeModalSection, clearSectionDraft])

  const handleUploadItemImage = useCallback(
    async (sectionType: PreviewSectionType, itemKey: string, file: File, review = false) => {
      try {
        const asset = await appearanceApi.uploadAsset(spaceId, file)
        if (asset?.url) {
          const currentSection = previewContent?.sections.find((s) => s.type === sectionType)
          updateItemImage(sectionType, itemKey, asset.url, asset.id, currentSection)
          if (!review) setModifiedSectionTypes((prev) => new Set(prev).add(sectionType))
          queryClient.invalidateQueries({ queryKey: ['yullo', 'appearance', spaceId] })
        }
      } catch {
        throw new Error('Could not upload this image. Please try again.')
      }
    },
    [spaceId, updateItemImage, queryClient, previewContent],
  )

  const handleUpdateSectionHeading = useCallback(
    (sectionType: PreviewSectionType, newHeading: string) => {
      const currentSection = previewContent?.sections.find((s) => s.type === sectionType)
      updateSectionHeading(sectionType, newHeading, currentSection)
      setModifiedSectionTypes((prev) => new Set(prev).add(sectionType))
    },
    [previewContent, updateSectionHeading],
  )

  const handleUpdateSectionItem = useCallback(
    (
      sectionType: PreviewSectionType,
      itemKey: string,
      updates: Partial<Pick<AppearancePreviewItem, 'title' | 'description' | 'meta'>>,
    ) => {
      const currentSection = previewContent?.sections.find((s) => s.type === sectionType)
      updateSectionItem(sectionType, itemKey, updates, currentSection)
      setModifiedSectionTypes((prev) => new Set(prev).add(sectionType))
    },
    [previewContent, updateSectionItem],
  )

  const modalSectionData = useMemo(() => {
    if (!activeModalSection) return null
    return previewState.content?.sections.find((s) => s.type === activeModalSection) || null
  }, [activeModalSection, previewState.content])

  const modalSectionLabel = useMemo(() => {
    if (!activeModalSection) return ''
    return activeModalSection === 'portfolio' ? 'Selected work' : activeModalSection.replace(/_/g, ' ')
  }, [activeModalSection])

  useEffect(() => {
    if (query.data && (loadedSpace.current !== spaceId || loadedRevision.current !== query.data.revision)) {
      const next = resolvePresentationConfig(query.data.effectiveConfig)
      // A slow initialization/refetch must not overwrite edits made while it ran.
      if (loadedSpace.current !== spaceId || JSON.stringify(history.draft) === loadedConfig.current) {
        history.replace(next)
      }
      loadedSpace.current = spaceId
      loadedConfig.current = JSON.stringify(next)
      loadedRevision.current = query.data.revision
    }
  }, [spaceId, query.data, history.draft, history.replace])

  const handleRebuildLayout = useCallback(async (force = true) => {
    setIsRebuildingLayout(true)
    setIsLayoutModalOpen(true)
    setError('')
    try {
      const result = await appearanceApi.rebuildLayout(spaceId, force)
      setLayoutModalData(result)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not rebuild layout.')
    } finally {
      setIsRebuildingLayout(false)
    }
  }, [spaceId])

  const handleConfirmRebuiltLayout = useCallback(() => {
    if (!layoutModalData) return
    setDiscardSavedDraft(Boolean(query.data?.editorDraft))
    history.apply(layoutModalData.config)
    if (layoutModalData.previewContent) {
      setPreviewContent(layoutModalData.previewContent, layoutModalData.explanation)
      setModifiedSectionTypes(
        (prev) => new Set([...prev, ...layoutModalData.previewContent.sections.map((s) => s.type)]),
      )
    }
    setIsLayoutModalOpen(false)
    setLayoutModalData(null)
  }, [layoutModalData, history, setPreviewContent, query.data?.editorDraft])

  const handleCancelRebuiltLayout = useCallback(() => {
    setIsLayoutModalOpen(false)
    setLayoutModalData(null)
  }, [])

  useEffect(() => {
    if (
      query.data &&
      !query.data.appearanceInitialized &&
      initializedSpace.current !== spaceId &&
      query.data.publishedConfig.presentationSource === 'default'
    ) {
      initializedSpace.current = spaceId
      setIsInitializing(true)
      void appearanceApi.initialize(spaceId)
        .then((result) => queryClient.setQueryData(['yullo', 'appearance', spaceId], result))
        .catch(() => {
          if (currentSpace.current === spaceId) setError('Could not prepare your appearance. Try Rebuild layout.')
        })
        .finally(() => {
          if (currentSpace.current === spaceId) setIsInitializing(false)
        })
    }
  }, [spaceId, query.data, queryClient])

  const dirty = useMemo(() => {
    const configDirty = Boolean(query.data) && JSON.stringify(history.draft) !== JSON.stringify(resolvePresentationConfig(query.data?.publishedConfig))
    return configDirty || modifiedSectionTypes.size > 0 || discardSavedDraft || Boolean(query.data?.editorDraft?.previewContent.sections.length)
  }, [history.draft, query.data, modifiedSectionTypes, discardSavedDraft])
  const unsavedEdits = Boolean(query.data) && (
    JSON.stringify(history.draft) !== JSON.stringify(resolvePresentationConfig(query.data!.effectiveConfig))
    || modifiedSectionTypes.size > 0 || discardSavedDraft
  )
  const confirmLeave = useUnsavedChangesGuard(unsavedEdits)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)')
    const syncLayout = () => setIsCompactLayout(media.matches)
    syncLayout()
    media.addEventListener('change', syncLayout)
    return () => media.removeEventListener('change', syncLayout)
  }, [])
  const save = useMutation({
    mutationFn: async () => {
      let result = query.data!
      const configDirty = JSON.stringify(history.draft) !== JSON.stringify(resolvePresentationConfig(query.data?.publishedConfig))
      if (configDirty || discardSavedDraft) {
        result = await appearanceApi.save(spaceId, history.draft, loadedRevision.current ?? query.data!.revision, discardSavedDraft)
      }
      const pendingTypes = new Set([
        ...(!discardSavedDraft ? query.data?.editorDraft?.previewContent.sections.map((section) => section.type) || [] : []),
        ...modifiedSectionTypes,
      ])
      if (pendingTypes.size > 0) {
        for (const type of pendingTypes) {
          const section =
            previewState.content?.sections.find((s) => s.type === type) ||
            previewContent?.sections.find((s) => s.type === type)
          if (section) {
            const updatedContent = await appearanceApi.applyPreviewSection(spaceId, section)
            queryClient.setQueryData(['yullo', 'appearance-live-preview', spaceId], updatedContent)
          }
        }
        result = await appearanceApi.get(spaceId)
      }
      return result
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['yullo', 'appearance', spaceId], result)
      history.replace(resolvePresentationConfig(result.effectiveConfig))
      loadedConfig.current = JSON.stringify(resolvePresentationConfig(result.effectiveConfig))
      loadedRevision.current = result.revision
      setModifiedSectionTypes(new Set())
      setDiscardSavedDraft(false)
      clearPreview()
      setError('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 900)
    },
    onError: (reason: any) =>
      setError(
        reason?.response?.data?.detail?.message ||
          reason?.response?.data?.detail ||
          'Could not save appearance. Your draft is unchanged.',
      ),
  })

  const applyAura = (candidate: AppearanceCandidate) => history.apply(candidate.config)

  const toggleLive = useMutation({
    mutationFn: () => formsApi.toggleLive(spaceId, query.data?.space.status !== 'live'),
    onSuccess: (identity) => {
      queryClient.setQueryData<AppearanceResponse>(['yullo', 'appearance', spaceId], (current) => current ? { ...current, space: { ...current.space, status: identity.status || current.space.status } } : current)
      queryClient.setQueryData(['identity', spaceId], identity)
      setError('')
    },
    onError: () => setError('Could not change public link visibility.'),
  })

  const upload = useMutation({
    mutationFn: async (files: File[]) => Promise.all(files.map((file) => appearanceApi.uploadAsset(spaceId, file))),
    onSuccess: (assets) => {
      queryClient.setQueryData<AppearanceResponse>(['yullo', 'appearance', spaceId], (current) => current ? { ...current, assets: [...assets, ...current.assets] } : current)
      if (assets[0]) history.apply({ ...history.draft, hero: { ...history.draft.hero, assetId: assets[0].id } })
      setAssetError('')
      setAssetNotice('Image uploaded. Save appearance to publish its placement.')
    },
    onError: (reason: any) => setAssetError(reason?.response?.data?.detail || 'Could not add this image.'),
  })

  const removeAsset = useMutation({
    mutationFn: (asset: AppearanceAsset) => appearanceApi.removeAsset(spaceId, asset.id).then(() => asset),
    onSuccess: (asset) => {
      queryClient.setQueryData<AppearanceResponse>(['yullo', 'appearance', spaceId], (current) => current ? { ...current, assets: current.assets.filter((item) => item.id !== asset.id) } : current)
      if (history.draft.hero.assetId === asset.id) history.apply({ ...history.draft, hero: { ...history.draft.hero, assetId: null }, backgroundTreatment: history.draft.backgroundTreatment === 'image' ? 'soft' : history.draft.backgroundTreatment })
      setAssetError('')
      setAssetNotice('Image deleted.')
    },
    onError: (reason: any) => setAssetError(reason?.response?.data?.detail || 'Could not remove this image.'),
  })

  const updateAsset = useMutation({
    mutationFn: ({ asset, altText }: { asset: AppearanceAsset; altText: string }) => appearanceApi.updateAsset(spaceId, asset.id, altText.trim() || null),
    onSuccess: (asset) => {
      queryClient.setQueryData<AppearanceResponse>(['yullo', 'appearance', spaceId], (current) => current ? { ...current, assets: current.assets.map((item) => item.id === asset.id ? asset : item) } : current)
      setAssetError('')
    },
    onError: (reason: any) => setAssetError(reason?.response?.data?.detail || 'Could not update the image description.'),
  })

  const handleSelectModalAsset = useCallback(
    (asset: AppearanceAsset) => {
      if (!imagePickerTarget) return
      if (imagePickerTarget.itemKey === 'hero') {
        history.apply({
          ...history.draft,
          hero: {
            ...history.draft.hero,
            assetId: asset.id,
            layout: history.draft.hero.layout === 'centered' ? 'image_right' : history.draft.hero.layout,
          },
          backgroundTreatment: history.draft.backgroundTreatment === 'image' ? 'image' : history.draft.backgroundTreatment,
        })
      } else {
        const currentSection = previewContent?.sections.find((s) => s.type === imagePickerTarget.sectionType)
        updateItemImage(imagePickerTarget.sectionType, imagePickerTarget.itemKey, asset.url, asset.id, currentSection)
        if (!imagePickerTarget.review) setModifiedSectionTypes((prev) => new Set(prev).add(imagePickerTarget.sectionType))
      }
      setImagePickerTarget(null)
    },
    [imagePickerTarget, history, updateItemImage, previewContent],
  )

  const handleUploadModalFile = useCallback(
    async (file: File) => {
      if (!imagePickerTarget) return
      if (imagePickerTarget.itemKey === 'hero') {
        try {
          await upload.mutateAsync([file])
        } catch {
          throw new Error('Could not upload this image. Please try again.')
        }
      } else {
        await handleUploadItemImage(imagePickerTarget.sectionType, imagePickerTarget.itemKey, file, imagePickerTarget.review)
      }
      setImagePickerTarget(null)
    },
    [imagePickerTarget, upload, handleUploadItemImage],
  )

  const handleRemoveModalImage = useCallback(() => {
    if (!imagePickerTarget) return
    if (imagePickerTarget.itemKey === 'hero') {
      history.apply({
        ...history.draft,
        hero: { ...history.draft.hero, assetId: null },
        backgroundTreatment: history.draft.backgroundTreatment === 'image' ? 'soft' : history.draft.backgroundTreatment,
      })
    } else {
      const currentSection = previewContent?.sections.find((s) => s.type === imagePickerTarget.sectionType)
      updateItemImage(imagePickerTarget.sectionType, imagePickerTarget.itemKey, '', undefined, currentSection)
      if (!imagePickerTarget.review) setModifiedSectionTypes((prev) => new Set(prev).add(imagePickerTarget.sectionType))
    }
    setImagePickerTarget(null)
  }, [imagePickerTarget, history, updateItemImage, previewContent])

  if (query.isLoading) return <div className="yullo-app min-h-screen bg-[var(--canvas)]"><YulloAppHeader spaceId={spaceId} /><div className="p-8 text-sm text-[var(--text-secondary)]">Loading appearance…</div></div>
  if (query.isError || !query.data) return <div className="yullo-app min-h-screen bg-[var(--canvas)]"><YulloAppHeader spaceId={spaceId} /><div className="p-8"><p>Could not load appearance.</p><button className="mt-4 underline" onClick={() => navigate(-1)}>Go back</button></div></div>

  const inactive = (mode: MobileMode) => (
    isCompactLayout && mobileMode !== mode ? { inert: '' } : {}
  ) as any

  const handleRemoveAsset = (asset: AppearanceAsset) => {
    if (history.draft.hero.assetId === asset.id) {
      history.apply({ ...history.draft, hero: { ...history.draft.hero, assetId: null }, backgroundTreatment: history.draft.backgroundTreatment === 'image' ? 'soft' : history.draft.backgroundTreatment })
      setAssetNotice('Removed from this draft. Save appearance before deleting the image.')
      return
    }
    if (query.data.publishedConfig.hero.assetId === asset.id) {
      setAssetError('Save the new appearance before deleting this image.')
      return
    }
    if (window.confirm(`Delete ${asset.filename}?`)) removeAsset.mutate(asset)
  }

  return (
    <div className="yullo-app appearance-page min-h-screen bg-[var(--canvas)] text-[var(--text-primary)]">
      <YulloAppHeader spaceId={spaceId} />
      <AppearanceHeader
        space={query.data.space}
        dirty={dirty}
        draftSaved={Boolean(query.data.editorDraft) && !unsavedEdits}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        saving={save.isPending || isInitializing}
        saved={saved}
        togglingLive={toggleLive.isPending}
        onBack={() => confirmLeave() && navigate(`/yullo/spaces/${spaceId}`)}
        onToggleLive={() => toggleLive.mutate()}
        onUndo={history.undo}
        onRedo={history.redo}
        onReset={() => {
          history.replace(resolvePresentationConfig(query.data.publishedConfig))
          clearPreview()
          setModifiedSectionTypes(new Set())
          setDiscardSavedDraft(Boolean(query.data.editorDraft))
        }}
        onSave={() => save.mutate()}
      />
      {error && <div className="appearance-error" role="alert">{error}</div>}
      <MobileModeSwitcher value={mobileMode} onChange={setMobileMode} />
      <main className="appearance-shell">
        <div className={`appearance-mode appearance-preview-mode ${mobileMode === 'preview' ? 'is-active' : ''}`} aria-hidden={isCompactLayout && mobileMode !== 'preview'} {...inactive('preview')}>
          <SectionEditorContext.Provider value={{
            generating: previewState.isGenerating || isInitializing,
            toggle: (type) => history.apply({ ...history.draft, sections: history.draft.sections.map((section) => section.type === type ? { ...section, visible: !section.visible } : section) }),
            build: handlePullSectionData,
            uploadItemImage: handleUploadItemImage,
            openImagePicker: (target) => setImagePickerTarget(target),
            updateSectionHeading: handleUpdateSectionHeading,
            updateSectionItem: handleUpdateSectionItem,
          }}>
            {/* Keep zoom and scroll when draft content changes. */}
            <AppearanceCanvas key={spaceId} space={query.data.space} config={history.draft} assets={query.data.assets} device={device} onDeviceChange={setDevice} previewContent={previewContent} isGenerating={previewState.isGenerating || isInitializing} />
          </SectionEditorContext.Provider>
        </div>
        <div className={`appearance-mode appearance-customize-mode ${mobileMode === 'customize' ? 'is-active' : ''}`} aria-hidden={isCompactLayout && mobileMode !== 'customize'} {...inactive('customize')}>
          <AppearanceInspector 
            spaceId={spaceId} 
            purpose={query.data.space.purpose as SpacePurpose} 
            config={history.draft} 
            assets={query.data.assets} 
            assetUploading={upload.isPending} 
            assetError={assetError} 
            assetNotice={assetNotice}
            previewStatus={previewState.status === 'idle' && query.data.editorDraft ? 'ready' : previewState.status}
            previewGenerating={previewState.isGenerating || isRebuildingLayout || isInitializing}
            previewGroundedCount={(previewState.content || (!discardSavedDraft ? query.data.editorDraft?.previewContent : null))?.sections.reduce((acc, section) => acc + section.items.filter((item) => item.source === 'grounded').length, 0) || 0}
            previewLastUpdate={previewState.lastUpdate}
            previewExplanation={previewState.explanation || query.data.editorDraft?.explanation}
            previewContent={previewContent}
            onPreviewRebuild={() => void handleRebuildLayout(true)}
            previewDraftTypes={previewState.content?.sections.map((s) => s.type) || (buildingSection ? [buildingSection] : [])}
            previewApplying={applySection.isPending}
            exampleSections={exampleSections}
            onToggleExample={(type) => setExampleVisibility((current) => ({ ...current, [type]: !exampleSections.includes(type) }))}
            onBuildSection={handlePullSectionData}
            onApplySection={(type) => {
              const target = previewState.content?.sections.find((s) => s.type === type)
              if (target) applySection.mutate(target)
            }}
            onDiscardSection={(type) => {
              if (type) clearSectionDraft(type)
              else clearPreview()
            }}
            onReviewDraftSection={handleReviewDraft}
            onChange={history.apply} 
            onAuraApply={applyAura} 
            onUpload={(files) => upload.mutate(files)} 
            onRemoveAsset={handleRemoveAsset}
            onAssetAltText={(asset, altText) => updateAsset.mutate({ asset, altText })} 
            onOpenAssetPicker={() =>
              setImagePickerTarget({
                sectionType: 'hero' as any,
                itemKey: 'hero',
                itemTitle: 'Opening image',
                currentImageUrl: query.data.assets.find((a) => a.id === history.draft.hero.assetId)?.url,
              })
            }
          />
        </div>
      </main>
      <div className="appearance-mobile-savebar">
        <span>{unsavedEdits ? 'Unsaved changes' : query.data.editorDraft ? 'Draft saved' : query.data.space.status === 'live' ? 'Public link is live' : 'Public link is private'}</span>
        <button className="appearance-save" onClick={() => save.mutate()} disabled={!dirty || save.isPending || isInitializing}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
      <SectionDataModal
        isOpen={Boolean(activeModalSection)}
        sectionType={activeModalSection}
        sectionLabel={modalSectionLabel}
        isLoading={previewState.isGenerating || buildingSection === activeModalSection}
        isApplying={applySection.isPending}
        sectionData={modalSectionData}
        assets={query.data.assets}
        explanation={previewState.explanation}
        status={previewState.status}
        onConfirm={handleConfirmSectionData}
        onCancel={handleCancelSectionData}
        onChooseImage={(item) => {
          if (activeModalSection) setImagePickerTarget({ sectionType: activeModalSection, itemKey: item.key, itemTitle: item.title, currentImageUrl: item.imageUrl, review: true })
        }}
        onRemoveImage={(item) => {
          if (activeModalSection) updateItemImage(activeModalSection, item.key, '', undefined, modalSectionData || undefined)
        }}
      />
      <LayoutConfirmModal
        isOpen={isLayoutModalOpen}
        isLoading={isRebuildingLayout}
        config={layoutModalData?.config}
        previewContent={layoutModalData?.previewContent}
        explanation={layoutModalData?.explanation || error}
        status={isRebuildingLayout ? 'idle' : layoutModalData ? 'ready' : 'unavailable'}
        onConfirm={handleConfirmRebuiltLayout}
        onCancel={handleCancelRebuiltLayout}
      />
      <AssetPickerModal
        isOpen={Boolean(imagePickerTarget)}
        target={imagePickerTarget}
        assets={query.data?.assets || []}
        isUploading={upload.isPending}
        onClose={() => setImagePickerTarget(null)}
        onSelectAsset={handleSelectModalAsset}
        onUploadFile={handleUploadModalFile}
        onRemoveImage={handleRemoveModalImage}
      />
    </div>
  )
}
