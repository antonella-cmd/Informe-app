// ============================================================
// routes/clients.js
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = Router();
router.use(requireAuth);

// GET /api/clients
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, 
        array_agg(pc.platform) FILTER (WHERE pc.platform IS NOT NULL) AS platforms,
        json_agg(json_build_object(
          'platform', pc.platform,
          'account_id', pc.account_id,
          'account_name', pc.account_name,
          'connected_at', pc.connected_at
        )) FILTER (WHERE pc.platform IS NOT NULL) AS connections
       FROM clients c
       LEFT JOIN platform_connections pc ON pc.client_id = c.id
       WHERE c.created_by = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
        json_agg(json_build_object(
          'platform', pc.platform,
          'account_id', pc.account_id,
          'account_name', pc.account_name,
          'connected_at', pc.connected_at
        )) FILTER (WHERE pc.platform IS NOT NULL) AS connections
       FROM clients c
       LEFT JOIN platform_connections pc ON pc.client_id = c.id
       WHERE c.id = $1 AND c.created_by = $2
       GROUP BY c.id`,
      [req.params.id, req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /api/clients
router.post('/', async (req, res, next) => {
  try {
    const { name, logo_url, industry, currency } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clients (name, logo_url, industry, currency, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, logo_url || null, industry || null, currency || 'USD', req.session.userId]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/clients/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, logo_url, industry, currency } = req.body;
    const { rows } = await pool.query(
      `UPDATE clients SET name=$1, logo_url=$2, industry=$3, currency=$4
       WHERE id=$5 AND created_by=$6 RETURNING *`,
      [name, logo_url, industry, currency, req.params.id, req.session.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/clients/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM clients WHERE id=$1 AND created_by=$2`,
      [req.params.id, req.session.userId]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/clients/:id/connections/:platform
router.delete('/:id/connections/:platform', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM platform_connections WHERE client_id=$1 AND platform=$2`,
      [req.params.id, req.params.platform]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;


// ============================================================
// routes/reports.js  — Saved reports CRUD
// ============================================================
// import { Router } from 'express';
// import { requireAuth } from '../middleware/auth.js';
// import { pool } from '../db.js';
// import crypto from 'crypto';
//
// const router = Router();
// router.use(requireAuth);
//
// router.get('/', async (req, res, next) => {
//   try {
//     const { clientId } = req.query;
//     const q = clientId
//       ? `SELECT * FROM reports WHERE client_id=$1 AND created_by=$2 ORDER BY updated_at DESC`
//       : `SELECT * FROM reports WHERE created_by=$1 ORDER BY updated_at DESC`;
//     const params = clientId ? [clientId, req.session.userId] : [req.session.userId];
//     const { rows } = await pool.query(q, params);
//     res.json(rows);
//   } catch(e) { next(e); }
// });
//
// router.get('/:id', async (req, res, next) => {
//   try {
//     const { rows } = await pool.query(
//       `SELECT * FROM reports WHERE id=$1 AND created_by=$2`, [req.params.id, req.session.userId]
//     );
//     if (!rows.length) return res.status(404).json({ error: 'Not found' });
//     res.json(rows[0]);
//   } catch(e) { next(e); }
// });
//
// router.post('/', async (req, res, next) => {
//   try {
//     const { client_id, title, description, config } = req.body;
//     const { rows } = await pool.query(
//       `INSERT INTO reports (client_id, created_by, title, description, config)
//        VALUES ($1,$2,$3,$4,$5) RETURNING *`,
//       [client_id, req.session.userId, title, description, JSON.stringify(config)]
//     );
//     res.status(201).json(rows[0]);
//   } catch(e) { next(e); }
// });
//
// router.post('/:id/share', async (req, res, next) => {
//   try {
//     const token = crypto.randomBytes(20).toString('hex');
//     await pool.query(
//       `UPDATE reports SET is_public=true, public_token=$1 WHERE id=$2 AND created_by=$3`,
//       [token, req.params.id, req.session.userId]
//     );
//     res.json({ url: `${process.env.FRONTEND_URL}/reports/public/${token}` });
//   } catch(e) { next(e); }
// });
//
// export default router;
