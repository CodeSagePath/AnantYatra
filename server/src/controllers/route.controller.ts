import { Request, Response } from 'express';
import { PrismaClient, Route } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { fetchValhallaRoute } from '../services/routing.service.js';

const prisma = new PrismaClient();

const parseJsonSafely = <T>(jsonString: string, fallback: T): T => {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
};

interface ParsedRouteData {
  polyline: string;
  distance: number;
  duration: number;
  legDistances: number[];
  legDurations: number[];
}

export const calculatePublicRoute = async (req: Request, res: Response) => {
  try {
    const { waypoints, costing } = req.body;
    
    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ error: 'At least 2 waypoints required' });
    }

    // Calculate the route using Valhalla
    const routeData = await fetchValhallaRoute(waypoints, costing);
    
    // Return the calculated data without saving to DB
    return res.json(routeData);
  } catch (error: unknown) {
    const errMessage = (error as Error).message || 'Failed to calculate route';
    return res.status(500).json({ error: errMessage });
  }
};

export const createRoute = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const { name, waypoints, costing } = req.body;

    if (!name || !waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ error: 'Name and at least 2 waypoints required' });
    }

    // Calculate the route using Valhalla
    const routeData = await fetchValhallaRoute(waypoints, costing || 'auto');

    // Save to database
    const newRoute = await prisma.route.create({
      data: {
        name,
        userId,
        costing: costing || 'auto',
        waypoints: JSON.stringify(waypoints), // Store original waypoints
        routeData: JSON.stringify(routeData), // Store calculated polyline, distance, duration, legDistances
      },
    });

    const parsedRouteData = parseJsonSafely<ParsedRouteData>(newRoute.routeData, {
      polyline: '',
      distance: 0,
      duration: 0,
      legDistances: [],
      legDurations: [],
    });

    return res.status(201).json({
      id: newRoute.id,
      name: newRoute.name,
      waypoints: parseJsonSafely<any[]>(newRoute.waypoints, []),
      polyline: parsedRouteData.polyline,
      distance: parsedRouteData.distance,
      duration: parsedRouteData.duration,
      legDistances: parsedRouteData.legDistances,
      legDurations: parsedRouteData.legDurations,
      costing: newRoute.costing,
      shareToken: newRoute.shareToken,
      userId: newRoute.userId,
      createdAt: newRoute.createdAt,
    });
  } catch (error: unknown) {
    const errMessage = (error as Error).message || 'Failed to create route';
    return res.status(500).json({ error: errMessage });
  }
};

export const updateRoute = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const id = req.params.id as string;
    const { name, waypoints, costing } = req.body;

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ error: 'At least 2 waypoints required' });
    }

    const existing = await prisma.route.findFirst({ where: { id, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Route not found or unauthorized' });
    }

    // Calculate updated route using Valhalla
    const routeData = await fetchValhallaRoute(waypoints, costing || existing.costing || 'auto');

    const updated = await prisma.route.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        costing: costing || existing.costing || 'auto',
        waypoints: JSON.stringify(waypoints),
        routeData: JSON.stringify(routeData),
      },
    });

    const parsedRouteData = parseJsonSafely<ParsedRouteData>(updated.routeData, {
      polyline: '',
      distance: 0,
      duration: 0,
      legDistances: [],
      legDurations: [],
    });

    return res.json({
      id: updated.id,
      name: updated.name,
      waypoints: parseJsonSafely<any[]>(updated.waypoints, []),
      polyline: parsedRouteData.polyline,
      distance: parsedRouteData.distance,
      duration: parsedRouteData.duration,
      legDistances: parsedRouteData.legDistances,
      legDurations: parsedRouteData.legDurations,
      costing: updated.costing,
      shareToken: updated.shareToken,
      userId: updated.userId,
      createdAt: updated.createdAt,
    });
  } catch (error: unknown) {
    const errMessage = (error as Error).message || 'Failed to update route';
    return res.status(500).json({ error: errMessage });
  }
};

export const getAllRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const routes = await prisma.route.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    
    const parsedRoutes = routes.map((route: Route) => {
      const parsedRouteData = parseJsonSafely<ParsedRouteData>(route.routeData, {
        polyline: '',
        distance: 0,
        duration: 0,
        legDistances: [],
        legDurations: [],
      });

      return {
        id: route.id,
        name: route.name,
        waypoints: parseJsonSafely<any[]>(route.waypoints, []),
        polyline: parsedRouteData.polyline,
        distance: parsedRouteData.distance,
        duration: parsedRouteData.duration,
        legDistances: parsedRouteData.legDistances,
        legDurations: parsedRouteData.legDurations,
        costing: route.costing,
        shareToken: route.shareToken,
        userId: route.userId,
        createdAt: route.createdAt,
      };
    });
    
    return res.json(parsedRoutes);
  } catch (error: unknown) {
    const errMessage = (error as Error).message || 'Failed to fetch routes';
    return res.status(500).json({ error: errMessage });
  }
};

export const getSharedRoute = async (req: Request, res: Response) => {
  try {
    const shareToken = req.params.shareToken as string;
    if (!shareToken) {
      return res.status(400).json({ error: 'Share token is required' });
    }

    const route = await prisma.route.findUnique({
      where: { shareToken },
    });

    if (!route) {
      return res.status(404).json({ error: 'Shared trip link is invalid or has been removed.' });
    }

    const parsedRouteData = parseJsonSafely<ParsedRouteData>(route.routeData, {
      polyline: '',
      distance: 0,
      duration: 0,
      legDistances: [],
      legDurations: [],
    });

    return res.json({
      id: route.id,
      name: route.name,
      waypoints: parseJsonSafely<any[]>(route.waypoints, []),
      polyline: parsedRouteData.polyline,
      distance: parsedRouteData.distance,
      duration: parsedRouteData.duration,
      legDistances: parsedRouteData.legDistances,
      legDurations: parsedRouteData.legDurations,
      costing: route.costing,
      shareToken: route.shareToken,
      createdAt: route.createdAt,
    });
  } catch (error: unknown) {
    const errMessage = (error as Error).message || 'Failed to fetch shared route';
    return res.status(500).json({ error: errMessage });
  }
};

export const deleteRoute = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const id = req.params.id as string;

    const route = await prisma.route.findFirst({ where: { id, userId } });
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    await prisma.route.delete({ where: { id } });
    return res.json({ message: 'Route deleted successfully' });
  } catch (error: unknown) {
    const errMessage = (error as Error).message || 'Failed to delete route';
    return res.status(500).json({ error: errMessage });
  }
};
