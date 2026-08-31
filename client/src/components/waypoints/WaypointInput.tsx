import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MapPin, X, Circle, Clock, Calendar, Moon, StickyNote } from 'lucide-react';
import { searchApi } from '../../api/endpoints';
import type { SearchResult, Waypoint } from '../../types';

interface WaypointInputProps {
  value: Waypoint | null;
  onChange: (wp: Waypoint | null) => void;
  onRemove: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  isFirst?: boolean;
  isLast?: boolean;
}

export const WaypointInput: React.FC<WaypointInputProps> = ({
  value,
  onChange,
  onRemove,
  onFocus,
  onBlur,
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

  const [showSchedule, setShowSchedule] = useState(false);

  const handleSelect = (place: SearchResult) => {
    onChange({ ...value, lat: place.lat, lon: place.lon, name: place.display_name });
    setQuery(place.display_name);
    setIsOpen(false);
    const saved = localStorage.getItem('anantyatra_recent_searches');
    const recents: SearchResult[] = saved ? JSON.parse(saved) : [];
    const filtered = recents.filter(r => r.display_name !== place.display_name || r.lat !== place.lat);
    const newRecents = [place, ...filtered].slice(0, 5);
    localStorage.setItem('anantyatra_recent_searches', JSON.stringify(newRecents));
    setRecentSearches(newRecents);
    setShowSchedule(true); // Auto open schedule on selection
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
    setIsOpen(true);
    setShowSchedule(false);
  };

  const showDropdown =
    isOpen &&
    (results.length > 0 ||
      (query.length >= 3 && !loading && !isTyping) ||
      (query.length < 3 && recentSearches.length > 0 && query !== value?.name));

  return (
    <div className="w-full relative group" ref={dropdownRef}>
      {/* Row: Icon column + Input + Buttons */}
      <div className="flex items-center gap-0 w-full relative z-10">
        {/* Timeline Icon column — exactly 44px center */}
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
        <div className="relative flex-1 min-w-0 ml-2.5 z-10">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setIsTyping(true); }}
            onFocus={() => { 
              if (results.length > 0 || recentSearches.length > 0) setIsOpen(true);
              onFocus?.();
            }}
            onBlur={() => {
              onBlur?.();
            }}
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

        {/* Actions Container */}
        <div className="flex items-center gap-0.5 ml-1 shrink-0 z-10">
          {/* Schedule toggle button */}
          {value && (
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className={`w-[40px] h-[48px] md:h-[52px] flex items-center justify-center rounded-2xl transition-all cursor-pointer ${
                showSchedule 
                  ? 'text-evergreen dark:text-grapefruit bg-evergreen/10 dark:bg-grapefruit/10' 
                  : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
              title="Schedule / Notes"
            >
              <Calendar className="w-[18px] h-[18px]" />
            </button>
          )}

          {/* Remove stop button */}
          <button
            onClick={onRemove}
            className="w-[40px] h-[48px] md:h-[52px] flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all cursor-pointer"
            title="Remove stop"
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* Schedule UI Panel */}
      {value && showSchedule && (
        <div className="ml-[32px] mt-2 pr-3 z-10 relative">
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/50 p-3 text-[12px] flex flex-col gap-2.5 shadow-sm">
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Date Input */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-2 rounded-lg flex-1 min-w-[130px] focus-within:border-evergreen/50 dark:focus-within:border-grapefruit/50 transition-colors">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input 
                  type="date" 
                  value={value.date || ''} 
                  onChange={e => onChange({...value, date: e.target.value})} 
                  className="bg-transparent outline-none w-full text-slate-700 dark:text-slate-200" 
                  title="Select Date"
                />
              </div>
              
              {/* Stay Duration */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-2 rounded-lg flex-1 min-w-[130px] focus-within:border-evergreen/50 dark:focus-within:border-grapefruit/50 transition-colors">
                <Moon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select 
                  value={value.stayDuration || ''} 
                  onChange={e => onChange({...value, stayDuration: e.target.value})} 
                  className="bg-transparent outline-none w-full text-slate-700 dark:text-slate-200 cursor-pointer appearance-none"
                >
                  <option value="" className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">Stay Duration...</option>
                  <option value="1 Night" className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">1 Night</option>
                  <option value="2 Nights" className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">2 Nights</option>
                  <option value="3 Nights" className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">3 Nights</option>
                  <option value="4+ Nights" className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">4+ Nights</option>
                  <option value="Half Day" className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">Half Day</option>
                  <option value="Full Day" className="bg-white dark:bg-[#1e2532] text-slate-800 dark:text-slate-100">Full Day</option>
                </select>
              </div>

              {/* Rest Day Toggle */}
              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
                value.isRestDay 
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400' 
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}>
                <input 
                  type="checkbox" 
                  checked={value.isRestDay || false} 
                  onChange={e => onChange({...value, isRestDay: e.target.checked})} 
                  className="accent-emerald-500 cursor-pointer" 
                />
                <span className="font-semibold select-none">Rest Day</span>
              </label>
            </div>

            {/* Notes Input */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-2 rounded-lg focus-within:border-evergreen/50 dark:focus-within:border-grapefruit/50 transition-colors">
              <StickyNote className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input 
                type="text" 
                value={value.notes || ''} 
                onChange={e => onChange({...value, notes: e.target.value})} 
                className="bg-transparent outline-none w-full text-slate-700 dark:text-slate-200" 
                placeholder="Quick notes (e.g., Sightseeing, visit fort, check-in 2PM)..." 
              />
            </div>
          </div>
        </div>
      )}

      {/* Autocomplete Dropdown - Inline Expandable with Custom Scrollbar */}
      <div 
        className={`transition-all duration-300 ease-out overflow-hidden z-20 relative ${
          showDropdown ? 'max-h-[350px] opacity-100 mt-2 mb-3' : 'max-h-0 opacity-0 mt-0 mb-0'
        }`}
      >
        <div className="ml-[32px] mr-[40px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden max-h-[320px] overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800">
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
