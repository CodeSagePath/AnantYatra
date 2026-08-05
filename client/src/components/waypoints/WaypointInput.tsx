import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, X, Circle, Clock } from 'lucide-react';
import { searchApi } from '../../api/endpoints';
import type { SearchResult, Waypoint } from '../../types';
import { Input } from '../ui/input';

interface WaypointInputProps {
  value: Waypoint | null;
  onChange: (wp: Waypoint | null) => void;
  onRemove: () => void;
  placeholder?: string;
  isFirst?: boolean;
  isLast?: boolean;
}

export const WaypointInput: React.FC<WaypointInputProps> = ({
  value,
  onChange,
  onRemove,
  placeholder = "Choose destination...",
  isFirst,
  isLast,
}) => {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [recentSearches, setRecentSearches] = useState<SearchResult[]>(() => {
    const local = localStorage.getItem('anantyatra_recent_searches');
    return local ? JSON.parse(local) : [];
  });

  // Sync internal input query with external value if it changes
  useEffect(() => {
    if (value && value.name !== query) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setQuery(value.name || `${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`);
    } else if (!value) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const fetchResults = async () => {
      // Don't fetch if the query exactly matches the selected value
      if (query.length < 3 || query === value?.name) {
        setResults([]);
        if (query === value?.name && query.length > 0) {
          setIsOpen(false);
        }
        return;
      }
      
      setLoading(true);
      try {
        const res = await searchApi.searchPlaces(query);
        setResults(res.data);
        setIsOpen(true);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchResults, 400);
    return () => clearTimeout(timeoutId);
  }, [query, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (place: SearchResult) => {
    onChange({ lat: place.lat, lon: place.lon, name: place.display_name });
    setQuery(place.display_name);
    setIsOpen(false);

    // Save to recents
    const saved = localStorage.getItem('anantyatra_recent_searches');
    const recents: SearchResult[] = saved ? JSON.parse(saved) : [];
    const filtered = recents.filter(r => r.display_name !== place.display_name || r.lat !== place.lat);
    const newRecents = [place, ...filtered].slice(0, 5); // Keep top 5
    localStorage.setItem('anantyatra_recent_searches', JSON.stringify(newRecents));
    setRecentSearches(newRecents);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(true); // Keep open to show recents
  };

  return (
    <div className="relative w-full z-20 group" ref={dropdownRef}>
      <div className="relative flex items-center gap-2">
        {/* Connection Line & Icon */}
        <div className="relative flex flex-col items-center justify-start pt-3 w-6 shrink-0 h-full min-h-[40px]">
          {!isLast && (
            <div className="absolute top-8 bottom-[-16px] left-[11px] border-l-2 border-dotted border-slate-300 dark:border-slate-600/60 pointer-events-none z-0 transition-colors" />
          )}
          {isFirst ? (
            <Circle className="w-3.5 h-3.5 text-evergreen dark:text-porcelain fill-white dark:fill-midnight-1 z-10 transition-colors" />
          ) : isLast && value ? (
            <MapPin className="w-4 h-4 text-grapefruit fill-grapefruit/20 z-10 transition-colors" />
          ) : (
            <Circle className="w-3 h-3 text-slate-400 dark:text-slate-500 fill-slate-400 dark:fill-slate-500 z-10 transition-colors" />
          )}
        </div>

        {/* Input Field */}
        <div className="relative flex-1">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0 || recentSearches.length > 0) setIsOpen(true);
            }}
            placeholder={placeholder}
            className={`w-full h-11 pr-10 bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-evergreen dark:text-porcelain placeholder:text-slate-400 dark:placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-evergreen/30 dark:focus-visible:ring-grapefruit/30 focus-visible:border-evergreen dark:focus-visible:border-grapefruit shadow-sm rounded-xl transition-all ${
              value ? 'border-evergreen/40 dark:border-grapefruit/50 bg-white dark:bg-slate-700/50 shadow-md' : ''
            }`}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-evergreen dark:text-grapefruit animate-spin" />
          )}
          {!loading && query && (
            <button
              onClick={handleClear}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-evergreen dark:text-slate-500 dark:hover:text-porcelain transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* Remove button (hidden for origin/dest if there's no third option usually, but we allow it) */}
        <button
          onClick={onRemove}
          className="w-8 h-10 flex items-center justify-center text-slate-400 dark:text-slate-600 hover:text-grapefruit dark:hover:text-grapefruit transition-colors opacity-0 group-hover:opacity-100 focus-within:opacity-100"
          title="Remove stop"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && (results.length > 0 || (query.length >= 3 && results.length === 0 && !loading) || (query.length < 3 && recentSearches.length > 0 && query !== value?.name)) && (
        <div className="absolute top-full left-8 right-8 mt-1 bg-white dark:bg-midnight-2 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto z-[100] transition-colors duration-300">
          
          {query.length >= 3 && results.length === 0 && !loading && (
            <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
              No results found for "<span className="font-semibold text-evergreen dark:text-slate-300">{query}</span>"
            </div>
          )}
          
          {results.length === 0 && recentSearches.length > 0 && query.length < 3 && (
            <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-midnight-1/50 border-b border-slate-100 dark:border-slate-700/50">
              Recent Searches
            </div>
          )}

          {(results.length > 0 ? results : (query.length < 3 ? recentSearches : [])).map((place, idx) => {
            const isRecent = results.length === 0 && query.length < 3;
            return (
              <div
                key={idx}
                onClick={() => handleSelect(place)}
                className="p-2.5 hover:bg-slate-50 dark:hover:bg-midnight-1 cursor-pointer border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 flex items-start gap-2.5 transition-colors"
              >
                {isRecent ? (
                  <Clock className="w-4 h-4 text-evergreen/40 dark:text-slate-500 shrink-0 mt-0.5 transition-colors" />
                ) : (
                  <MapPin className="w-4 h-4 text-evergreen/60 dark:text-slate-400 shrink-0 mt-0.5 transition-colors" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-evergreen dark:text-slate-200 text-sm line-clamp-2 transition-colors">{place.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight transition-colors">{place.display_name}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
