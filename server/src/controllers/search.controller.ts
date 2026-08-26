import { Request, Response } from 'express';
import { searchPlaces, batchGetStates, reverseGeocode } from '../services/search.service.js';

export const search = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required and must be a string.' });
      return;
    }

    const results = await searchPlaces(q);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search for places' });
  }
};

export const batchStates = async (req: Request, res: Response): Promise<void> => {
  try {
    const { coordinates } = req.body;
    
    if (!coordinates || !Array.isArray(coordinates)) {
      res.status(400).json({ error: 'Body parameter "coordinates" is required and must be an array.' });
      return;
    }

    const results = await batchGetStates(coordinates);
    res.json(results);
  } catch (error) {
    console.error('Batch states error:', error);
    res.status(500).json({ error: 'Failed to fetch batch states' });
  }
};

export const reverseGeocodeController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { lat, lon } = req.query;
    
    if (!lat || !lon) {
      res.status(400).json({ error: 'Query parameters "lat" and "lon" are required.' });
      return;
    }

    const result = await reverseGeocode(parseFloat(lat as string), parseFloat(lon as string));
    res.json({ name: result });
  } catch (error) {
    console.error('Reverse geocode error:', error);
    res.status(500).json({ error: 'Failed to reverse geocode' });
  }
};
