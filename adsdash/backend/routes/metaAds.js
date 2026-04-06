// ============================================================
// routes/metaAds.js
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import * as meta from '../services/metaAds.js';

const router = Router();
router.use(requireAuth);

// GET /api/meta/auth-url?clientId=X
router.get('/auth-url', (req, res) => {
  const state = `clientId:${req.query.clientId}`;
  res.json({ url: meta.getMetaAuthUrl(state) });
});

// GET /api/meta/callback?code=XX&state=clientId:XX
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const clientId = state?.split(':')[1];
  await meta.exchangeMetaCode(code, clientId);
  res.redirect(`${process.env.FRONTEND_URL}/clients/${clientId}?connected=meta`);
});

// GET /api/meta/accounts?clientId=X
router.get('/accounts', requireClientAccess, async (req, res, next) => {
  try { res.json(await meta.listAdAccounts(req.query.clientId)); }
  catch (e) { next(e); }
});

// GET /api/meta/summary?clientId=X&start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/summary', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    res.json(await meta.fetchMetaSummary(clientId, { startDate: start, endDate: end, accountId }));
  } catch (e) { next(e); }
});

// GET /api/meta/campaigns
router.get('/campaigns', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    res.json(await meta.fetchMetaCampaigns(clientId, { startDate: start, endDate: end, accountId }));
  } catch (e) { next(e); }
});

// GET /api/meta/timeseries
router.get('/timeseries', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    res.json(await meta.fetchMetaTimeSeries(clientId, { startDate: start, endDate: end, accountId }));
  } catch (e) { next(e); }
});

// GET /api/meta/adsets?clientId=X&campaignId=Y (opcional)
router.get('/adsets', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId, campaignId } = req.query;
    res.json(await meta.fetchMetaAdSets(clientId, { startDate: start, endDate: end, accountId, campaignId }));
  } catch (e) { next(e); }
});

export default router;
