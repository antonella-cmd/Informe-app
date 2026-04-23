// ============================================================
// routes/admin.js — Gestión de usuarios y roles (solo ADMIN)
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = Router();
router.use(requireAuth);

// Middleware: solo admins
function requireAdmin(req, res, next) {
  if (req.session?.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol admin' });
  }
  next();
}

// Cargar rol en sesión al autenticar (complementa auth.js)
router.use(async (req, res, next) => {
  if (req.session?.userId && !req.session?.role) {
    const { rows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [req.session.userId]);
    if (rows[0]) req.session.role = rows[0].role;
  }
  next();
});

// ─── Usuarios ────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = 'WHERE 1=1';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      where += ` AND role = $${params.length}`;
    }

    params.push(limit, offset);
    const { rows } = await pool.query(`
      SELECT id, name, email, role, created_at, avatar_url
      FROM users ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM users ${where}`, params.slice(0, -2));
    res.json({ items: rows, total: Number(countRows[0].count), page: Number(page) });
  } catch (e) { next(e); }
});

// POST /api/admin/users — Crear consultor
router.post('/users', requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role = 'editor' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email y password son requeridos' });
    if (!['admin', 'editor'].includes(role)) return res.status(400).json({ error: 'Rol inválido. Use admin o editor' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role, created_at
    `, [name, email, hash, role]);

    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email ya registrado' });
    next(e);
  }
});

// PUT /api/admin/users/:id/role — Cambiar rol
router.put('/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!['admin', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido. Use admin, editor o viewer' });
    }
    // No se puede cambiar el propio rol
    if (String(id) === String(req.session.userId)) {
      return res.status(400).json({ error: 'No podés cambiar tu propio rol' });
    }
    const { rows } = await pool.query(`
      UPDATE users SET role = $1 WHERE id = $2
      RETURNING id, name, email, role
    `, [role, id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (String(id) === String(req.session.userId)) {
      return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
    }
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── Invitaciones (viewers) ───────────────────────────────────

// POST /api/admin/invite — Invitar viewer a un cliente
router.post('/invite', async (req, res, next) => {
  try {
    const { email, client_id, name } = req.body;
    if (!email || !client_id) return res.status(400).json({ error: 'email y client_id son requeridos' });

    // Verificar que el que invita tiene acceso
    const { rows: userRows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [req.session.userId]);
    if (!['admin', 'editor'].includes(userRows[0]?.role)) {
      return res.status(403).json({ error: 'Sin permisos para invitar' });
    }

    // Crear o encontrar usuario
    let userId;
    const { rows: existing } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.length) {
      userId = existing[0].id;
    } else {
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hash = await bcrypt.hash(tempPassword, 12);
      const { rows: newUser } = await pool.query(`
        INSERT INTO users (name, email, password_hash, role, invite_token)
        VALUES ($1, $2, $3, 'viewer', $4)
        RETURNING id
      `, [name || email.split('@')[0], email, hash, inviteToken]);
      userId = newUser[0].id;
    }

    // Asociar al cliente
    await pool.query(`
      INSERT INTO client_users (client_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [client_id, userId]);

    res.json({ ok: true, message: `Invitación enviada a ${email}` });
  } catch (e) { next(e); }
});

// ─── Sync status ──────────────────────────────────────────────

// GET /api/admin/sync-status
router.get('/sync-status', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT sl.*, c.name AS client_name
      FROM sync_logs sl
      JOIN clients c ON c.id = sl.client_id
      ORDER BY sl.created_at DESC
      LIMIT 50
    `);
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// GET /api/admin/health
router.get('/health', requireAdmin, async (req, res, next) => {
  try {
    const { rows: dbCheck } = await pool.query(`SELECT COUNT(*) FROM users`);
    const { rows: clientCount } = await pool.query(`SELECT COUNT(*) FROM clients`);
    const { rows: campaignCount } = await pool.query(`SELECT COUNT(*) FROM campaigns`);
    res.json({
      status: 'ok',
      db: 'connected',
      users: Number(dbCheck[0].count),
      clients: Number(clientCount[0].count),
      campaigns: Number(campaignCount[0].count),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

export default router;
