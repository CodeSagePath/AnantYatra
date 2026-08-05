import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import routeRoutes from './routes/route.routes.js';
import searchRoutes from './routes/search.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large route payloads

// Public Routes
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);

// Protected Routes
app.use('/api/routes', authMiddleware, routeRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'MVC Route Planner Backend Running' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
