// ============================================================
// server.js — con sesiones persistentes en PostgreSQL
// ============================================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from 'dotenv';
import { pool, bootstrapSchema } from './db.js';
import authRoutes      from './routes/auth.js';
import googleAdsRoutes from './routes/googleAds.js';
import metaAdsRoutes   from './routes/metaAds.js';
import clientsRoutes   from './routes/clients.js';
import reportsRoutes   from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import aiRoutes        from './routes/ai.js';
import uploadRoutes    from './routes/upload.js';
import adminRoutes     from './routes/admin.js';

config();

const app  = express();
const PORT = process.env.PORT || 4000;

// Sesiones persistentes en PostgreSQL
const PgSession = connectPgSimple(session);

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(express.json({ limit: '10mb' }));

app.use(session({
  store: new PgSession({
    pool,                     // usa el mismo pool de PostgreSQL
    tableName: 'user_sessions',
    createTableIfMissing: true, // crea la tabla automáticamente
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.SESSION_COOKIE_SAME_SITE || 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  },
}));

// Cargar rol en sesión en cada request
app.use(async (req, res, next) => {
  if (req.session?.userId && !req.session?.role) {
    try {
      const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [req.session.userId]);
      if (rows[0]) req.session.role = rows[0].role;
    } catch (_) {}
  }
  next();
});

// Rutas
app.use('/api/auth',      authRoutes);
app.use('/api/google',    googleAdsRoutes);
app.use('/api/meta',      metaAdsRoutes);
app.use('/api/clients',   clientsRoutes);
app.use('/api/reports',   reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai',        aiRoutes);
app.use('/api/upload',    uploadRoutes);
app.use('/api/admin',     adminRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

bootstrapSchema().then(() => {
  app.listen(PORT, () => console.log(`🚀 PTI Analytics API running on port ${PORT}`));
});

export default app;
