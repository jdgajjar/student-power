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
  Files,
  CheckCircle2,
  AlertCircle,
  Loader2,
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

/** Result of a single file in a bulk upload */
interface BulkFileResult {
  fileName: string;
  success: boolean;
  error?: string;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const PAGE_SIZE = 10;

const emptyFormData: PDF = {
  subjectId: '',
  title: '',
  description: '',
  fileName: '',
  fileUrl: '',
  fileSize: 0,
  category: 'other',
};

const CATEGORY_OPTIONS = [
  { value: 'notes',       label: 'Notes' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'papers',      label: 'Papers' },
  { value: 'other',       label: 'Other' },
] as const;

// ──────────────────────────────────────────────
// SearchableSubjectDropdown
// ──────────────────────────────────────────────

interface SearchableSubjectDropdownProps {
  subjects: Subject[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

function SearchableSubjectDropdown({
  subjects,
  value,
  onChange,
  placeholder = 'Select Subject',
  required = false,
  id,
}: SearchableSubjectDropdownProps) {
  const [open,         setOpen]        = useState(false);
  const [searchTerm,   setSearchTerm]  = useState('');
  const containerRef                   = useRef<HTMLDivElement>(null);
  const searchRef                      = useRef<HTMLInputElement>(null);

  const selectedSubject = subjects.find((s) => s._id === value);

  const filtered = searchTerm.trim()
    ? subjects.filter(
        (s) =>
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.code.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : subjects;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = (subjectId: string) => {
    onChange(subjectId);
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className="relative" id={id}>
      {/* Hidden native select for form validation */}
      {required && (
        <select
          required={required}
          value={value}
          onChange={() => {}}
          aria-hidden="true"
          tabIndex={-1}
          className="absolute opacity-0 pointer-events-none w-0 h-0"
        >
          <option value="" />
          {subjects.map((s) => (
            <option key={s._id} value={s._id} />
          ))}
        </select>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-4 py-2 border rounded-lg text-left
                    transition-colors text-sm
                    ${
                      open
                        ? 'border-blue-500 ring-2 ring-blue-500/30 bg-white dark:bg-gray-700'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                    }
                    text-gray-900 dark:text-white`}
      >
        <span className={selectedSubject ? '' : 'text-gray-500 dark:text-gray-400'}>
          {selectedSubject
            ? `${selectedSubject.code} - ${selectedSubject.name}`
            : placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600
                        rounded-lg shadow-lg overflow-hidden">
          {/* Search box */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search subjects..."
                className="w-full pl-7 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200
                           dark:border-gray-600 rounded-md text-gray-900 dark:text-white
                           placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Options list */}
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                No subjects found
              </li>
            ) : (
              filtered.map((s) => (
                <li key={s._id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(s._id)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                                ${
                                  s._id === value
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                    : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                  >
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">
                      {s.code}
                    </span>
                    {s.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

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
      if (idx > 0 && sorted[idx] - sorted[idx - 1] > 1) {
        result.push('...');
      }
      result.push(sorted[idx]);
    }

    return result;
  };

  const pageNumbers = buildPageNumbers();
  const startItem   = (page - 1) * limit + 1;
  const endItem     = Math.min(page * limit, total);

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
            key={page}
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
  const router      = useRouter();
  const { isAdmin } = useStore();

  // Data state
  const [pdfs, setPdfs]               = useState<PDF[]>([]);
  const [pagination, setPagination]   = useState<PaginationMeta | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Supporting data
  const [subjects,     setSubjects]     = useState<Subject[]>([]);
  const [semesters,    setSemesters]    = useState<Semester[]>([]);
  const [courses,      setCourses]      = useState<Course[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);

  // UI state — single-upload modal
  const [loading,      setLoading]      = useState(true);
  const [uploading,    setUploading]    = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isHydrated,   setIsHydrated]   = useState(false);

  // UI state — bulk-upload modal
  const [showBulkModal,    setShowBulkModal]    = useState(false);
  const [bulkUploading,    setBulkUploading]    = useState(false);
  const [bulkFiles,        setBulkFiles]        = useState<File[]>([]);
  const [bulkSubjectId,    setBulkSubjectId]    = useState('');
  const [bulkCategory,     setBulkCategory]     = useState<'notes' | 'assignments' | 'papers' | 'other'>('other');
  const [bulkDescription,  setBulkDescription]  = useState('');
  const [bulkResults,      setBulkResults]      = useState<BulkFileResult[] | null>(null);
  const [bulkSummary,      setBulkSummary]      = useState<{ uploaded: number; failed: number } | null>(null);

  // ── Server-side filters ───────────────────────
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterSubject,  setFilterSubject]  = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form (single upload)
  const [formData, setFormData] = useState<PDF>(emptyFormData);

  useEffect(() => { setIsHydrated(true); }, []);

  // ── Data fetching ────────────────────────────

  const fetchPDFs = useCallback(
    async (
      page = 1,
      overrideSearch?: string,
      overrideSubject?: string,
      overrideCategory?: string,
    ) => {
      try {
        setLoading(true);

        const search   = overrideSearch   !== undefined ? overrideSearch   : searchQuery;
        const subject  = overrideSubject  !== undefined ? overrideSubject  : filterSubject;
        const category = overrideCategory !== undefined ? overrideCategory : filterCategory;

        const params = new URLSearchParams({
          page:     String(page),
          limit:    String(PAGE_SIZE),
          paginate: 'true',
        });

        if (search.trim())       params.set('search',    search.trim());
        if (subject  !== 'all')  params.set('subjectId', subject);
        if (category !== 'all')  params.set('category',  category);

        const res  = await fetch(`/api/pdfs?${params.toString()}`, {
          cache:   'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const data = await res.json();

        if (data.success) {
          setPdfs(data.data);
          if (data.pagination) setPagination(data.pagination);
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

  const fetchSubjects     = async () => {
    try {
      const res  = await fetch('/api/subjects',     { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      const data = await res.json();
      if (data.success) setSubjects(data.data);
    } catch (e) { console.error(e); }
  };

  const fetchSemesters    = async () => {
    try {
      const res  = await fetch('/api/semesters',    { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      const data = await res.json();
      if (data.success) setSemesters(data.data);
    } catch (e) { console.error(e); }
  };

  const fetchCourses      = async () => {
    try {
      const res  = await fetch('/api/courses',      { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      const data = await res.json();
      if (data.success) setCourses(data.data);
    } catch (e) { console.error(e); }
  };

  const fetchUniversities = async () => {
    try {
      const res  = await fetch('/api/universities', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      const data = await res.json();
      if (data.success) setUniversities(data.data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!isHydrated) return;
    if (!isAdmin) {
      router.push('/admin/login');
    } else {
      fetchPDFs(1);
      fetchSubjects();
      fetchSemesters();
      fetchCourses();
      fetchUniversities();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, router, isHydrated]);

  // ── Filter handlers ──────────────────────────

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchPDFs(1, value, undefined, undefined);
    }, 350);
  };

  const handleSubjectChange  = (value: string) => { setFilterSubject(value);  fetchPDFs(1, undefined, value, undefined); };
  const handleCategoryChange = (value: string) => { setFilterCategory(value); fetchPDFs(1, undefined, undefined, value); };

  const handleClearFilters = () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchQuery('');
    setFilterSubject('all');
    setFilterCategory('all');
    fetchPDFs(1, '', 'all', 'all');
  };

  const handlePageChange = (page: number) => {
    fetchPDFs(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Single-upload helpers ─────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') { alert('Please select a PDF file'); return; }
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
      const res  = await fetch('/api/pdfs/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) return { url: data.data.url, publicId: data.data.publicId, size: data.data.size };
      alert(`Upload error: ${data.error}`);
      return null;
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file');
      return null;
    }
  };

  // ── Single modal helpers ──────────────────────

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
      subjectId:   pdf.subjectId,
      title:       pdf.title,
      description: pdf.description,
      fileName:    pdf.fileName,
      fileUrl:     pdf.fileUrl,
      fileSize:    pdf.fileSize,
      category:    pdf.category,
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setSelectedFile(null);
    setFormData(emptyFormData);
  };

  // ── Bulk modal helpers ────────────────────────

  const handleOpenBulkModal = () => {
    setBulkFiles([]);
    setBulkSubjectId('');
    setBulkCategory('other');
    setBulkDescription('');
    setBulkResults(null);
    setBulkSummary(null);
    setShowBulkModal(true);
  };

  const handleCloseBulkModal = () => {
    if (bulkUploading) return; // prevent closing during upload
    setShowBulkModal(false);
    setBulkFiles([]);
    setBulkSubjectId('');
    setBulkCategory('other');
    setBulkDescription('');
    setBulkResults(null);
    setBulkSummary(null);
  };

  const handleBulkFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;

    const validFiles: File[]  = [];
    const invalidNames: string[] = [];

    Array.from(fileList).forEach((file) => {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        validFiles.push(file);
      } else {
        invalidNames.push(file.name);
      }
    });

    if (invalidNames.length > 0) {
      alert(`The following files are not PDFs and were skipped:\n${invalidNames.join('\n')}`);
    }

    setBulkFiles((prev) => {
      // Deduplicate by name+size
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const fresh    = validFiles.filter((f) => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...fresh];
    });

    // Reset input so the same files can be re-selected if needed
    e.target.value = '';
  };

  const handleRemoveBulkFile = (index: number) => {
    setBulkFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!bulkSubjectId) { alert('Please select a subject'); return; }
    if (bulkFiles.length === 0) { alert('Please select at least one PDF file'); return; }

    setBulkUploading(true);
    setBulkResults(null);
    setBulkSummary(null);

    try {
      const fd = new FormData();
      fd.append('subjectId',   bulkSubjectId);
      fd.append('category',    bulkCategory);
      fd.append('description', bulkDescription);

      bulkFiles.forEach((file) => fd.append('files', file));

      const res  = await fetch('/api/pdfs/upload/bulk', { method: 'POST', body: fd });
      const data = await res.json();

      if (data.success || (data.data?.uploaded > 0)) {
        setBulkResults(data.data?.results ?? []);
        setBulkSummary({ uploaded: data.data?.uploaded ?? 0, failed: data.data?.failed ?? 0 });
        // Refresh PDF list to show newly uploaded files
        fetchPDFs(1);
      } else {
        alert(`Bulk upload error: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Bulk upload error:', error);
      alert('Failed to perform bulk upload. Please try again.');
    } finally {
      setBulkUploading(false);
    }
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
        if (!uploadResult) { setUploading(false); return; }
        pdfData = {
          ...pdfData,
          fileUrl:            uploadResult.url,
          cloudinaryPublicId: uploadResult.publicId,
          fileSize:           uploadResult.size,
          fileName:           selectedFile.name,
        };
      }

      const url    = editingId ? `/api/pdfs/${editingId}` : '/api/pdfs';
      const method = editingId ? 'PUT' : 'POST';

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(pdfData),
        cache:   'no-store',
      });
      const data = await res.json();

      if (data.success) {
        alert(editingId ? 'PDF updated successfully!' : 'PDF added successfully!');
        handleCloseModal();
        fetchPDFs(currentPage);
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
      setPdfs((prev) => prev.filter((pdf) => pdf._id !== id));

      const response = await fetch(`/api/pdfs/${id}`, { method: 'DELETE', cache: 'no-store' });
      const data     = await response.json();

      if (data.success) {
        alert('PDF deleted successfully!');
        const newPage = pdfs.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
        fetchPDFs(newPage);
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
    const subject    = subjects.find((s) => s._id === pdf.subjectId);
    if (!subject?.slug) return;
    const semester   = semesters.find((s) => s._id === subject.semesterId);
    if (!semester?.slug) return;
    const course     = courses.find((c) => c._id === subject.courseId);
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
    const k     = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i     = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const hasActiveFilters =
    searchQuery !== '' || filterSubject !== 'all' || filterCategory !== 'all';

  // ── Guard ────────────────────────────────────

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

            {/* Action buttons — "+ Add Many" to the left of "+ Add PDF" */}
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleOpenBulkModal}>
                <Files className="h-4 w-4 mr-2" />
                Add Many
              </Button>
              <Button onClick={handleOpenModal}>
                <Plus className="h-4 w-4 mr-2" />
                Add PDF
              </Button>
            </div>
          </div>

          {/* Search & Filter row */}
          <div className="space-y-4 mt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search PDFs by title or description..."
                  value={searchQuery}
                  onChange={handleSearchChange}
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
                    onChange={(e) => handleSubjectChange(e.target.value)}
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
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Categories</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
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
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              {pdfs.map((pdf) => (
                <Card key={pdf._id} hover={true}>
                  <div className="flex justify-between items-start">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handlePdfClick(pdf)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePdfClick(pdf); }
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

                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditModal(pdf); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400
                                   dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Edit PDF"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(pdf._id || '', pdf.title); }}
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

            {pagination && (
              <Pagination pagination={pagination} onPageChange={handlePageChange} />
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ── Single Upload / Edit Modal ──────────────────────────────
            ═══════════════════════════════════════════════════════════════ */}
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
                    {/* Subject — searchable */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Subject *
                      </label>
                      <SearchableSubjectDropdown
                        subjects={subjects}
                        value={formData.subjectId}
                        onChange={(v) => setFormData({ ...formData, subjectId: v })}
                        placeholder="Select Subject"
                        required
                      />
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
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
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
                    <Button type="button" variant="secondary" onClick={handleCloseModal} disabled={uploading}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={uploading}>
                      {uploading ? 'Uploading...' : editingId ? 'Update PDF' : 'Upload PDF'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            ── Bulk Upload Modal ("+ Add Many") ────────────────────────
            ═══════════════════════════════════════════════════════════════ */}
        {showBulkModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                {/* Modal header */}
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Bulk Upload PDFs
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Upload multiple PDFs at once — each file becomes a separate record.
                    </p>
                  </div>
                  <button
                    onClick={handleCloseBulkModal}
                    disabled={bulkUploading}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* ── Results panel (shown after upload) ── */}
                {bulkResults !== null && bulkSummary !== null ? (
                  <div className="space-y-4">
                    {/* Summary banner */}
                    <div
                      className={`flex items-center gap-3 p-4 rounded-lg ${
                        bulkSummary.failed === 0
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : bulkSummary.uploaded === 0
                          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                          : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                      }`}
                    >
                      {bulkSummary.failed === 0 ? (
                        <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {bulkSummary.failed === 0
                            ? `All ${bulkSummary.uploaded} file(s) uploaded successfully!`
                            : `${bulkSummary.uploaded} uploaded, ${bulkSummary.failed} failed`}
                        </p>
                        {bulkSummary.failed > 0 && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Check the failed files below for details.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Per-file results */}
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {bulkResults.map((r, i) => (
                        <li
                          key={i}
                          className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm ${
                            r.success
                              ? 'bg-green-50 dark:bg-green-900/10'
                              : 'bg-red-50 dark:bg-red-900/10'
                          }`}
                        >
                          {r.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {r.fileName}
                            </p>
                            {!r.success && r.error && (
                              <p className="text-red-600 dark:text-red-400 text-xs">{r.error}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>

                    {/* Close / Upload more */}
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="secondary" onClick={handleCloseBulkModal}>
                        Close
                      </Button>
                      <Button
                        onClick={() => {
                          setBulkResults(null);
                          setBulkSummary(null);
                          setBulkFiles([]);
                        }}
                      >
                        Upload More
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── Upload form ── */
                  <form onSubmit={handleBulkSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Subject — searchable */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Subject *
                        </label>
                        <SearchableSubjectDropdown
                          subjects={subjects}
                          value={bulkSubjectId}
                          onChange={setBulkSubjectId}
                          placeholder="Select Subject"
                          required
                        />
                      </div>

                      {/* Category */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Category
                        </label>
                        <select
                          value={bulkCategory}
                          onChange={(e) =>
                            setBulkCategory(e.target.value as any)
                          }
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                     focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* PDF Files — multiple */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        PDF Files *
                        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                          (Title = file name, select multiple)
                        </span>
                      </label>

                      {/* Drop-zone / picker */}
                      <label className="block cursor-pointer">
                        <div
                          className="flex flex-col items-center justify-center gap-2 px-4 py-6
                                     border-2 border-dashed border-gray-300 dark:border-gray-600
                                     rounded-lg bg-gray-50 dark:bg-gray-700/50
                                     hover:border-blue-400 dark:hover:border-blue-500
                                     hover:bg-blue-50/40 dark:hover:bg-blue-900/10
                                     transition-colors"
                        >
                          <Upload className="h-7 w-7 text-gray-400" />
                          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              Click to select
                            </span>{' '}
                            one or more PDF files
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            PDF only · max 100 MB each
                          </p>
                        </div>
                        <input
                          type="file"
                          accept=".pdf"
                          multiple
                          onChange={handleBulkFileSelect}
                          className="hidden"
                        />
                      </label>

                      {/* Selected files list */}
                      {bulkFiles.length > 0 && (
                        <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                            {bulkFiles.length} file{bulkFiles.length !== 1 ? 's' : ''} selected
                          </p>
                          {bulkFiles.map((file, idx) => (
                            <div
                              key={`${file.name}-${file.size}-${idx}`}
                              className="flex items-center justify-between gap-2 px-3 py-2
                                         bg-gray-50 dark:bg-gray-700 rounded-lg border
                                         border-gray-200 dark:border-gray-600"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                <span className="text-sm text-gray-900 dark:text-white truncate">
                                  {file.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatFileSize(file.size)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBulkFile(idx)}
                                  className="p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400
                                             transition-colors rounded"
                                  title="Remove file"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Description (optional, shared) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description
                        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                          (optional — if blank, each PDF's description = its filename)
                        </span>
                      </label>
                      <textarea
                        value={bulkDescription}
                        onChange={(e) => setBulkDescription(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                                   placeholder:text-gray-500 dark:placeholder:text-gray-400
                                   focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                        placeholder="Shared description for all uploaded PDFs (leave blank to use filename)"
                      />
                    </div>

                    {/* Upload progress indicator */}
                    {bulkUploading && (
                      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20
                                       border border-blue-200 dark:border-blue-800 rounded-lg">
                        <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            Uploading {bulkFiles.length} file{bulkFiles.length !== 1 ? 's' : ''}…
                          </p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            Please do not close this window.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleCloseBulkModal}
                        disabled={bulkUploading}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={bulkUploading || bulkFiles.length === 0}
                        loading={bulkUploading}
                      >
                        {bulkUploading
                          ? `Uploading ${bulkFiles.length} file${bulkFiles.length !== 1 ? 's' : ''}…`
                          : `Upload ${bulkFiles.length > 0 ? bulkFiles.length + ' ' : ''}PDF${bulkFiles.length !== 1 ? 's' : ''}`}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
