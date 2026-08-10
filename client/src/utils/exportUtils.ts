import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Waypoint } from '../types';
import IndiaMap from '@svg-maps/india';

/**
 * Decodes an encoded polyline string into an array of [lat, lon] coordinates.
 * Valhalla default precision is 6.
 */
function decodePolyline(str: string, precision: number = 6): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const coordinates: [number, number][] = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let b, shift = 0, result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

export const exportToPDF = (
  tripName: string,
  waypoints: Waypoint[],
  legDistances?: number[],
  legDurations?: number[],
  totalDistance?: number,
  totalDuration?: number
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const title = tripName.trim() || 'AnantYatra Trip Itinerary';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Header Banner
  doc.setFillColor(30, 120, 70); // Evergreen color (#1E7846)
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ANANTYATRA', 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Trip Itinerary Report', 14, 21);

  doc.setFontSize(9);
  doc.text(`Generated: ${dateStr}`, 196, 18, { align: 'right' });

  // Trip Title
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 38);

  // Prepare table rows
  const tableRows = waypoints.map((wp, i) => {
    const isFirst = i === 0;
    const legDist = legDistances?.[i - 1];
    const legDur = legDurations?.[i - 1];

    const placeName = wp.name || `Stop ${i + 1} (${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)})`;

    let distText = '—';
    let timeText = '—';

    if (!isFirst && legDist !== undefined && legDist !== null) {
      distText = legDist >= 10 ? `${Math.round(legDist)} km` : `${legDist.toFixed(1)} km`;
    }

    if (!isFirst && legDur !== undefined && legDur !== null) {
      const h = Math.floor(legDur / 60);
      const m = Math.round(legDur % 60);
      timeText = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    return [i + 1, placeName, distText, timeText];
  });

  // Totals calculations
  const totalKmText =
    totalDistance !== undefined
      ? totalDistance >= 10
        ? `${Math.round(totalDistance)} km`
        : `${totalDistance.toFixed(1)} km`
      : '—';

  let totalTimeText = '—';
  if (totalDuration !== undefined && totalDuration > 0) {
    const th = Math.floor(totalDuration / 60);
    const tm = Math.round(totalDuration % 60);
    totalTimeText = th > 0 ? `${th}h ${tm}m` : `${tm}m`;
  }

  // Footer Totals Row
  tableRows.push([
    'TOTAL',
    `${waypoints.length} Total Places`,
    totalKmText,
    totalTimeText,
  ]);

  // Generate AutoTable
  autoTable(doc, {
    startY: 44,
    head: [['Sr.', 'Place Name', 'Leg Distance', 'Expected Travel Time']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 120, 70], // Evergreen
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9.5,
      textColor: [51, 65, 85],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 95 },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' },
    },
    didParseCell: (data) => {
      // Style total row
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
  });

  // Save PDF
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-itinerary.pdf`;
  doc.save(filename);
};

export const exportToSVG = (
  tripName: string,
  waypoints: Waypoint[],
  _legDistances?: number[],
  _legDurations?: number[],
  totalDistance?: number,
  totalDuration?: number,
  polyline?: string,
  includeMapBackground: boolean = true
) => {
  const title = tripName.trim() || 'AnantYatra Trip Map';
  const stopCount = waypoints.length;

  // The base SVG map of India from @svg-maps/india has a viewBox of "0 0 612 696"
  const mapWidth = 612;
  const mapHeight = 696;

  // We add padding for the header and footer
  const headerHeight = 100;
  const footerHeight = 80;
  const paddingX = 40;
  
  const svgWidth = mapWidth + paddingX * 2;
  const svgHeight = mapHeight + headerHeight + footerHeight;

  const mapOffsetX = paddingX;
  const mapOffsetY = headerHeight;

  // Precise calibrated linear projection for the @svg-maps/india Bounding Box
  // Derived via least-squares calibration of 5 known GPS points to their SVG paths.
  const mapLatLonToXY = (lat: number, lon: number): [number, number] => {
    const x = 26.6014 * lon - 1873.4753;
    const y = -22.4898 * lat + 851.4938;

    return [x, y];
  };

  // Generate the India Map Base Layer
  let mapPathsSvg = '';
  if (includeMapBackground && IndiaMap && IndiaMap.locations) {
    mapPathsSvg = IndiaMap.locations
      .map(
        (loc: { id: string; path: string }) =>
          `<path id="${loc.id}" d="${loc.path}" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.2" />`
      )
      .join('\n      ');
  }

  // Generate Routes and Waypoints
  let routeLinesSvg = '';
  let waypointsSvg = '';

  const projectedPoints = waypoints.map((wp) => mapLatLonToXY(wp.lat, wp.lon));

  // Draw lines (using Polyline if available, otherwise straight lines)
  if (polyline) {
    const decodedRoute = decodePolyline(polyline, 6);
    if (decodedRoute.length > 0) {
      const svgPoints = decodedRoute.map(([lat, lon]) => {
        const [x, y] = mapLatLonToXY(lat, lon);
        return `${x},${y}`;
      }).join(' ');
      
      routeLinesSvg = `<polyline points="${svgPoints}" fill="none" stroke="#1E7846" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />`;
    }
  }
  
  if (!routeLinesSvg) {
    // Fallback to straight lines
    for (let i = 0; i < projectedPoints.length - 1; i++) {
      const [x1, y1] = projectedPoints[i];
      const [x2, y2] = projectedPoints[i + 1];

      routeLinesSvg += `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1E7846" stroke-width="3" stroke-dasharray="6 4" opacity="0.8" />
      `;
    }
  }

  // Draw pins and labels
  projectedPoints.forEach((point, idx) => {
    const [x, y] = point;
    const wp = waypoints[idx];
    const isFirst = idx === 0;
    const isLast = idx === waypoints.length - 1;

    // Parse to keep only city name (before first comma)
    let placeName = wp.name || `Stop ${idx + 1}`;
    if (placeName.includes(',')) {
      placeName = placeName.split(',')[0].trim();
    }
    
    const escapedName = placeName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Elegant map pin (Teardrop shape)
    const pinColor = isFirst ? '#1E7846' : isLast ? '#EF6450' : '#3B82F6';
    const pinSvg = `
      <g transform="translate(${x}, ${y})">
        <!-- Pin Shadow -->
        <ellipse cx="0" cy="4" rx="6" ry="2" fill="rgba(0,0,0,0.2)" />
        <!-- Pin Body -->
        <path d="M 0 0 C -6 -6 -9 -11 -9 -15 C -9 -20 -5 -24 0 -24 C 5 -24 9 -20 9 -15 C 9 -11 6 -6 0 0 Z" fill="${pinColor}" stroke="#FFFFFF" stroke-width="1.5" />
        <!-- Pin Hole -->
        <circle cx="0" cy="-15" r="3" fill="#FFFFFF" />
      </g>
    `;

    // Anti-collision logic: Default to top-right
    let labelOffsetX = 12;
    let labelOffsetY = -18;
    
    if (idx > 0) {
      const prevPoint = projectedPoints[idx - 1];
      const dist = Math.hypot(x - prevPoint[0], y - prevPoint[1]);
      
      // If points are very close, alternate label position to bottom-left or bottom-right
      if (dist < 40) {
        if (idx % 2 !== 0) {
          labelOffsetX = 12;
          labelOffsetY = 12; // Bottom right
        } else {
          labelOffsetX = -(escapedName.length * 8 + 24); // Push left
          labelOffsetY = -18; // Top left
        }
      }
    }

    // Label background for legibility
    const labelSvg = `
      <g transform="translate(${x + labelOffsetX}, ${y + labelOffsetY})">
        <rect x="0" y="-12" width="${escapedName.length * 8 + 16}" height="20" rx="4" fill="rgba(255,255,255,0.9)" stroke="${pinColor}" stroke-width="1" />
        <text x="8" y="2" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#0F172A">${escapedName}</text>
      </g>
    `;

    waypointsSvg += `${pinSvg}\n${labelSvg}\n`;
  });

  // Footer totals
  const totalKm =
    totalDistance !== undefined
      ? totalDistance >= 10
        ? `${Math.round(totalDistance)} km`
        : `${totalDistance.toFixed(1)} km`
      : '—';

  let totalTime = '—';
  if (totalDuration && totalDuration > 0) {
    const th = Math.floor(totalDuration / 60);
    const tm = Math.round(totalDuration % 60);
    totalTime = th > 0 ? `${th}h ${tm}m` : `${tm}m`;
  }

  const footerY = svgHeight - footerHeight + 20;

  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E2E8F0" />
      <stop offset="100%" stop-color="#F1F5F9" />
    </linearGradient>
    <filter id="drop-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.05" />
    </filter>
  </defs>

  <!-- Ocean/Background -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="url(#bgGrad)" />

  <!-- Offset Group for Map & Routes -->
  <g transform="translate(${mapOffsetX}, ${mapOffsetY})">
    <!-- India Map Base -->
    <g filter="url(#drop-shadow)">
      ${mapPathsSvg}
    </g>

    <!-- Routes -->
    ${routeLinesSvg}

    <!-- Waypoints & Labels -->
    ${waypointsSvg}
  </g>

  <!-- Header Overlay -->
  <rect x="0" y="0" width="${svgWidth}" height="80" fill="#FF6B6B" />
  <text x="35" y="42" font-family="system-ui, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" letter-spacing="1">ANANTYATRA</text>
  <text x="35" y="62" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="rgba(255,255,255,0.9)" letter-spacing="0.5">anantyatra.codesagepath.dev • created with love in India by CodeSagePath with OSM and Valhalla</text>

  <!-- Footer Overlay -->
  <rect x="35" y="${footerY}" width="${svgWidth - 70}" height="44" rx="12" fill="#0F172A" filter="url(#drop-shadow)" />
  <text x="60" y="${footerY + 27}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">TOTAL STOPS: <tspan fill="#FFFFFF">${stopCount}</tspan></text>
  <text x="240" y="${footerY + 27}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">DISTANCE: <tspan fill="#A7F3D0">${totalKm}</tspan></text>
  <text x="440" y="${footerY + 27}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">TIME: <tspan fill="#FFFFFF">${totalTime}</tspan></text>
</svg>`;

  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-map.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
