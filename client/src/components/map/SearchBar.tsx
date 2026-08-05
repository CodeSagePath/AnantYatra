import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { searchApi } from '../../api/endpoints';
import type { SearchResult, Waypoint } from '../../types';
import { Input } from '../ui/input';

interface SearchBarProps {
  onSelectWaypoint: (waypoint: Waypoint) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSelectWaypoint }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const fetchResults = async () => {
      if (query.length < 3) {
        setResults([]);
        setIsOpen(false);
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

    const timeoutId = setTimeout(fetchResults, 500);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Click outside handler to close dropdown
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
    onSelectWaypoint({ lat: place.lat, lon: place.lon, name: place.name });
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-full max-w-md z-[1000]" ref={dropdownRef}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-5 h-5 text-indigo-400" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a place in India..."
          className="pl-10 h-12 bg-white/90 backdrop-blur-md border-indigo-200 shadow-xl text-slate-800 placeholder:text-slate-400 focus-visible:ring-indigo-500 rounded-xl"
        />
        {loading && <Loader2 className="absolute right-3 w-5 h-5 text-indigo-500 animate-spin" />}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-white/95 backdrop-blur-xl border border-indigo-100 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map((place, idx) => (
            <div
              key={idx}
              onClick={() => handleSelect(place)}
              className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-indigo-50 last:border-b-0 flex items-start gap-3 transition-colors"
            >
              <MapPin className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800">{place.name}</p>
                <p className="text-xs text-slate-500 line-clamp-1">{place.display_name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
