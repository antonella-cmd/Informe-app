// ============================================================
// routes/dashboard.js
// FIX: errores de Meta se reportan claramente al frontend
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import * as google from '../services/googleAds.js';
import * as meta   from '../services/metaAds.js';
import { pool }    from '../db.js';

const router = Router();
router.use(requireAuth);

function withTimeout(promise, ms = 12000) {
  if (!promise) return Promise.resolve(null);
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de ${ms/1000}s esperando la API`)), ms)
    ),
  ]);
}

// GET /api/dashboard/overview?clientId=X&start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/overview', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end } = req.query;

    const { rows: conns } = await pool.query(
      `SELECT platform, account_id, account_name FROM platform_connections WHERE client_id = $1`,
      [clientId]
    );

    const hasGoogle = conns.find(c => c.platform === 'google_ads');
    const hasMeta   = conns.find(c => c.platform === 'meta_ads');

    const [gSummary, mSummary, gCampaigns, mCampaigns, gTimeSeries, mTimeSeries] =
      await Promise.allSettled([
        withTimeout(hasGoogle ? google.fetchAccountSummary(clientId,  { startDate: start, endDate: end }) : null),
        withTimeout(hasMeta   ? meta.fetchMetaSummary(clientId,       { startDate: start, endDate: end }) : null),
        withTimeout(hasGoogle ? google.fetchCampaignMetrics(clientId, { startDate: start, endDate: end }) : null),
        withTimeout(hasMeta   ? meta.fetchMetaCampaigns(clientId,     { startDate: start, endDate: end }) : null),
        withTimeout(hasGoogle ? google.fetchDailyTimeSeries(clientId, { startDate: start, endDate: end }) : null),
        withTimeout(hasMeta   ? meta.fetchMetaTimeSeries(clientId,    { startDate: start, endDate: end }) : null),
      ]);

    // Log completo de errores en el servidor
    const slotNames = ['gSummary','mSummary','gCampaigns','mCampaigns','gTimeSeries','mTimeSeries'];
    [gSummary, mSummary, gCampaigns, mCampaigns, gTimeSeries, mTimeSeries].forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[Dashboard] ${slotNames[i]} falló:`, r.reason?.message);
      }
    });

    const g = gSummary.value || {};
    const m = mSummary.value || {};

    const kpis = {
      total_spend:       (g.spend       || 0) + (m.spend       || 0),
      total_clicks:      (g.clicks      || 0) + (m.clicks      || 0),
      total_impressions: (g.impressions || 0) + (m.impressions || 0),
      total_conversions: (g.conversions || 0) + (m.conversions || 0),
      total_revenue:     (g.revenue     || 0) + (m.revenue     || 0),
      google: g,
      meta:   m,
    };
    kpis.roas = kpis.total_spend > 0 ? kpis.total_revenue / kpis.total_spend : 0;
    kpis.cpa  = kpis.total_conversions > 0 ? kpis.total_spend / kpis.total_conversions : 0;
    kpis.ctr  = kpis.total_impressions > 0 ? (kpis.total_clicks / kpis.total_impressions) * 100 : 0;

    const campaigns = [
      ...(gCampaigns.value || []),
      ...(mCampaigns.value || []),
    ].sort((a, b) => b.spend - a.spend);

    const tsMap = {};
    for (const row of [...(gTimeSeries.value || []), ...(mTimeSeries.value || [])]) {
      if (!tsMap[row.date]) {
        tsMap[row.date] = { date: row.date, spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0 };
      }
      tsMap[row.date].spend       += row.spend;
      tsMap[row.date].clicks      += row.clicks;
      tsMap[row.date].impressions += row.impressions;
      tsMap[row.date].conversions += row.conversions;
      tsMap[row.date].revenue     += row.revenue;
    }
    const timeSeries = Object.values(tsMap).sort((a, b) => a.date.localeCompare(b.date));

    // Errores detallados para el frontend
    const errors = {};
    if (gSummary.status === 'rejected') errors.google = gSummary.reason?.message;
    if (mSummary.status === 'rejected') errors.meta   = mSummary.reason?.message;

    res.json({ kpis, campaigns, timeSeries, connections: conns, errors });
  } catch (e) { next(e); }
});

// GET /api/dashboard/clients-summary
router.get('/clients-summary', async (req, res, next) => {
  try {
    const agencyUserId = req.session.userId;
    const start = req.query.start || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const end   = req.query.end   || new Date().toISOString().split('T')[0];

    const { rows: clients } = await pool.query(
      `SELECT id, name, logo_url FROM clients WHERE created_by = $1`,
      [agencyUserId]
    );

    const summaries = await Promise.all(clients.map(async (client) => {
      const { rows: conns } = await pool.query(
        `SELECT platform FROM platform_connections WHERE client_id = $1`, [client.id]
      );
      let spend = 0, conversions = 0, revenue = 0;
      for (const conn of conns) {
        try {
          if (conn.platform === 'google_ads') {
            const s = await withTimeout(google.fetchAccountSummary(client.id, { startDate: start, endDate: end }), 6000);
            if (s) { spend += s.spend; conversions += s.conversions; revenue += s.revenue; }
          } else if (conn.platform === 'meta_ads') {
            const s = await withTimeout(meta.fetchMetaSummary(client.id, { startDate: start, endDate: end }), 6000);
            if (s) { spend += s.spend; conversions += s.conversions; revenue += s.revenue; }
          }
        } catch (_) {}
      }
      return {
        ...client, spend, conversions, revenue,
        roas: spend > 0 ? revenue / spend : 0,
        platforms: conns.map(c => c.platform),
      };
    }));

    res.json({ clients: summaries, dateRange: { start, end } });
  } catch (e) { next(e); }
});

export default router;
