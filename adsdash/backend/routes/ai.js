// ============================================================
// routes/ai.js — Análisis IA con Claude API
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';

const router = Router();
router.use(requireAuth);

// POST /api/ai/:clientId/insights
router.post('/:clientId/insights', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date y end_date son requeridos' });
    }

    // Calcular período anterior (misma duración)
    const start = new Date(start_date);
    const end = new Date(end_date);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);

    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr   = prevEnd.toISOString().split('T')[0];

    // Traer nombre del cliente
    const { rows: clientRows } = await pool.query(
      `SELECT name, country FROM clients WHERE id = $1`, [clientId]
    );
    if (!clientRows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    const client = clientRows[0];

    // Métricas período actual
    const { rows: currentMetrics } = await pool.query(`
      SELECT
        SUM(spend)::numeric       AS spend,
        SUM(clicks)::numeric      AS clicks,
        SUM(impressions)::numeric AS impressions,
        SUM(conversions)::numeric AS conversions,
        SUM(revenue)::numeric     AS revenue,
        AVG(ctr)::numeric         AS ctr,
        AVG(cpc)::numeric         AS cpc,
        AVG(roas)::numeric        AS roas
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1
        AND cm.date BETWEEN $2 AND $3
    `, [clientId, start_date, end_date]);

    // Métricas período anterior
    const { rows: prevMetrics } = await pool.query(`
      SELECT
        SUM(spend)::numeric       AS spend,
        SUM(clicks)::numeric      AS clicks,
        SUM(impressions)::numeric AS impressions,
        SUM(conversions)::numeric AS conversions,
        SUM(revenue)::numeric     AS revenue,
        AVG(ctr)::numeric         AS ctr,
        AVG(cpc)::numeric         AS cpc,
        AVG(roas)::numeric        AS roas
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1
        AND cm.date BETWEEN $2 AND $3
    `, [clientId, prevStartStr, prevEndStr]);

    // Top campañas por ROAS
    const { rows: topCampaigns } = await pool.query(`
      SELECT
        c.name,
        c.platform,
        c.status,
        SUM(cm.spend)::numeric       AS spend,
        AVG(cm.roas)::numeric        AS roas,
        SUM(cm.conversions)::numeric AS conversions,
        AVG(cm.ctr)::numeric         AS ctr
      FROM campaign_metrics cm
      JOIN campaigns c ON c.id = cm.campaign_id
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE a.client_id = $1
        AND cm.date BETWEEN $2 AND $3
      GROUP BY c.id, c.name, c.platform, c.status
      ORDER BY roas DESC NULLS LAST
      LIMIT 5
    `, [clientId, start_date, end_date]);

    // Llamar Claude API
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });
    }

    const prompt = `Analizá los datos de campañas publicitarias del cliente ${client.name} (${client.country}) para el período ${start_date} al ${end_date}.

MÉTRICAS DEL PERÍODO ACTUAL:
${JSON.stringify(currentMetrics[0] || {}, null, 2)}

MÉTRICAS DEL PERÍODO ANTERIOR (${prevStartStr} al ${prevEndStr}):
${JSON.stringify(prevMetrics[0] || {}, null, 2)}

TOP CAMPAÑAS:
${JSON.stringify(topCampaigns, null, 2)}

Respondé ÚNICAMENTE con este JSON sin texto adicional ni backticks:
{
  "summary": "Resumen ejecutivo en 2-3 oraciones enfocado en resultados de negocio y la evolución vs período anterior",
  "top_insights": [
    {
      "title": "Título corto del insight",
      "description": "Explicación concreta con datos específicos del análisis",
      "impact": "high|medium|low"
    }
  ],
  "recommendations": [
    {
      "action": "Acción concreta a tomar",
      "reason": "Por qué esta acción basada en los datos",
      "expected_impact": "Impacto esperado cuantificado si es posible",
      "priority": "high|medium|low"
    }
  ],
  "alerts": [
    {
      "type": "warning|info|danger",
      "message": "Descripción del alerta",
      "campaign": "Nombre de la campaña si aplica o null"
    }
  ]
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `Sos un analista senior de performance marketing de PTI Consulting Partner, consultora especializada en e-commerce, marketplaces y transformación digital con presencia en Latinoamérica y España. Tus análisis están orientados a resultados de negocio concretos: ventas, ROAS, costo por adquisición, crecimiento de revenue. Usás lenguaje profesional pero claro y directo. Siempre respondés en español. Cuando des recomendaciones, son específicas y accionables, no genéricas.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '{}';

    let analysis;
    try {
      analysis = JSON.parse(rawText);
    } catch {
      // Intentar limpiar backticks si Claude los incluyó
      const clean = rawText.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(clean);
    }

    res.json({
      ...analysis,
      generated_at: new Date().toISOString(),
      period: { start: start_date, end: end_date },
      client: client.name,
    });

  } catch (e) { next(e); }
});

// POST /api/ai/:clientId/campaign/:campaignId/analysis
router.post('/:clientId/campaign/:campaignId/analysis', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId, campaignId } = req.params;
    const { start_date, end_date } = req.body;

    const { rows: campaignRows } = await pool.query(
      `SELECT c.*, a.platform FROM campaigns c JOIN ad_accounts a ON a.id = c.ad_account_id WHERE c.id = $1 AND a.client_id = $2`,
      [campaignId, clientId]
    );
    if (!campaignRows.length) return res.status(404).json({ error: 'Campaña no encontrada' });
    const campaign = campaignRows[0];

    const { rows: metrics } = await pool.query(`
      SELECT date, spend, clicks, impressions, conversions, ctr, cpc, cpm, roas
      FROM campaign_metrics
      WHERE campaign_id = $1 AND date BETWEEN $2 AND $3
      ORDER BY date
    `, [campaignId, start_date, end_date]);

    const { rows: allCampaigns } = await pool.query(`
      SELECT c.name, AVG(cm.roas) AS avg_roas, AVG(cm.ctr) AS avg_ctr, SUM(cm.spend) AS total_spend
      FROM campaigns c
      JOIN ad_accounts a ON a.id = c.ad_account_id
      JOIN campaign_metrics cm ON cm.campaign_id = c.id
      WHERE a.client_id = $1 AND cm.date BETWEEN $2 AND $3
      GROUP BY c.id, c.name
      ORDER BY avg_roas DESC
    `, [clientId, start_date, end_date]);

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

    const prompt = `Realizá un análisis profundo de la campaña "${campaign.name}" (plataforma: ${campaign.platform}, estado: ${campaign.status}).

MÉTRICAS DIARIAS DE LA CAMPAÑA:
${JSON.stringify(metrics, null, 2)}

COMPARATIVA CON OTRAS CAMPAÑAS DEL CLIENTE:
${JSON.stringify(allCampaigns, null, 2)}

Respondé ÚNICAMENTE con JSON:
{
  "summary": "Análisis ejecutivo de la campaña",
  "performance": "high|medium|low",
  "key_findings": ["finding1", "finding2"],
  "recommendations": [{"action": "", "reason": "", "priority": "high|medium|low"}],
  "trend": "improving|stable|declining"
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'Sos analista senior de performance marketing de PTI Consulting Partner. Respondés siempre en español con análisis concretos y accionables.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '{}';
    let analysis;
    try { analysis = JSON.parse(rawText); }
    catch { analysis = JSON.parse(rawText.replace(/```json|```/g, '').trim()); }

    res.json({ campaign: campaign.name, ...analysis, generated_at: new Date().toISOString() });
  } catch (e) { next(e); }
});

export default router;
