import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Waypoint } from '../types';

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
  legDistances?: number[],
  legDurations?: number[],
  totalDistance?: number,
  totalDuration?: number
) => {
  const title = tripName.trim() || 'AnantYatra Trip Timeline';
  const stopCount = waypoints.length;

  const rowHeight = 90;
  const headerHeight = 120;
  const footerHeight = 90;
  const svgWidth = 600;
  const svgHeight = headerHeight + stopCount * rowHeight + footerHeight;

  let nodesSvg = '';

  waypoints.forEach((wp, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === stopCount - 1;
    const yPos = headerHeight + idx * rowHeight;

    const placeName = wp.name || `Stop ${idx + 1}`;
    const escapedName = placeName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Node shape
    const nodeShape = isFirst
      ? `<circle cx="100" cy="${yPos}" r="14" fill="#1E7846" stroke="#ffffff" stroke-width="4" />
         <circle cx="100" cy="${yPos}" r="5" fill="#ffffff" />`
      : isLast
      ? `<polygon points="100,${yPos - 14} 114,${yPos} 100,${yPos + 14} 86,${yPos}" fill="#EF6450" stroke="#ffffff" stroke-width="4" />`
      : `<circle cx="100" cy="${yPos}" r="10" fill="#64748B" stroke="#ffffff" stroke-width="3" />`;

    // Node label
    const labelSvg = `<text x="140" y="${yPos + 5}" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#0F172A">${escapedName}</text>`;

    // Connector segment & distance badge to next stop
    let connectorSvg = '';
    if (!isLast) {
      const nextY = headerHeight + (idx + 1) * rowHeight;
      const legDist = legDistances?.[idx];
      const legDur = legDurations?.[idx];

      let distLabel = '';
      if (legDist !== undefined && legDist !== null) {
        const kmStr = legDist >= 10 ? `${Math.round(legDist)} km` : `${legDist.toFixed(1)} km`;
        let durStr = '';
        if (legDur) {
          const h = Math.floor(legDur / 60);
          const m = Math.round(legDur % 60);
          durStr = h > 0 ? ` (${h}h ${m}m)` : ` (${m}m)`;
        }
        distLabel = `${kmStr}${durStr}`;
      }

      connectorSvg = `
        <line x1="100" y1="${yPos + 16}" x2="100" y2="${nextY - 16}" stroke="#CBD5E1" stroke-width="3" stroke-dasharray="6 4" />
        ${
          distLabel
            ? `<rect x="135" y="${(yPos + nextY) / 2 - 12}" width="140" height="24" rx="12" fill="#F1F5F9" stroke="#E2E8F0" />
               <text x="205" y="${(yPos + nextY) / 2 + 4}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#1E7846">${distLabel}</text>`
            : ''
        }
      `;
    }

    nodesSvg += `
      <g id="stop-${idx}">
        ${connectorSvg}
        ${nodeShape}
        ${labelSvg}
      </g>
    `;
  });

  // Totals text
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

  const footerY = headerHeight + stopCount * rowHeight + 20;

  const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#F8FAFC" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="url(#bgGrad)" rx="24" />

  <!-- Header -->
  <rect x="0" y="0" width="${svgWidth}" height="80" fill="#1E7846" rx="24" />
  <text x="35" y="42" font-family="system-ui, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF">ANANTYATRA</text>
  <text x="35" y="62" font-family="system-ui, sans-serif" font-size="12" font-weight="500" fill="#A7F3D0">Journey Timeline</text>
  
  <text x="${svgWidth - 35}" y="48" text-anchor="end" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#FFFFFF">${title.replace(
    /&/g,
    '&amp;'
  )}</text>

  <!-- Timeline Body -->
  ${nodesSvg}

  <!-- Footer -->
  <rect x="35" y="${footerY}" width="${svgWidth - 70}" height="50" rx="16" fill="#0F172A" />
  <text x="60" y="${footerY + 30}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">TOTAL STOPS: <tspan fill="#FFFFFF">${stopCount}</tspan></text>
  <text x="240" y="${footerY + 30}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">DISTANCE: <tspan fill="#A7F3D0">${totalKm}</tspan></text>
  <text x="440" y="${footerY + 30}" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#94A3B8">TIME: <tspan fill="#FFFFFF">${totalTime}</tspan></text>
</svg>`;

  const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-timeline.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
