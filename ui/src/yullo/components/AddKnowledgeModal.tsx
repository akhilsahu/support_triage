import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { 
  X, Upload, FileText, HelpCircle, Globe, Loader2, AlertTriangle, 
  Search, Check, RefreshCw, Lock, Image as ImageIcon
} from 'lucide-react';
import { yulloOnboardingApi } from '../api/onboarding';
import type { SourceItem } from './SourceUnderstandingCard';

export type KnowledgeModalTab = 'link' | 'upload' | 'text' | 'qna' | 'images';
export type UploadStage = 'select' | 'processing' | 'preview' | 'full_processing';
type LinkStage = 'entry' | 'preview';

interface AddKnowledgeModalProps {
  isOpen: boolean;
  initialTab?: KnowledgeModalTab;
  onClose: () => void;
  onAddLink: (url: string, title?: string, background?: boolean) => Promise<SourceItem | void>;
  onUploadFile: (file: File) => Promise<string | void>;
  onAddText: (title: string, text: string) => Promise<void>;
  onSourceChanged?: () => Promise<void> | void;
  onProcessingStarted?: (source: SourceItem) => void;
}

export const AddKnowledgeModal: React.FC<AddKnowledgeModalProps> = ({
  isOpen,
  initialTab = 'link',
  onClose,
  onAddLink,
  onUploadFile,
  onAddText,
  onSourceChanged,
  onProcessingStarted,
}) => {
  const [activeTab, setActiveTab] = useState<KnowledgeModalTab>(initialTab);
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [images, setImages] = useState<{ file: File; status: 'queued' | 'uploading' | 'submitted' | 'failed' }[]>([]);

  // Two-Stage Resumable Upload Flow state
  const [uploadStage, setUploadStage] = useState<UploadStage>('select');
  const [uploadProgress, setUploadProgress] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pollingSourceId, setPollingSourceId] = useState<string | null>(null);
  const [linkStage, setLinkStage] = useState<LinkStage>('entry');
  const [linkPreview, setLinkPreview] = useState<SourceItem | null>(null);

  // In-modal extracted preview state
  const [fileExtractedText, setFileExtractedText] = useState<string>('');
  const [uploadedSource, setUploadedSource] = useState<any>(null);
  const [fullExtractedText, setFullExtractedText] = useState<string | null>(null);
  const [renderedTextLimit, setRenderedTextLimit] = useState<number>(3000);

  useEffect(() => {
    setActiveTab(initialTab);
    setUploadStage('select');
    setUploadProgress(0);
    setErrorMsg(null);
    setFullExtractedText(null);
    setRenderedTextLimit(3000);
    setLinkStage('entry');
    setLinkPreview(null);
    setImages([]);
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const isSubmitDisabled = isLoading || (
    activeTab === 'link' ? (linkStage === 'entry' && !url.trim()) :
    activeTab === 'upload' ? (uploadStage === 'select' && !selectedFile) :
    activeTab === 'text' ? !textContent.trim() :
    activeTab === 'qna' ? (!question.trim() || !answer.trim()) :
    activeTab === 'images' ? !images.some(image => image.status === 'queued' || image.status === 'failed') : false
  );

  const startRealProcessing = async (file?: File) => {
    const fileToProcess = file || selectedFile;
    if (!fileToProcess) return;
    setUploadStage('processing');
    setUploadProgress(10);
    setErrorMsg(null);
    try {
      const sourceId = await onUploadFile(fileToProcess);
      if (!sourceId) {
        throw new Error('Failed to start ingestion job');
      }
      setPollingSourceId(sourceId);
      
      let isReady = false;
      let attempt = 0;
      let progressVal = 15;
      
      while (!isReady && attempt < 40) { // 80 seconds max
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempt++;
        
        try {
          const source = await yulloOnboardingApi.getSource(sourceId);
          setUploadedSource(source);
          if (source.status === 'ready_to_review' || source.status === 'ready') {
            isReady = true;
            setUploadProgress(100);
            setUploadedSource(source);
            setFileExtractedText(source.preview_excerpt || 'No text extracted.');
            yulloOnboardingApi.getSourceContent(sourceId).then(content => {
               if (content) setFullExtractedText(content);
            }).catch(err => console.error('Failed to load full text:', err));

            setTimeout(() => {
              setUploadStage('preview');
            }, 300);
            break;
          } else if (source.status === 'failed' || source.status === 'preview_failed') {
             throw new Error(source.error_msg || 'Processing failed');
          } else {
             // Use real backend progress when available; fall back to
             // local estimate only when the API hasn't reported yet
             if (source.progress != null && source.progress > 0) {
               progressVal = source.progress;
             } else {
               progressVal = Math.min(progressVal + (attempt < 10 ? 10 : 2), 95);
             }
             setUploadProgress(progressVal);
          }
        } catch (e: any) {
          if (e.message.includes('not found')) {
            // Source might not be visible immediately, wait and retry
            continue;
          }
          throw e;
        }
      }
      
      if (!isReady) {
        throw new Error('Processing timed out. The file may still be processing in the background.');
      }
      
    } catch (err: any) {
      setUploadStage('select');
      setErrorMsg(err.message || 'An error occurred during processing');
    }
  };

  const handleRunLinkInBackground = async () => {
    if (!url || !url.trim()) return;
    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await onAddLink(formattedUrl, urlTitle.trim() || undefined, true);
      await onSourceChanged?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start background preview');
      setIsLoading(false);
    }
  };

  const uploadImages = async () => {
    setIsLoading(true); setErrorMsg(null);
    try {
      for (const [index, image] of images.entries()) {
        if (image.status === 'submitted') continue;
        setImages(previous => previous.map((item, i) => i === index ? { ...item, status: 'uploading' } : item));
        try {
          const id = await onUploadFile(image.file);
          if (!id) throw new Error('Upload unavailable');
          setImages(previous => previous.map((item, i) => i === index ? { ...item, status: 'submitted' } : item));
        } catch {
          setImages(previous => previous.map((item, i) => i === index ? { ...item, status: 'failed' } : item));
        }
      }
      await onSourceChanged?.();
    } catch { setErrorMsg('Could not refresh the source list. Your uploaded images are retained.'); } finally { setIsLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    setErrorMsg(null);
    if (activeTab === 'images') { await uploadImages(); return; }

    if (activeTab === 'upload') {
      if (uploadStage === 'select') {
        if (!selectedFile) return;
        startRealProcessing();
        return;
      }
      if (uploadStage === 'preview') {
        await handlePublishFileToAura();
        return;
      }
    }

    setIsLoading(true);
    try {
      if (activeTab === 'link') {
        if (linkStage === 'preview') {
          if (!linkPreview) throw new Error('Link preview is unavailable');
          await yulloOnboardingApi.updateSource(linkPreview.id, { is_confirmed: true });
          await onSourceChanged?.();
          onProcessingStarted?.({
            ...linkPreview,
            is_confirmed: true,
            status: 'processing',
            stage: 'Preparing Aura search',
            progress: 35,
          });
          onClose();
          return;
        }
        if (!url || !url.trim()) throw new Error('Please enter a valid URL');
        let formattedUrl = url.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
          formattedUrl = `https://${formattedUrl}`;
        }
        const source = await onAddLink(formattedUrl, urlTitle.trim() || undefined, true);
        if (!source) throw new Error('Could not create the source');
        await onSourceChanged?.();
        onClose();
        return;
      } else if (activeTab === 'text') {
        if (!textContent.trim()) throw new Error('Please enter text content');
        const title = textTitle.trim() || 'Pasted text';
        await onAddText(title, textContent.trim());
      } else if (activeTab === 'qna') {
        if (!question.trim() || !answer.trim()) throw new Error('Please provide both question and answer');
        const title = `Q&A: ${question.trim()}`;
        const combined = `Question: ${question.trim()}\nAnswer: ${answer.trim()}`;
        await onAddText(title, combined);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add knowledge source');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublishFileToAura = async () => {
    if (!pollingSourceId) return;
    setIsLoading(true);
    setUploadStage('full_processing');
    setUploadProgress(10);
    setErrorMsg(null);
    try {
      // Mark as confirmed to trigger full ingestion job in the background
      await yulloOnboardingApi.updateSource(pollingSourceId, { is_confirmed: true });
      await onSourceChanged?.();
      if (uploadedSource) {
        onProcessingStarted?.({
          ...uploadedSource,
          is_confirmed: true,
          status: 'processing',
          stage: 'Preparing Aura search',
          progress: 35,
        });
      }
      onClose(); // Auto close to let user see background progress in AuraKnowledgeScreen
    } catch (err: any) {
      setUploadStage('preview');
      setErrorMsg(err.message || 'Failed to start full ingestion');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeepBackgroundJob = () => {
    if (activeTab === 'images' && isLoading) return;
    // Background job is already running on the server, we just close the modal
    onClose();
  };

  const sourceTiles: { id: KnowledgeModalTab; title: string; subtitle: string; icon: React.ReactNode }[] = [
    { 
      id: 'text', 
      title: 'Paste knowledge', 
      subtitle: 'Notes, bio, guidelines',
      icon: <FileText className="w-5 h-5 text-[var(--space-type-event)]" />
    },
    { 
      id: 'upload', 
      title: 'Upload file', 
      subtitle: 'PDF, DOCX, TXT, MD',
      icon: <Upload className="w-5 h-5 text-[var(--space-type-posting)]" />
    },
    { 
      id: 'link', 
      title: 'Add link', 
      subtitle: 'Web URL or doc link',
      icon: <Globe className="w-5 h-5 text-[var(--space-type-service)]" />
    },
    { 
      id: 'qna', 
      title: 'Add Q&A', 
      subtitle: 'Question & answer',
      icon: <HelpCircle className="w-5 h-5 text-[var(--space-type-other)]" />
    },
    { id: 'images', title: 'Add images', subtitle: 'Photos, posters, scans', icon: <ImageIcon className="w-5 h-5 text-[var(--space-type-service)]" /> },
  ];

  const getTabHeading = () => {
    if (activeTab === 'images') return 'Add images';
    if (activeTab === 'text') return 'Paste knowledge';
    if (activeTab === 'upload') return uploadStage === 'preview' ? 'Preview extracted content' : 'Upload file';
    if (activeTab === 'link') return linkStage === 'preview' ? 'Review website preview' : 'Add website link';
    return 'Add Q&A pair';
  };

  const modalContent = (
    <div className="yullo-app yullo-add-knowledge" style={{ display: 'contents' }}>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 bg-black/30 backdrop-blur-[3px] animate-in fade-in duration-150 font-[Instrument_Sans]">
        {/* Backdrop */}
        <div className="absolute inset-0" onClick={handleKeepBackgroundJob} />

      {/* Spacious Modal Box (Desktop: min(760px, calc(100vw - 48px)), Mobile: Full screen 100dvh x 100dvw) */}
      <div 
        className="relative w-full max-w-[760px] min-[641px]:w-[min(760px,calc(100vw-48px))] sm:max-h-[90vh] max-sm:w-full max-sm:h-[100dvh] max-sm:rounded-none bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-6 sm:px-8 sm:py-7 flex items-start justify-between z-20 shrink-0">
          <div>
            <h2 className="font-[Satoshi] text-[24px] sm:text-[28px] md:text-[30px] font-bold text-[var(--text-primary)] tracking-tight leading-none">
              {getTabHeading()}
            </h2>
            <p className="text-[15px] text-[var(--text-secondary)] mt-2 font-[Instrument_Sans]">
              Add information Aura should understand.
            </p>
          </div>
          <button
            onClick={handleKeepBackgroundJob}
            aria-label="Close modal"
            className="p-2 rounded-xl hover:bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0 -mr-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7 space-y-7">
          {errorMsg && (
            <div className="p-4 bg-[var(--surface-soft)] border border-[var(--critical)] rounded-xl text-[14px] text-[var(--critical)] font-medium">
              {errorMsg}
            </div>
          )}

          {/* Spacious Source Type Tiles Row (Horizontal Scroll on Mobile) */}
          <div className="space-y-3">
            <label className="block text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Source Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 overflow-x-auto pb-1 scrollbar-none">
              {sourceTiles.map(tile => {
                const isActive = activeTab === tile.id;
                return (
                  <button
                    key={tile.id}
                    disabled={isLoading}
                    type="button"
                    onClick={() => { setActiveTab(tile.id); setErrorMsg(null); }}
                    className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isActive
                        ? 'border-[var(--accent)] text-[var(--text-primary)] shadow-xs ring-1 ring-[var(--accent)]/40'
                        : 'bg-[var(--surface-soft)]/60 border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)]'
                    }`}
                    style={isActive ? {
                      backgroundColor: 'var(--accent-soft)',
                      borderColor: 'var(--accent)',
                    } : undefined}
                  >
                    <div className="mb-3 shrink-0">{tile.icon}</div>
                    <div>
                      <p className="font-semibold text-[14px] text-[var(--text-primary)] font-[Satoshi] leading-tight">
                        {tile.title}
                      </p>
                      <p className="text-[12px] text-[var(--text-secondary)] mt-1 truncate">
                        {tile.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === 'images' && <div className="space-y-4">
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-5 text-center text-sm focus-within:outline focus-within:outline-2 focus-within:outline-[var(--accent)]">
              <ImageIcon size={24} className="text-[var(--accent-ink)]" aria-hidden="true" />Choose up to 10 images
              <span className="text-xs text-[var(--text-secondary)]">PNG, JPG or WebP · Each image becomes a source for this Space</span>
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={isLoading} className="sr-only" onChange={event => {
                const files = Array.from(event.target.files || []);
                if (files.length > 10 || files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024)) {
                  setErrorMsg('Choose up to 10 PNG, JPG or WebP images, each up to 20 MB.'); return;
                }
                setImages(files.map(file => ({ file, status: 'queued' }))); setErrorMsg(null); event.target.value = '';
              }} />
            </label>
            {images.map((image, index) => <div key={`${image.file.name}:${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3 text-sm"><span className="min-w-0 break-words">{image.file.name}<span className="mt-1 block text-xs text-[var(--text-secondary)]">{formatFileSize(image.file.size)}</span></span><span role="status" className={`shrink-0 text-xs ${image.status === 'failed' ? 'text-[var(--critical)]' : 'text-[var(--text-secondary)]'}`}>{image.status === 'submitted' ? 'Added · processing' : image.status === 'uploading' ? 'Uploading…' : image.status === 'failed' ? 'Failed · retry' : 'Ready to upload'}</span></div>)}
            <p className="text-xs leading-5 text-[var(--text-secondary)]">Images use the existing source-processing flow. Review extracted information before approving it. Retry skips images already added.</p>
          </div>}

          {/* TAB 1: PASTE KNOWLEDGE (DESIGN SPEC COMPOSITION WITH LIVE PREVIEW BELOW) */}
          {activeTab === 'text' && (
            <div className="space-y-6">
              <div>
                <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2 font-[Satoshi]">
                  Name this source <span className="text-[var(--text-secondary)] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Founder notes, Company bio, Return policy..."
                  value={textTitle}
                  onChange={e => setTextTitle(e.target.value)}
                  className="w-full h-[52px] px-4.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-all font-[Instrument_Sans]"
                />
              </div>

              <div>
                <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2 font-[Satoshi]">
                  Content
                </label>
                <textarea
                  rows={7}
                  placeholder="Paste FAQs, biography, customer guidelines, or internal notes..."
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  className="w-full min-h-[220px] p-4 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-all font-[Instrument_Sans] leading-relaxed resize-y"
                  required
                />
              </div>

              {/* Character Count & Privacy Indicator Bar */}
              <div className="flex items-center justify-between text-[13px] text-[var(--text-secondary)] pt-1 font-[Instrument_Sans]">
                <span>{textContent.length} characters</span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock className="w-3.5 h-3.5 text-[var(--text-secondary)]" /> Private to this Space
                </span>
              </div>

              {/* LIVE RAW TEXT & EXTRACTED KNOWLEDGE PREVIEW IN SPACE BELOW */}
              {textContent.trim().length > 0 && (
                <div className="space-y-4 pt-4 border-t border-[var(--border)] animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <label className="block text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Live Extracted Preview
                    </label>
                    <span className="text-[12px] font-mono text-[var(--text-secondary)]">
                      {textContent.trim().split(/\s+/).length} words
                    </span>
                  </div>

                  <div className="p-5 max-h-[200px] overflow-y-auto bg-[var(--surface-soft)]/80 border border-[var(--border)] rounded-xl text-[14px] text-[var(--text-primary)] leading-relaxed select-text text-left prose dark:prose-invert prose-sm max-w-none font-[Instrument_Sans] [&>:first-child]:mt-0 [&>:last-child]:mb-0 prose-p:my-2 prose-p:leading-relaxed prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-bold prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5 prose-blockquote:my-2.5 prose-blockquote:pl-3.5 prose-blockquote:border-l-2 prose-blockquote:border-[var(--accent)] prose-blockquote:italic">
                    <ReactMarkdown>
                      {textContent}
                    </ReactMarkdown>
                  </div>

                  {/* Candidate Facts Preview */}
                  <div className="p-4 bg-[var(--accent-soft)] border border-[var(--border)] rounded-xl flex items-center justify-between text-[14px] text-[var(--text-primary)]">
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4.5 h-4.5 text-[var(--accent-ink)] shrink-0" />
                      <span className="font-bold">Live facts candidate: ready for Aura</span>
                    </div>
                    <span className="text-[12px] font-mono font-semibold">Automatic extraction</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: UPLOAD FILE (IN-MODAL DRAG SECTION REPLACED WITH PREVIEW CONTENT) */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={e => {
                  const file = e.target.files?.[0] || null;
                  if (file) {
                    setSelectedFile(file);
                    startRealProcessing(file);
                  }
                }}
                className="hidden"
                id="file-upload-input"
              />

              {!selectedFile ? (
                /* DRAG AREA WHEN NO FILE IS SELECTED */
                <div className="space-y-3">
                  <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2 font-[Satoshi]">
                    Select File
                  </label>
                  <div 
                    onClick={() => document.getElementById('file-upload-input')?.click()}
                    className="border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] rounded-2xl p-10 text-center bg-[var(--surface-soft)]/50 hover:bg-[var(--surface-soft)] transition-colors cursor-pointer group"
                  >
                    <Upload className="w-9 h-9 text-[var(--text-secondary)] group-hover:text-[var(--accent-ink)] mx-auto mb-3 transition-colors" />
                    <p className="text-[16px] font-semibold text-[var(--text-primary)] font-[Satoshi]">
                      Click to upload or drag file here
                    </p>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
                      PDF, DOCX, TXT or Markdown · up to 20 MB
                    </p>
                  </div>
                </div>
              ) : (
                /* DRAG SECTION REPLACED IN-PLACE WITH EXTRACTED CONTENT PREVIEW */
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Selected File Control Bar */}
                  <div className="flex items-center justify-between p-4 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl font-[Instrument_Sans]">
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-xl bg-[var(--accent-soft)] border border-[var(--border)] flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-[var(--accent-ink)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate font-[Satoshi]">
                          {selectedFile.name}
                        </p>
                        <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                          {formatFileSize(selectedFile.size)}{uploadedSource?.page_count ? ` · ${uploadedSource.page_count} pages` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { 
                        if (pollingSourceId) { yulloOnboardingApi.deleteSource(pollingSourceId).catch(console.error); }
                        document.getElementById('file-upload-input')?.click(); 
                      }}
                      className="text-[13px] font-semibold text-[var(--accent-ink)] hover:underline px-3 py-1.5 rounded-lg hover:bg-[var(--surface-soft)] transition-colors cursor-pointer shrink-0 ml-3"
                    >
                      Replace file
                    </button>
                    <button
                      type="button"
                      onClick={() => { 
                        if (pollingSourceId) { yulloOnboardingApi.deleteSource(pollingSourceId).catch(console.error); }
                        setSelectedFile(null); 
                        setFileExtractedText(''); 
                        setUploadStage('select'); 
                        setUploadedSource(null);
                        setPollingSourceId(null);
                      }}
                      className="text-[13px] font-semibold text-[var(--critical)] hover:opacity-80 px-3 py-1.5 rounded-lg hover:bg-[var(--surface-soft)] transition-colors cursor-pointer shrink-0 ml-1"
                    >
                      Remove
                    </button>
                  </div>

              {/* PROCESSING PROGRESS BAR (IF IN PROCESSING STAGE) */}
              {(uploadStage === 'processing' || uploadStage === 'full_processing') && (
                <div className="py-6 px-5 text-center space-y-4 bg-[var(--surface-soft)]/60 border border-[var(--border)] rounded-2xl">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-5 h-5 text-[var(--accent-ink)] animate-spin" />
                    <h4 className="font-[Satoshi] text-[16px] font-bold text-[var(--text-primary)]">
                      {uploadedSource?.stage ? uploadedSource.stage : `Processing ${selectedFile?.name || ''}`}... ({uploadProgress}%)
                    </h4>
                  </div>

                  {uploadedSource?.eta_seconds != null && uploadedSource.eta_seconds > 0 && (
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      About {uploadedSource.eta_seconds < 60 ? `${uploadedSource.eta_seconds}s` : `${Math.ceil(uploadedSource.eta_seconds / 60)}m`} remaining
                    </p>
                  )}

                  <div className="w-full bg-[var(--border)] h-2 rounded-full overflow-hidden max-w-xs mx-auto">
                    <div 
                      className="h-full transition-all duration-200"
                      style={{ width: `${uploadProgress}%`, backgroundColor: 'var(--accent-solid)' }}
                    />
                  </div>
                </div>
              )}

              {/* LIVE EXTRACTED RAW TEXT & CANDIDATE FACTS IN THE SPACE BELOW */}
              {selectedFile && uploadStage === 'preview' && (
                <div className="space-y-6 pt-2 border-t border-[var(--border)] animate-in fade-in duration-200">
                  {uploadedSource?.is_scanned && (
                    <div className="p-3.5 bg-[var(--surface-soft)] border border-[var(--attention)] rounded-xl text-[13px] text-[var(--text-primary)] flex items-center gap-3">
                      <AlertTriangle className="w-4.5 h-4.5 text-[var(--attention)] shrink-0" />
                      <span>OCR will run after adding this source.</span>
                    </div>
                  )}
                  {/* Complete Extracted Text Body Viewer */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Preview Excerpt
                      </label>
                      <span className="text-[12px] text-[var(--text-secondary)] font-mono">
                        {fullExtractedText 
                          ? `${fullExtractedText.substring(0, renderedTextLimit).split(/\s+/).filter(Boolean).length.toLocaleString()} of ${fullExtractedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words`
                          : `${(fileExtractedText || '').split(/\s+/).filter(Boolean).length.toLocaleString()} words (loading full text...)`
                        }
                      </span>
                    </div>
                    <div 
                      className="p-5 max-h-[240px] overflow-y-auto bg-[var(--surface-soft)]/80 border border-[var(--border)] rounded-xl text-[14px] text-[var(--text-primary)] leading-relaxed select-text text-left prose dark:prose-invert prose-sm max-w-none font-[Instrument_Sans] [&>:first-child]:mt-0 [&>:last-child]:mb-0 prose-p:my-2 prose-p:leading-relaxed prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-bold prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5 prose-blockquote:my-2.5 prose-blockquote:pl-3.5 prose-blockquote:border-l-2 prose-blockquote:border-[var(--accent)] prose-blockquote:italic whitespace-pre-wrap"
                      onScroll={(e) => {
                        const target = e.target as HTMLDivElement;
                        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 50) {
                          setRenderedTextLimit(prev => prev + 3000);
                        }
                      }}
                    >
                      {fullExtractedText 
                        ? fullExtractedText.substring(0, renderedTextLimit) + (fullExtractedText.length > renderedTextLimit ? '...' : '') 
                        : (fileExtractedText || 'No excerpt available.')}
                    </div>
                  </div>
                </div>
              )}
              
            </div>
          )}
        </div>
      )}

          {/* TAB 3: ADD LINK */}
          {activeTab === 'link' && (
            <div className="space-y-6">
              {linkStage === 'entry' ? (
                <>
              <div>
                <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2 font-[Satoshi]">
                  Website or Document URL
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/about"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="w-full h-[52px] px-4.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-all font-[Instrument_Sans]"
                  required
                />
              </div>

              <div>
                <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2 font-[Satoshi]">
                  Title / Label <span className="text-[var(--text-secondary)] font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Official website"
                  value={urlTitle}
                  onChange={e => setUrlTitle(e.target.value)}
                  className="w-full h-[52px] px-4.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-all font-[Instrument_Sans]"
                />
              </div>

              {url.trim().length > 4 && url.includes('.') && (
                <div className="space-y-4 pt-4 border-t border-[var(--border)] animate-in fade-in duration-200">
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Link Preview
                  </label>
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/50 shadow-xs">
                    <div className="w-12 h-12 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex flex-shrink-0 items-center justify-center overflow-hidden">
                      <Globe className="w-6 h-6 text-[var(--text-muted)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-[15px] text-[var(--text-primary)] font-[Satoshi] truncate">
                        {urlTitle || url.replace(/^https?:\/\//i, '').split('/')[0]}
                      </h4>
                      <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 truncate">
                        {url}
                      </p>
                    </div>
                  </div>
                  {isLoading ? (
                    <div className="p-4 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl space-y-3 text-[13px] text-[var(--text-secondary)] animate-in fade-in duration-150">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 font-medium text-[var(--text-primary)]">
                          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-ink)]" />
                          <span>Fetching and scraping page content…</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onSourceChanged?.();
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer self-start sm:self-auto"
                        >
                          Run in background & close
                        </button>
                      </div>
                      <p className="text-[12px] leading-relaxed">
                        Aura is downloading the page, harvesting metadata and assets, and extracting grounded facts. You can close this modal now and continue your work — a progress bar on top will show live status and notify you when ready.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px] text-[var(--text-secondary)]">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[var(--text-primary)] shrink-0" />
                        <span className="font-medium text-[var(--text-primary)]">Preview page before Aura uses it</span>
                      </div>
                      <span className="text-[12px] font-mono opacity-80 whitespace-nowrap">Automatic extraction</span>
                    </div>
                  )}
                </div>
              )}
                </>
              ) : linkPreview && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/60 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] overflow-hidden">
                      {linkPreview.favicon_url ? (
                        <img
                          src={linkPreview.favicon_url}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-6 w-6 object-contain rounded-xs"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                            if (sibling) sibling.style.display = 'block';
                          }}
                        />
                      ) : null}
                      <Globe
                        className="h-5 w-5 text-[var(--accent-ink)]"
                        style={linkPreview.favicon_url ? { display: 'none' } : undefined}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-[Satoshi] text-[15px] font-semibold text-[var(--text-primary)]">
                        {linkPreview.title || urlTitle || 'Website'}
                      </h4>
                      <p className="truncate font-mono text-[12px] text-[var(--text-secondary)]">{linkPreview.content_ref}</p>
                    </div>
                    {Boolean(linkPreview.assets?.images?.length || linkPreview.assets?.documents?.length) && (
                      <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                        {[
                          linkPreview.assets?.images?.length ? `${linkPreview.assets.images.length} images` : '',
                          linkPreview.assets?.documents?.length ? `${linkPreview.assets.documents.length} docs` : '',
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>

                  {(linkPreview.preview_image_url || linkPreview.assets?.images?.[0]?.url) && (
                    <div className="rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface-soft)]/40 max-h-48">
                      <img
                        src={linkPreview.preview_image_url || linkPreview.assets?.images?.[0]?.url}
                        alt="Preview banner"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-48 object-cover"
                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                      />
                    </div>
                  )}

                  {Boolean(linkPreview.assets?.images?.length) && (
                    <div className="space-y-2">
                      <label className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-[Satoshi] flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" /> Extracted Page Images ({linkPreview.assets!.images!.length})
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {linkPreview.assets!.images!.slice(0, 8).map((img, idx) => (
                          <a
                            key={idx}
                            href={img.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--surface-soft)] hover:border-[var(--accent)] transition-all flex flex-col"
                          >
                            <div className="aspect-square w-full bg-[var(--surface-soft)]/80 flex items-center justify-center overflow-hidden">
                              <img
                                src={img.url}
                                alt={img.alt || `Extracted image ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                                onError={(e) => {
                                  const parent = (e.currentTarget as HTMLElement).parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="p-2 text-center text-[10px] text-[var(--text-muted)] flex items-center justify-center h-full"><span class="opacity-50">Unavailable</span></div>';
                                  }
                                }}
                              />
                            </div>
                            {img.alt && (
                              <p className="p-1.5 text-[11px] text-[var(--text-secondary)] truncate font-[Instrument_Sans]">
                                {img.alt}
                              </p>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Scraped preview</label>
                      <span className="text-[12px] font-medium text-[var(--accent-ink)]"><Check className="mr-1 inline h-3.5 w-3.5" />Ready to review</span>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]/70 p-5 text-[14px] leading-relaxed text-[var(--text-primary)]">
                      {linkPreview.preview_excerpt || 'The page was reachable, but no readable preview text was returned.'}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-4 text-[13px] leading-relaxed text-[var(--text-primary)]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)]" />
                    <span><strong>Add to Aura</strong> will start full indexing, fact extraction, and offering/entity detection in the background.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ADD Q&A */}
          {activeTab === 'qna' && (
            <div className="space-y-6">
              <div>
                <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2 font-[Satoshi]">
                  Question
                </label>
                <input
                  type="text"
                  placeholder="e.g. What is your return policy?"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  className="w-full h-[52px] px-4.5 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-all font-[Instrument_Sans]"
                  required
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[var(--text-primary)] mb-2 font-[Satoshi]">
                  Approved Answer
                </label>
                <textarea
                  rows={5}
                  placeholder="e.g. We offer full refunds within 30 days of purchase..."
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  className="w-full min-h-[160px] p-4 bg-[var(--surface-soft)] border border-[var(--border)] rounded-xl text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 outline-none transition-all font-[Instrument_Sans] resize-y"
                  required
                />
              </div>
            </div>
          )}
        </form>

        {/* Sticky Full-Width Footer Actions */}
        <div className="sticky bottom-0 bg-[var(--surface)] border-t border-[var(--border)] px-6 py-4 sm:px-8 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 z-20">
          {(activeTab === 'upload' && uploadStage === 'preview') || (activeTab === 'link' && linkStage === 'preview') ? (
            <>
              <button
                type="button"
                onClick={() => activeTab === 'link' ? setLinkStage('entry') : setUploadStage('select')}
                className="w-full sm:w-auto px-5 h-[52px] rounded-xl border border-[var(--border)] text-[15px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 text-[var(--text-secondary)]" /> {activeTab === 'link' ? 'Change link' : 'Replace file'}
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleKeepBackgroundJob}
                  className="px-5 h-[52px] rounded-xl text-[15px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="flex-1 sm:flex-initial px-8 h-[52px] rounded-xl text-[15px] font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 active:scale-[0.99] bg-[var(--accent-solid)] text-[var(--accent-on-solid)] hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--accent-solid)',
                    color: 'var(--accent-on-solid)'
                  }}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4.5 h-4.5 stroke-[3]" />}
                  Add to Aura
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 w-full">
              <button
                type="button"
                onClick={handleKeepBackgroundJob}
                className="w-full sm:w-auto px-6 h-[52px] rounded-xl text-[15px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors cursor-pointer border border-transparent"
              >
                Cancel
              </button>
              {activeTab === 'link' && linkStage === 'entry' && !isLoading && (
                <button
                  type="button"
                  onClick={handleRunLinkInBackground}
                  disabled={isSubmitDisabled}
                  className="w-full sm:w-auto px-5 h-[52px] rounded-xl border border-[var(--border)] text-[14px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add in background
                </button>
              )}
              {activeTab === 'link' && linkStage === 'entry' && isLoading && (
                <button
                  type="button"
                  onClick={() => {
                    onSourceChanged?.();
                    onClose();
                  }}
                  className="w-full sm:w-auto px-5 h-[52px] rounded-xl border border-[var(--border)] text-[14px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-soft)] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  Run in background & close
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
                className={`bg-[var(--accent-solid)] text-[var(--accent-on-solid)] w-full sm:w-auto px-8 h-[52px] rounded-xl text-[15px] font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer hover:opacity-90 active:scale-[0.99] ${
                  isSubmitDisabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
                style={{
                  backgroundColor: 'var(--accent-solid)',
                  color: 'var(--accent-on-solid)'
                }}
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {activeTab === 'images' ? (isLoading ? 'Uploading images…' : 'Upload images') : activeTab === 'upload'
                  ? (isLoading ? 'Uploading…' : 'Upload & process') 
                  : activeTab === 'link' 
                  ? (isLoading ? 'Adding to Aura…' : 'Add to Aura')
                  : (isLoading ? 'Adding…' : 'Add to Aura')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
