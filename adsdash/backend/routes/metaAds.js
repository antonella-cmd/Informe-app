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
  res.redirect(`${process.env.FRONTEND_URL}/clients/${clientId}/connections?connected=meta`);
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

// GET /api/meta/diagnose?clientId=X — diagnóstico completo de la conexión
router.get('/diagnose', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.query;
    const { rows } = await (await import('../db.js')).pool.query(
      `SELECT access_token, account_id, account_name, token_expires_at
       FROM platform_connections WHERE client_id=$1 AND platform='meta_ads'`,
      [clientId]
    );

    if (!rows.length) return res.json({ connected: false, error: 'No hay conexión de Meta guardada' });

    const conn = rows[0];
    const result = {
      connected: true,
      has_token: !!conn.access_token,
      has_account_id: !!conn.account_id,
      account_id: conn.account_id,
      account_name: conn.account_name,
      token_expires_at: conn.token_expires_at,
    };

    // Probar el token
    if (conn.access_token) {
      try {
        const testUrl = `https://graph.facebook.com/v20.0/me?access_token=${conn.access_token}&fields=id,name`;
        const testRes = await (await import('node-fetch')).default(testUrl);
        const testData = await testRes.json();
        if (testData.error) {
          result.token_valid = false;
          result.token_error = testData.error.message;
        } else {
          result.token_valid = true;
          result.token_user = testData.name;
        }
      } catch (e) {
        result.token_valid = false;
        result.token_error = e.message;
      }

      // Listar cuentas disponibles
      try {
        const accsUrl = `https://graph.facebook.com/v20.0/me/adaccounts?access_token=${conn.access_token}&fields=id,name,account_status&limit=10`;
        const accsRes = await (await import('node-fetch')).default(accsUrl);
        const accsData = await accsRes.json();
        result.available_accounts = accsData.data || [];
        result.accounts_error = accsData.error?.message;
      } catch (e) {
        result.available_accounts = [];
        result.accounts_error = e.message;
      }
    }

    res.json(result);
  } catch (e) { next(e); }
});
