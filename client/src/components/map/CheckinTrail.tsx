import React from 'react';
import { Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { Checkin } from '../../types';
import { Car, Clock, MapPin, Navigation, History } from 'lucide-react';

interface GroupedCheckin {
  checkin: Checkin;
  count: number;
  firstSeen: string;
  lastSeen: string;
  lat: number;
  lng: number;
}

// Distance helper in meters
const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Deduplicate consecutive check-ins at the same location (within 50 meters)
const deduplicateCheckins = (rawCheckins: Checkin[]): GroupedCheckin[] => {
  if (!rawCheckins || rawCheckins.length === 0) return [];

  // Filter valid coords
  const valid = rawCheckins.filter((c) => {
    const lat = typeof c.latitude === 'number' ? c.latitude : parseFloat(c.latitude as unknown as string);
    const lng = typeof c.longitude === 'number' ? c.longitude : parseFloat(c.longitude as unknown as string);
    return !isNaN(lat) && !isNaN(lng);
  });

  if (valid.length === 0) return [];

  const grouped: GroupedCheckin[] = [];

  for (const item of valid) {
    const lat = typeof item.latitude === 'number' ? item.latitude : parseFloat(item.latitude as unknown as string);
    const lng = typeof item.longitude === 'number' ? item.longitude : parseFloat(item.longitude as unknown as string);

    if (grouped.length === 0) {
      grouped.push({
        checkin: item,
        count: 1,
        firstSeen: item.createdAt,
        lastSeen: item.createdAt,
        lat,
        lng,
      });
    } else {
      const prev = grouped[grouped.length - 1];
      const distance = getDistanceMeters(prev.lat, prev.lng, lat, lng);

      // If within 50 meters, group with the previous location entry
      if (distance <= 50) {
        prev.count += 1;
        prev.firstSeen = item.createdAt; // Since input is desc, item.createdAt is earlier
      } else {
        grouped.push({
          checkin: item,
          count: 1,
          firstSeen: item.createdAt,
          lastSeen: item.createdAt,
          lat,
          lng,
        });
      }
    }
  }

  return grouped;
};

// Create custom leaflet marker for Latest Check-in
const createLatestIcon = () => {
  const svgHtml = `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 46px; height: 46px;">
      <div style="position: absolute; inset: 0; background: rgba(16, 185, 129, 0.3); border-radius: 9999px; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="position: relative; background: #0f172a; color: #10b981; border: 2px solid #10b981; border-radius: 9999px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; box-shadow: 0px 4px 14px rgba(16, 185, 129, 0.4);">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.05 11.2 2 11.6 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-latest-marker bg-transparent border-none',
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -23],
  });
};

// Create custom leaflet marker for Previous Check-in Breadcrumbs
const createBreadcrumbIcon = (index: number) => {
  const svgHtml = `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
      <div style="background: #1e293b; color: #94a3b8; border: 2px solid #64748b; border-radius: 9999px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; box-shadow: 0px 2px 8px rgba(0,0,0,0.3);">
        #${index}
      </div>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-breadcrumb-marker bg-transparent border-none',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

interface CheckinTrailProps {
  checkins: Checkin[];
}

export const CheckinTrail: React.FC<CheckinTrailProps> = ({ checkins }) => {
  const grouped = deduplicateCheckins(checkins);

  if (grouped.length === 0) return null;

  // Trajectory polyline coordinates (from oldest breadcrumb to newest latest checkin)
  const trajectoryPositions: [number, number][] = [...grouped]
    .reverse()
    .map((g) => [g.lat, g.lng]);

  return (
    <>
      {/* Dashed Trajectory Trail */}
      {trajectoryPositions.length > 1 && (
        <Polyline
          positions={trajectoryPositions}
          pathOptions={{
            color: '#10b981',
            weight: 3,
            dashArray: '6, 8',
            opacity: 0.7,
          }}
        />
      )}

      {/* Render Markers for Deduplicated Check-in Locations */}
      {grouped.map((item, idx) => {
        const isLatest = idx === 0;
        const breadcrumbNum = grouped.length - idx;
        const dateObj = item.checkin.createdAt ? new Date(item.checkin.createdAt) : new Date();
        const formattedTime = isNaN(dateObj.getTime()) ? 'Recently' : dateObj.toLocaleString();

        return (
          <Marker
            key={item.checkin.id || `checkin-group-${idx}`}
            position={[item.lat, item.lng]}
            icon={isLatest ? createLatestIcon() : createBreadcrumbIcon(breadcrumbNum)}
          >
            <Popup className="font-sans">
              <div className="p-1 min-w-[220px]">
                {/* Header Badge */}
                <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {isLatest ? (
                      <>
                        <Car className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">Latest Check-in</span>
                      </>
                    ) : (
                      <>
                        <History className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Previous Stop #{breadcrumbNum}</span>
                      </>
                    )}
                  </div>

                  {item.count > 1 && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
                      {item.count} check-ins here
                    </span>
                  )}
                </div>

                {/* User Info (for admin / shared view) */}
                {item.checkin.user?.email && (
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{item.checkin.user.email}</span>
                  </div>
                )}

                {/* Location & Address */}
                <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <div className="flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">
                      {item.checkin.address || `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-slate-400 text-[10px] pt-1">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>{isLatest ? `Checked in: ${formattedTime}` : `Recorded: ${formattedTime}`}</span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
};
