// ============================================================
// routes/auth.js
// ============================================================
import { Router }  from 'express';
import bcrypt      from 'bcryptjs';
import { pool }    from '../db.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id,name,email,role`,
      [name, email, hash]
    );
    req.session.userId = rows[0].id;
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    next(e);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = rows[0].id;
    res.json({ id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role });
  } catch (e) { next(e); }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { rows } = await pool.query(
    `SELECT id,name,email,role FROM users WHERE id = $1`, [req.session.userId]
  );
  res.json(rows[0]);
});

export default router;
