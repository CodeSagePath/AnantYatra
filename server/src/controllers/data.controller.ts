import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Request, Response } from 'express';

const sourceRecordId = 'osmfr-karnataka-20261017';
const sourceUri = 'https://download.openstreetmap.fr/extracts/asia/india/karnataka.osm.pbf';
const attribution = '© OpenStreetMap contributors. Data available under the Open Database License (ODbL) 1.0.';
const attributionUrl = 'https://www.openstreetmap.org/copyright';

interface OfferManifest {
  draftOnly?: boolean;
  sourceStatus?: string;
  sourceReviewStatus?: string;
  permittedUses?: string[];
}

const loadPublishableOffer = async (): Promise<string | undefined> => {
  if (process.env.OSM_DATA_OFFER_ENABLED !== 'true') return undefined;
  const bundlePath = process.env.OSM_DATA_OFFER_BUNDLE;
  if (!bundlePath) return undefined;

  try {
    const manifestPath = `${bundlePath}.manifest.json`;
    const [manifestText] = await Promise.all([
      readFile(manifestPath, 'utf-8'),
      access(bundlePath),
    ]);
    const manifest = JSON.parse(manifestText) as OfferManifest;
    const approved =
      manifest.draftOnly === false &&
      manifest.sourceStatus === 'active' &&
      manifest.sourceReviewStatus === 'approved' &&
      manifest.permittedUses?.includes('distribution');
    return approved ? bundlePath : undefined;
  } catch {
    return undefined;
  }
};

export const getOsmDataOffer = async (_req: Request, res: Response) => {
  const bundlePath = await loadPublishableOffer();
  return res.json({
    sourceRecordId,
    sourceUri,
    license: 'ODbL-1.0',
    attribution,
    attributionUrl,
    downloadAvailable: Boolean(bundlePath),
    downloadPath: bundlePath ? '/api/data/osm/karnataka/download' : null,
  });
};

export const downloadOsmDataOffer = async (_req: Request, res: Response) => {
  const bundlePath = await loadPublishableOffer();
  if (!bundlePath) {
    return res.status(404).json({ error: 'osm_data_offer_unavailable' });
  }

  return res.download(
    bundlePath,
    path.basename(bundlePath),
    (error) => {
      if (error && !res.headersSent) {
        res.status(500).json({ error: 'osm_data_offer_download_failed' });
      }
    },
  );
};
