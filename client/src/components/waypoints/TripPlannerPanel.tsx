import { useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarDays, Loader2, Route as RouteIcon, Sparkles } from 'lucide-react';
import { routeApi } from '../../api/endpoints';
import type { TripPlanDraft, Waypoint } from '../../types';

interface TripPlannerPanelProps {
  waypoints: Waypoint[];
  costing: string;
  startDate?: string | null;
}

const parseList = (value: string): string[] => value.split(',').map((item) => item.trim()).filter(Boolean);

export const TripPlannerPanel = ({ waypoints, costing, startDate }: TripPlannerPanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const [durationDays, setDurationDays] = useState(3);
  const [travelerCount, setTravelerCount] = useState(1);
  const [dailyDrivingLimitHours, setDailyDrivingLimitHours] = useState(8);
  const [budget, setBudget] = useState('');
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
          ...(budget.trim() ? { budget: { amount: Number(budget), currency: 'INR', scope: 'whole_trip' } } : {}),
          dailyDrivingLimitHours,
          vehicle: { mode: costing === 'auto' ? 'car' : costing },
          preferences: {
            interests: parseList(interests),
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
    } catch {
      setError('Could not create a trip draft. Check the route service and available place data, then try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-3 rounded-2xl border border-evergreen/20 dark:border-grapefruit/20 bg-white/70 dark:bg-slate-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-evergreen dark:text-grapefruit">
          <Sparkles className="w-4 h-4" /> Build a day-by-day trip plan
        </span>
        <span className="text-xs text-slate-500">{expanded ? 'Close' : 'Set preferences'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200/70 dark:border-slate-700/70">
          <p className="mt-3 mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Creates a draft from the selected route and available place records. Place facilities, prices, and opening status may be unknown.
          </p>
          <form onSubmit={createPlan} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Trip days
                <input type="number" min={1} max={30} value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Travelers
                <input type="number" min={1} max={50} value={travelerCount} onChange={(event) => setTravelerCount(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Daily driving limit (hours)
                <input type="number" min={1} max={16} step={0.5} value={dailyDrivingLimitHours} onChange={(event) => setDailyDrivingLimitHours(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Whole-trip budget (₹, optional)
                <input type="number" min={1} value={budget} onChange={(event) => setBudget(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Interests (comma separated)
              <input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="waterfalls, heritage, nature" className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Food preferences (comma separated)
              <input value={food} onChange={(event) => setFood(event.target.value)} placeholder="vegetarian, local cuisine" className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
            </label>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Required facilities (comma separated)
              <input value={requiredFacilities} onChange={(event) => setRequiredFacilities(event.target.value)} placeholder="parking, restroom" className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={accommodationNeeded} onChange={(event) => setAccommodationNeeded(event.target.checked)} /> Include overnight stay suggestions
            </label>
            {startDate && <p className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="w-3.5 h-3.5" /> Start date: {startDate}</p>}
            {!supportedMode && <p className="text-xs text-amber-600">Trip planning currently supports car, motorcycle, and bicycle routes.</p>}
            <button type="submit" disabled={!canPlan || loading} className="w-full h-10 rounded-xl bg-evergreen dark:bg-grapefruit text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Building draft…</> : <><RouteIcon className="w-4 h-4" /> Create trip draft</>}
            </button>
          </form>

          {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-300"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</p>}
          {plan && (
            <div className="mt-4 space-y-3" aria-live="polite">
              <div className="rounded-lg bg-evergreen/5 dark:bg-grapefruit/10 px-3 py-2 text-xs font-bold text-evergreen dark:text-grapefruit">Draft itinerary · {plan.days.length} days</div>
              {plan.days.map((day) => (
                <div key={day.dayNumber} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <h3 className="text-sm font-bold">Day {day.dayNumber}{day.date ? ` · ${day.date}` : ''}</h3>
                  {day.legs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {day.legs.map((leg, index) => (
                        <p key={`${day.dayNumber}-leg-${index}`} className="text-[11px] text-slate-500 dark:text-slate-400">
                          {leg.from} → {leg.to} · {(leg.distanceMeters / 1000).toFixed(0)} km · {Math.round(leg.durationSeconds / 3600 * 10) / 10} hr (route estimate)
                        </p>
                      ))}
                    </div>
                  )}
                  {day.stops.length === 0 ? <p className="mt-2 text-xs text-slate-500">No verified stops were selected for this day.</p> : (
                    <ul className="mt-2 space-y-2">
                      {day.stops.map((stop) => (
                        <li key={`${day.dayNumber}-${stop.poiId}`} className="text-xs">
                          <p className="font-semibold">{places[stop.poiId] || 'Place name unavailable'}</p>
                          <p className="mt-0.5 text-slate-500 dark:text-slate-400">{stop.reason}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {day.notes?.map((note) => <p key={note} className="mt-2 text-xs text-amber-700 dark:text-amber-300">{note}</p>)}
                </div>
              ))}
              {plan.uncertainties.length > 0 && <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"><strong>Things to verify</strong><ul className="mt-1 list-disc pl-4">{plan.uncertainties.map((item) => <li key={item}>{item}</li>)}</ul></div>}
              <p className="text-[11px] text-slate-500">This is a draft. Confirm facilities, opening hours, prices, and route conditions before travel.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
