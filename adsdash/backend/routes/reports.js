// ============================================================
// routes/reports.js — Reportes, share token, PDF, CSV
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';
import crypto from 'crypto';

const router = Router();

// ─── Rutas públicas (share token) ────────────────────────────
// GET /api/reports/share/:token
router.get('/share/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { rows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.country
      FROM reports r
      JOIN clients c ON c.id = r.client_id
      WHERE r.share_token = $1
    `, [token]);

    if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });
    const report = rows[0];

    if (report.share_expires_at && new Date(report.share_expires_at) < new Date()) {
      return res.status(410).json({ error: 'El link de este reporte ha expirado' });
    }

    // Traer métricas del reporte
    const config = report.config_json || {};
    const { rows: metrics } = await pool.query(`
      SELECT cm.date, cm.spend, cm.impressions, cm.clicks, cm.conversions,
             cm.ctr, cm.cpc, cm.roas, cm.revenue, c.name AS campaign_name, a.platform
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1
        AND cm.date BETWEEN $2 AND $3
      ORDER BY cm.date
    `, [report.client_id, config.start_date || '2024-01-01', config.end_date || new Date().toISOString().split('T')[0]]);

    res.json({ report, metrics });
  } catch (e) { next(e); }
});

// ─── Rutas protegidas ────────────────────────────────────────
router.use(requireAuth);

// GET /api/reports?clientId=X&page=1
router.get('/', async (req, res, next) => {
  try {
    const { clientId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.session.userId;

    // Verificar acceso
    const { rows: userRows } = await pool.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    const role = userRows[0]?.role;

    let query, params;
    if (role === 'admin' || role === 'editor') {
      if (clientId) {
        query = `SELECT r.*, u.name AS created_by_name, c.name AS client_name
                 FROM reports r
                 LEFT JOIN users u ON u.id = r.created_by_user_id
                 LEFT JOIN clients c ON c.id = r.client_id
                 WHERE r.client_id = $1
                 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`;
        params = [clientId, limit, offset];
      } else {
        query = `SELECT r.*, u.name AS created_by_name, c.name AS client_name
                 FROM reports r
                 LEFT JOIN users u ON u.id = r.created_by_user_id
                 LEFT JOIN clients c ON c.id = r.client_id
                 ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`;
        params = [limit, offset];
      }
    } else {
      // Viewers solo ven reportes de sus clientes
      query = `SELECT r.*, u.name AS created_by_name, c.name AS client_name
               FROM reports r
               LEFT JOIN users u ON u.id = r.created_by_user_id
               LEFT JOIN clients c ON c.id = r.client_id
               JOIN client_users cu ON cu.client_id = r.client_id
               WHERE cu.user_id = $1
               ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`;
      params = [userId, limit, offset];
    }

    const { rows } = await pool.query(query, params);
    res.json({ items: rows, page: Number(page) });
  } catch (e) { next(e); }
});

// POST /api/reports — Crear reporte
router.post('/', async (req, res, next) => {
  try {
    const { client_id, name, config } = req.body;
    const userId = req.session.userId;
    if (!client_id || !name) return res.status(400).json({ error: 'client_id y name son requeridos' });

    const { rows } = await pool.query(`
      INSERT INTO reports (client_id, created_by_user_id, name, config_json, created_at, last_run_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `, [client_id, userId, name, JSON.stringify(config || {})]);

    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// GET /api/reports/:id — Detalle con métricas
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.country, u.name AS created_by_name
      FROM reports r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN users u ON u.id = r.created_by_user_id
      WHERE r.id = $1
    `, [id]);

    if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });
    const report = rows[0];
    const config = report.config_json || {};

    const { rows: metrics } = await pool.query(`
      SELECT cm.date, cm.spend, cm.impressions, cm.clicks, cm.conversions,
             cm.ctr, cm.cpc, cm.roas, cm.revenue, c.name AS campaign_name, a.platform
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1
        AND cm.date BETWEEN $2 AND $3
      ORDER BY cm.date
    `, [report.client_id, config.start_date || '2024-01-01', config.end_date || new Date().toISOString().split('T')[0]]);

    res.json({ report, metrics });
  } catch (e) { next(e); }
});

// PUT /api/reports/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, config } = req.body;
    const { rows } = await pool.query(`
      UPDATE reports SET name = $1, config_json = $2, last_run_at = NOW()
      WHERE id = $3 RETURNING *
    `, [name, JSON.stringify(config || {}), id]);
    if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/reports/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM reports WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/reports/:id/share — Generar share token
router.post('/:id/share', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.body;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const { rows } = await pool.query(`
      UPDATE reports SET share_token = $1, share_expires_at = $2
      WHERE id = $3 RETURNING share_token, share_expires_at
    `, [token, expiresAt, id]);

    if (!rows.length) return res.status(404).json({ error: 'Reporte no encontrado' });

    const shareUrl = `${process.env.FRONTEND_URL}/share/${token}`;
    res.json({ share_url: shareUrl, expires_at: rows[0].share_expires_at, token });
  } catch (e) { next(e); }
});

// GET /api/reports/:id/export/csv
router.get('/:id/export/csv', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: reportRows } = await pool.query(`SELECT * FROM reports WHERE id = $1`, [id]);
    if (!reportRows.length) return res.status(404).json({ error: 'Reporte no encontrado' });

    const report = reportRows[0];
    const config = report.config_json || {};

    const { rows: metrics } = await pool.query(`
      SELECT cm.date, c.name AS campaign, a.platform,
             cm.spend, cm.impressions, cm.clicks, cm.conversions,
             cm.ctr, cm.cpc, cm.cpm, cm.roas, cm.revenue
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1
        AND cm.date BETWEEN $2 AND $3
      ORDER BY cm.date, c.name
    `, [report.client_id, config.start_date || '2024-01-01', config.end_date || new Date().toISOString().split('T')[0]]);

    const headers = ['Fecha', 'Campaña', 'Plataforma', 'Gasto', 'Impresiones', 'Clics', 'Conversiones', 'CTR', 'CPC', 'CPM', 'ROAS', 'Revenue'];
    const csvRows = metrics.map(r => [
      r.date, r.campaign, r.platform,
      r.spend, r.impressions, r.clicks, r.conversions,
      r.ctr, r.cpc, r.cpm, r.roas, r.revenue,
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${id}.csv"`);
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (e) { next(e); }
});

// GET /api/reports/:id/export/pdf
router.get('/:id/export/pdf', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: reportRows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.country, u.name AS consultant_name
      FROM reports r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN users u ON u.id = r.created_by_user_id
      WHERE r.id = $1
    `, [id]);
    if (!reportRows.length) return res.status(404).json({ error: 'Reporte no encontrado' });

    const report = reportRows[0];
    const config = report.config_json || {};

    const { rows: metrics } = await pool.query(`
      SELECT cm.date, c.name AS campaign, a.platform,
             cm.spend, cm.impressions, cm.clicks, cm.conversions,
             cm.ctr, cm.cpc, cm.roas, cm.revenue
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1
        AND cm.date BETWEEN $2 AND $3
      ORDER BY cm.date, c.name
      LIMIT 200
    `, [report.client_id, config.start_date || '2024-01-01', config.end_date || new Date().toISOString().split('T')[0]]);

    // Calcular totales
    const totals = metrics.reduce((acc, r) => ({
      spend:       (acc.spend       || 0) + Number(r.spend),
      impressions: (acc.impressions || 0) + Number(r.impressions),
      clicks:      (acc.clicks      || 0) + Number(r.clicks),
      conversions: (acc.conversions || 0) + Number(r.conversions),
      revenue:     (acc.revenue     || 0) + Number(r.revenue),
    }), {});
    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    totals.ctr  = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

    const fmt = (n, decimals = 2) => Number(n || 0).toFixed(decimals);
    const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

    // Generar HTML del PDF con branding PTI
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; font-size: 12px; }

    .cover { 
      background: #0A1628; color: white; 
      min-height: 100vh; display: flex; flex-direction: column;
      justify-content: center; padding: 60px;
    }
    .logo-area { margin-bottom: 60px; }
    .logo-dot { 
      display: inline-block; width: 14px; height: 14px; 
      border-radius: 50%; background: #E8A020; margin-right: 10px;
      vertical-align: middle;
    }
    .logo-text { font-size: 28px; font-weight: 700; vertical-align: middle; }
    .logo-text span { color: #E8A020; }
    .cover h1 { font-size: 36px; font-weight: 700; margin-bottom: 16px; color: white; }
    .cover .meta { color: #8AAFD4; font-size: 15px; line-height: 2; }
    .cover .meta strong { color: white; }

    .page { padding: 40px 50px; page-break-before: always; }
    .page-header { 
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #E8A020; padding-bottom: 12px; margin-bottom: 30px;
    }
    .page-header .logo-sm { font-size: 14px; font-weight: 700; color: #0A1628; }
    .page-header .logo-sm span { color: #E8A020; }
    .page-header .client-name { font-size: 13px; color: #6B8AB8; }

    h2 { font-size: 18px; color: #0A1628; margin-bottom: 16px; font-weight: 700; }
    h3 { font-size: 14px; color: #1B3A6B; margin-bottom: 12px; font-weight: 600; }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
    .kpi-card { 
      background: #f8f9fc; border: 1px solid #e0e8f0;
      border-radius: 8px; padding: 16px; border-top: 3px solid #E8A020;
    }
    .kpi-label { font-size: 10px; color: #6B8AB8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .kpi-value { font-size: 22px; font-weight: 700; color: #0A1628; }

    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
    th { background: #0A1628; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
    td { padding: 7px 10px; border-bottom: 1px solid #e8edf5; }
    tr:nth-child(even) td { background: #f8f9fc; }
    .platform-badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 9px; font-weight: 600; text-transform: uppercase;
    }
    .google { background: #EBF3FD; color: #378ADD; }
    .meta   { background: #F0EFFE; color: #7F77DD; }

    .footer { 
      margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e8f0;
      text-align: center; color: #9AAFCC; font-size: 10px;
    }
  </style>
</head>
<body>

<!-- PORTADA -->
<div class="cover">
  <div class="logo-area">
    <span class="logo-dot"></span>
    <span class="logo-text">PTI <span>Analytics</span></span>
  </div>
  <h1>Reporte de Performance Publicitario</h1>
  <div class="meta">
    <div><strong>Cliente:</strong> ${report.client_name} (${report.country || ''})</div>
    <div><strong>Período:</strong> ${config.start_date || '-'} al ${config.end_date || '-'}</div>
    <div><strong>Generado por:</strong> ${report.consultant_name || 'PTI Analytics'}</div>
    <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
  </div>
</div>

<!-- PÁGINA 1: KPIs -->
<div class="page">
  <div class="page-header">
    <div class="logo-sm">PTI <span>Analytics</span></div>
    <div class="client-name">${report.client_name}</div>
  </div>

  <h2>Resumen Ejecutivo</h2>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Gasto Total</div>
      <div class="kpi-value">${fmtMoney(totals.spend)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">ROAS</div>
      <div class="kpi-value">${fmt(totals.roas)}x</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Conversiones</div>
      <div class="kpi-value">${fmt(totals.conversions, 0)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">CTR Promedio</div>
      <div class="kpi-value">${fmt(totals.ctr)}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Impresiones</div>
      <div class="kpi-value">${Number(totals.impressions || 0).toLocaleString('es-AR')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Clics</div>
      <div class="kpi-value">${Number(totals.clicks || 0).toLocaleString('es-AR')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Revenue</div>
      <div class="kpi-value">${fmtMoney(totals.revenue)}</div>
    </div>
  </div>

  <h2>Detalle de Campañas</h2>
  <table>
    <thead>
      <tr>
        <th>Campaña</th>
        <th>Plataforma</th>
        <th>Fecha</th>
        <th>Gasto</th>
        <th>Impresiones</th>
        <th>Clics</th>
        <th>CTR</th>
        <th>ROAS</th>
        <th>Conversiones</th>
      </tr>
    </thead>
    <tbody>
      ${metrics.map(r => `
        <tr>
          <td>${r.campaign}</td>
          <td><span class="platform-badge ${r.platform === 'google_ads' ? 'google' : 'meta'}">${r.platform === 'google_ads' ? 'Google' : 'Meta'}</span></td>
          <td>${r.date}</td>
          <td>${fmtMoney(r.spend)}</td>
          <td>${Number(r.impressions || 0).toLocaleString('es-AR')}</td>
          <td>${Number(r.clicks || 0).toLocaleString('es-AR')}</td>
          <td>${fmt(r.ctr)}%</td>
          <td>${fmt(r.roas)}x</td>
          <td>${fmt(r.conversions, 0)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    PTI Analytics — pticonsultingpartner.com — contacto@pticonsultingpartner.com
  </div>
</div>

</body>
</html>`;

    // Intentar usar puppeteer si está disponible, sino devolver HTML
    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      await browser.close();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-pti-${id}.pdf"`);
      res.send(pdf);
    } catch {
      // Fallback: devolver HTML si puppeteer no está disponible
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-pti-${id}.html"`);
      res.send(html);
    }

  } catch (e) { next(e); }
});

export default router;
