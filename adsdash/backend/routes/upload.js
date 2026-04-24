// ============================================================
// routes/upload.js — Carga de Excel y Google Sheets
// Inserta en campaign_metrics Y en metrics_snapshots (compatibilidad)
// ============================================================
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireClientAccess } from '../middleware/clientAccess.js';
import { pool } from '../db.js';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(xlsx|xls|csv)$/i)) cb(null, true);
    else cb(new Error('Solo se permiten archivos .xlsx, .xls o .csv'));
  },
});

const COL_MAP = {
  campaign_name:  ['campaign', 'campaña', 'campaign name', 'nombre campaña', 'nombre de campaña', 'campaign_name', 'nombre'],
  platform:       ['platform', 'plataforma', 'canal', 'channel', 'fuente'],
  date:           ['date', 'fecha', 'day', 'día', 'periodo'],
  spend:          ['spend', 'gasto', 'cost', 'costo', 'inversión', 'inversion', 'importe', 'budget spent'],
  impressions:    ['impressions', 'impresiones', 'impr', 'alcance'],
  clicks:         ['clicks', 'clics', 'click', 'link clicks'],
  conversions:    ['conversions', 'conversiones', 'conv', 'resultados'],
  revenue:        ['revenue', 'ingresos', 'ventas', 'valor de conversión', 'conversion value', 'purchase value'],
  ctr:            ['ctr', 'click through rate', 'tasa de clics'],
  cpc:            ['cpc', 'cost per click', 'costo por clic'],
  cpm:            ['cpm', 'cost per mille', 'coste por mil'],
  roas:           ['roas', 'return on ad spend', 'retorno'],
  status:         ['status', 'estado'],
  objective:      ['objective', 'objetivo'],
};

function normalizeHeader(h) {
  return h?.toString().toLowerCase().trim().replace(/\s+/g, ' ');
}

function mapColumns(headers) {
  const mapping = {};
  for (const [field, variants] of Object.entries(COL_MAP)) {
    const idx = headers.findIndex(h => variants.includes(normalizeHeader(h)));
    if (idx !== -1) mapping[field] = idx;
  }
  return mapping;
}

function parseDate(val) {
  if (!val) return new Date().toISOString().split('T')[0];
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const d = new Date(val);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[,$%\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function detectPlatform(row, colMap) {
  if (colMap.platform === undefined) return 'google_ads';
  const val = row[colMap.platform]?.toString().toLowerCase() || '';
  if (val.includes('meta') || val.includes('facebook') || val.includes('fb') || val.includes('instagram')) return 'meta_ads';
  return 'google_ads';
}

async function insertRows(clientId, dataRows, headers, colMap) {
  let inserted = 0, skipped = 0;
  const errors = [];

  for (const [i, row] of dataRows.entries()) {
    try {
      const campaignName = row[colMap.campaign_name]?.toString().trim();
      if (!campaignName) { skipped++; continue; }

      const platform    = detectPlatform(row, colMap);
      const date        = colMap.date !== undefined ? parseDate(row[colMap.date]) : new Date().toISOString().split('T')[0];
      const spend       = parseNum(colMap.spend       !== undefined ? row[colMap.spend]       : 0);
      const impressions = parseNum(colMap.impressions  !== undefined ? row[colMap.impressions]  : 0);
      const clicks      = parseNum(colMap.clicks       !== undefined ? row[colMap.clicks]       : 0);
      const conversions = parseNum(colMap.conversions  !== undefined ? row[colMap.conversions]  : 0);
      const revenue     = parseNum(colMap.revenue      !== undefined ? row[colMap.revenue]      : 0);
      const ctr         = colMap.ctr  !== undefined ? parseNum(row[colMap.ctr])  : (impressions > 0 ? (clicks / impressions) * 100 : 0);
      const cpc         = colMap.cpc  !== undefined ? parseNum(row[colMap.cpc])  : (clicks > 0 ? spend / clicks : 0);
      const cpm         = colMap.cpm  !== undefined ? parseNum(row[colMap.cpm])  : (impressions > 0 ? (spend / impressions) * 1000 : 0);
      const roas        = colMap.roas !== undefined ? parseNum(row[colMap.roas]) : (spend > 0 ? revenue / spend : 0);
      const status      = colMap.status    !== undefined ? row[colMap.status]?.toString()    || 'active'  : 'active';
      const objective   = colMap.objective !== undefined ? row[colMap.objective]?.toString() || 'general' : 'general';

      // 1. Insertar en metrics_snapshots (tabla principal existente)
      await pool.query(`
        INSERT INTO metrics_snapshots
          (client_id, platform, date, campaign_id, campaign_name, impressions, clicks, spend, conversions, revenue)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (client_id, platform, date, campaign_id) DO UPDATE SET
          campaign_name = EXCLUDED.campaign_name,
          impressions   = EXCLUDED.impressions,
          clicks        = EXCLUDED.clicks,
          spend         = EXCLUDED.spend,
          conversions   = EXCLUDED.conversions,
          revenue       = EXCLUDED.revenue,
          fetched_at    = NOW()
      `, [
        clientId, platform, date,
        `upload_${campaignName.replace(/\s+/g, '_').toLowerCase().slice(0, 50)}`,
        campaignName, impressions, clicks, spend, conversions, revenue,
      ]);

      // 2. También insertar en campaign_metrics (para rutas nuevas de IA)
      const { rows: accountRows } = await pool.query(`
        INSERT INTO ad_accounts (client_id, platform, account_id, account_name, currency, is_active)
        VALUES ($1, $2, $3, $4, 'USD', true)
        ON CONFLICT (client_id, platform, account_id) DO UPDATE SET account_name = EXCLUDED.account_name
        RETURNING id
      `, [clientId, platform, `upload_${clientId}_${platform}`, `Upload ${platform}`]);

      const adAccountId = accountRows[0].id;

      const { rows: campRows } = await pool.query(`
        INSERT INTO campaigns (ad_account_id, platform_campaign_id, name, status, objective, synced_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (ad_account_id, platform_campaign_id) DO UPDATE
          SET name = EXCLUDED.name, status = EXCLUDED.status, synced_at = NOW()
        RETURNING id
      `, [
        adAccountId,
        `upload_${campaignName.replace(/\s+/g, '_').toLowerCase().slice(0, 80)}`,
        campaignName, status, objective,
      ]);

      const campaignId = campRows[0].id;

      await pool.query(`
        INSERT INTO campaign_metrics
          (campaign_id, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, cpm, roas)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (campaign_id, date) DO UPDATE SET
          spend = EXCLUDED.spend, impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks, conversions = EXCLUDED.conversions,
          revenue = EXCLUDED.revenue, ctr = EXCLUDED.ctr,
          cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, roas = EXCLUDED.roas,
          fetched_at = NOW()
      `, [campaignId, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, cpm, roas]);

      inserted++;
    } catch (rowErr) {
      errors.push({ row: i + 2, error: rowErr.message });
      skipped++;
    }
  }

  return { inserted, skipped, errors };
}

// POST /api/upload/:clientId/excel
router.post('/:clientId/excel', requireClientAccess, upload.single('file'), async (req, res, next) => {
  try {
    const { clientId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    const workbook  = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const rows      = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

    if (rows.length < 2) return res.status(400).json({ error: 'El archivo no tiene datos suficientes' });

    const headers  = rows[0];
    const colMap   = mapColumns(headers);

    if (colMap.campaign_name === undefined) {
      return res.status(400).json({
        error: 'No se encontró la columna de campaña',
        headers_detectados: headers,
        columnas_aceptadas: ['campaign', 'campaña', 'nombre campaña', 'campaign name'],
      });
    }

    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
    const result   = await insertRows(clientId, dataRows, headers, colMap);

    res.json({
      ok: true,
      ...result,
      errors: result.errors.slice(0, 10),
      columns_mapped: Object.keys(colMap),
      message: `Se importaron ${result.inserted} registros correctamente`,
    });
  } catch (e) { next(e); }
});

// POST /api/upload/:clientId/gsheet
router.post('/:clientId/gsheet', requireClientAccess, async (req, res, next) => {
  try {
    const { clientId } = req.params;
    const { sheet_url } = req.body;

    if (!sheet_url) return res.status(400).json({ error: 'sheet_url es requerido' });

    const match = sheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: 'URL de Google Sheets inválida' });

    const sheetId  = match[1];
    const csvUrl   = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const response = await fetch(csvUrl);

    if (!response.ok) {
      return res.status(400).json({
        error: 'No se pudo acceder al Google Sheet. Asegurate de que sea público (Compartir → Cualquier persona con el link).',
      });
    }

    const csvText  = await response.text();
    const workbook = XLSX.read(csvText, { type: 'string' });
    const rows     = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });

    if (rows.length < 2) return res.status(400).json({ error: 'El sheet no tiene datos suficientes' });

    const headers  = rows[0];
    const colMap   = mapColumns(headers);

    if (colMap.campaign_name === undefined) {
      return res.status(400).json({
        error: 'No se encontró la columna de campaña',
        headers_detectados: headers,
      });
    }

    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));
    const result   = await insertRows(clientId, dataRows, headers, colMap);

    res.json({
      ok: true,
      ...result,
      sheet_id: sheetId,
      message: `Se importaron ${result.inserted} registros desde Google Sheets`,
    });
  } catch (e) { next(e); }
});

export default router;
