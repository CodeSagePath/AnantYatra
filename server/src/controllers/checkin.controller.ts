import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { reverseGeocode } from '../services/search.service.js';
import { locationLogger } from '../utils/logger.js';

const prisma = new PrismaClient();

export const createCheckin = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, address } = req.body;
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const resolvedAddress = address || (await reverseGeocode(latNum, lngNum));

    const checkin = await prisma.checkin.create({
      data: {
        userId,
        latitude: latNum,
        longitude: lngNum,
        address: resolvedAddress || null,
      },
      include: {
        user: {
          select: {
            email: true,
            role: true,
          },
        },
      },
    });

    // Log to the dedicated background location tracking file
    locationLogger.info({
      user: userEmail,
      location: resolvedAddress || 'Unknown Place',
      coords: `${latNum.toFixed(5)}, ${lngNum.toFixed(5)}`
    });

    res.status(201).json(checkin);
  } catch (error: unknown) {
    const errObj = error as { message?: string };
    res.status(500).json({ error: errObj.message || 'Failed to record check-in' });
  }
};

export const getAdminCheckins = async (req: AuthRequest, res: Response) => {
  try {
    const checkins = await prisma.checkin.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.json(checkins);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to fetch check-ins for admin' });
  }
};

export const getSharedCheckin = async (req: Request, res: Response) => {
  try {
    const shareToken = req.params.shareToken as string;

    const checkin = await prisma.checkin.findUnique({
      where: { shareToken },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!checkin) {
      return res.status(404).json({ error: 'Check-in location not found or invalid link' });
    }

    res.json(checkin);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to retrieve shared check-in' });
  }
};
