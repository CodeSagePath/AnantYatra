import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BedDouble,
  Bike,
  CalendarDays,
  CarFront,
  Check,
  Clock3,
  Fuel,
  MapPin,
  Route as RouteIcon,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { routeApi } from '../../api/endpoints';
import type { TripPlanDraft, Waypoint } from '../../types';

interface TripPlannerPanelProps {
  waypoints: Waypoint[];
  costing: string;
  startDate?: string | null;
}

const stopOptions = [
  { id: 'sightseeing', label: 'Places to explore', icon: MapPin },
  { id: 'restaurants', label: 'Food stops', icon: Utensils },
  { id: 'fuel', label: 'Fuel stops', icon: Fuel },
  { id: 'rest', label: 'Rest breaks', icon: Clock3 },
];

const parseList = (value: string): string[] => value.split(',').map((item) => item.trim()).filter(Boolean);

const getModeLabel = (costing: string): string => {
  if (costing === 'motorcycle') return 'Motorcycle';
  if (costing === 'bicycle') return 'Bicycle';
  return 'Car';
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
};

export const TripPlannerPanel = ({ waypoints, costing, startDate }: TripPlannerPanelProps) => {
  const [open, setOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'preferences' | 'plan'>('preferences');
  const [durationDays, setDurationDays] = useState(3);
  const [travelerCount, setTravelerCount] = useState(2);
  const [dailyDrivingLimitHours, setDailyDrivingLimitHours] = useState(6);
  const [budget, setBudget] = useState('');
  const [budgetScope, setBudgetScope] = useState<'whole_trip' | 'per_person'>('whole_trip');
  const [selectedStops, setSelectedStops] = useState<string[]>(['sightseeing', 'restaurants', 'fuel', 'rest']);
  const [interests, setInterests] = useState('');
  const [food, setFood] = useState('');
  const [requiredFacilities, setRequiredFacilities] = useState('');
  const [accommodationNeeded, setAccommodationNeeded] = useState(true);
  const [plan, setPlan] = useState<TripPlanDraft | null>(null);
  const [places, setPlaces] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supportedMode = costing === 'auto' || costing === 'motorcycle' || costing === 'bicycle';
  const canPlan = waypoints.length >= 2 && supportedMode;
  const origin = waypoints[0]?.name || 'Choose a starting point';
  const destination = waypoints[waypoints.length - 1]?.name || 'Choose a destination';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading]);

  const toggleStop = (stopId: string) => {
    setSelectedStops((current) => current.includes(stopId)
      ? current.filter((item) => item !== stopId)
      : [...current, stopId]);
  };

  const createPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canPlan) return;
    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    if (!first?.name || !last?.name) {
      setError('Set a start and destination before creating a trip plan.');
      return;
    }

    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const response = await routeApi.createAiPlan({
        waypoints,
        request: {
          schemaVersion: '1.0',
          requestId: `trip-${Date.now()}`,
          origin: { label: first.name, latitude: first.lat, longitude: first.lon },
          destination: { label: last.name, latitude: last.lat, longitude: last.lon },
          ...(startDate ? { startDate } : {}),
          durationDays,
          travelerCount,
          ...(budget.trim() ? { budget: { amount: Number(budget), currency: 'INR', scope: budgetScope } } : {}),
          dailyDrivingLimitHours,
          vehicle: { mode: costing === 'auto' ? 'car' : costing },
          preferences: {
            interests: [...new Set([...selectedStops, ...parseList(interests)])],
            food: parseList(food),
            requiredFacilities: parseList(requiredFacilities),
            avoid: [],
            pace: 'balanced',
            accommodationNeeded,
          },
          safety: { profile: 'balanced', preferArrivalBeforeSunset: true },
        },
      });
      setPlan(response.data.plan);
      setPlaces(response.data.places);
      setMobileView('plan');
    } catch {
      setError('Could not create a trip draft. Check the route service and available place data, then try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-2xl border border-evergreen/20 dark:border-grapefruit/20 bg-gradient-to-br from-evergreen/[0.07] to-white dark:from-grapefruit/[0.08] dark:to-slate-900 px-4 py-4 text-left transition hover:border-evergreen/40 dark:hover:border-grapefruit/40"
        aria-haspopup="dialog"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-evergreen text-white dark:bg-grapefruit"><Sparkles className="h-5 w-5" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-evergreen dark:text-grapefruit">Plan this road trip</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">Stops, food, fuel and overnight stays</span>
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-evergreen px-3 py-1.5 text-xs font-semibold text-white dark:bg-grapefruit">Open planner</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[4000] flex items-stretch justify-center bg-slate-950/60 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="trip-planner-title" className="flex h-full max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-950 sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-7 sm:py-5">
              <div>
                <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-evergreen dark:text-grapefruit sm:text-xs"><Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> AI road trip planner</p>
                <h2 id="trip-planner-title" className="text-base font-bold leading-tight text-slate-900 dark:text-white sm:text-2xl">Plan your journey</h2>
                <p className="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 sm:block">Build a route-aware draft around your time, budget and travel style.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={loading} aria-label="Close planner" className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </header>

            <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900 lg:hidden" role="tablist" aria-label="Trip planner steps">
              <button type="button" role="tab" aria-selected={mobileView === 'preferences'} onClick={() => setMobileView('preferences')} className={`min-h-10 rounded-xl px-3 text-xs font-bold ${mobileView === 'preferences' ? 'bg-evergreen text-white dark:bg-grapefruit' : 'text-slate-500 dark:text-slate-400'}`}>Trip preferences</button>
              <button type="button" role="tab" aria-selected={mobileView === 'plan'} disabled={!plan} onClick={() => setMobileView('plan')} className={`min-h-10 rounded-xl px-3 text-xs font-bold disabled:opacity-40 ${mobileView === 'plan' ? 'bg-evergreen text-white dark:bg-grapefruit' : 'text-slate-500 dark:text-slate-400'}`}>Itinerary{plan ? ` · ${plan.days.length} days` : ''}</button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:overflow-hidden">
              <div className={`min-h-0 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5 lg:block lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-7 ${mobileView === 'preferences' ? 'block' : 'hidden'}`}>
                <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"><span>Your route</span><span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 normal-case tracking-normal text-slate-700 dark:bg-slate-800 dark:text-slate-200">{costing === 'motorcycle' ? <Bike className="h-3.5 w-3.5" /> : <CarFront className="h-3.5 w-3.5" />}{getModeLabel(costing)}</span></div>
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100"><span className="h-2.5 w-2.5 rounded-full bg-evergreen dark:bg-grapefruit" /><span className="truncate">{origin}</span></div>
                  <div className="ml-[4px] h-5 border-l border-dashed border-slate-300 dark:border-slate-700" />
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100"><span className="h-2.5 w-2.5 rounded-full border-2 border-evergreen dark:border-grapefruit" /><span className="truncate">{destination}</span></div>
                  {waypoints.length > 2 && <p className="ml-6 mt-2 text-xs text-slate-500">Including {waypoints.length - 2} selected intermediate {waypoints.length - 2 === 1 ? 'stop' : 'stops'}</p>}
                </div>

                <form id="trip-planner-form" onSubmit={createPlan} className="space-y-5">
                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Trip basics</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Days<input type="number" min={1} max={30} value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-evergreen dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Travelers<input type="number" min={1} max={50} value={travelerCount} onChange={(event) => setTravelerCount(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-evergreen dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Max driving per day<input type="number" min={1} max={16} step={0.5} value={dailyDrivingLimitHours} onChange={(event) => setDailyDrivingLimitHours(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-evergreen dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Budget (₹)<input type="number" min={1} value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Optional" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-evergreen dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    </div>
                    {budget && <div className="mt-2 flex gap-2" aria-label="Budget scope"><button type="button" onClick={() => setBudgetScope('whole_trip')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${budgetScope === 'whole_trip' ? 'bg-evergreen text-white dark:bg-grapefruit' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>Total trip</button><button type="button" onClick={() => setBudgetScope('per_person')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${budgetScope === 'per_person' ? 'bg-evergreen text-white dark:bg-grapefruit' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>Per person</button></div>}
                    {startDate && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Starts {startDate}</p>}
                  </section>

                  <section>
                    <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">What should we find along the way?</h3>
                    <p className="mb-3 text-xs text-slate-500">Choose the kinds of stops to include in the draft.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {stopOptions.map(({ id, label, icon: Icon }) => {
                        const selected = selectedStops.includes(id);
                        return <button key={id} type="button" aria-pressed={selected} onClick={() => toggleStop(id)} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition ${selected ? 'border-evergreen/40 bg-evergreen/5 text-evergreen dark:border-grapefruit/40 dark:bg-grapefruit/10 dark:text-grapefruit' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-evergreen bg-evergreen text-white dark:border-grapefruit dark:bg-grapefruit' : 'border-slate-300 dark:border-slate-600'}`}>{selected && <Check className="h-3.5 w-3.5" />}</span><Icon className="h-4 w-4" />{label}</button>;
                      })}
                    </div>
                    <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">Interests <span className="font-normal text-slate-400">(optional, comma separated)</span><input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="Waterfalls, heritage, viewpoints" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-evergreen dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Comfort and food</h3>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Food preferences<input value={food} onChange={(event) => setFood(event.target.value)} placeholder="Vegetarian, local cuisine" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-evergreen dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">Facilities to look for<input value={requiredFacilities} onChange={(event) => setRequiredFacilities(event.target.value)} placeholder="Restroom, parking, accessible entry" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-evergreen dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                    <label className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"><BedDouble className="h-4 w-4 text-evergreen dark:text-grapefruit" /><span className="flex-1">Suggest overnight stays</span><input type="checkbox" checked={accommodationNeeded} onChange={(event) => setAccommodationNeeded(event.target.checked)} className="h-4 w-4 accent-emerald-700" /></label>
                  </section>
                </form>
              </div>

              <div className={`min-h-0 flex-col p-4 dark:bg-slate-950 sm:p-5 lg:flex lg:overflow-y-auto lg:p-7 ${mobileView === 'plan' ? 'flex' : 'hidden'}`}>
                {plan ? (
                  <div className="space-y-4">
                    <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-evergreen dark:text-grapefruit">Your draft</p><h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">A {plan.days.length}-day trip, shaped around your route</h3></div>
                    {plan.days.map((day) => (
                      <article key={day.dayNumber} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800"><h4 className="font-bold text-slate-900 dark:text-white">Day {day.dayNumber}{day.date ? ` · ${day.date}` : ''}</h4><span className="text-xs text-slate-500">{day.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0) / 1000 > 0 ? `${Math.round(day.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0) / 1000)} km` : ''}</span></header>
                        <div className="space-y-3 p-4">
                          {day.legs.map((leg, index) => <div key={`${day.dayNumber}-leg-${index}`} className="flex gap-3 text-xs text-slate-500"><RouteIcon className="mt-0.5 h-4 w-4 shrink-0 text-evergreen dark:text-grapefruit" /><span>{leg.from} → {leg.to}<span className="ml-1 text-slate-400">· {Math.round(leg.distanceMeters / 1000)} km · {formatDuration(leg.durationSeconds)}</span></span></div>)}
                          {day.stops.length ? day.stops.map((stop) => <div key={`${day.dayNumber}-${stop.poiId}`} className="flex gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-evergreen dark:text-grapefruit" /><div><p className="text-sm font-semibold text-slate-900 dark:text-white">{places[stop.poiId] || 'Place name unavailable'}</p><p className="mt-0.5 text-xs text-slate-500">{stop.reason}</p></div></div>) : <p className="text-xs text-slate-500">No verified stops were selected for this day.</p>}
                          {day.notes?.map((note) => <p key={note} className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{note}</p>)}
                        </div>
                      </article>
                    ))}
                    {plan.uncertainties.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><h4 className="font-bold">Details to verify</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{plan.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></div>}
                    <p className="text-xs leading-relaxed text-slate-500">Draft only. Confirm facilities, availability, prices, opening hours and current road conditions before travelling.</p>
                    <button type="button" onClick={() => setMobileView('preferences')} className="text-sm font-semibold text-evergreen underline underline-offset-4 dark:text-grapefruit">Adjust preferences and try again</button>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-evergreen/10 text-evergreen dark:bg-grapefruit/10 dark:text-grapefruit"><Sparkles className="h-6 w-6" /></span>
                    <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">Your trip plan will appear here</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">Choose what matters to you, then generate a route-aware draft with stops arranged across your travel days.</p>
                    <div className="mx-auto mt-5 flex flex-wrap justify-center gap-2 text-xs text-slate-500"><span className="rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">Places to explore</span><span className="rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">Food & fuel</span><span className="rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">Overnight stays</span></div>
                  </div>
                )}
                {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
                {!supportedMode && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Trip planning supports car, motorcycle and bicycle routes.</p>}
              </div>
            </div>

            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-4">
              <p className="hidden text-[11px] leading-relaxed text-slate-500 sm:block">AI-generated suggestions are drafts. Place details may be incomplete or out of date.</p>
              {plan && mobileView === 'plan' ? (
                <>
                  <button type="button" onClick={() => setMobileView('preferences')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 text-sm font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:hidden">Edit preferences</button>
                  <button type="submit" form="trip-planner-form" disabled={!canPlan || loading} className="hidden min-h-11 items-center justify-center gap-2 rounded-xl bg-evergreen px-5 text-sm font-bold text-white disabled:opacity-50 dark:bg-grapefruit sm:flex">Regenerate plan</button>
                </>
              ) : (
                <button type="submit" form="trip-planner-form" disabled={!canPlan || loading} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-evergreen px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-grapefruit">
                  {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Building your draft…</> : <><Sparkles className="h-4 w-4" />Create trip plan</>}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </>
  );
};
