// ============================================================
// routes/reports.js
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();
router.use(requireAuth);

// GET /api/reports?clientId=X
router.get('/', async (req, res, next) => {
  try {
    const { clientId } = req.query;
    const { rows } = await pool.query(
      `SELECT * FROM reports WHERE client_id=$1 ORDER BY created_at DESC`,
      [clientId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/reports
router.post('/', async (req, res, next) => {
  try {
    const { clientId, title, description, config } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO reports (client_id, created_by, title, description, config)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [clientId, req.session.userId, title, description, JSON.stringify(config)]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/reports/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM reports WHERE id=$1 AND created_by=$2`,
      [req.params.id, req.session.userId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
