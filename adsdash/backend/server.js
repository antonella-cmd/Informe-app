// ============================================================
// AdsDash Agency Platform — Backend Server
// Node.js + Express
// ============================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { config } from 'dotenv';
import { pool } from './db.js'; // Importante para que la DB se conecte al inicio

// ── Imports de Rutas (Corregidos) ───────────────────────────
import authRoutes from './routes/auth.js';
import googleAdsRoutes from './routes/googleAds.js';
import metaAdsRoutes from './routes/metaAds.js';
import clientsRoutes from './routes/clients.js';
import dashboardRoutes from './routes/dashboard.js';

config();

const app = express();
// Railway asigna el puerto dinámicamente, esto es obligatorio
const PORT = process.env.PORT || 4000;

// ── Security & Middleware ──────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Limite de peticiones para evitar ataques de fuerza bruta
app.use(rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 200,
  message: { error: 'Demasiadas peticiones, intente más tarde.' }
}));

app.use(express.json());

// ── Session Configuration ──────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'adsdash-secret-default-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Requerido para CORS en prod
    maxAge: 24 * 60 * 60 * 1000 
  },
}));

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/google',    googleAdsRoutes);
app.use('/api/meta',      metaAdsRoutes);
app.use('/api/clients',   clientsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Endpoint de salud para monitoreo de Railway
app.get('/api/health', (_, res) => res.json({ 
  status: 'ok', 
  uptime: process.uptime(),
  timestamp: new Date() 
}));

// ── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error',
    code: err.code || 'UNKNOWN_ERROR'
  });
});

// ── Start Server ───────────────────────────────────────────
// IMPORTANTE: '0.0.0.0' permite que Railway redirija el tráfico correctamente
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AdsDash API running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
