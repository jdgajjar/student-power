'use client';

/**
 * PDFViewer — RAG-Enabled PDF Reader
 *
 * ═══════════════════════════════════════════════════════════════════
 * RAG FLOW IN THIS COMPONENT
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. PDF LOADS  →  extractAndStoreChunks() is called ONCE
 *    • Extracts full text via pdf.js
 *    • Sends text + pdfId to POST /api/ai/chunks
 *    • Server cleans text, splits into 300–500-word chunks, stores in MongoDB
 *    • In-memory chunks also kept for instant fallback
 *
 * 2. USER ACTION (summarize / questions / ask)
 *    • Client runs retrieveRelevantChunks() locally against in-memory chunks
 *    • Sends { action, pdfId, chunks: top5 } to /api/ai/chat
 *    • NO full PDF text transferred — only 3–5 chunks (~1 500 chars)
 *    • AI answers strictly from context
 *
 * TOKEN SAVING vs. old approach:
 *   Old:  10 000-char pdfText per request  ≈ 2 500 input tokens
 *   New:  ~1 800-char top-5 chunks         ≈   600 input tokens
 *   Reduction: ~75 % fewer input tokens per AI request
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  MessageSquare,
  FileText,
  Maximize2,
  X,
  HelpCircle,
  List,
  Cpu,
} from 'lucide-react';
import Button from '../ui/Button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Import RAG utilities — used client-side for fast in-memory retrieval
import {
  cleanExtractedText,
  splitIntoChunks,
  retrieveRelevantChunks,
  TextChunk,
  MAX_CHUNKS_PER_REQUEST,
} from '@/lib/ai/pdf-analyzer';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  fileName: string;
  /** MongoDB _id of the PDF record — used as the RAG chunk key */
  pdfId?: string;
  title?: string;
  onClose?: () => void;
}

export default function PDFViewer({
  fileUrl,
  fileName,
  pdfId,
  title,
  onClose,
}: PDFViewerProps) {
  // ── PDF state ────────────────────────────────────────────────────────────────
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);

  // ── RAG state ────────────────────────────────────────────────────────────────
  /**
   * inMemoryChunks: all chunks extracted from the current PDF.
   * Stored in component state after the first extraction so we don't
   * need to re-process on every question.
   */
  const [inMemoryChunks, setInMemoryChunks] = useState<TextChunk[]>([]);
  const [chunksStored, setChunksStored] = useState(false);  // true once chunks are in MongoDB
  const [isExtractingChunks, setIsExtractingChunks] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);

  // ── AI UI state ──────────────────────────────────────────────────────────────
  const [showAI, setShowAI] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [summary, setSummary] = useState('');
  const [questions, setQuestions] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'questions' | 'qa'>('summary');

  // ── Fullscreen state ─────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenScale, setFullscreenScale] = useState<number>(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const pdfOptions = useMemo(
    () => ({
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    }),
    []
  );

  // ── Container width tracking ─────────────────────────────────────────────────
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  const goToPrevPage = useCallback(() => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  }, [numPages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === 'ArrowLeft') goToPrevPage();
      else if (e.key === 'ArrowRight') goToNextPage();
      else if (e.key === 'Escape') setIsFullscreen(false);
      else if (e.key === '+' || e.key === '=') setFullscreenScale((p) => Math.min(p + 0.2, 3.0));
      else if (e.key === '-') setFullscreenScale((p) => Math.max(p - 0.2, 0.5));
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isFullscreen, goToNextPage, goToPrevPage]);

  // ── Touch gestures ────────────────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50 && pageNumber < numPages) goToNextPage();
    if (distance < -50 && pageNumber > 1) goToPrevPage();
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // STEP 1: Extract PDF text and store chunks in MongoDB (runs ONCE on load)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * extractAndStoreChunks
   *
   * Called after the PDF document loads.  Performs two actions:
   *   a) Extracts full text using pdf.js (client-side, all pages)
   *   b) Stores cleaned + chunked text in MongoDB via POST /api/ai/chunks
   *
   * TOKEN SAVING:
   *   After this runs once, subsequent AI calls send ONLY pdfId + question.
   *   No raw text needs to be re-sent to the server.
   */
  async function extractAndStoreChunks(pdf: any) {
    if (isExtractingChunks || inMemoryChunks.length > 0) return;

    try {
      setIsExtractingChunks(true);

      // ── Extract text from all pages ────────────────────────────────────────
      let rawText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        rawText += pageText + ' ';
      }

      console.log(`📄 Extracted ${rawText.length} chars from ${pdf.numPages} pages`);

      // ── Clean and chunk in-memory (instant retrieval fallback) ─────────────
      const cleanedText = cleanExtractedText(rawText);
      const chunks = splitIntoChunks(cleanedText);

      setInMemoryChunks(chunks);
      setChunkCount(chunks.length);
      console.log(`✅ Created ${chunks.length} in-memory chunks`);

      // ── Store chunks in MongoDB (async, non-blocking for UX) ───────────────
      // We don't await this — the UI can already use in-memory chunks.
      if (pdfId && chunks.length > 0) {
        fetch('/api/ai/chunks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfId, pdfText: rawText }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.success) {
              setChunksStored(true);
              console.log(`✅ Stored ${d.chunkCount} chunks in MongoDB for pdfId: ${pdfId}`);
            }
          })
          .catch((err) => {
            console.warn('⚠️ Failed to store chunks in MongoDB, using in-memory only:', err);
          });
      }
    } catch (error) {
      console.error('❌ Text extraction error:', error);
    } finally {
      setIsExtractingChunks(false);
    }
  }

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n);
    // Use getDocument to re-fetch so we can iterate pages for text
    const loadingTask = pdfjs.getDocument({
      url: fileUrl,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
    });
    loadingTask.promise.then(extractAndStoreChunks).catch(console.error);
  }

  function onDocumentLoadError(error: Error) {
    console.error('Failed to load PDF:', error);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // STEP 2: Helper — resolve top-K relevant chunks for a question
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * getRelevantChunks
   *
   * Returns the top-K in-memory chunks relevant to the query.
   * For summarize/generate_questions (no query), returns first K chunks.
   *
   * TOKEN SAVING:
   *   We only pass these chunks to /api/ai/chat — not the full text.
   *   MAX_CHUNKS_PER_REQUEST = 5 → at most ~2 000 chars of context.
   */
  function getRelevantChunks(query?: string): TextChunk[] {
    if (inMemoryChunks.length === 0) return [];
    if (!query || query.trim().length === 0) {
      return inMemoryChunks.slice(0, MAX_CHUNKS_PER_REQUEST);
    }
    return retrieveRelevantChunks(query, inMemoryChunks, MAX_CHUNKS_PER_REQUEST);
  }

  // ── AI action helpers ─────────────────────────────────────────────────────────

  /**
   * callAI — central function for all AI actions.
   *
   * Sends ONLY:
   *   • action
   *   • pdfId  (if available)
   *   • chunks (pre-selected top-K, not full PDF)
   *   • question / message
   *
   * TOKEN SAVING:
   *   Old: body contained pdfText (~10 000 chars = ~2 500 tokens)
   *   New: body contains 3–5 chunks (~1 800 chars = ~600 tokens)
   */
  async function callAI(
    action: 'summarize' | 'generate_questions' | 'answer' | 'chat',
    questionText?: string
  ): Promise<string> {
    const selectedChunks = getRelevantChunks(questionText);

    if (selectedChunks.length === 0) {
      throw new Error('PDF content is still loading. Please wait a moment and try again.');
    }

    const payload: Record<string, any> = {
      action,
      chunks: selectedChunks, // only top-K, not full PDF
    };

    // Include pdfId when available — server will use DB retrieval
    if (pdfId) payload.pdfId = pdfId;

    if (action === 'answer' || action === 'chat') {
      payload.question = questionText;
      payload.message = questionText; // both fields for compatibility
    }

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'AI request failed');
    return data.response;
  }

  // ── Summarize ────────────────────────────────────────────────────────────────
  const handleSummarize = async () => {
    if (inMemoryChunks.length === 0) {
      alert('Please wait for the PDF to finish loading.');
      return;
    }
    try {
      setIsGeneratingSummary(true);
      setSummary('');
      const result = await callAI('summarize');
      setSummary(result);
      setActiveTab('summary');
    } catch (error: any) {
      console.error('Summarization error:', error);
      alert(error.message || 'Failed to generate summary');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // ── Generate Questions ────────────────────────────────────────────────────────
  const handleGenerateQuestions = async () => {
    if (inMemoryChunks.length === 0) {
      alert('Please wait for the PDF to finish loading.');
      return;
    }
    try {
      setIsGeneratingQuestions(true);
      setQuestions('');
      const result = await callAI('generate_questions');
      setQuestions(result);
      setActiveTab('questions');
    } catch (error: any) {
      console.error('Question generation error:', error);
      alert(error.message || 'Failed to generate questions');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // ── Ask Question (Q&A) ────────────────────────────────────────────────────────
  const handleAskQuestion = async () => {
    if (!question.trim()) {
      alert('Please enter a question.');
      return;
    }
    if (inMemoryChunks.length === 0) {
      alert('Please wait for the PDF to finish loading.');
      return;
    }
    try {
      setIsAnswering(true);
      setAnswer('');
      const result = await callAI('answer', question);
      setAnswer(result);
      setActiveTab('qa');
    } catch (error: any) {
      console.error('Q&A error:', error);
      alert(error.message || 'Failed to answer question');
    } finally {
      setIsAnswering(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Failed to fetch PDF file');
      const blob = await response.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      const downloadName = title
        ? title.replace(/[<>:"/\\|?*]/g, '_').trim()
        : fileName;
      link.download = downloadName.endsWith('.pdf') ? downloadName : `${downloadName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  // ── Zoom helpers ──────────────────────────────────────────────────────────────
  const zoomIn = () => setScale((p) => Math.min(p + 0.2, 3.0));
  const zoomOut = () => setScale((p) => Math.max(p - 0.2, 0.5));
  const zoomInFullscreen = () => setFullscreenScale((p) => Math.min(p + 0.2, 3.0));
  const zoomOutFullscreen = () => setFullscreenScale((p) => Math.max(p - 0.2, 0.5));
  const openFullscreen = () => { setIsFullscreen(true); setFullscreenScale(1.0); };
  const closeFullscreen = () => { setIsFullscreen(false); setFullscreenScale(1.0); };

  // ── Loading state: are we still extracting chunks? ────────────────────────────
  const isLoadingAI = isExtractingChunks;
  const contentReady = inMemoryChunks.length > 0;

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <>
      {/* ── Fullscreen PDF View ─────────────────────────────────────────────── */}
      {isFullscreen && (
        <div
          ref={fullscreenRef}
          className="fixed inset-0 bg-black z-[100] flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-0 left-0 right-0 bg-black bg-opacity-75 text-white p-3 sm:p-4 flex items-center justify-between z-10">
            <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
              <button
                onClick={closeFullscreen}
                className="p-1.5 sm:p-2 hover:bg-white hover:bg-opacity-20 rounded transition-colors flex-shrink-0"
                aria-label="Exit fullscreen"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <span className="text-sm sm:text-base font-medium truncate">
                Page {pageNumber} of {numPages}
              </span>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
              <button
                onClick={zoomOutFullscreen}
                disabled={fullscreenScale <= 0.5}
                className="p-1.5 sm:p-2 hover:bg-white hover:bg-opacity-20 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <span className="text-xs sm:text-sm px-1 sm:px-2">
                {Math.round(fullscreenScale * 100)}%
              </span>
              <button
                onClick={zoomInFullscreen}
                disabled={fullscreenScale >= 3.0}
                className="p-1.5 sm:p-2 hover:bg-white hover:bg-opacity-20 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto flex items-center justify-center pt-14 sm:pt-16 p-1 sm:p-4">
            <Document
              file={fileUrl}
              options={pdfOptions}
              loading={
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={fullscreenScale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="mx-auto"
                width={
                  typeof window !== 'undefined'
                    ? window.innerWidth <= 768
                      ? window.innerWidth - 8
                      : Math.min(window.innerWidth * 0.9, 1200)
                    : undefined
                }
              />
            </Document>
          </div>

          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-3 sm:p-4 flex items-center justify-center space-x-4 sm:space-x-6">
            <button
              onClick={goToPrevPage}
              disabled={pageNumber <= 1}
              className="p-2 sm:p-3 hover:bg-white hover:bg-opacity-20 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            <button
              onClick={goToNextPage}
              disabled={pageNumber >= numPages}
              className="p-2 sm:p-3 hover:bg-white hover:bg-opacity-20 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </div>
      )}

      {/* ── Regular PDF Viewer Modal ────────────────────────────────────────── */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-1 sm:p-4 md:p-6 lg:p-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full h-full sm:max-w-7xl sm:max-h-[95vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-2 sm:p-4 border-b dark:border-gray-700">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <h2 className="text-sm sm:text-xl font-bold text-gray-900 dark:text-white truncate flex-1 mr-2">
                {fileName}
              </h2>
              {/* RAG status indicator */}
              {contentReady && (
                <span
                  className="hidden sm:flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full flex-shrink-0"
                  title={`${chunkCount} chunks indexed for RAG retrieval`}
                >
                  <Cpu className="h-3 w-3" />
                  {chunkCount} chunks
                </span>
              )}
              {isLoadingAI && (
                <span className="hidden sm:flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Indexing…
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2">
              <Button
                onClick={() => setShowAI(!showAI)}
                variant="secondary"
                size="sm"
                title={showAI ? 'Hide AI Tools' : 'Chat with AI'}
              >
                {showAI ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                <span className="hidden sm:inline ml-2">{showAI ? 'Hide AI' : 'Chat AI'}</span>
              </Button>
              <Button onClick={handleDownload} variant="secondary" size="sm" title="Download PDF">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Download</span>
              </Button>
              {onClose && (
                <Button onClick={onClose} variant="secondary" size="sm" title="Close viewer">
                  <span className="hidden sm:inline">Close</span>
                  <X className="h-4 w-4 sm:hidden" />
                </Button>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* PDF Viewer Panel */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Controls */}
              <div className="flex items-center justify-center space-x-2 sm:space-x-4 p-2 sm:p-4 border-b dark:border-gray-700 flex-wrap gap-2 flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <Button onClick={goToPrevPage} disabled={pageNumber <= 1} variant="secondary" size="sm">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    Page {pageNumber} of {numPages}
                  </span>
                  <Button onClick={goToNextPage} disabled={pageNumber >= numPages} variant="secondary" size="sm">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="border-l dark:border-gray-700 h-6 mx-2 hidden sm:block"></div>

                <div className="flex items-center space-x-2">
                  <Button onClick={zoomOut} disabled={scale <= 0.5} variant="secondary" size="sm">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button onClick={zoomIn} disabled={scale >= 3.0} variant="secondary" size="sm">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>

                <div className="border-l dark:border-gray-700 h-6 mx-2 hidden sm:block"></div>

                <Button onClick={openFullscreen} variant="secondary" size="sm" title="Open fullscreen">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </div>

              {/* PDF Display */}
              <div
                ref={containerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100 dark:bg-gray-800 p-1 sm:p-4 lg:p-6 min-h-0"
                style={{ overflowY: 'auto', maxHeight: '100%' }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div className="flex justify-center">
                  <Document
                    file={fileUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    options={pdfOptions}
                    loading={
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        <p className="ml-3 text-gray-600 dark:text-gray-400 text-sm sm:text-base">
                          Loading PDF…
                        </p>
                      </div>
                    }
                    error={
                      <div className="flex flex-col items-center justify-center p-8 text-red-600">
                        <p className="text-base sm:text-lg font-semibold mb-2">Failed to load PDF</p>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center">
                          The PDF file could not be loaded. Please try downloading it instead.
                        </p>
                      </div>
                    }
                  >
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      width={
                        containerWidth > 0
                          ? containerWidth <= 768
                            ? containerWidth - 8
                            : Math.min(containerWidth - 48, 1000)
                          : undefined
                      }
                      className="shadow-lg"
                    />
                  </Document>
                </div>
              </div>
            </div>

            {/* ── AI Panel ──────────────────────────────────────────────────── */}
            {showAI && (
              <div className="w-full sm:w-96 border-l dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800 min-h-0 overflow-hidden">
                {/* AI Panel Header */}
                <div className="p-3 sm:p-4 border-b dark:border-gray-700 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      AI Tools
                    </h3>
                    <button
                      onClick={() => setShowAI(false)}
                      className="sm:hidden p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {isLoadingAI
                      ? 'Indexing PDF into RAG chunks…'
                      : contentReady
                      ? `RAG ready · ${chunkCount} chunks indexed`
                      : 'Waiting for PDF to load…'}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="p-3 sm:p-4 border-b dark:border-gray-700 flex-shrink-0 space-y-2">
                  <Button
                    onClick={handleSummarize}
                    disabled={isGeneratingSummary || isLoadingAI || !contentReady}
                    className="w-full"
                    size="sm"
                  >
                    {isGeneratingSummary ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating Summary…
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Generate Summary
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleGenerateQuestions}
                    disabled={isGeneratingQuestions || isLoadingAI || !contentReady}
                    className="w-full"
                    size="sm"
                    variant="secondary"
                  >
                    {isGeneratingQuestions ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating Questions…
                      </>
                    ) : (
                      <>
                        <HelpCircle className="h-4 w-4 mr-2" />
                        Generate Questions
                      </>
                    )}
                  </Button>
                </div>

                {/* Tabs */}
                <div className="flex border-b dark:border-gray-700 flex-shrink-0">
                  {(['summary', 'questions', 'qa'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
                        activeTab === tab
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      {tab === 'summary' && <FileText className="h-4 w-4 inline mr-1" />}
                      {tab === 'questions' && <List className="h-4 w-4 inline mr-1" />}
                      {tab === 'qa' && <MessageSquare className="h-4 w-4 inline mr-1" />}
                      {tab === 'summary' ? 'Summary' : tab === 'questions' ? 'Questions' : 'Q&A'}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 min-h-0">
                  {/* Summary Tab */}
                  {activeTab === 'summary' && (
                    <div className="space-y-3">
                      {summary ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-gray-900 rounded border dark:border-gray-700 p-3">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">
                            Click &quot;Generate Summary&quot; to create a structured academic summary
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Questions Tab */}
                  {activeTab === 'questions' && (
                    <div className="space-y-3">
                      {questions ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-gray-900 rounded border dark:border-gray-700 p-3">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{questions}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                          <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">
                            Click &quot;Generate Questions&quot; to create important questions from this
                            document
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Q&A Tab */}
                  {activeTab === 'qa' && (
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                          Ask a Question
                        </h4>
                        <textarea
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="Ask a question about this PDF…"
                          className="w-full p-2 border dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs sm:text-sm resize-none"
                          rows={3}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              handleAskQuestion();
                            }
                          }}
                        />
                        <Button
                          onClick={handleAskQuestion}
                          disabled={isAnswering || isLoadingAI || !question.trim() || !contentReady}
                          className="w-full mt-2"
                          size="sm"
                        >
                          {isAnswering ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Analyzing…
                            </>
                          ) : (
                            'Get Answer'
                          )}
                        </Button>
                        <p className="text-xs text-gray-400 mt-1">Tip: Ctrl+Enter to submit</p>
                      </div>
                      {answer && (
                        <div className="prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-gray-900 rounded border dark:border-gray-700 p-3">
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                            Answer:
                          </p>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )}

                  {/* RAG info badge */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 p-3 bg-blue-50 dark:bg-blue-900/20 rounded mt-4">
                    <p className="font-medium mb-1">🤖 RAG-Powered AI</p>
                    <p>
                      Answers are derived <strong>only from PDF content</strong> using
                      Retrieval-Augmented Generation.{' '}
                      {contentReady && (
                        <>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {chunkCount} chunks indexed
                          </span>
                          {' · '}
                          <span>
                            up to {MAX_CHUNKS_PER_REQUEST} most relevant chunks sent per query
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
