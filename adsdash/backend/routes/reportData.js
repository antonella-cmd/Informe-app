// ============================================================
// routes/reportData.js
// Endpoints granulares para el constructor de informes
// Todos los bloques de datos disponibles para Google y Meta
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';
import fetch from 'node-fetch';

const router = Router();
router.use(requireAuth);

const GRAPH = 'https://graph.facebook.com/v20.0';

// ── Helpers ─────────────────────────────────────────────────
async function getMetaConn(clientId) {
  const { rows } = await pool.query(
    `SELECT access_token, account_id FROM platform_connections
     WHERE client_id=$1 AND platform='meta_ads'`,
    [clientId]
  );
  return rows[0] || null;
}

async function getGoogleConn(clientId) {
  const { rows } = await pool.query(
    `SELECT refresh_token, account_id FROM platform_connections
     WHERE client_id=$1 AND platform='google_ads'`,
    [clientId]
  );
  return rows[0] || null;
}

async function metaGet(path, params, token) {
  const url = `${GRAPH}/${path}?` + new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

// ── GET /api/report-data/available-blocks
// Devuelve todos los bloques disponibles para el constructor
router.get('/available-blocks', (req, res) => {
  res.json({
    blocks: [
      // KPIs
      { id: 'kpi_summary',        category: 'kpis',        label: 'KPIs principales',           icon: '📊', platforms: ['google','meta','both'], description: 'Tarjetas con métricas clave y comparación de períodos' },
      { id: 'kpi_google',         category: 'kpis',        label: 'KPIs Google Ads',            icon: '🔵', platforms: ['google'], description: 'KPIs exclusivos de Google Ads' },
      { id: 'kpi_meta',           category: 'kpis',        label: 'KPIs Meta Ads',              icon: '🔷', platforms: ['meta'], description: 'KPIs exclusivos de Meta Ads' },
      // Campañas
      { id: 'campaigns_table',    category: 'campañas',    label: 'Tabla de campañas',          icon: '📋', platforms: ['google','meta','both'], description: 'Tabla completa con columnas personalizables' },
      { id: 'campaigns_chart',    category: 'campañas',    label: 'Gráfico por campaña',        icon: '📈', platforms: ['google','meta','both'], description: 'Barras comparando campañas por métrica elegida' },
      // Anuncios
      { id: 'top_ads',            category: 'anuncios',    label: 'Mejores anuncios',           icon: '🏆', platforms: ['meta','google'], description: 'Top N anuncios con imagen/video del creativo' },
      { id: 'worst_ads',          category: 'anuncios',    label: 'Peores anuncios',            icon: '⚠️', platforms: ['meta','google'], description: 'Anuncios con menor performance' },
      { id: 'top_ctr_ads',        category: 'anuncios',    label: 'Mayor CTR',                  icon: '🎯', platforms: ['meta','google'], description: 'Anuncios con mejor tasa de clics' },
      { id: 'worst_ctr_ads',      category: 'anuncios',    label: 'Menor CTR',                  icon: '📉', platforms: ['meta','google'], description: 'Anuncios con peor tasa de clics' },
      { id: 'top_roas_ads',       category: 'anuncios',    label: 'Mejor ROAS por anuncio',     icon: '💰', platforms: ['meta','google'], description: 'Anuncios con mayor retorno sobre inversión' },
      // Segmentación
      { id: 'device_breakdown',   category: 'audiencia',   label: 'Conversiones por dispositivo', icon: '📱', platforms: ['google','meta'], description: 'Mobile vs desktop vs tablet' },
      { id: 'age_breakdown',      category: 'audiencia',   label: 'Conversiones por edad',      icon: '👥', platforms: ['google','meta'], description: 'Desglose por grupos de edad' },
      { id: 'gender_breakdown',   category: 'audiencia',   label: 'Conversiones por género',    icon: '⚖️', platforms: ['google','meta'], description: 'Hombre vs mujer vs no especificado' },
      { id: 'geo_breakdown',      category: 'audiencia',   label: 'Conversiones por región',    icon: '🗺️', platforms: ['google','meta'], description: 'Desglose geográfico' },
      // Google específico
      { id: 'search_terms',       category: 'google',      label: 'Términos de búsqueda',       icon: '🔍', platforms: ['google'], description: 'Términos que disparan los anuncios' },
      { id: 'keyword_table',      category: 'google',      label: 'Keywords',                   icon: '🗝️', platforms: ['google'], description: 'Rendimiento por palabra clave' },
      // Meta específico
      { id: 'meta_placements',    category: 'meta',        label: 'Ubicaciones Meta',           icon: '📍', platforms: ['meta'], description: 'Feed, Stories, Reels, etc.' },
      { id: 'meta_adsets',        category: 'meta',        label: 'Conjuntos de anuncios',      icon: '🗂️', platforms: ['meta'], description: 'Rendimiento por adset' },
      // Evolución
      { id: 'timeseries_chart',   category: 'evolución',   label: 'Gráfico de evolución',       icon: '📅', platforms: ['google','meta','both'], description: 'Línea temporal de cualquier métrica' },
      { id: 'roas_history',       category: 'evolución',   label: 'Histórico de ROAS',          icon: '📆', platforms: ['google','meta','both'], description: 'ROAS por mes en tabla' },
      // Extras
      { id: 'ai_summary',         category: 'análisis',    label: 'Resumen IA',                 icon: '🤖', platforms: ['google','meta','both'], description: 'Análisis automático con Claude AI' },
      { id: 'custom_text',        category: 'extras',      label: 'Texto personalizado',        icon: '✍️', platforms: ['google','meta','both'], description: 'Agregar conclusiones o notas propias' },
      { id: 'comparison_table',   category: 'extras',      label: 'Tabla comparativa períodos', icon: '↔️', platforms: ['google','meta','both'], description: 'Comparar dos períodos lado a lado' },
    ]
  });
});

// ── GET /api/report-data/:clientId/meta/ads
// Anuncios de Meta con creatividades, ordenables
router.get('/:clientId/meta/ads', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end, sort = 'roas', order = 'desc', limit = 10 } = req.query;

    const conn = await getMetaConn(clientId);

    // Si no hay conexión a Meta API, intentar desde base de datos (datos importados por Excel)
    if (!conn || !conn.account_id) {
      const platFilter = `AND (a.platform = 'meta_ads' OR ms.platform = 'meta_ads')`;
      // Intentar desde campaign_metrics primero
      try {
        const { rows } = await pool.query(`
          SELECT c.name, a.platform, c.name AS campaign_name,
            SUM(cm.spend)::numeric AS spend, SUM(cm.clicks)::numeric AS clicks,
            SUM(cm.impressions)::numeric AS impressions,
            SUM(cm.conversions)::numeric AS conversions,
            SUM(cm.revenue)::numeric AS revenue,
            AVG(cm.ctr)::numeric AS ctr, AVG(cm.cpc)::numeric AS cpc,
            AVG(cm.cpm)::numeric AS cpm,
            CASE WHEN SUM(cm.spend)>0 THEN SUM(cm.revenue)::numeric/SUM(cm.spend) ELSE 0 END AS roas,
            CASE WHEN SUM(cm.conversions)>0 THEN SUM(cm.spend)::numeric/SUM(cm.conversions) ELSE 0 END AS cpa,
            NULL::text AS image_url, 'image' AS creative_type
          FROM campaign_metrics cm
          JOIN campaigns c ON c.id = cm.campaign_id
          JOIN ad_accounts a ON a.id = c.ad_account_id
          WHERE a.client_id = $1 AND cm.date BETWEEN $2 AND $3
          GROUP BY c.name, a.platform
          ORDER BY ${['roas','spend','conversions','ctr','clicks','cpm','reach'].includes(sort)?sort:'roas'} DESC NULLS LAST
          LIMIT $4
        `, [clientId, start, end, parseInt(limit)]);

        if (rows.length > 0) {
          return res.json({ ads: rows.map((r,i)=>({...r,ad_id:`db_${i}`,name:r.name,spend:parseFloat(r.spend||0),clicks:parseFloat(r.clicks||0),impressions:parseFloat(r.impressions||0),conversions:parseFloat(r.conversions||0),revenue:parseFloat(r.revenue||0),ctr:parseFloat(r.ctr||0),cpc:parseFloat(r.cpc||0),cpm:parseFloat(r.cpm||0),roas:parseFloat(r.roas||0),cpa:parseFloat(r.cpa||0),reach:0,frequency:0})), total: rows.length, source: 'database' });
        }

        // Fallback a metrics_snapshots
        const { rows: msRows } = await pool.query(`
          SELECT campaign_name AS name, platform, campaign_name,
            SUM(spend)::numeric AS spend, SUM(clicks)::numeric AS clicks,
            SUM(impressions)::numeric AS impressions, SUM(conversions)::numeric AS conversions,
            SUM(revenue)::numeric AS revenue,
            CASE WHEN SUM(impressions)>0 THEN (SUM(clicks)::numeric/SUM(impressions))*100 ELSE 0 END AS ctr,
            CASE WHEN SUM(clicks)>0 THEN SUM(spend)::numeric/SUM(clicks) ELSE 0 END AS cpc,
            CASE WHEN SUM(impressions)>0 THEN (SUM(spend)::numeric/SUM(impressions))*1000 ELSE 0 END AS cpm,
            CASE WHEN SUM(spend)>0 THEN SUM(revenue)::numeric/SUM(spend) ELSE 0 END AS roas,
            CASE WHEN SUM(conversions)>0 THEN SUM(spend)::numeric/SUM(conversions) ELSE 0 END AS cpa,
            NULL::text AS image_url, 'image' AS creative_type
          FROM metrics_snapshots
          WHERE client_id = $1 AND date BETWEEN $2 AND $3 AND campaign_name IS NOT NULL
          GROUP BY campaign_name, platform
          ORDER BY roas DESC NULLS LAST
          LIMIT $4
        `, [clientId, start, end, parseInt(limit)]);

        return res.json({ ads: msRows.map((r,i)=>({...r,ad_id:`ms_${i}`,name:r.name,spend:parseFloat(r.spend||0),clicks:parseFloat(r.clicks||0),impressions:parseFloat(r.impressions||0),conversions:parseFloat(r.conversions||0),revenue:parseFloat(r.revenue||0),ctr:parseFloat(r.ctr||0),cpc:parseFloat(r.cpc||0),cpm:parseFloat(r.cpm||0),roas:parseFloat(r.roas||0),cpa:parseFloat(r.cpa||0),reach:0,frequency:0})), total: msRows.length, source: 'database' });
      } catch(dbErr) {
        return res.json({ ads: [], error: 'Sin conexión a Meta y sin datos importados' });
      }
    }

    const { access_token, account_id } = conn;
    if (!account_id) return res.json({ ads: [], error: 'Sin account_id de Meta' });

    // Traer ads con insights y creatividades
    const adsData = await metaGet(`${account_id}/ads`, {
      fields: [
        'id,name,status',
        'campaign{id,name}',
        'adset{id,name}',
        'creative{id,name,thumbnail_url,image_url,video_id,body,title,object_type,call_to_action_type}',
        `insights.fields(impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach,frequency).time_range({"since":"${start}","until":"${end}"})`,
      ].join(','),
      limit: 100,
    }, access_token);

    const rawAds = adsData.data || [];

    // Para ads con video_id, intentar traer thumbnail
    const videoIds = rawAds
      .map(a => a.creative?.video_id)
      .filter(Boolean);

    const videoThumbs = {};
    if (videoIds.length > 0) {
      try {
        const vidData = await metaGet('', {
          ids: videoIds.slice(0, 20).join(','),
          fields: 'id,thumbnails{uri},picture',
        }, access_token);
        for (const [id, v] of Object.entries(vidData)) {
          videoThumbs[id] = v.thumbnails?.data?.[0]?.uri || v.picture || null;
        }
      } catch (_) {}
    }

    const ads = rawAds.map(ad => {
      const ins = ad.insights?.data?.[0] || {};
      const conv = (ins.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
      const revenue = (ins.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
      const spend = Number(ins.spend || 0);
      const cr = ad.creative || {};
      const videoId = cr.video_id;
      const imageUrl = cr.image_url || cr.thumbnail_url ||
        (videoId ? videoThumbs[videoId] : null);

      return {
        ad_id: ad.id,
        name: ad.name,
        status: ad.status,
        campaign_id: ad.campaign?.id,
        campaign_name: ad.campaign?.name,
        adset_name: ad.adset?.name,
        platform: 'meta_ads',
        creative_type: videoId ? 'video' : 'image',
        image_url: imageUrl,
        video_id: videoId,
        headline: cr.title,
        body: cr.body,
        cta: cr.call_to_action_type,
        ad_url: `https://www.facebook.com/ads/library/?id=${ad.id}`,
        impressions: Number(ins.impressions || 0),
        clicks: Number(ins.clicks || 0),
        spend,
        conversions: Number(conv),
        revenue: Number(revenue),
        ctr: Number(ins.ctr || 0),
        cpc: Number(ins.cpc || 0),
        cpm: Number(ins.cpm || 0),
        reach: Number(ins.reach || 0),
        frequency: Number(ins.frequency || 0),
        roas: spend > 0 && Number(revenue) > 0 ? Number(revenue) / spend : 0,
        cpa: Number(conv) > 0 ? spend / Number(conv) : 0,
      };
    });

    // Ordenar
    const sortFn = (a, b) => {
      const va = a[sort] || 0, vb = b[sort] || 0;
      return order === 'asc' ? va - vb : vb - va;
    };
    const sorted = ads.filter(a => a.impressions > 0).sort(sortFn).slice(0, parseInt(limit));

    res.json({ ads: sorted, total: ads.length });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/meta/adsets
router.get('/:clientId/meta/adsets', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end } = req.query;
    const conn = await getMetaConn(clientId);
    if (!conn) return res.json({ adsets: [] });
    const { access_token, account_id } = conn;

    const data = await metaGet(`${account_id}/adsets`, {
      fields: `id,name,status,optimization_goal,campaign{name},insights.fields(impressions,clicks,spend,actions,action_values,ctr,cpc,cpm,reach).time_range({"since":"${start}","until":"${end}"})`,
      limit: 100,
    }, access_token);

    const adsets = (data.data || []).map(s => {
      const ins = s.insights?.data?.[0] || {};
      const conv = (ins.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
      const revenue = (ins.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
      const spend = Number(ins.spend || 0);
      return {
        id: s.id, name: s.name, status: s.status,
        goal: s.optimization_goal,
        campaign_name: s.campaign?.name,
        impressions: Number(ins.impressions || 0),
        clicks: Number(ins.clicks || 0),
        spend, conversions: Number(conv), revenue: Number(revenue),
        ctr: Number(ins.ctr || 0), cpc: Number(ins.cpc || 0),
        cpm: Number(ins.cpm || 0), reach: Number(ins.reach || 0),
        roas: spend > 0 ? Number(revenue) / spend : 0,
        cpa: Number(conv) > 0 ? spend / Number(conv) : 0,
      };
    });
    res.json({ adsets });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/meta/placements
router.get('/:clientId/meta/placements', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end } = req.query;
    const conn = await getMetaConn(clientId);
    if (!conn) return res.json({ placements: [] });
    const { access_token, account_id } = conn;

    const data = await metaGet(`${account_id}/insights`, {
      fields: 'impressions,clicks,spend,actions,action_values,ctr,reach',
      breakdowns: 'publisher_platform,platform_position',
      time_range: JSON.stringify({ since: start, until: end }),
      level: 'account',
      limit: 50,
    }, access_token);

    const placements = (data.data || []).map(r => {
      const conv = (r.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
      const revenue = (r.action_values || []).find(a => a.action_type === 'purchase')?.value || 0;
      const spend = Number(r.spend || 0);
      return {
        platform: r.publisher_platform,
        position: r.platform_position,
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        spend, conversions: Number(conv), revenue: Number(revenue),
        ctr: Number(r.ctr || 0), reach: Number(r.reach || 0),
        roas: spend > 0 ? Number(revenue) / spend : 0,
      };
    }).sort((a, b) => b.spend - a.spend);

    res.json({ placements });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/meta/demographics
router.get('/:clientId/meta/demographics', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end } = req.query;
    const conn = await getMetaConn(clientId);
    if (!conn) return res.json({ age: [], gender: [], device: [] });
    const { access_token, account_id } = conn;

    const [ageData, genderData, deviceData] = await Promise.allSettled([
      metaGet(`${account_id}/insights`, {
        fields: 'impressions,clicks,spend,actions,ctr',
        breakdowns: 'age',
        time_range: JSON.stringify({ since: start, until: end }),
        level: 'account',
      }, access_token),
      metaGet(`${account_id}/insights`, {
        fields: 'impressions,clicks,spend,actions,ctr',
        breakdowns: 'gender',
        time_range: JSON.stringify({ since: start, until: end }),
        level: 'account',
      }, access_token),
      metaGet(`${account_id}/insights`, {
        fields: 'impressions,clicks,spend,actions,ctr',
        breakdowns: 'device_platform',
        time_range: JSON.stringify({ since: start, until: end }),
        level: 'account',
      }, access_token),
    ]);

    const mapRow = (r) => {
      const conv = (r.actions || []).find(a => a.action_type === 'purchase')?.value || 0;
      return {
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        spend: Number(r.spend || 0),
        conversions: Number(conv),
        ctr: Number(r.ctr || 0),
      };
    };

    res.json({
      age: (ageData.value?.data || []).map(r => ({ label: r.age, ...mapRow(r) })),
      gender: (genderData.value?.data || []).map(r => ({ label: r.gender, ...mapRow(r) })),
      device: (deviceData.value?.data || []).map(r => ({ label: r.device_platform, ...mapRow(r) })),
    });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/google/search-terms
router.get('/:clientId/google/search-terms', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end, limit = 50 } = req.query;
    const conn = await getGoogleConn(clientId);
    if (!conn) return res.json({ terms: [] });

    // Importar Google Ads service
    const { GoogleAdsApi } = await import('google-ads-api');
    const api = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
    });

    const customerConfig = {
      customer_id: conn.account_id?.replace(/-/g, ''),
      refresh_token: conn.refresh_token,
    };
    if (process.env.GOOGLE_MCC_ID) customerConfig.login_customer_id = process.env.GOOGLE_MCC_ID.replace(/-/g, '');

    const customer = api.Customer(customerConfig);
    const rows = await customer.query(`
      SELECT
        search_term_view.search_term,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM search_term_view
      WHERE segments.date BETWEEN '${start}' AND '${end}'
        AND search_term_view.status != 'EXCLUDED'
      ORDER BY metrics.clicks DESC
      LIMIT ${parseInt(limit)}
    `);

    const terms = rows.map(r => ({
      term: r.search_term_view.search_term,
      campaign: r.campaign.name,
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      spend: Number(r.metrics.cost_micros || 0) / 1_000_000,
      conversions: Number(r.metrics.conversions || 0),
      ctr: Number(r.metrics.ctr || 0) * 100,
      cpc: Number(r.metrics.average_cpc || 0) / 1_000_000,
    }));

    res.json({ terms });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/google/demographics
router.get('/:clientId/google/demographics', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start, end } = req.query;
    const conn = await getGoogleConn(clientId);
    if (!conn) return res.json({ age: [], gender: [], device: [] });

    const { GoogleAdsApi } = await import('google-ads-api');
    const api = new GoogleAdsApi({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
    });
    const customerConfig = {
      customer_id: conn.account_id?.replace(/-/g, ''),
      refresh_token: conn.refresh_token,
    };
    if (process.env.GOOGLE_MCC_ID) customerConfig.login_customer_id = process.env.GOOGLE_MCC_ID.replace(/-/g, '');
    const customer = api.Customer(customerConfig);

    const [ageRows, genderRows, deviceRows] = await Promise.allSettled([
      customer.query(`
        SELECT age_range_view.resource_name, ad_group_criterion.age_range.type,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM age_range_view
        WHERE segments.date BETWEEN '${start}' AND '${end}'
        ORDER BY metrics.conversions DESC
      `),
      customer.query(`
        SELECT gender_view.resource_name, ad_group_criterion.gender.type,
          metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM gender_view
        WHERE segments.date BETWEEN '${start}' AND '${end}'
        ORDER BY metrics.conversions DESC
      `),
      customer.query(`
        SELECT segments.device, metrics.impressions, metrics.clicks,
          metrics.cost_micros, metrics.conversions
        FROM customer
        WHERE segments.date BETWEEN '${start}' AND '${end}'
          AND segments.device != 'UNSPECIFIED'
      `),
    ]);

    const toLabel = (s) => s?.replace(/_/g, ' ').replace('AGE RANGE ', '').replace('GENDER ', '');

    const mapGoogleRow = (r, labelKey) => ({
      label: toLabel(String(r[labelKey]?.type || r.segments?.device || '')),
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      spend: Number(r.metrics.cost_micros || 0) / 1_000_000,
      conversions: Number(r.metrics.conversions || 0),
    });

    res.json({
      age: (ageRows.value || []).map(r => mapGoogleRow(r, 'ad_group_criterion.age_range')),
      gender: (genderRows.value || []).map(r => mapGoogleRow(r, 'ad_group_criterion.gender')),
      device: (deviceRows.value || []).map(r => mapGoogleRow(r, 'segments')),
    });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/roas-history
router.get('/:clientId/roas-history', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    // Últimos 12 meses desde metrics_snapshots y campaign_metrics
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(date, 'Mon YYYY') AS month_label,
        DATE_TRUNC('month', date) AS month_start,
        SUM(spend)::numeric AS spend,
        SUM(revenue)::numeric AS revenue,
        SUM(conversions)::numeric AS conversions,
        CASE WHEN SUM(spend) > 0 THEN SUM(revenue)::numeric / SUM(spend) ELSE 0 END AS roas
      FROM metrics_snapshots
      WHERE client_id = $1
        AND date >= NOW() - INTERVAL '12 months'
      GROUP BY month_label, month_start
      ORDER BY month_start DESC
      LIMIT 12
    `, [clientId]);
    res.json({ history: rows });
  } catch (e) { next(e); }
});

// ── GET /api/report-data/:clientId/comparison
// Compara dos períodos completos lado a lado
router.get('/:clientId/comparison', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start_a, end_a, start_b, end_b, platform } = req.query;

    const query = (s, e) => pool.query(`
      SELECT
        SUM(spend)::numeric AS spend, SUM(clicks)::numeric AS clicks,
        SUM(impressions)::numeric AS impressions, SUM(conversions)::numeric AS conversions,
        SUM(revenue)::numeric AS revenue,
        CASE WHEN SUM(spend) > 0 THEN SUM(revenue)::numeric / SUM(spend) ELSE 0 END AS roas,
        CASE WHEN SUM(conversions) > 0 THEN SUM(spend)::numeric / SUM(conversions) ELSE 0 END AS cpa,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::numeric / SUM(impressions)) * 100 ELSE 0 END AS ctr
      FROM metrics_snapshots
      WHERE client_id = $1 AND date BETWEEN $2 AND $3
        ${platform && platform !== 'all' ? `AND platform = '${platform}'` : ''}
    `, [clientId, s, e]);

    const [resA, resB] = await Promise.all([query(start_a, end_a), query(start_b, end_b)]);
    res.json({ period_a: { ...resA.rows[0], start: start_a, end: end_a }, period_b: { ...resB.rows[0], start: start_b, end: end_b } });
  } catch (e) { next(e); }
});

export default router;
