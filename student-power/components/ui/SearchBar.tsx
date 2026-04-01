'use client';

import { Search } from 'lucide-react';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  className?: string;
  /** Controlled value – pass this when the parent needs to reset the input */
  value?: string;
}

/**
 * SearchBar
 *
 * Supports both controlled (value prop provided) and uncontrolled usage.
 *
 * Controlled usage — parent manages the state:
 *   <SearchBar value={query} onSearch={setQuery} />
 *
 * Uncontrolled usage — component manages its own internal state:
 *   <SearchBar onSearch={handleSearch} />
 */
export default function SearchBar({
  placeholder = 'Search...',
  onSearch,
  className = '',
  value,
}: SearchBarProps) {
  const isControlled = value !== undefined;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearch(e.target.value);
  };

  return (
    <div className={`relative w-full max-w-2xl ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-5 w-5 text-gray-400" />
      </div>
      <input
        type="text"
        // If controlled, bind value; otherwise let the browser manage it
        {...(isControlled ? { value } : {})}
        onChange={handleChange}
        className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg
                   leading-5 bg-white dark:bg-gray-800 placeholder-gray-500
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all
                   text-gray-900 dark:text-white"
        placeholder={placeholder}
      />
    </div>
  );
}
