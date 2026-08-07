import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, X, Circle, Clock } from 'lucide-react';
import { searchApi } from '../../api/endpoints';
import type { SearchResult, Waypoint } from '../../types';

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
  placeholder = 'Choose destination...',
  isFirst,
  isLast,
}) => {
  const [query, setQuery] = useState(value?.name || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [recentSearches, setRecentSearches] = useState<SearchResult[]>(() => {
    const local = localStorage.getItem('anantyatra_recent_searches');
    return local ? JSON.parse(local) : [];
  });

  // Sync internal query with external value
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

  // Debounced search
  useEffect(() => {
    const fetchResults = async () => {
      setIsTyping(false);
      if (query.length < 3 || query === value?.name) {
        setResults([]);
        if (query === value?.name && query.length > 0) setIsOpen(false);
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
    const id = setTimeout(fetchResults, 400);
    return () => clearTimeout(id);
  }, [query, value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (place: SearchResult) => {
    onChange({ lat: place.lat, lon: place.lon, name: place.display_name });
    setQuery(place.display_name);
    setIsOpen(false);
    const saved = localStorage.getItem('anantyatra_recent_searches');
    const recents: SearchResult[] = saved ? JSON.parse(saved) : [];
    const filtered = recents.filter(r => r.display_name !== place.display_name || r.lat !== place.lat);
    const newRecents = [place, ...filtered].slice(0, 5);
    localStorage.setItem('anantyatra_recent_searches', JSON.stringify(newRecents));
    setRecentSearches(newRecents);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(true);
  };

  const showDropdown =
    isOpen &&
    (results.length > 0 ||
      (query.length >= 3 && !loading && !isTyping) ||
      (query.length < 3 && recentSearches.length > 0 && query !== value?.name));

  return (
    <div className="w-full group" ref={dropdownRef}>
      {/* Row: Icon column + Input + Remove button */}
      <div className="flex items-center gap-0 w-full relative z-10">
        {/* Timeline Icon column — exactly 44px center */}
        {/* w-8 for drag handle in WaypointList, plus w-6 for icon = 14px center within w-6 -> total center = 32 + 12 = 44px */}
        <div className="relative flex flex-col items-center justify-start w-[24px] shrink-0 self-stretch z-10">
          {/* Connector line drawn from center of icon, going down to bottom */}
          {!isLast && (
            <div className="absolute top-[28px] bottom-[-8px] left-[11px] w-[2px] bg-slate-200 dark:bg-slate-700 pointer-events-none z-0" />
          )}
          <div className="mt-[14px] bg-white dark:bg-[#1a2030] rounded-full z-10">
            {isFirst ? (
              <Circle className="w-4 h-4 text-evergreen dark:text-emerald-400 fill-white dark:fill-midnight-1 shrink-0" />
            ) : isLast && value ? (
              <MapPin className="w-5 h-5 text-grapefruit fill-grapefruit/20 shrink-0" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 fill-slate-300 dark:fill-slate-600 shrink-0" />
            )}
          </div>
        </div>

        {/* Input */}
        <div className="relative flex-1 min-w-0 ml-2 z-10">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setIsTyping(true); }}
            onFocus={() => { if (results.length > 0 || recentSearches.length > 0) setIsOpen(true); }}
            placeholder={placeholder}
            className={`
              w-full h-[48px] md:h-[52px] pl-4 pr-10 text-[15px] md:text-[14px] font-medium rounded-2xl outline-none
              bg-slate-100/80 dark:bg-slate-800/70
              border border-transparent
              text-slate-800 dark:text-slate-100
              placeholder:text-slate-400 dark:placeholder:text-slate-500
              focus:bg-white dark:focus:bg-slate-900
              focus:border-evergreen/60 dark:focus:border-grapefruit/60
              focus:shadow-[0_0_0_3px_rgba(30,120,70,0.12)] dark:focus:shadow-[0_0_0_3px_rgba(239,100,80,0.12)]
              transition-all duration-200
              ${value ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700' : ''}
            `}
          />
          {loading ? (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-evergreen dark:text-grapefruit animate-spin" />
          ) : query ? (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {/* Remove stop button — 44×48px touch target */}
        <button
          onClick={onRemove}
          className="w-[44px] h-[48px] md:h-[52px] flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all shrink-0 cursor-pointer ml-1 z-10"
          title="Remove stop"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Autocomplete Dropdown - Inline Expandable (prevents z-index clipping in mobile sheets) */}
      <div 
        className={`transition-all duration-300 ease-out overflow-hidden z-20 relative ${
          showDropdown ? 'max-h-[300px] opacity-100 mt-2 mb-3' : 'max-h-0 opacity-0 mt-0 mb-0'
        }`}
      >
        <div className="ml-[32px] mr-[48px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {query.length >= 3 && results.length === 0 && !loading && !isTyping && (
            <div className="p-4 text-center text-[14px] text-slate-400 dark:text-slate-500">
              No results for "<span className="font-semibold text-slate-600 dark:text-slate-300">{query}</span>"
            </div>
          )}
          {results.length === 0 && recentSearches.length > 0 && query.length < 3 && (
            <div className="px-4 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/60">
              Recent Searches
            </div>
          )}
          {(results.length > 0 ? results : query.length < 3 ? recentSearches : []).map((place, idx) => {
            const isRecent = results.length === 0 && query.length < 3;
            return (
              <div
                key={idx}
                onClick={() => handleSelect(place)}
                className="flex items-start gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
              >
                {isRecent ? (
                  <Clock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                ) : (
                  <MapPin className="w-5 h-5 text-grapefruit shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[14px] md:text-[13px] text-slate-800 dark:text-slate-100 line-clamp-1">{place.name}</p>
                  <p className="text-[12px] md:text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 line-clamp-1">{place.display_name}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
