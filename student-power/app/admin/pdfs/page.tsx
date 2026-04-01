'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import {
  ArrowLeft,
  Plus,
  X,
  Upload,
  FileText,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface PDF {
  _id?: string;
  subjectId: string;
  title: string;
  description: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  cloudinaryPublicId?: string;
  category: 'notes' | 'assignments' | 'papers' | 'other';
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface Subject {
  _id: string;
  name: string;
  slug: string;
  code: string;
  semesterId: string;
  courseId: string;
}

interface Semester {
  _id: string;
  name: string;
  slug: string;
  courseId: string;
}

interface Course {
  _id: string;
  name: string;
  slug: string;
  universityId: string;
}

interface University {
  _id: string;
  name: string;
  slug: string;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 350;

const emptyFormData: PDF = {
  subjectId: '',
  title: '',
  description: '',
  fileName: '',
  fileUrl: '',
  fileSize: 0,
  category: 'other',
};

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

  /**
   * Build a compact page-number list.
   * Always shows: page 1, current page ± 1, last page.
   * Inserts '…' wherever there is a gap larger than 1.
   */
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
      if (idx > 0 && sorted[idx] - sorted[idx - 1] > 1) {
        result.push('...');
      }
      result.push(sorted[idx]);
    }

    return result;
  };

  const pageNumbers = buildPageNumbers();

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="mt-8 flex flex-col items-center gap-4">
      {/* Result count info */}
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Showing <span className="font-semibold">{startItem}–{endItem}</span> of{' '}
        <span className="font-semibold">{total}</span> PDFs
      </p>

      {/* Navigation row */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {/* Previous */}
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

        {/* Page numbers */}
        {pageNumbers.map((p, idx) =>
          p === '...' ? (
            <span
              key={`ellipsis-${idx}`}
              className="px-2 py-2 text-gray-500 dark:text-gray-400 select-none"
            >
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

        {/* Next */}
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

      {/* Jump-to-page input for large sets */}
      {totalPages > 5 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <label htmlFor="jump-to-page" className="whitespace-nowrap">
            Go to page:
          </label>
          <input
            id="jump-to-page"
            type="number"
            min={1}
            max={totalPages}
            defaultValue={page}
            key={page} // reset when page changes externally
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = parseInt((e.target as HTMLInputElement).value, 10);
                if (val >= 1 && val <= totalPages) onPageChange(val);
              }
            }}
            className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700
                       text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span>of {totalPages}</span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page component
// ──────────────────────────────────────────────

export default function ManagePDFs() {
  const router = useRouter();
  const { isAdmin } = useStore();

  // Data state
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Supporting data
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Search & filter state (all applied server-side)
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Form
  const [formData, setFormData] = useState<PDF>(emptyFormData);

  // Debounce timer ref
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Wait for Zustand to hydrate from localStorage
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // ── Debounced search ──────────────────────────

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(value);
      setCurrentPage(1);
    }, DEBOUNCE_MS);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ── Data fetching ────────────────────────────

  /**
   * Fetch a page of PDFs from the backend applying all active filters.
   * All filtering (search, subject, category) is done at the database level.
   */
  const fetchPDFs = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);

        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          paginate: 'true',
        });

        // Server-side filters
        if (searchQuery.trim() !== '') params.set('search', searchQuery.trim());
        if (filterSubject !== 'all') params.set('subjectId', filterSubject);
        if (filterCategory !== 'all') params.set('category', filterCategory);

        const res = await fetch(`/api/pdfs?${params.toString()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });

        const data = await res.json();

        if (data.success) {
          setPdfs(data.data);
          if (data.pagination) {
            setPagination(data.pagination);
          }
          setCurrentPage(page);
        }
      } catch (error) {
        console.error('Error fetching PDFs:', error);
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, filterSubject, filterCategory]
  );

  const fetchSubjects = async () => {
    try {
      const res = await fetch('/api/subjects', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data.success) setSubjects(data.data);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchSemesters = async () => {
    try {
      const res = await fetch('/api/semesters', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data.success) setSemesters(data.data);
    } catch (error) {
      console.error('Error fetching semesters:', error);
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await fetch('/api/courses', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data.success) setCourses(data.data);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const fetchUniversities = async () => {
    try {
      const res = await fetch('/api/universities', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data.success) setUniversities(data.data);
    } catch (error) {
      console.error('Error fetching universities:', error);
    }
  };

  // Initial load
  useEffect(() => {
    if (!isHydrated) return;
    if (!isAdmin) {
      router.push('/admin/login');
    } else {
      fetchSubjects();
      fetchSemesters();
      fetchCourses();
      fetchUniversities();
    }
  }, [isAdmin, router, isHydrated]);

  // Re-fetch PDFs whenever filters or page changes
  useEffect(() => {
    if (!isHydrated || !isAdmin) return;
    fetchPDFs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterSubject, filterCategory]);

  // ── Page navigation ──────────────────────────

  const handlePageChange = (page: number) => {
    fetchPDFs(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Filter change handlers ────────────────────

  const handleFilterSubjectChange = (value: string) => {
    setFilterSubject(value);
    setCurrentPage(1);
  };

  const handleFilterCategoryChange = (value: string) => {
    setFilterCategory(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setFilterSubject('all');
    setFilterCategory('all');
    setCurrentPage(1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };

  // ── File upload helpers ──────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
      }
      setSelectedFile(file);
      setFormData({ ...formData, fileName: file.name, fileSize: file.size });
    }
  };

  const uploadFile = async (
    file: File
  ): Promise<{ url: string; publicId: string; size: number } | null> => {
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/pdfs/upload', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success) {
        return { url: data.data.url, publicId: data.data.publicId, size: data.data.size };
      }
      alert(`Upload error: ${data.error}`);
      return null;
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file');
      return null;
    }
  };

  // ── Modal helpers ────────────────────────────

  const handleOpenModal = () => {
    setEditingId(null);
    setSelectedFile(null);
    setFormData(emptyFormData);
    setShowModal(true);
  };

  const handleEditModal = (pdf: PDF) => {
    setEditingId(pdf._id || null);
    setSelectedFile(null);
    setFormData({
      subjectId: pdf.subjectId,
      title: pdf.title,
      description: pdf.description,
      fileName: pdf.fileName,
      fileUrl: pdf.fileUrl,
      fileSize: pdf.fileSize,
      category: pdf.category,
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setSelectedFile(null);
    setFormData(emptyFormData);
  };

  // ── CRUD operations ──────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.subjectId) {
      alert('Please fill in all required fields');
      return;
    }
    if (!editingId && !selectedFile) {
      alert('Please select a PDF file to upload');
      return;
    }

    setUploading(true);

    try {
      let pdfData = { ...formData };

      if (selectedFile) {
        const uploadResult = await uploadFile(selectedFile);
        if (!uploadResult) {
          setUploading(false);
          return;
        }
        pdfData = {
          ...pdfData,
          fileUrl: uploadResult.url,
          cloudinaryPublicId: uploadResult.publicId,
          fileSize: uploadResult.size,
          fileName: selectedFile.name,
        };
      }

      const url = editingId ? `/api/pdfs/${editingId}` : '/api/pdfs';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pdfData),
        cache: 'no-store',
      });

      const data = await res.json();

      if (data.success) {
        alert(editingId ? 'PDF updated successfully!' : 'PDF added successfully!');
        handleCloseModal();
        // Refresh current page to reflect changes
        setTimeout(() => fetchPDFs(currentPage), 100);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error saving PDF:', error);
      alert('Failed to save PDF');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      // Optimistic removal from the current page view
      setPdfs((prev) => prev.filter((pdf) => pdf._id !== id));

      const response = await fetch(`/api/pdfs/${id}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      const data = await response.json();

      if (data.success) {
        alert('PDF deleted successfully!');
        // Refresh – if we deleted the last item on a page, go to the previous page
        const newPage =
          pdfs.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
        setTimeout(() => fetchPDFs(newPage), 100);
      } else {
        alert(`Error: ${data.error}`);
        fetchPDFs(currentPage);
      }
    } catch (error) {
      console.error('Error deleting PDF:', error);
      alert('Failed to delete PDF');
      fetchPDFs(currentPage);
    }
  };

  const handlePdfClick = (pdf: PDF) => {
    const subject = subjects.find((s) => s._id === pdf.subjectId);
    if (!subject?.slug) return;

    const semester = semesters.find((s) => s._id === subject.semesterId);
    if (!semester?.slug) return;

    const course = courses.find((c) => c._id === subject.courseId);
    if (!course?.slug) return;

    const university = universities.find((u) => u._id === course.universityId);
    if (!university?.slug) return;

    router.push(
      `/universities/${university.slug}/courses/${course.slug}/semesters/${semester.slug}/subjects/${subject.slug}/pdfs`
    );
  };

  // ── Utility helpers ──────────────────────────

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const hasActiveFilters =
    searchQuery !== '' || filterSubject !== 'all' || filterCategory !== 'all';

  // ── Guard: wait for hydration / auth ─────────

  if (!isHydrated || !isAdmin) return null;

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back link */}
        <button
          onClick={() => router.push('/admin')}
          className="flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </button>

        {/* Header + Controls */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              Manage PDFs
            </h1>
            <Button onClick={handleOpenModal}>
              <Plus className="h-4 w-4 mr-2" />
              Add PDF
            </Button>
          </div>

          {/* Search & Filter row */}
          <div className="space-y-4 mt-6">
            {/* Search input with debounce */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search PDFs by title or description..."
                  value={searchInput}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             placeholder:text-gray-500 dark:placeholder:text-gray-400
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex flex-col sm:flex-row gap-4 flex-1 w-full sm:w-auto">
                {/* Subject filter */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    Subject:
                  </label>
                  <select
                    value={filterSubject}
                    onChange={(e) => handleFilterSubjectChange(e.target.value)}
                    className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Subjects</option>
                    {subjects.map((sub) => (
                      <option key={sub._id} value={sub._id}>
                        {sub.code} - {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category filter */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    Category:
                  </label>
                  <select
                    value={filterCategory}
                    onChange={(e) => handleFilterCategoryChange(e.target.value)}
                    className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Categories</option>
                    <option value="notes">Notes</option>
                    <option value="assignments">Assignments</option>
                    <option value="papers">Papers</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full sm:w-auto">
                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    Clear All Filters
                  </button>
                )}

                <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {pagination
                    ? hasActiveFilters
                      ? `${pagination.total} result${pagination.total !== 1 ? 's' : ''} found`
                      : `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)`
                    : `${pdfs.length} PDFs`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PDF grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">Loading PDFs...</p>
          </div>
        ) : pdfs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              {hasActiveFilters
                ? 'No PDFs match your search or filters. Try adjusting them.'
                : 'No PDFs found. Upload your first PDF!'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              {pdfs.map((pdf) => (
                <Card key={pdf._id} hover={true}>
                  <div className="flex justify-between items-start">
                    {/* Clickable content area */}
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handlePdfClick(pdf)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePdfClick(pdf);
                        }
                      }}
                    >
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2
                                     hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {pdf.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                        {pdf.description}
                      </p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full
                                         bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {pdf.category}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-500">
                          📄 {pdf.fileName}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-500">
                          💾 {formatFileSize(pdf.fileSize)}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditModal(pdf);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400
                                   dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Edit PDF"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(pdf._id || '', pdf.title);
                        }}
                        className="p-2 text-red-600 hover:bg-red-50 dark:text-red-400
                                   dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Delete PDF"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination – always shown, respects active filters */}
            {pagination && (
              <Pagination pagination={pagination} onPageChange={handlePageChange} />
            )}
          </>
        )}

        {/* ── Upload / Edit Modal ───────────────────────── */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {editingId ? 'Edit PDF' : 'Upload New PDF'}
                  </h2>
                  <button
                    onClick={handleCloseModal}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Subject */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Subject *
                      </label>
                      <select
                        required
                        value={formData.subjectId}
                        onChange={(e) =>
                          setFormData({ ...formData, subjectId: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                   focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Subject</option>
                        {subjects.map((sub) => (
                          <option key={sub._id} value={sub._id}>
                            {sub.code} - {sub.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Category
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) =>
                          setFormData({ ...formData, category: e.target.value as any })
                        }
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                   focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="notes">Notes</option>
                        <option value="assignments">Assignments</option>
                        <option value="papers">Papers</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                 placeholder:text-gray-500 dark:placeholder:text-gray-400
                                 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Lecture 1 - Introduction"
                    />
                  </div>

                  {/* File upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      PDF File {!editingId && '*'}
                    </label>
                    <div className="flex items-center">
                      <label className="flex-1 cursor-pointer">
                        <div
                          className="flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600
                                     rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                     hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          <span className="text-sm">
                            {selectedFile
                              ? selectedFile.name
                              : editingId
                              ? 'Keep current file or choose new'
                              : 'Choose PDF file'}
                          </span>
                        </div>
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {editingId && !selectedFile && formData.fileName && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Current file: {formData.fileName}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                 placeholder:text-gray-500 dark:placeholder:text-gray-400
                                 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      placeholder="PDF description"
                    />
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCloseModal}
                      disabled={uploading}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={uploading}>
                      {uploading
                        ? 'Uploading...'
                        : editingId
                        ? 'Update PDF'
                        : 'Upload PDF'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
