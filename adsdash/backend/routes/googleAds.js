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
router.get('/auth-url', (req, res) => {
  const url = google.getAuthUrl();
  res.json({ url });
});

// GET /api/google/callback?code=XX&state=clientId:XX
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const clientId = state?.split(':')[1];
  await google.exchangeCodeAndSave(code, clientId);
res.redirect(`${process.env.FRONTEND_URL}/clients/${clientId}/connections?connected=google`);
});

// GET /api/google/accounts?clientId=X
router.get('/accounts', requireClientAccess, async (req, res, next) => {
  try {
    const { rows } = await import('../db.js').then(m =>
      m.pool.query(`SELECT refresh_token FROM platform_connections
                    WHERE client_id=$1 AND platform='google_ads'`, [req.query.clientId])
    );
    const accounts = await google.listAccessibleAccounts(rows[0].refresh_token);
    res.json(accounts);
  } catch (e) { next(e); }
});

// GET /api/google/summary?clientId=X&start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/summary', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    const data = await google.fetchAccountSummary(clientId, {
      startDate: start, endDate: end, accountId,
    });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/google/campaigns
router.get('/campaigns', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    const data = await google.fetchCampaignMetrics(clientId, {
      startDate: start, endDate: end, accountId,
    });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/google/timeseries
router.get('/timeseries', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, start, end, accountId } = req.query;
    const data = await google.fetchDailyTimeSeries(clientId, {
      startDate: start, endDate: end, accountId,
    });
    res.json(data);
  } catch (e) { next(e); }
});

export default router;


// ============================================================
// routes/metaAds.js  (save separately as metaAds.js)
// ============================================================
// import { Router } from 'express';
// import { requireAuth } from '../middleware/auth.js';
// import { requireClientAccess } from '../middleware/clientAccess.js';
// import * as meta from '../services/metaAds.js';
//
// const router = Router();
// router.use(requireAuth);
//
// router.get('/auth-url', (req, res) => {
//   const state = `clientId:${req.query.clientId}`;
//   res.json({ url: meta.getMetaAuthUrl(state) });
// });
//
// router.get('/callback', async (req, res) => {
//   const { code, state } = req.query;
//   const clientId = state?.split(':')[1];
//   await meta.exchangeMetaCode(code, clientId);
//   res.redirect(`${process.env.FRONTEND_URL}/clients/${clientId}?connected=meta`);
// });
//
// router.get('/accounts',   requireClientAccess, async (req,res,next) => {
//   try { res.json(await meta.listAdAccounts(req.query.clientId)); } catch(e){next(e);}
// });
// router.get('/summary',    requireClientAccess, async (req,res,next) => {
//   try {
//     const {clientId,start,end,accountId} = req.query;
//     res.json(await meta.fetchMetaSummary(clientId,{startDate:start,endDate:end,accountId}));
//   } catch(e){next(e);}
// });
// router.get('/campaigns',  requireClientAccess, async (req,res,next) => {
//   try {
//     const {clientId,start,end,accountId} = req.query;
//     res.json(await meta.fetchMetaCampaigns(clientId,{startDate:start,endDate:end,accountId}));
//   } catch(e){next(e);}
// });
// router.get('/timeseries', requireClientAccess, async (req,res,next) => {
//   try {
//     const {clientId,start,end,accountId} = req.query;
//     res.json(await meta.fetchMetaTimeSeries(clientId,{startDate:start,endDate:end,accountId}));
//   } catch(e){next(e);}
// });
// router.get('/adsets',     requireClientAccess, async (req,res,next) => {
//   try {
//     const {clientId,start,end,accountId,campaignId} = req.query;
//     res.json(await meta.fetchMetaAdSets(clientId,{startDate:start,endDate:end,accountId,campaignId}));
//   } catch(e){next(e);}
// });
//
// export default router;
