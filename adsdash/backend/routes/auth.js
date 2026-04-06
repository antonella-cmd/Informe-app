import { pool } from '../db.js';

// Verifica si el usuario está logueado
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Verifica si el usuario tiene permiso sobre un cliente específico
export async function requireClientAccess(req, res, next) {
  const clientId = req.query.clientId || req.params.clientId || req.body.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  try {
    const { rows } = await pool.query(
      `SELECT id FROM clients WHERE id = $1 AND created_by = $2`,
      [clientId, req.session.userId]
    );
    if (!rows.length) return res.status(403).json({ error: 'Access denied' });
    next();
  } catch (error) {
    next(error);
  }
}
