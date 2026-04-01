'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { MapPin, BookOpen, Plus, Search } from 'lucide-react';

interface University {
  _id: string;
  name: string;
  slug: string;
  description: string;
  location: string;
  logo?: string;
}

const DEBOUNCE_MS = 350;

export default function UniversitiesPage() {
  const router = useRouter();
  const { isAdmin } = useStore();

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Fetch universities whenever searchQuery changes
  useEffect(() => {
    const fetchUniversities = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (searchQuery.trim() !== '') params.set('search', searchQuery.trim());

        const response = await fetch(
          `/api/universities${params.toString() ? `?${params.toString()}` : ''}`,
          { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
        );
        const data = await response.json();
        if (data.success) {
          setUniversities(data.data);
        }
      } catch (error) {
        console.error('Error fetching universities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUniversities();
  }, [searchQuery]);

  // Generate breadcrumb items
  const breadcrumbItems = [{ name: 'Universities', href: '/universities' }];

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb Navigation */}
        <Breadcrumbs items={breadcrumbItems} />

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Universities
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Select a university to explore courses and study materials
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Debounced search bar */}
            <div className="relative w-full sm:max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search universities..."
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg leading-5
                           bg-white dark:bg-gray-800 placeholder-gray-500
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            {isAdmin && (
              <Button
                onClick={() => router.push('/admin/universities')}
                variant="primary"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add University
              </Button>
            )}
          </div>
        </div>

        {/* Universities Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 text-lg">Loading universities...</p>
          </div>
        ) : universities.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {searchQuery !== ''
                ? 'No universities match your search.'
                : 'No universities found. Please add one from the admin panel.'}
            </p>
            {searchQuery !== '' && (
              <button
                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {universities.map((university) => (
              <Card
                key={university._id}
                onClick={() => router.push(`/universities/${university.slug}/courses`)}
              >
                <div className="flex flex-col h-full">
                  {university.logo && (
                    <img
                      src={university.logo}
                      alt={university.name}
                      className="h-16 w-16 object-contain mb-3"
                    />
                  )}
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {university.name}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4 flex-1">
                    {university.description}
                  </p>
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <MapPin className="h-4 w-4 mr-1" />
                    {university.location}
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
