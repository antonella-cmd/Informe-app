// ============================================================
// middleware/clientAccess.js
// ============================================================
import { pool } from '../db.js';

export async function requireClientAccess(req, res, next) {
  const clientId = req.query.clientId || req.params.clientId || req.body.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  const { rows } = await pool.query(
    `SELECT id FROM clients WHERE id = $1 AND created_by = $2`,
    [clientId, req.session.userId]
  );
  if (!rows.length) return res.status(403).json({ error: 'Access denied' });
  next();
}
