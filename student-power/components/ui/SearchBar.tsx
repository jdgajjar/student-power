'use client';

import { Search } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  className?: string;
  /** Controlled value – when provided the component syncs its display to this value */
  value?: string;
  /** Debounce delay in ms (default: 350). Set to 0 to disable debounce. */
  debounceMs?: number;
}

export default function SearchBar({
  placeholder = 'Search...',
  onSearch,
  className = '',
  value,
  debounceMs = 350,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(value ?? '');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Sync controlled value from outside (e.g., when filters are cleared)
  useEffect(() => {
    if (value !== undefined) {
      setInternalQuery(value);
    }
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalQuery(newValue);

    if (debounceMs > 0) {
      // Debounced callback
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onSearch(newValue);
      }, debounceMs);
    } else {
      // Immediate callback
      onSearch(newValue);
    }
  };

  return (
    <div className={`relative w-full max-w-2xl ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-gray-400" />
      </div>
      <input
        type="text"
        value={internalQuery}
        onChange={handleChange}
        className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        placeholder={placeholder}
      />
    </div>
  );
}
