// ============================================================
// middleware/clientAccess.js — Acceso por rol
// ============================================================
import { pool } from '../db.js';

export async function requireClientAccess(req, res, next) {
  const clientId = req.query.clientId || req.params.clientId || req.body?.clientId;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  const userId = req.session.userId;
  const role   = req.session.role;

  // Admin y editor tienen acceso a todos los clientes
  if (role === 'admin' || role === 'editor') return next();

  // Manager (legacy) también tiene acceso completo
  if (role === 'manager') return next();

  // Viewer: solo puede ver sus clientes asignados
  const { rows } = await pool.query(
    `SELECT 1 FROM clients c
     LEFT JOIN client_users cu ON cu.client_id = c.id
     WHERE c.id = $1
       AND (c.created_by = $2 OR cu.user_id = $2)`,
    [clientId, userId]
  );

  if (!rows.length) return res.status(403).json({ error: 'Acceso denegado a este cliente' });
  next();
}
