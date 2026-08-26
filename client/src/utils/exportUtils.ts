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
  _tripName: string,
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

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  // Header Banner
  doc.setFillColor(255, 107, 107); // Grapefruit color (#FF6B6B)
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ANANTYATRA', 14, 14);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('anantyatra.codesagepath.dev • created with love in India by CodeSagePath with OSM and Valhalla', 14, 21);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Generated: ${dateStr}`, 196, 14, { align: 'right' });

  // Prepare table rows
  const tableRows = waypoints.map((wp, i) => {
    const isFirst = i === 0;
    const legDist = legDistances?.[i - 1];
    const legDur = legDurations?.[i - 1];

    let placeName = wp.name || `Stop ${i + 1} (${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)})`;
    if (placeName.includes(',')) {
      placeName = placeName.split(',')[0].trim();
    }

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
    startY: 34,
    head: [['Sr.', 'Place Name', 'Distance', 'Expected Travel Time']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 107], // Grapefruit (#FF6B6B)
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

  // Save PDF with clean short filename including date
  const today = new Date().toISOString().split('T')[0];
  let filename = `anantyatra-trip-${today}.pdf`;
  if (waypoints.length > 0) {
    const startCity = (waypoints[0].name || '').split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const endCity = (waypoints[waypoints.length - 1].name || '').split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (startCity && endCity && startCity !== endCity) {
      filename = `anantyatra-${startCity}-to-${endCity}-${today}.pdf`;
    } else if (startCity) {
      filename = `anantyatra-${startCity}-${today}.pdf`;
    }
  }

  doc.save(filename);
};

export const exportToSVG = (
  _tripName: string,
  waypoints: Waypoint[],
  _legDistances?: number[],
  _legDurations?: number[],
  totalDistance?: number,
  totalDuration?: number,
  polyline?: string,
  includeMapBackground: boolean = true
) => {
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

  // Generate clean short filename with date
  const today = new Date().toISOString().split('T')[0];
  let filename = `anantyatra-map-${today}.svg`;
  if (waypoints.length > 0) {
    const startCity = (waypoints[0].name || '').split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const endCity = (waypoints[waypoints.length - 1].name || '').split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (startCity && endCity && startCity !== endCity) {
      filename = `anantyatra-${startCity}-to-${endCity}-${today}-map.svg`;
    } else if (startCity) {
      filename = `anantyatra-${startCity}-${today}-map.svg`;
    }
  }

  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Grouping logic for Day-to-Day exports
interface DayStop {
  index: number;
  waypoint: Waypoint;
  legDist?: number;
  legDur?: number;
}

function groupWaypointsByDay(waypoints: Waypoint[], legDistances?: number[], legDurations?: number[]) {
  const days: { dayTitle: string; date: string | null; stops: DayStop[] }[] = [];
  let currentDayNumber = 1;
  let lastDate = waypoints[0]?.date || null;
  
  let currentDayGroup: { dayTitle: string; date: string | null; stops: DayStop[] } = { 
    dayTitle: `Day ${currentDayNumber}`, 
    date: lastDate,
    stops: [] 
  };

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const legDist = i > 0 ? legDistances?.[i - 1] : undefined;
    const legDur = i > 0 ? legDurations?.[i - 1] : undefined;

    let isNewDay = false;

    if (i > 0) {
      const prevWp = waypoints[i - 1];
      const prevStay = prevWp.stayDuration || '';
      
      if (prevStay.toLowerCase().includes('night')) {
        isNewDay = true;
      }
      
      if (wp.date && lastDate && wp.date !== lastDate) {
        isNewDay = true;
      }
    }

    if (isNewDay) {
      days.push(currentDayGroup);
      currentDayNumber++;
      lastDate = wp.date || null;
      currentDayGroup = {
        dayTitle: `Day ${currentDayNumber}`,
        date: lastDate,
        stops: []
      };
    }

    currentDayGroup.stops.push({
      index: i,
      waypoint: wp,
      legDist,
      legDur,
    });
  }
  
  if (currentDayGroup.stops.length > 0) {
    days.push(currentDayGroup);
  }

  return days;
}

export const exportDayToDayPDF = (
  _tripName: string,
  waypoints: Waypoint[],
  legDistances?: number[],
  legDurations?: number[]
) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  // Header Banner
  doc.setFillColor(30, 120, 70); // Evergreen color (#1E7846)
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('ANANTYATRA', 14, 14);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Day-to-Day Itinerary • created with love in India by CodeSagePath', 14, 21);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Generated: ${dateStr}`, 196, 14, { align: 'right' });

  const days = groupWaypointsByDay(waypoints, legDistances, legDurations);
  let currentY = 34;

  days.forEach((day) => {
    // Add Day Header
    doc.setFillColor(241, 245, 249);
    doc.rect(14, currentY, 182, 10, 'F');
    doc.setTextColor(30, 120, 70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const dayTitle = day.date ? `${day.dayTitle} • ${day.date}` : day.dayTitle;
    doc.text(dayTitle, 16, currentY + 7);
    currentY += 14;

    const tableRows = day.stops.map((stop) => {
      let placeName = stop.waypoint.name || `Stop (${stop.waypoint.lat.toFixed(4)}, ${stop.waypoint.lon.toFixed(4)})`;
      if (placeName.includes(',')) placeName = placeName.split(',')[0].trim();
      
      let distText = '—';
      let timeText = '—';
      if (stop.legDist !== undefined && stop.legDist !== null) {
        distText = stop.legDist >= 10 ? `${Math.round(stop.legDist)} km` : `${stop.legDist.toFixed(1)} km`;
      }
      if (stop.legDur !== undefined && stop.legDur !== null) {
        const h = Math.floor(stop.legDur / 60);
        const m = Math.round(stop.legDur % 60);
        timeText = h > 0 ? `${h}h ${m}m` : `${m}m`;
      }
      
      const notes = stop.waypoint.notes ? `\nNotes: ${stop.waypoint.notes}` : '';
      const stay = stop.waypoint.stayDuration ? `\nStay: ${stop.waypoint.stayDuration}` : '';
      
      return [
        placeName + stay + notes,
        distText,
        timeText
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Place & Notes', 'Distance', 'Travel Time']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
      columnStyles: { 
        0: { cellWidth: 112 },
        1: { cellWidth: 35, halign: 'right' },
        2: { cellWidth: 35, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });
    
    currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  });

  const today = new Date().toISOString().split('T')[0];
  const filename = `anantyatra-day-by-day-${today}.pdf`;
  doc.save(filename);
};

export const exportDayToDaySVG = (
  _tripName: string,
  waypoints: Waypoint[],
  _legDistances?: number[],
  _legDurations?: number[],
  totalDistance?: number,
  totalDuration?: number,
  polyline?: string,
  includeMapBackground: boolean = true
) => {
  const days = groupWaypointsByDay(waypoints, _legDistances, _legDurations);

  const mapWidth = 612; const mapHeight = 696;
  const headerHeight = 100; const footerHeight = 80;
  const paddingX = 40;
  const svgWidth = mapWidth + paddingX * 2;
  const svgHeight = mapHeight + headerHeight + footerHeight;
  const mapOffsetX = paddingX; const mapOffsetY = headerHeight;

  const mapLatLonToXY = (lat: number, lon: number): [number, number] => {
    return [26.6014 * lon - 1873.4753, -22.4898 * lat + 851.4938];
  };

  let mapPathsSvg = '';
  if (includeMapBackground && IndiaMap && IndiaMap.locations) {
    mapPathsSvg = IndiaMap.locations.map((loc: { id: string; path: string }) =>
      `<path id="${loc.id}" d="${loc.path}" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.2" />`
    ).join('\n      ');
  }

  let routeLinesSvg = '';
  let waypointsSvg = '';

  const projectedPoints = waypoints.map(wp => mapLatLonToXY(wp.lat, wp.lon));

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
    for (let i = 0; i < projectedPoints.length - 1; i++) {
      const [x1, y1] = projectedPoints[i]; const [x2, y2] = projectedPoints[i + 1];
      routeLinesSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1E7846" stroke-width="3" stroke-dasharray="6 4" opacity="0.8" />`;
    }
  }

  const wpToDay = new Map();
  const dayColors = ['#1E7846', '#EF6450', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#6366F1'];
  
  days.forEach((day, dIdx) => {
    day.stops.forEach(stop => {
      wpToDay.set(stop.index, {
        dayStr: day.dayTitle,
        color: dayColors[dIdx % dayColors.length]
      });
    });
  });

  projectedPoints.forEach((point, idx) => {
    const [x, y] = point;
    const wp = waypoints[idx];
    const dayInfo = wpToDay.get(idx);
    const pinColor = dayInfo ? dayInfo.color : '#3B82F6';
    
    let placeName = wp.name || `Stop ${idx + 1}`;
    if (placeName.includes(',')) placeName = placeName.split(',')[0].trim();
    const escapedName = placeName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    const pinSvg = `
      <g transform="translate(${x}, ${y})">
        <ellipse cx="0" cy="4" rx="6" ry="2" fill="rgba(0,0,0,0.2)" />
        <path d="M 0 0 C -6 -6 -9 -11 -9 -15 C -9 -20 -5 -24 0 -24 C 5 -24 9 -20 9 -15 C 9 -11 6 -6 0 0 Z" fill="${pinColor}" stroke="#FFFFFF" stroke-width="1.5" />
        <circle cx="0" cy="-15" r="3" fill="#FFFFFF" />
      </g>
    `;

    let labelOffsetX = 12; let labelOffsetY = -18;
    if (idx > 0) {
      const prevPoint = projectedPoints[idx - 1];
      const dist = Math.hypot(x - prevPoint[0], y - prevPoint[1]);
      if (dist < 40) {
        if (idx % 2 !== 0) { labelOffsetX = 12; labelOffsetY = 12; }
        else { labelOffsetX = -(escapedName.length * 8 + 24); labelOffsetY = -18; }
      }
    }

    const dayLabel = dayInfo ? dayInfo.dayStr : '';
    const fullLabelText = `${dayLabel}: ${escapedName}`;
    const rectWidth = fullLabelText.length * 7 + 16;
    
    const labelSvg = `
      <g transform="translate(${x + labelOffsetX}, ${y + labelOffsetY})">
        <rect x="0" y="-12" width="${rectWidth}" height="20" rx="4" fill="rgba(255,255,255,0.95)" stroke="${pinColor}" stroke-width="1.5" />
        <text x="8" y="2" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#0F172A">${fullLabelText}</text>
      </g>
    `;
    waypointsSvg += `${pinSvg}\n${labelSvg}\n`;
  });

  const totalKm = totalDistance !== undefined ? (totalDistance >= 10 ? `${Math.round(totalDistance)} km` : `${totalDistance.toFixed(1)} km`) : '—';
  let totalTime = '—';
  if (totalDuration && totalDuration > 0) {
    const th = Math.floor(totalDuration / 60); const tm = Math.round(totalDuration % 60);
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
  <rect width="${svgWidth}" height="${svgHeight}" fill="url(#bgGrad)" />
  <g transform="translate(${mapOffsetX}, ${mapOffsetY})">
    <g filter="url(#drop-shadow)">
      ${mapPathsSvg}
    </g>
    ${routeLinesSvg}
    ${waypointsSvg}
  </g>
  <rect x="0" y="0" width="${svgWidth}" height="80" fill="#1E7846" />
  <text x="35" y="42" font-family="system-ui, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" letter-spacing="1">ANANTYATRA DAY-BY-DAY</text>
  <text x="35" y="62" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="rgba(255,255,255,0.9)" letter-spacing="0.5">anantyatra.codesagepath.dev • created with love in India by CodeSagePath</text>
  <rect x="35" y="${footerY}" width="${svgWidth - 70}" height="44" rx="12" fill="#0F172A" filter="url(#drop-shadow)" />
  <text x="60" y="${footerY + 27}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">TOTAL DAYS: <tspan fill="#FFFFFF">${days.length}</tspan></text>
  <text x="240" y="${footerY + 27}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">DISTANCE: <tspan fill="#A7F3D0">${totalKm}</tspan></text>
  <text x="440" y="${footerY + 27}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">TIME: <tspan fill="#FFFFFF">${totalTime}</tspan></text>
</svg>`;

  const today = new Date().toISOString().split('T')[0];
  const filename = `anantyatra-day-by-day-${today}-map.svg`;
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
};

// Helper to calculate bounding box of a path dynamically
function getPathBBox(pathString: string) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathString);
  svg.appendChild(path);
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  svg.style.width = '0';
  svg.style.height = '0';
  document.body.appendChild(svg);
  const bbox = path.getBBox();
  document.body.removeChild(svg);
  return bbox;
}

const generateStateSVGString = (stateName: string, statePath: string, waypoints: Waypoint[], polyline?: string) => {
  const bbox = getPathBBox(statePath);
  // Add some padding
  const padding = Math.max(bbox.width, bbox.height) * 0.15;
  const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`;
  
  // Calculate dynamic scale relative to full map (~1000px)
  const scale = Math.max(bbox.width, bbox.height) / 800;
  
  // Use pure proportional scaling so elements don't bloat on small states
  const baseScale = scale;
  
  const mapLatLonToXY = (lat: number, lon: number): [number, number] => {
    return [26.6014 * lon - 1873.4753, -22.4898 * lat + 851.4938];
  };

  const projectedPoints = waypoints.map(wp => mapLatLonToXY(wp.lat, wp.lon));

  let routeLinesSvg = '';
  let waypointsSvg = '';

  const routeStrokeWidth = 4 * baseScale;
  
  if (polyline) {
    const decodedRoute = decodePolyline(polyline, 6);
    if (decodedRoute.length > 0) {
      const svgPoints = decodedRoute.map(([lat, lon]) => {
        const [x, y] = mapLatLonToXY(lat, lon);
        return `${x},${y}`;
      }).join(' ');
      routeLinesSvg = `<polyline points="${svgPoints}" fill="none" stroke="#FF6B6B" stroke-width="${routeStrokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />`;
    }
  }

  if (!routeLinesSvg) {
    for (let i = 0; i < projectedPoints.length - 1; i++) {
      const [x1, y1] = projectedPoints[i]; const [x2, y2] = projectedPoints[i + 1];
      routeLinesSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#FF6B6B" stroke-width="${routeStrokeWidth}" stroke-dasharray="${6*baseScale} ${4*baseScale}" opacity="0.85" />`;
    }
  }

  const pinRx = 7 * baseScale; const pinRy = 2.5 * baseScale;
  const pinCy = 5 * baseScale;
  const pathScale = 1.2 * baseScale;
  const circleR = 3.5 * baseScale;
  const circleCy = -18 * baseScale;
  
  const fontSize = 14 * baseScale;
  const textOffsetY = -24 * baseScale;
  const rectPadding = 6 * baseScale;

  projectedPoints.forEach((point, idx) => {
    const [x, y] = point;
    const wp = waypoints[idx];
    let placeName = wp.name || `Stop ${idx + 1}`;
    if (placeName.includes(',')) placeName = placeName.split(',')[0].trim();
    const escapedName = placeName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const pinSvg = `
      <g transform="translate(${x}, ${y})">
        <ellipse cx="0" cy="${pinCy}" rx="${pinRx}" ry="${pinRy}" fill="rgba(0,0,0,0.2)" />
        <path d="M 0 0 C ${-7*pathScale} ${-7*pathScale} ${-10*pathScale} ${-13*pathScale} ${-10*pathScale} ${-18*pathScale} C ${-10*pathScale} ${-24*pathScale} ${-5*pathScale} ${-28*pathScale} 0 ${-28*pathScale} C ${5*pathScale} ${-28*pathScale} ${10*pathScale} ${-24*pathScale} ${10*pathScale} ${-18*pathScale} C ${10*pathScale} ${-13*pathScale} ${7*pathScale} ${-7*pathScale} 0 0 Z" fill="#042A2B" stroke="#FFFFFF" stroke-width="${1.5*baseScale}" />
        <circle cx="0" cy="${circleCy}" r="${circleR}" fill="#FFFFFF" />
      </g>
    `;

    // Try to alternate label placement
    let labelOffsetX = 14 * baseScale; 
    let labelOffsetY = textOffsetY;
    if (idx > 0) {
      const prevPoint = projectedPoints[idx - 1];
      const dist = Math.hypot(x - prevPoint[0], y - prevPoint[1]);
      if (dist < 50 * baseScale) {
        if (idx % 2 !== 0) { labelOffsetX = 14 * baseScale; labelOffsetY = 14 * baseScale; }
        else { labelOffsetX = -(escapedName.length * fontSize * 0.6 + 24 * baseScale); labelOffsetY = textOffsetY; }
      }
    }

    const rectWidth = escapedName.length * (fontSize * 0.6) + rectPadding * 2;
    const labelSvg = `
      <g transform="translate(${x + labelOffsetX}, ${y + labelOffsetY})">
        <rect x="0" y="${-fontSize}" width="${rectWidth}" height="${fontSize * 1.8}" rx="${4*baseScale}" fill="rgba(255,255,255,0.95)" stroke="#042A2B" stroke-width="${1.5*baseScale}" />
        <text x="${rectPadding}" y="${fontSize * 0.25}" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="700" fill="#0F172A">${escapedName}</text>
      </g>
    `;
    waypointsSvg += `${pinSvg}\n${labelSvg}\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ds" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="${4*baseScale}" stdDeviation="${4*baseScale}" flood-opacity="0.1" />
    </filter>
  </defs>
  <rect x="${bbox.x - padding}" y="${bbox.y - padding}" width="${bbox.width + padding * 2}" height="${bbox.height + padding * 2}" fill="#F1F5F9" />
  <g filter="url(#ds)">
    <path d="${statePath}" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="${2*baseScale}" />
  </g>
  ${routeLinesSvg}
  ${waypointsSvg}
  <text x="${bbox.x - padding + 20*baseScale}" y="${bbox.y - padding + 35*baseScale}" font-family="system-ui, sans-serif" font-size="${18*baseScale}" font-weight="900" fill="#0F172A">${stateName.toUpperCase()}</text>
  <text x="${bbox.x - padding + 20*baseScale}" y="${bbox.y - padding + 55*baseScale}" font-family="system-ui, sans-serif" font-size="${10*baseScale}" font-weight="600" fill="#64748B">AnantYatra State Map</text>
</svg>`;
};

export const exportStateWiseSVG = (
  stateName: string,
  waypoints: Waypoint[],
  polyline?: string
) => {
  if (!IndiaMap || !IndiaMap.locations) return;
  const stateLoc = IndiaMap.locations.find(l => l.name.toLowerCase() === stateName.toLowerCase());
  if (!stateLoc) return;

  const fullSvg = generateStateSVGString(stateName, stateLoc.path, waypoints, polyline);
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `anantyatra-${stateName.replace(/\s+/g, '-').toLowerCase()}-map.svg`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
};

export const exportStateWisePDF = (
  stateName: string,
  waypoints: Waypoint[],
  polyline?: string
) => {
  if (!IndiaMap || !IndiaMap.locations) return;
  const stateLoc = IndiaMap.locations.find(l => l.name.toLowerCase() === stateName.toLowerCase());
  if (!stateLoc) return;

  const fullSvg = generateStateSVGString(stateName, stateLoc.path, waypoints, polyline);
  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    // High res canvas
    canvas.width = 2000;
    canvas.height = (img.height / img.width) * 2000;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const doc = new jsPDF({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const scaledWidth = canvas.width * ratio;
      const scaledHeight = canvas.height * ratio;
      
      // Center image
      const x = (pageWidth - scaledWidth) / 2;
      const y = (pageHeight - scaledHeight) / 2;
      
      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, scaledWidth, scaledHeight);
      doc.save(`anantyatra-${stateName.replace(/\s+/g, '-').toLowerCase()}-map.pdf`);
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
};
