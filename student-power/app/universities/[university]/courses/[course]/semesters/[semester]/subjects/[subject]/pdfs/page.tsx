'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import SearchBar from '@/components/ui/SearchBar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PDFViewer from '@/components/pdf-viewer/PDFViewer';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { FileText, Download, ArrowLeft, Plus, Eye } from 'lucide-react';
import { generateCollectionSchema, generatePDFSchema } from '@/lib/seo/structured-data';
import { BASE_URL } from '@/lib/seo/metadata';

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

export default function PDFsPage() {
  const router = useRouter();
  const params = useParams();
  const universitySlug = params.university as string;
  const courseSlug = params.course as string;
  const semesterSlug = params.semester as string;
  const subjectSlug = params.subject as string;
  const { isAdmin } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPDF, setSelectedPDF] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'title'>('latest');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [university, setUniversity] = useState<University | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [pdfs, setPdfs] = useState<PDF[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch university details
        const uniResponse = await fetch(`/api/universities/${universitySlug}`);
        const uniData = await uniResponse.json();
        if (uniData.success) {
          setUniversity(uniData.data);
        }

        // Fetch course details
        const courseResponse = await fetch(`/api/courses/${courseSlug}`);
        const courseData = await courseResponse.json();
        if (courseData.success) {
          setCourse(courseData.data);
        }

        // Fetch semester details
        const semesterResponse = await fetch(`/api/semesters/${semesterSlug}`);
        const semesterData = await semesterResponse.json();
        if (semesterData.success) {
          setSemester(semesterData.data);
        }

        // Fetch subject details
        const subjectResponse = await fetch(`/api/subjects/${subjectSlug}`);
        const subjectData = await subjectResponse.json();
        if (subjectData.success) {
          setSubject(subjectData.data);
        }

        // Fetch PDFs for this subject (using actual _id from subject data)
        const pdfsResponse = await fetch('/api/pdfs');
        const pdfsData = await pdfsResponse.json();
        if (pdfsData.success && subjectData.data) {
          const subjectPDFs = pdfsData.data.filter(
            (pdf: PDF) => pdf.subjectId === subjectData.data._id
          );
          setPdfs(subjectPDFs);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [universitySlug, courseSlug, semesterSlug, subjectSlug]);

  const filteredPDFs = useMemo(() => {
    let result = pdfs.filter(pdf =>
      pdf.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pdf.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Apply category filter
    if (filterCategory !== 'all') {
      result = result.filter(pdf => pdf.category === filterCategory);
    }

    // Apply sorting
    result.sort((a, b) => {
      if (sortBy === 'latest') {
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      } else if (sortBy === 'oldest') {
        return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      } else if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return result;
  }, [pdfs, searchQuery, sortBy, filterCategory]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getCategoryColor = (category: string) => {
    const colors: any = {
      notes: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      assignments: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      papers: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    return colors[category] || colors.other;
  };

  const handleDownload = useCallback(async (pdf: PDF) => {
    try {
      // Fetch the file from the URL
      const response = await fetch(pdf.fileUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch PDF file');
      }
      
      // Get the blob and ensure it's a PDF type
      const blob = await response.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });

      // Create a temporary <a> link and trigger download
      const link = document.createElement('a');
      link.href = URL.createObjectURL(pdfBlob);
      
      // Use title for download name instead of uploaded fileName
      // Sanitize the title by removing invalid filename characters
      const downloadName = pdf.title.replace(/[<>:"/\\|?*]/g, '_').trim();
      
      link.download = downloadName.endsWith('.pdf') ? downloadName : `${downloadName}.pdf`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download PDF. Please try again.');
    }
  }, []);


  if (loading) {
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

  // Generate breadcrumb items
  const breadcrumbItems = [
    { name: 'Universities', href: '/universities' },
    { name: university?.name || '', href: `/universities/${universitySlug}/courses` },
    { name: course?.name || '', href: `/universities/${universitySlug}/courses/${courseSlug}/semesters` },
    { name: semester?.name || '', href: `/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects` },
    { name: subject?.name || '', href: `/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects/${subjectSlug}` },
  ].filter(item => item.name);

  // Generate structured data for the collection
  const collectionSchema = university && course && semester && subject ? generateCollectionSchema({
    name: `${subject.name} Study Materials - ${course.name}`,
    description: `Study materials, PDFs, notes, and exam papers for ${subject.name} in ${semester.name} of ${course.name} at ${university.name}`,
    url: `${BASE_URL}/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects/${subjectSlug}/pdfs`,
    numberOfItems: pdfs.length,
  }) : null;

  return (
    <>
      {/* Structured Data */}
      {collectionSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
        />
      )}

      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs items={breadcrumbItems} />

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {subject?.name} - Study Materials
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              View and download PDFs with AI-powered analysis
            </p>

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <SearchBar
                  placeholder="Search PDFs..."
                  onSearch={setSearchQuery}
                  className="w-full sm:max-w-md"
                />
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
                      onChange={(e) => setSortBy(e.target.value as 'latest' | 'oldest' | 'title')}
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
                      onChange={(e) => setFilterCategory(e.target.value)}
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

                {(searchQuery || filterCategory !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterCategory('all');
                    }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* PDFs Grid */}
          {filteredPDFs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                {pdfs.length === 0 ? 'No PDFs found for this subject. Please add one from the admin panel.' : 'No PDFs found matching your search'}
              </p>
              {isAdmin && pdfs.length === 0 && (
                <Button onClick={() => router.push('/admin/pdfs')} className="mt-4">
                  Add First PDF
                </Button>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPDFs.map((pdf) => (
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
