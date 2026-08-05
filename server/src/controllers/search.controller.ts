import { Request, Response } from 'express';
import { searchPlaces } from '../services/search.service.js';

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
