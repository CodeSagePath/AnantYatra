import { Request, Response } from 'express';
import { PrismaClient, Route } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { fetchValhallaRoute } from '../services/routing.service.js';

const prisma = new PrismaClient();

export const calculatePublicRoute = async (req: Request, res: Response) => {
  try {
    const { waypoints } = req.body;
    
    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ error: 'At least 2 waypoints required' });
    }

    // Calculate the route using Valhalla
    const routeData = await fetchValhallaRoute(waypoints);
    
    // Return the calculated data without saving to DB
    res.json(routeData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to calculate route' });
  }
};

export const createRoute = async (req: AuthRequest, res: Response) => {
  try {
    const { name, waypoints } = req.body;
    const userId = req.user!.id;

    if (!name || !waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ error: 'Name and at least 2 waypoints required' });
    }

    // Calculate the route using Valhalla
    const routeData = await fetchValhallaRoute(waypoints);

    // Save to database
    // Note: Since we are using SQLite, Prisma expects these to be Strings, so we stringify them.
    const newRoute = await prisma.route.create({
      data: {
        name,
        userId,
        waypoints: JSON.stringify(waypoints), // Store the original waypoints
        routeData: JSON.stringify(routeData), // Store the calculated polyline, distance, duration
      },
    });

    // Return the response parsed as JSON objects for the frontend
    res.status(201).json({
      ...newRoute,
      waypoints: JSON.parse(newRoute.waypoints),
      routeData: JSON.parse(newRoute.routeData)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create route' });
  }
};

export const getAllRoutes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const routes = await prisma.route.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    
    // Parse the JSON strings back into objects for the frontend since SQLite stores them as Strings
    const parsedRoutes = routes.map((route: Route) => ({
      ...route,
      waypoints: JSON.parse(route.waypoints),
      routeData: JSON.parse(route.routeData)
    }));
    
    res.json(parsedRoutes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
};

export const deleteRoute = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const route = await prisma.route.findFirst({ where: { id, userId } });
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    await prisma.route.delete({ where: { id } });
    res.json({ message: 'Route deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete route' });
  }
};
