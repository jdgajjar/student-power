'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { BookOpen, Award, Plus, Search } from 'lucide-react';

interface University {
  _id: string;
  name: string;
}

interface Course {
  _id: string;
  name: string;
}

interface Semester {
  _id: string;
  name: string;
  slug: string;
}

interface Subject {
  _id: string;
  name: string;
  slug: string;
  code: string;
  description: string;
  credits: number;
  courseId: string;
  semesterId: string;
}

const DEBOUNCE_MS = 350;

export default function SubjectsPage() {
  const router = useRouter();
  const params = useParams();
  const universitySlug = params.university as string;
  const courseSlug = params.course as string;
  const semesterSlug = params.semester as string;
  const { isAdmin } = useStore();

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [university, setUniversity] = useState<University | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [courseId, setCourseId] = useState<string>('');
  const [semesterId, setSemesterId] = useState<string>('');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [contextLoading, setContextLoading] = useState(true);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Debounced search handler
  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(value);
    }, DEBOUNCE_MS);
  };

  // Load university, course, semester context
  useEffect(() => {
    const loadContext = async () => {
      try {
        setContextLoading(true);

        const [uniRes, courseRes, semRes] = await Promise.all([
          fetch(`/api/universities/${universitySlug}`, { cache: 'no-store' }),
          fetch(`/api/courses/${courseSlug}`, { cache: 'no-store' }),
          fetch(`/api/semesters/${semesterSlug}`, { cache: 'no-store' }),
        ]);

        const [uniData, courseData, semData] = await Promise.all([
          uniRes.json(),
          courseRes.json(),
          semRes.json(),
        ]);

        if (uniData.success) setUniversity(uniData.data);
        if (courseData.success) {
          setCourse(courseData.data);
          setCourseId(courseData.data._id);
        }
        if (semData.success) {
          setSemester(semData.data);
          setSemesterId(semData.data._id);
        }
      } catch (error) {
        console.error('Error loading context:', error);
      } finally {
        setContextLoading(false);
      }
    };

    loadContext();
  }, [universitySlug, courseSlug, semesterSlug]);

  // Fetch subjects with server-side search and filtering
  useEffect(() => {
    if (!courseId || !semesterId) return;

    const fetchSubjects = async () => {
      try {
        setSubjectsLoading(true);
        const queryParams = new URLSearchParams({ courseId, semesterId });
        if (searchQuery.trim() !== '') queryParams.set('search', searchQuery.trim());

        const res = await fetch(`/api/subjects?${queryParams.toString()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const data = await res.json();
        if (data.success) setSubjects(data.data);
      } catch (error) {
        console.error('Error fetching subjects:', error);
      } finally {
        setSubjectsLoading(false);
      }
    };

    fetchSubjects();
  }, [courseId, semesterId, searchQuery]);

  if (contextLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400 text-lg">Loading...</p>
      </div>
    );
  }

  if (!university || !course || !semester) {
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
    { name: university.name, href: `/universities/${universitySlug}/courses` },
    { name: course.name, href: `/universities/${universitySlug}/courses/${courseSlug}/semesters` },
    { name: semester.name, href: `/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects` },
  ].filter((item) => item.name);

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb Navigation */}
        <Breadcrumbs items={breadcrumbItems} />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Subjects
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Select a subject to view PDFs and study materials
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Debounced search bar */}
            <div className="relative w-full sm:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search subjects..."
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg leading-5
                           bg-white dark:bg-gray-800 placeholder-gray-500
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            {isAdmin && (
              <Button
                onClick={() => router.push('/admin/subjects')}
                variant="primary"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Subject
              </Button>
            )}
          </div>
        </div>

        {/* Subjects Grid */}
        {subjectsLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 text-lg">Loading subjects...</p>
          </div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {searchQuery !== ''
                ? 'No subjects match your search.'
                : 'No subjects found for this semester. Please add one from the admin panel.'}
            </p>
            {searchQuery !== '' && (
              <button
                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear search
              </button>
            )}
            {isAdmin && searchQuery === '' && (
              <Button onClick={() => router.push('/admin/subjects')} className="mt-4">
                Add First Subject
              </Button>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <Card
                key={subject._id}
                onClick={() =>
                  router.push(
                    `/universities/${universitySlug}/courses/${courseSlug}/semesters/${semesterSlug}/subjects/${subject.slug}/pdfs`
                  )
                }
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {subject.name}
                    </h3>
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                      {subject.code}
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mb-4 flex-1">
                    {subject.description}
                  </p>
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <Award className="h-4 w-4 mr-1" />
                    {subject.credits} Credits
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
