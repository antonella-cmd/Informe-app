// ============================================================
// routes/googleAds.js
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import * as google from '../services/googleAds.js';

const router = Router();
router.use(requireAuth);

// GET /api/google/auth-url?clientId=X
// El clientId va en el state para recuperarlo en el callback
router.get('/auth-url', (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  const url = google.getAuthUrl(clientId); // state se agrega dentro de getAuthUrl
  res.json({ url });
});

// GET /api/google/callback?code=XX&state=clientId:XX
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    // state viene como "clientId:123"
    const clientId = state?.split(':')[1];
    if (!clientId) return res.status(400).send('clientId missing in state');
    await google.exchangeCodeAndSave(code, clientId);
    res.redirect(`${process.env.FRONTEND_URL}/clients/${clientId}/connections?connected=google`);
  } catch (e) { next(e); }
});

// GET /api/google/accounts?clientId=X
router.get('/accounts', requireClientAccess, async (req, res, next) => {
  try {
    const { rows } = await (await import('../db.js')).pool.query(
      `SELECT refresh_token FROM platform_connections WHERE client_id=$1 AND platform='google_ads'`,
      [req.query.clientId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Google Ads no conectado' });
    const accounts = await google.listAccessibleAccounts(rows[0].refresh_token);
    res.json(accounts);
  } catch (e) { next(e); }
});

// GET /api/google/summary
router.get('/summary', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    const data = await google.fetchAccountSummary(clientId, { startDate: start, endDate: end, accountId });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/google/campaigns
router.get('/campaigns', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    const data = await google.fetchCampaignMetrics(clientId, { startDate: start, endDate: end, accountId });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/google/timeseries
router.get('/timeseries', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    const data = await google.fetchDailyTimeSeries(clientId, { startDate: start, endDate: end, accountId });
    res.json(data);
  } catch (e) { next(e); }
});

export default router;
