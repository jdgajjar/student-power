'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PDFViewer from '@/components/pdf-viewer/PDFViewer';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import {
  FileText,
  Download,
  Plus,
  Eye,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { generateCollectionSchema } from '@/lib/seo/structured-data';
import { BASE_URL } from '@/lib/seo/metadata';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface University {
  _id: string;
  name: string;
}

interface Course {
  _id: string;
  name: string;
}

interface Subject {
  _id: string;
  name: string;
}

interface Semester {
  _id: string;
  name: string;
  slug: string;
}

interface PDF {
  _id: string;
  title: string;
  description: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  category: string;
  uploadedAt: string;
  subjectId: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const PAGE_SIZE = 12;
const DEBOUNCE_MS = 350;

// ──────────────────────────────────────────────
// Pagination component
// ──────────────────────────────────────────────

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}

function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { page, totalPages, total, limit, hasNextPage, hasPrevPage } = pagination;

  if (totalPages <= 1) return null;

  const buildPageNumbers = (): (number | '...')[] => {
    const pageSet = new Set<number>();
    pageSet.add(1);
    pageSet.add(totalPages);
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages, page + 1); i++) {
      pageSet.add(i);
    }
    const sorted = Array.from(pageSet).sort((a, b) => a - b);
    const result: (number | '...')[] = [];
    for (let idx = 0; idx < sorted.length; idx++) {
      if (idx > 0 && sorted[idx] - sorted[idx - 1] > 1) result.push('...');
      result.push(sorted[idx]);
    }
    return result;
  };

  const pageNumbers = buildPageNumbers();
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="mt-8 flex flex-col items-center gap-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Showing <span className="font-semibold">{startItem}–{endItem}</span> of{' '}
        <span className="font-semibold">{total}</span> PDFs
      </p>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevPage}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300
                     hover:bg-gray-50 dark:hover:bg-gray-700
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {pageNumbers.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 py-2 text-gray-500 dark:text-gray-400 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              aria-label={`Go to page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[2.25rem] px-3 py-2 rounded-lg border text-sm font-medium transition-colors
                ${
                  p === page
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          aria-label="Next page"
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                     bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300
                     hover:bg-gray-50 dark:hover:bg-gray-700
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page component
// ──────────────────────────────────────────────

export default function PDFsPage() {
  const router = useRouter();
  const params = useParams();
  const universitySlug = params.university as string;
  const courseSlug = params.course as string;
  const semesterSlug = params.semester as string;
  const subjectSlug = params.subject as string;
  const { isAdmin } = useStore();

  // Context data
  const [university, setUniversity] = useState<University | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [subjectId, setSubjectId] = useState<string>('');

  // PDF data & pagination
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPDFs, setTotalPDFs] = useState(0); // for structured data

  // UI state
  const [contextLoading, setContextLoading] = useState(true);
  const [pdfsLoading, setPdfsLoading] = useState(false);
  const [selectedPDF, setSelectedPDF] = useState<any>(null);

  // Search & filter (applied server-side)
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'title'>('latest');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Debounce timer
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // ── Load context (university, course, semester, subject) ──

  useEffect(() => {
    const loadContext = async () => {
      try {
        setContextLoading(true);

        const [uniRes, courseRes, semRes, subRes] = await Promise.all([
          fetch(`/api/universities/${universitySlug}`, { cache: 'no-store' }),
          fetch(`/api/courses/${courseSlug}`, { cache: 'no-store' }),
          fetch(`/api/semesters/${semesterSlug}`, { cache: 'no-store' }),
          fetch(`/api/subjects/${subjectSlug}`, { cache: 'no-store' }),
        ]);

        const [uniData, courseData, semData, subData] = await Promise.all([
          uniRes.json(),
          courseRes.json(),
          semRes.json(),
          subRes.json(),
        ]);

        if (uniData.success) setUniversity(uniData.data);
        if (courseData.success) setCourse(courseData.data);
        if (semData.success) setSemester(semData.data);
        if (subData.success) {
          setSubject(subData.data);
          setSubjectId(subData.data._id);
        }
      } catch (error) {
        console.error('Error loading context:', error);
      } finally {
        setContextLoading(false);
      }
    };

    loadContext();
  }, [universitySlug, courseSlug, semesterSlug, subjectSlug]);

  // ── Load PDFs (backend-filtered, paginated) ──

  const fetchPDFs = useCallback(
    async (page = 1) => {
      if (!subjectId) return;

      try {
        setPdfsLoading(true);

        const params = new URLSearchParams({
          subjectId,
          page: String(page),
          limit: String(PAGE_SIZE),
          paginate: 'true',
        });

        if (searchQuery.trim() !== '') params.set('search', searchQuery.trim());
        if (filterCategory !== 'all') params.set('category', filterCategory);

        const res = await fetch(`/api/pdfs?${params.toString()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const data = await res.json();

        if (data.success) {
          // Apply client-side sort (sort is cosmetic; data already filtered server-side)
          const sorted = sortPDFs(data.data, sortBy);
          setPdfs(sorted);
          if (data.pagination) {
            setPagination(data.pagination);
            if (page === 1 && searchQuery === '' && filterCategory === 'all') {
              setTotalPDFs(data.pagination.total);
            }
          }
          setCurrentPage(page);
        }
      } catch (error) {
        console.error('Error fetching PDFs:', error);
      } finally {
        setPdfsLoading(false);
      }
    },
    [subjectId, searchQuery, filterCategory, sortBy]
  );

  // Re-fetch PDFs whenever subjectId becomes available or filters change
  useEffect(() => {
    if (!subjectId) return;
    fetchPDFs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, searchQuery, filterCategory, sortBy]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ── Sort helper ──────────────────────────────

  const sortPDFs = (list: PDF[], sort: 'latest' | 'oldest' | 'title'): PDF[] => {
    return [...list].sort((a, b) => {
      if (sort === 'latest') return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      if (sort === 'oldest') return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      return a.title.localeCompare(b.title);
    });
  };

  // ── Debounced search handler ─────────────────

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(value);
      setCurrentPage(1);
    }, DEBOUNCE_MS);
  };

  // ── Filter/sort change handlers ──────────────

  const handleCategoryChange = (value: string) => {
    setFilterCategory(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: 'latest' | 'oldest' | 'title') => {
    setSortBy(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setFilterCategory('all');
    setSortBy('latest');
    setCurrentPage(1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };

  const handlePageChange = (page: number) => {
    fetchPDFs(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Download handler ─────────────────────────

  const handleDownload = useCallback(async (pdf: PDF) => {
    try {
      const response = await fetch(pdf.fileUrl);
      if (!response.ok) throw new Error('Failed to fetch PDF file');

      const blob = await response.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      const downloadName = pdf.title.replace(/[<>:"/\\|?*]/g, '_').trim();
      link.download = downloadName.endsWith('.pdf') ? downloadName : `${downloadName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download PDF. Please try again.');
    }
  }, []);

  // ── Utility ──────────────────────────────────

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      notes: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      assignments: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      papers: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    return colors[category] || colors.other;
  };

  const hasActiveFilters = searchQuery !== '' || filterCategory !== 'all';

  // ── Loading / not-found states ───────────────

  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 text-lg">Loading...</p>
      </div>
    );
  }

  if (!university || !course || !semester || !subject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg">Page not found</p>
          <Button onClick={() => router.push('/universities')} className="mt-4">
            Back to Universities
          </Button>
        </div>
      </div>
    );
  }

  // ── Breadcrumbs ──────────────────────────────

  const breadcrumbItems = [
    { name: 'Universities', href: '/universities' },
    { name: university.name, href: `/universities/${universitySlug}/courses` },
    { name: course.name, href: `/universities/${universitySlug}/courses/${courseSlug}/semesters` },
    { name: semester.name, href: `/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects` },
    { name: subject.name, href: `/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects/${subjectSlug}/pdfs` },
  ].filter((item) => item.name);

  // ── Structured data ──────────────────────────

  const collectionSchema = generateCollectionSchema({
    name: `${subject.name} Study Materials - ${course.name}`,
    description: `Study materials, PDFs, notes, and exam papers for ${subject.name} in ${semester.name} of ${course.name} at ${university.name}`,
    url: `${BASE_URL}/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects/${subjectSlug}/pdfs`,
    numberOfItems: totalPDFs,
  });

  // ── Render ───────────────────────────────────

  return (
    <>
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />

      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs items={breadcrumbItems} />

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {subject.name} - Study Materials
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              View and download PDFs with AI-powered analysis
            </p>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                {/* Debounced search */}
                <div className="relative w-full sm:max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search PDFs..."
                    value={searchInput}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg leading-5
                               bg-white dark:bg-gray-800 placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                {isAdmin && (
                  <Button
                    onClick={() => router.push('/admin/pdfs')}
                    variant="primary"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add PDF
                  </Button>
                )}
              </div>

              {/* Filters and Sort Controls */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex flex-col sm:flex-row gap-4 flex-1 w-full sm:w-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Sort by:
                    </label>
                    <select
                      value={sortBy}
                      onChange={(e) => handleSortChange(e.target.value as 'latest' | 'oldest' | 'title')}
                      className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="latest">Latest First</option>
                      <option value="oldest">Oldest First</option>
                      <option value="title">Title (A-Z)</option>
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Category:
                    </label>
                    <select
                      value={filterCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All Categories</option>
                      <option value="notes">Notes</option>
                      <option value="assignments">Assignments</option>
                      <option value="papers">Papers</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {pagination && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {hasActiveFilters
                        ? `${pagination.total} result${pagination.total !== 1 ? 's' : ''}`
                        : `${pagination.total} total`}
                    </span>
                  )}
                  {hasActiveFilters && (
                    <button
                      onClick={handleClearFilters}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* PDFs Grid */}
          {pdfsLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg">Loading PDFs...</p>
            </div>
          ) : pdfs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                {hasActiveFilters
                  ? 'No PDFs match your search or filters.'
                  : 'No PDFs found for this subject. Please add one from the admin panel.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={handleClearFilters}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear filters
                </button>
              )}
              {isAdmin && !hasActiveFilters && (
                <Button onClick={() => router.push('/admin/pdfs')} className="mt-4">
                  Add First PDF
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pdfs.map((pdf) => (
                  <Card key={pdf._id} hover={false} className="flex flex-col">
                    <div className="flex items-start justify-between mb-3">
                      <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      <span className={`text-xs font-medium px-2 py-1 rounded ${getCategoryColor(pdf.category)}`}>
                        {pdf.category}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                      {pdf.title}
                    </h3>

                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-1">
                      {pdf.description}
                    </p>

                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                      <div>Size: {formatFileSize(pdf.fileSize)}</div>
                      <div>Uploaded: {new Date(pdf.uploadedAt).toLocaleDateString()}</div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => setSelectedPDF(pdf)}
                        variant="primary"
                        size="sm"
                        className="flex-1"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        onClick={() => handleDownload(pdf)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {pagination && (
                <Pagination pagination={pagination} onPageChange={handlePageChange} />
              )}
            </>
          )}
        </div>
      </div>

      {/* PDF Viewer Modal */}
      {selectedPDF && (
        <PDFViewer
          fileUrl={selectedPDF.fileUrl}
          fileName={selectedPDF.fileName}
          title={selectedPDF.title}
          pdfId={selectedPDF._id?.toString()}
          onClose={() => setSelectedPDF(null)}
        />
      )}
    </>
  );
}
