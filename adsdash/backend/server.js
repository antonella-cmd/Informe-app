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
import { pool } from './db.js';

import authRoutes from './middleware/auth.js';
import googleAdsRoutes from './routes/googleAds.js';
import metaAdsRoutes from './routes/metaAds.js';
import clientsRoutes from './routes/clients.js';
import dashboardRoutes from './routes/dashboard.js';

config();

const app = express();
const PORT = process.env.PORT || 4000;

// ── Security ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

// ── Body & Session ─────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
}));

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/google',    googleAdsRoutes);
app.use('/api/meta',      metaAdsRoutes);
app.use('/api/clients',   clientsRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => console.log(`🚀 AdsDash API running on port ${PORT}`));
export default app;
