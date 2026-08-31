import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup, Tooltip, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Waypoint } from '../../types';

const createCustomIcon = (index: number, total: number) => {
  const isLast = index === total - 1 && total > 1;
  const color = isLast ? '#FF6B6B' : '#042A2B'; 

  const svgHtml = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="36" height="36" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.3))">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-leaflet-marker bg-transparent border-none',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

const getNightsFromStayDuration = (dur?: string): number => {
  if (!dur) return 0;
  if (dur === '1 Night') return 1;
  if (dur === '2 Nights') return 2;
  if (dur === '3 Nights') return 3;
  if (dur === '4+ Nights') return 4;
  return 0;
};

interface MapViewProps {
  waypoints: Waypoint[];
  centerLocation?: [number, number] | null;
  startDate?: string | null;
  children?: React.ReactNode;
}

const MapUpdater = ({ waypoints, centerLocation }: { waypoints: Waypoint[]; centerLocation?: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (centerLocation) {
      map.setView(centerLocation, 15, { animate: true });
    } else if (waypoints.length > 0) {
      const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lon]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [waypoints, centerLocation, map]);
  return null;
};

export const MapView = ({ waypoints, centerLocation, startDate, children }: MapViewProps) => {
  let accumulatedNights = 0;

  return (
    <div className="w-full h-full">
      <MapContainer
        center={centerLocation || [20.5937, 78.9629]}
        zoom={centerLocation ? 15 : 5}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {waypoints.map((wp, i) => {
          const dayNumber = Math.floor(accumulatedNights) + 1;
          const currentNights = getNightsFromStayDuration(wp.stayDuration);
          accumulatedNights += currentNights;

          let formattedDate: string | null = null;
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + Math.floor(accumulatedNights - currentNights));
            if (!isNaN(d.getTime())) {
              formattedDate = d.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
            }
          } else if (wp.date) {
            formattedDate = wp.date;
          }

          const parts = (wp.name || `Stop ${i + 1}`).split(',');
          const mainTitle = parts[0].trim();
          const fullAddress = parts.slice(1).join(',').trim();

          const isFirst = i === 0;
          const isLast = i === waypoints.length - 1 && waypoints.length > 1;
          const roleLabel = isFirst ? 'Origin' : isLast ? 'Destination' : `Stop ${i + 1}`;

          return (
            <Marker key={i} position={[wp.lat, wp.lon]} icon={createCustomIcon(i, waypoints.length)}>
              {/* Hover Tooltip Preview */}
              <Tooltip direction="top" offset={[0, -32]} opacity={0.95}>
                <div className="font-sans text-[12px] font-semibold text-slate-800 px-1">
                  <span className="font-bold text-[#042A2B]">Stop {i + 1}:</span> {mainTitle} {formattedDate ? `· ${formattedDate}` : `(Day ${dayNumber})`}
                </div>
              </Tooltip>

              {/* Click Rich Popup Card */}
              <Popup className="rich-map-popup font-sans">
                <div className="p-1 min-w-[210px] max-w-[260px] space-y-2 text-slate-800 dark:text-slate-100">
                  {/* Header Badge */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#042A2B] bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-200/50">
                      Stop {i + 1} · {roleLabel}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Day {dayNumber}
                    </span>
                  </div>

                  {/* Title & Address */}
                  <div>
                    <h4 className="font-extrabold text-[14px] text-slate-900 dark:text-white leading-tight">
                      {mainTitle}
                    </h4>
                    {fullAddress && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5 line-clamp-2">
                        {fullAddress}
                      </p>
                    )}
                  </div>

                  {/* Information Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {formattedDate && (
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg flex items-center gap-1 border border-slate-200/60 dark:border-slate-700/60">
                        📅 {formattedDate}
                      </span>
                    )}

                    {wp.stayDuration && (
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg flex items-center gap-1 border border-slate-200/60 dark:border-slate-700/60">
                        🌙 {wp.stayDuration}
                      </span>
                    )}

                    {wp.isRestDay && (
                      <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-500/20 px-2 py-1 rounded-lg flex items-center gap-1 border border-emerald-300/60 dark:border-emerald-500/30">
                        🌴 Rest Day
                      </span>
                    )}
                  </div>

                  {/* Custom Notes */}
                  {wp.notes && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-lg text-[11px] text-amber-900 dark:text-amber-200 italic leading-snug">
                      "{wp.notes}"
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {children}
        <MapUpdater waypoints={waypoints} centerLocation={centerLocation} />
      </MapContainer>
    </div>
  );
};

