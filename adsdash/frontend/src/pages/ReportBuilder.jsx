// ============================================================
// ReportBuilder.jsx — Constructor de informes modular
// Drag & drop de bloques, configuración por bloque,
// datos reales de Google Ads y Meta Ads con creatividades
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { format, subDays, subMonths, startOfMonth, endOfMonth, subYears } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api, { clientsAPI, dashboardAPI, reportsAPI } from '../services/api';

// ── Utils ───────────────────────────────────────────────────
const $ = n => '$' + Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const N = n => Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:1});
const P = n => Number(n||0).toFixed(2)+'%';
const R = n => Number(n||0).toFixed(2)+'x';
const today = () => format(new Date(),'yyyy-MM-dd');
const ago = n => format(subDays(new Date(),n),'yyyy-MM-dd');

const PRESETS = [
  {label:'Hoy',value:'today'},
  {label:'Últimos 7 días',value:'7d'},
  {label:'Últimos 14 días',value:'14d'},
  {label:'Últimos 30 días',value:'30d'},
  {label:'Este mes',value:'this_month'},
  {label:'Mes pasado',value:'last_month'},
  {label:'Personalizado',value:'custom'},
];
function presetRange(p){
  const n=new Date();
  if(p==='today') return {s:today(),e:today()};
  if(p==='7d') return {s:ago(6),e:today()};
  if(p==='14d') return {s:ago(13),e:today()};
  if(p==='30d') return {s:ago(29),e:today()};
  if(p==='this_month') return {s:format(startOfMonth(n),'yyyy-MM-dd'),e:today()};
  if(p==='last_month') return {s:format(startOfMonth(subMonths(n,1)),'yyyy-MM-dd'),e:format(endOfMonth(subMonths(n,1)),'yyyy-MM-dd')};
  return {s:ago(29),e:today()};
}

const COMP_OPTIONS=[
  {v:'none',l:'Sin comparación'},
  {v:'prev',l:'Período anterior'},
  {v:'prev_month',l:'Mes anterior'},
  {v:'same_month_ly',l:'Mismo mes año anterior'},
  {v:'prev_year',l:'Año anterior'},
  {v:'custom',l:'Personalizado'},
];
function compRange(type,s,e,cs,ce){
  const start=new Date(s),end=new Date(e);
  const days=Math.round((end-start)/(86400000))+1;
  if(type==='prev') return {s:format(subDays(start,days),'yyyy-MM-dd'),e:format(subDays(start,1),'yyyy-MM-dd')};
  if(type==='prev_month') return {s:format(startOfMonth(subMonths(start,1)),'yyyy-MM-dd'),e:format(endOfMonth(subMonths(start,1)),'yyyy-MM-dd')};
  if(type==='same_month_ly') return {s:format(startOfMonth(subYears(start,1)),'yyyy-MM-dd'),e:format(endOfMonth(subYears(start,1)),'yyyy-MM-dd')};
  if(type==='prev_year') return {s:format(subYears(start,1),'yyyy-MM-dd'),e:format(subYears(end,1),'yyyy-MM-dd')};
  if(type==='custom') return {s:cs,e:ce};
  return null;
}

// ── ALL available metrics with formatter ────────────────────
const METRICS = {
  impressions:        {label:'Impresiones',          fmt:N,   invert:false},
  clicks:             {label:'Clics',                fmt:N,   invert:false},
  ctr:                {label:'CTR',                  fmt:P,   invert:false},
  spend:              {label:'Inversión / Importe gastado', fmt:$, invert:false},
  purchases:          {label:'Compras',              fmt:N,   invert:false},
  purchase_value:     {label:'Valor de compras',     fmt:$,   invert:false},
  add_to_cart:        {label:'Agregados al carrito', fmt:N,   invert:false},
  checkout_initiated: {label:'Pagos iniciados',      fmt:N,   invert:false},
  frequency:          {label:'Frecuencia',           fmt:n=>Number(n||0).toFixed(2), invert:true},
  cost_per_purchase:  {label:'Costo por compra',     fmt:$,   invert:true},
  roas:               {label:'ROAS',                 fmt:R,   invert:false},
  ig_follows:         {label:'Seguidores Instagram', fmt:N,   invert:false},
  conversions:        {label:'Conversiones',         fmt:N,   invert:false},
  revenue:            {label:'Revenue',              fmt:$,   invert:false},
  cpa:                {label:'CPA',                  fmt:$,   invert:true},
  reach:              {label:'Alcance',              fmt:N,   invert:false},
  cpc:                {label:'CPC',                  fmt:$,   invert:true},
  cpm:                {label:'CPM',                  fmt:$,   invert:true},
};

// Mapeo bidireccional: clave de métrica → clave en kpis del overview
const kpiMap = {
  spend:       'total_spend',
  clicks:      'total_clicks',
  impressions: 'total_impressions',
  conversions: 'total_conversions',
  revenue:     'total_revenue',
  roas:        'roas',
  cpa:         'cpa',
  ctr:         'ctr',
  cpc:         'cpc',
  cpm:         'cpm',
  reach:       'reach',
  frequency:   'frequency',
};

// ── BLOCK CATALOG ───────────────────────────────────────────
const BLOCK_CATALOG = [
  {id:'kpi_grid',      cat:'KPIs',      icon:'📊', label:'Tarjetas KPI',              desc:'Métricas clave con delta vs período anterior'},
  {id:'campaigns',     cat:'Campañas',  icon:'📋', label:'Tabla de campañas',         desc:'Todas las campañas con columnas a elección'},
  {id:'timeseries',    cat:'Evolución', icon:'📈', label:'Gráfico de evolución',      desc:'Serie temporal de cualquier métrica'},
  {id:'meta_ads',      cat:'Anuncios',  icon:'🖼️', label:'Anuncios Meta (creatividades)', desc:'Top/peor anuncios con imagen o video'},
  {id:'meta_adsets',   cat:'Meta',      icon:'🗂️', label:'Conjuntos de anuncios Meta', desc:'Rendimiento por adset'},
  {id:'meta_placements',cat:'Meta',     icon:'📍', label:'Ubicaciones Meta',           desc:'Feed, Stories, Reels, etc.'},
  {id:'demographics',  cat:'Audiencia', icon:'👥', label:'Demografía',                desc:'Edad, género y dispositivo'},
  {id:'search_terms',  cat:'Google',    icon:'🔍', label:'Términos de búsqueda',      desc:'Top keywords de Google Ads'},
  {id:'roas_history',  cat:'Histórico', icon:'📅', label:'Histórico ROAS',            desc:'ROAS por mes en tabla'},
  {id:'comparison',    cat:'Extras',    icon:'↔️', label:'Comparar dos períodos',      desc:'Tabla lado a lado de dos períodos'},
  {id:'custom_text',   cat:'Extras',    icon:'✍️', label:'Nota / conclusión',         desc:'Texto libre para agregar análisis'},
  {id:'ai_summary',    cat:'IA',        icon:'🤖', label:'Análisis con IA',           desc:'Resumen automático generado por Claude'},
];

// ── Colors ──────────────────────────────────────────────────
const COLORS=['#E8A020','#378ADD','#7F77DD','#34C78A','#FF6B6B','#4ECDC4','#95A5A6','#F39C12'];
const PIE_COLORS=['#E8A020','#378ADD','#7F77DD','#34C78A','#FF6B6B','#4ECDC4'];

// ── Delta badge ─────────────────────────────────────────────
function Delta({curr,prev,invert=false,size=12}){
  if(prev==null||prev===0||curr==null) return null;
  const pct=((curr-prev)/Math.abs(prev))*100;
  const up=pct>=0; const good=invert?!up:up;
  return <span style={{fontSize:size,color:good?'#34C78A':'#FF4D6A',fontWeight:600,marginLeft:4,whiteSpace:'nowrap'}}>{up?'▲':'▼'} {Math.abs(pct).toFixed(1)}%</span>;
}

// ── Creative Modal ──────────────────────────────────────────
function CreativeModal({ad,onClose}){
  if(!ad) return null;
  const isVid=ad.creative_type==='video';
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:18,padding:24,maxWidth:660,width:'100%',maxHeight:'92vh',overflow:'auto',border:'1px solid var(--border)',boxShadow:'0 24px 60px rgba(0,0,0,0.4)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <div style={{fontWeight:700,fontSize:16}}>{ad.name||'Anuncio'}</div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:3}}>{ad.campaign_name} {ad.adset_name?`· ${ad.adset_name}`:''}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--muted)',lineHeight:1}}>✕</button>
        </div>

        {/* Media */}
        <div style={{borderRadius:12,overflow:'hidden',marginBottom:16,background:'#000',minHeight:200,display:'flex',alignItems:'center',justifyContent:'center',maxHeight:420}}>
          {ad.image_url?(
            isVid?(
              <video src={ad.image_url} controls poster={ad.image_url} style={{maxWidth:'100%',maxHeight:420,objectFit:'contain'}}/>
            ):(
              <img src={ad.image_url} alt="" style={{maxWidth:'100%',maxHeight:420,objectFit:'contain'}} onError={e=>{e.target.parentElement.style.background='#111';e.target.style.display='none';}}/>
            )
          ):(
            <div style={{color:'#fff',opacity:0.4,fontSize:13,padding:40,textAlign:'center'}}>
              {isVid?'▶ Video — conectá Meta Ads para ver el video':'🖼 Sin previsualización disponible'}<br/>
              <span style={{fontSize:11}}>Conectá la cuenta de Meta para ver creatividades</span>
            </div>
          )}
        </div>

        {/* Copy del anuncio */}
        {(ad.headline||ad.body)&&(
          <div style={{background:'var(--bg)',borderRadius:8,padding:'10px 14px',marginBottom:14,fontSize:13}}>
            {ad.headline&&<div style={{fontWeight:600,marginBottom:4}}>{ad.headline}</div>}
            {ad.body&&<div style={{color:'var(--muted)',lineHeight:1.5}}>{ad.body}</div>}
            {ad.cta&&<div style={{marginTop:6,fontSize:11,color:'#E8A020',fontWeight:600}}>CTA: {ad.cta?.replace(/_/g,' ')}</div>}
          </div>
        )}

        {/* Métricas */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {[
            ['Inversión',$(ad.spend)],
            ['ROAS',R(ad.roas)],
            ['Compras',N(ad.purchases||ad.conversions)],
            ['Valor compras',$(ad.purchase_value||ad.revenue)],
            ['Ag. carrito',N(ad.add_to_cart)],
            ['Checkout',N(ad.checkout_initiated)],
            ['Costo/compra',$(ad.cost_per_purchase||ad.cpa)],
            ['CTR',P(ad.ctr)],
            ['Clics',N(ad.clicks)],
            ['Impresiones',N(ad.impressions)],
            ['Frecuencia',Number(ad.frequency||0).toFixed(2)],
            ['Alcance',N(ad.reach)],
            ['CPM',$(ad.cpm)],
            ['Seg. IG',N(ad.ig_follows)],
            ['CPC',$(ad.cpc)],
          ].map(([l,v])=>(
            <div key={l} style={{background:'var(--bg)',borderRadius:7,padding:'8px 10px',border:'1px solid var(--border)'}}>
              <div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:3}}>{l}</div>
              <div style={{fontSize:15,fontWeight:700}}>{v}</div>
            </div>
          ))}
        </div>
        {ad.ad_url&&<a href={ad.ad_url} target="_blank" rel="noopener noreferrer" style={{display:'block',marginTop:14,textAlign:'center',fontSize:12,color:'#E8A020',textDecoration:'none'}}>Ver en Biblioteca de Anuncios de Meta →</a>}
      </div>
    </div>
  );
}

// ── Block renderer ──────────────────────────────────────────
function BlockRenderer({block,clientId,rangeStart,rangeEnd,compStart,compEnd,useComp,dashData,prevData}){
  const [bdata,setBdata]=useState(null);
  const [loading,setLoading]=useState(false);
  const [selectedAd,setSelectedAd]=useState(null);

  const cfg=block.config||{};
  const platform=cfg.platform||'both';
  const limit=cfg.limit||10;
  const sortBy=cfg.sort||'roas';
  const sortOrder=cfg.order||'desc';

  useEffect(()=>{
    if(!clientId||!rangeStart||!rangeEnd) return;
    const loads={
      meta_ads:()=>api.get(`/report-data/${clientId}/meta/ads`,{params:{start:rangeStart,end:rangeEnd,sort:sortBy,order:sortOrder,limit}}),
      meta_adsets:()=>api.get(`/report-data/${clientId}/meta/adsets`,{params:{start:rangeStart,end:rangeEnd}}),
      meta_placements:()=>api.get(`/report-data/${clientId}/meta/placements`,{params:{start:rangeStart,end:rangeEnd}}),
      demographics:()=>api.get(`/report-data/${clientId}/${platform==='meta'?'meta':'google'}/demographics`,{params:{start:rangeStart,end:rangeEnd}}),
      search_terms:()=>api.get(`/report-data/${clientId}/google/search-terms`,{params:{start:rangeStart,end:rangeEnd,limit:limit||50}}),
      roas_history:()=>api.get(`/report-data/${clientId}/roas-history`),
      comparison:()=>api.get(`/report-data/${clientId}/comparison`,{params:{start_a:rangeStart,end_a:rangeEnd,start_b:compStart||rangeStart,end_b:compEnd||rangeEnd}}),
    };
    if(loads[block.type]){
      setLoading(true);
      loads[block.type]().then(r=>setBdata(r.data)).catch(()=>setBdata(null)).finally(()=>setLoading(false));
    }
  },[block.type,clientId,rangeStart,rangeEnd,sortBy,sortOrder,limit,platform]);

  const kpis=dashData?.kpis||{};
  const prevKpis=prevData?.kpis||{};
  const campaigns=(dashData?.campaigns||[]).filter(c=>platform==='both'||(platform==='google'&&c.platform==='google_ads')||(platform==='meta'&&c.platform==='meta_ads'));

  const selectedMetrics=cfg.metrics||['impressions','clicks','ctr','spend','purchases','purchase_value','add_to_cart','checkout_initiated','cost_per_purchase','roas'];
  const selectedCols=cfg.columns||['name','platform','status','spend','purchases','purchase_value','add_to_cart','checkout_initiated','cost_per_purchase','roas','ctr'];

  if(loading) return(
    <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>
      <div style={{width:24,height:24,border:'2px solid var(--border)',borderTopColor:'#E8A020',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}}/>
      Cargando…
    </div>
  );

  // ── KPI Grid ──────────────────────────────────────────────
  if(block.type==='kpi_grid'){
    const getVal=(key)=>{
      // kpiMap[key] da la clave en el objeto kpis del overview (ej: spend → total_spend)
      const mapped=kpiMap[key];
      if(mapped && kpis[mapped]!=null) return kpis[mapped];
      return kpis[key]||0;
    };
    const getPrev=(key)=>{
      const mapped=kpiMap[key];
      if(mapped && prevKpis[mapped]!=null) return prevKpis[mapped];
      return prevKpis[key]||0;
    };
    const cols=Math.min(selectedMetrics.length,4);
    return(
      <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap:12}}>
        {selectedMetrics.map(key=>{
          const m=METRICS[key];
          if(!m) return null;
          const val=getVal(key);
          const prev=getPrev(key);
          return(
            <div key={key} style={{background:'var(--surface)',border:'1px solid var(--border)',borderTop:`3px solid ${COLORS[selectedMetrics.indexOf(key)%COLORS.length]}`,borderRadius:12,padding:'14px 18px'}}>
              <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>{m.label}</div>
              <div style={{fontSize:22,fontWeight:700,display:'flex',alignItems:'baseline',flexWrap:'wrap',gap:2}}>
                <span>{m.fmt(val)}</span>
                {useComp&&prev!=null&&<Delta curr={parseFloat(val)} prev={parseFloat(prev)} invert={m.invert}/>}
              </div>
              {useComp&&prev!=null&&<div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Anterior: {m.fmt(prev)}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Campaigns Table ───────────────────────────────────────
  if(block.type==='campaigns'){
    // Filtros configurables
    const statusFilter=cfg.statusFilter||'all';
    const filteredCampaigns=campaigns.filter(c=>{
      if(statusFilter==='active') return ['ENABLED','ACTIVE'].includes(c.status?.toUpperCase());
      if(statusFilter==='paused') return ['PAUSED','INACTIVE'].includes(c.status?.toUpperCase());
      if(statusFilter==='with_spend') return Number(c.spend||0)>0;
      return true;
    });

    const COL_DEFS={
      name:{label:'Campaña',render:c=><td style={{padding:'9px 12px',fontWeight:500,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</td>},
      platform:{label:'Plataforma',render:c=><td style={{padding:'9px 12px'}}><span style={{fontSize:10,padding:'2px 7px',borderRadius:4,fontWeight:700,background:c.platform==='google_ads'?'rgba(66,133,244,0.15)':'rgba(127,119,221,0.15)',color:c.platform==='google_ads'?'#378ADD':'#7F77DD'}}>{c.platform==='google_ads'?'Google':'Meta'}</span></td>},
      status:{label:'Estado',render:c=>{const active=['ENABLED','ACTIVE'].includes(c.status?.toUpperCase());return<td style={{padding:'9px 12px'}}><span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11}}><span style={{width:6,height:6,borderRadius:'50%',background:active?'#34C78A':'#FFB547'}}/>{active?'Activa':'Pausada'}</span></td>;}},
      spend:{label:'Inversión',render:c=><td style={{padding:'9px 12px',fontWeight:600}}>{$(c.spend)}</td>},
      impressions:{label:'Impresiones',render:c=><td style={{padding:'9px 12px'}}>{N(c.impressions)}</td>},
      clicks:{label:'Clics',render:c=><td style={{padding:'9px 12px'}}>{N(c.clicks)}</td>},
      ctr:{label:'CTR',render:c=><td style={{padding:'9px 12px'}}>{P(c.ctr)}</td>},
      purchases:{label:'Compras',render:c=><td style={{padding:'9px 12px'}}>{N(c.purchases||c.conversions)}</td>},
      purchase_value:{label:'Valor compras',render:c=><td style={{padding:'9px 12px'}}>{$(c.purchase_value||c.revenue)}</td>},
      add_to_cart:{label:'Ag. carrito',render:c=><td style={{padding:'9px 12px'}}>{N(c.add_to_cart)}</td>},
      checkout_initiated:{label:'Checkout',render:c=><td style={{padding:'9px 12px'}}>{N(c.checkout_initiated)}</td>},
      cost_per_purchase:{label:'Costo/compra',render:c=><td style={{padding:'9px 12px'}}>{$(c.cost_per_purchase||c.cpa)}</td>},
      roas:{label:'ROAS',render:c=><td style={{padding:'9px 12px',color:c.roas>=4?'#34C78A':c.roas>0?'#E8A020':'var(--muted)',fontWeight:600}}>{R(c.roas)}</td>},
      frequency:{label:'Frecuencia',render:c=><td style={{padding:'9px 12px'}}>{Number(c.frequency||0).toFixed(2)}</td>},
      cpm:{label:'CPM',render:c=><td style={{padding:'9px 12px'}}>{$(c.cpm)}</td>},
      cpc:{label:'CPC',render:c=><td style={{padding:'9px 12px'}}>{$(c.cpc)}</td>},
      reach:{label:'Alcance',render:c=><td style={{padding:'9px 12px'}}>{N(c.reach)}</td>},
    };
    return(
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr>{selectedCols.map(k=>{const d=COL_DEFS[k];return d?<th key={k} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{d.label}</th>:null;})}</tr>
          </thead>
          <tbody>
            {filteredCampaigns.map((c,i)=>(
              <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                {selectedCols.map(k=>{const d=COL_DEFS[k];return d?d.render(c):null;})}
              </tr>
            ))}
            {filteredCampaigns.length===0&&<tr><td colSpan={selectedCols.length} style={{padding:30,textAlign:'center',color:'var(--muted)',fontSize:13}}>Sin campañas para este filtro</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Timeseries ────────────────────────────────────────────
  if(block.type==='timeseries'){
    const metric=cfg.metric||'spend';
    const chartKind=cfg.chartKind||'line';
    const ts=Object.values((dashData?.timeSeries||[]).reduce((m,r)=>{
      if(!m[r.date]) m[r.date]={date:r.date,spend:0,clicks:0,impressions:0,conversions:0,revenue:0,ctr:0};
      m[r.date].spend+=r.spend||0; m[r.date].clicks+=r.clicks||0;
      m[r.date].impressions+=r.impressions||0; m[r.date].conversions+=r.conversions||0;
      m[r.date].revenue+=r.revenue||0;
      return m;
    },{})).sort((a,b)=>a.date.localeCompare(b.date));
    const mMeta=METRICS[metric]||METRICS.spend;
    const Col=chartKind==='bar'?BarChart:LineChart;
    const Series=chartKind==='bar'?Bar:Line;
    if(!ts.length) return <div style={{padding:30,textAlign:'center',color:'var(--muted)',fontSize:13}}>Sin datos de serie temporal</div>;
    return(
      <ResponsiveContainer width="100%" height={220}>
        <Col data={ts}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
          <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={d=>d.slice(5)}/>
          <YAxis tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)}/>
          <Tooltip contentStyle={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}} formatter={v=>[mMeta.fmt(v),mMeta.label]}/>
          {chartKind==='bar'?<Bar dataKey={metric} fill={COLORS[0]} radius={[4,4,0,0]}/>:<Line type="monotone" dataKey={metric} stroke={COLORS[0]} strokeWidth={2} dot={false}/>}
        </Col>
      </ResponsiveContainer>
    );
  }

  // ── Meta Ads con creatividades ────────────────────────────
  if(block.type==='meta_ads'){
    const ads=(bdata?.ads||[]);
    const viewMode=cfg.viewMode||'table';
    const thumbSize=cfg.thumbSize||'medium';
    const visibleCols=cfg.visibleCols||['impressions','clicks','ctr','spend','purchases','purchase_value','add_to_cart','checkout_initiated','frequency','cost_per_purchase','roas'];
    const thumbDims={small:{w:52,h:36},medium:{w:90,h:64},large:{w:140,h:100}};
    const td=thumbDims[thumbSize]||thumbDims.medium;
    const ALL_AD_COLS=[
      {key:'impressions',       label:'Impresiones',         render:ad=>N(ad.impressions)},
      {key:'clicks',            label:'Clics',               render:ad=>N(ad.clicks)},
      {key:'ctr',               label:'CTR',                 render:ad=>P(ad.ctr)},
      {key:'spend',             label:'Inversión',           render:ad=>$(ad.spend)},
      {key:'purchases',         label:'Compras',             render:ad=>N(ad.purchases)},
      {key:'purchase_value',    label:'Valor de compras',    render:ad=>$(ad.purchase_value)},
      {key:'add_to_cart',       label:'Ag. al carrito',      render:ad=>N(ad.add_to_cart)},
      {key:'checkout_initiated',label:'Checkout iniciado',   render:ad=>N(ad.checkout_initiated)},
      {key:'frequency',         label:'Frecuencia',          render:ad=>Number(ad.frequency||0).toFixed(2)},
      {key:'cost_per_purchase', label:'Costo por compra',    render:ad=>$(ad.cost_per_purchase)},
      {key:'roas',              label:'ROAS',                render:ad=><span style={{color:ad.roas>=4?'#34C78A':ad.roas>0?'#E8A020':'var(--muted)',fontWeight:600}}>{R(ad.roas)}</span>},
      {key:'ig_follows',        label:'Seguidores IG',       render:ad=>N(ad.ig_follows)},
      {key:'cpm',               label:'CPM',                 render:ad=>$(ad.cpm)},
      {key:'reach',             label:'Alcance',             render:ad=>N(ad.reach)},
      {key:'cpc',               label:'CPC',                 render:ad=>$(ad.cpc)},
    ];
    const cols=ALL_AD_COLS.filter(c=>visibleCols.includes(c.key));
    if(!ads.length) return(
      <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>
        No hay anuncios de Meta para este período.<br/>
        <span style={{fontSize:11}}>Conectá Meta Ads desde la sección Conexiones.</span>
      </div>
    );
    if(viewMode==='grid') return(
      <>
        <div style={{display:'grid',gridTemplateColumns:`repeat(auto-fill,minmax(${thumbSize==='large'?220:thumbSize==='medium'?180:150}px,1fr))`,gap:12}}>
          {ads.map((ad,i)=>(
            <div key={ad.ad_id||i} onClick={()=>setSelectedAd(ad)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor='#E8A020'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              <div style={{width:'100%',aspectRatio:'1/1',background:'#111',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',position:'relative'}}>
                {ad.image_url?(<img src={ad.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.target.style.display='none';}}/>):(<span style={{fontSize:32,opacity:0.3}}>{ad.creative_type==='video'?'▶':'🖼'}</span>)}
                {ad.creative_type==='video'&&<div style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.6)',borderRadius:4,padding:'2px 6px',fontSize:10,color:'#fff'}}>▶ Video</div>}
                <div style={{position:'absolute',top:6,left:6,background:'rgba(0,0,0,0.6)',borderRadius:4,padding:'2px 6px',fontSize:10,color:'#fff',fontWeight:700}}>#{i+1}</div>
              </div>
              <div style={{padding:'10px 12px'}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ad.name}</div>
                <div style={{fontSize:10,color:'var(--muted)',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ad.campaign_name}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                  {cols.slice(0,4).map(c=>(<div key={c.key} style={{background:'var(--surface)',borderRadius:5,padding:'5px 7px'}}><div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',marginBottom:1}}>{c.label}</div><div style={{fontSize:12,fontWeight:600}}>{c.render(ad)}</div></div>))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {selectedAd&&<CreativeModal ad={selectedAd} onClose={()=>setSelectedAd(null)}/>}
      </>
    );
    return(
      <>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr>
                {['#','Creatividad','Anuncio','Campaña'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>)}
                {cols.map(c=><th key={c.key} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ads.map((ad,i)=>(
                <tr key={ad.ad_id||i} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  onClick={()=>setSelectedAd(ad)}>
                  <td style={{padding:'9px 12px',color:'var(--muted)',fontWeight:600,fontSize:11}}>{i+1}</td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{width:td.w,height:td.h,borderRadius:6,overflow:'hidden',background:'#111',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',flexShrink:0}}>
                      {ad.image_url?(<img src={ad.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.target.style.display='none';}}/>):(<span style={{fontSize:thumbSize==='large'?28:thumbSize==='medium'?20:14,opacity:0.4}}>{ad.creative_type==='video'?'▶':'🖼'}</span>)}
                      {ad.creative_type==='video'&&<div style={{position:'absolute',bottom:2,right:2,background:'rgba(0,0,0,0.7)',borderRadius:3,padding:'1px 4px',fontSize:9,color:'#fff'}}>▶</div>}
                    </div>
                  </td>
                  <td style={{padding:'9px 12px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{ad.name}</td>
                  <td style={{padding:'9px 12px',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--muted)',fontSize:11}}>{ad.campaign_name}</td>
                  {cols.map(c=><td key={c.key} style={{padding:'9px 12px'}}>{c.render(ad)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedAd&&<CreativeModal ad={selectedAd} onClose={()=>setSelectedAd(null)}/>}
      </>
    );
  }

  // ── Meta Adsets ───────────────────────────────────────────
  if(block.type==='meta_adsets'){
    const adsets=bdata?.adsets||[];
    if(!adsets.length) return <div style={{padding:30,textAlign:'center',color:'var(--muted)',fontSize:13}}>Sin conjuntos de anuncios</div>;
    return(
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['Conjunto','Campaña','Objetivo','Inversión','ROAS','Conv.','CTR','Alcance'].map(h=>(<th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>))}</tr></thead>
          <tbody>
            {adsets.map((s,i)=>(
              <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'9px 12px',fontWeight:500,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</td>
                <td style={{padding:'9px 12px',color:'var(--muted)',fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.campaign_name}</td>
                <td style={{padding:'9px 12px',fontSize:11}}>{s.goal?.replace(/_/g,' ')}</td>
                <td style={{padding:'9px 12px',fontWeight:600}}>{$(s.spend)}</td>
                <td style={{padding:'9px 12px',color:s.roas>=4?'#34C78A':s.roas>0?'#E8A020':'var(--muted)',fontWeight:600}}>{R(s.roas)}</td>
                <td style={{padding:'9px 12px'}}>{N(s.conversions)}</td>
                <td style={{padding:'9px 12px'}}>{P(s.ctr)}</td>
                <td style={{padding:'9px 12px'}}>{N(s.reach)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Meta Placements ───────────────────────────────────────
  if(block.type==='meta_placements'){
    const places=bdata?.placements||[];
    if(!places.length) return <div style={{padding:30,textAlign:'center',color:'var(--muted)',fontSize:13}}>Sin datos de ubicaciones</div>;
    return(
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['Plataforma','Posición','Inversión','Clics','CTR','Conv.','ROAS'].map(h=>(<th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>))}</tr></thead>
          <tbody>
            {places.map((p,i)=>(
              <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'9px 12px',fontWeight:500,textTransform:'capitalize'}}>{p.platform}</td>
                <td style={{padding:'9px 12px',color:'var(--muted)',fontSize:11,textTransform:'capitalize'}}>{p.position?.replace(/_/g,' ')}</td>
                <td style={{padding:'9px 12px',fontWeight:600}}>{$(p.spend)}</td>
                <td style={{padding:'9px 12px'}}>{N(p.clicks)}</td>
                <td style={{padding:'9px 12px'}}>{P(p.ctr)}</td>
                <td style={{padding:'9px 12px'}}>{N(p.conversions)}</td>
                <td style={{padding:'9px 12px',color:p.roas>=4?'#34C78A':p.roas>0?'#E8A020':'var(--muted)',fontWeight:600}}>{R(p.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Demographics ──────────────────────────────────────────
  if(block.type==='demographics'){
    const demo=bdata||{age:[],gender:[],device:[]};
    const show=cfg.show||['age','gender','device'];
    const totalConv=(arr)=>arr.reduce((s,r)=>s+Number(r.conversions||0),0)||1;
    const DemoPie=({data,title})=>{
      if(!data?.length) return null;
      const total=totalConv(data);
      const pieData=data.map((r,i)=>({name:r.label,value:Number(r.conversions||0),fill:PIE_COLORS[i%PIE_COLORS.length]}));
      return(
        <div>
          <div style={{fontSize:12,fontWeight:600,marginBottom:10,textAlign:'center'}}>{title}</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" outerRadius={65} dataKey="value" nameKey="name">
              {pieData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
            </Pie>
            <Tooltip formatter={(v)=>[`${((v/total)*100).toFixed(1)}% (${N(v)} conv.)`,'']}/>
            <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:10}}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    };
    return(
      <div style={{display:'grid',gridTemplateColumns:`repeat(${show.length},1fr)`,gap:16}}>
        {show.includes('age')&&<DemoPie data={demo.age} title="Por edad"/>}
        {show.includes('gender')&&<DemoPie data={demo.gender} title="Por género"/>}
        {show.includes('device')&&<DemoPie data={demo.device} title="Por dispositivo"/>}
      </div>
    );
  }

  // ── Search Terms ──────────────────────────────────────────
  if(block.type==='search_terms'){
    const terms=bdata?.terms||[];
    if(!terms.length) return <div style={{padding:30,textAlign:'center',color:'var(--muted)',fontSize:13}}>Sin términos de búsqueda. Conectá Google Ads.</div>;
    return(
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr>{['#','Término','Campaña','Clics','Conv.','CTR','CPC'].map(h=>(<th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>))}</tr></thead>
          <tbody>
            {terms.slice(0,limit||50).map((t,i)=>(
              <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'9px 12px',color:'var(--muted)',fontSize:11}}>{i+1}</td>
                <td style={{padding:'9px 12px',fontWeight:500}}>{t.term}</td>
                <td style={{padding:'9px 12px',color:'var(--muted)',fontSize:11,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.campaign}</td>
                <td style={{padding:'9px 12px'}}>{N(t.clicks)}</td>
                <td style={{padding:'9px 12px'}}>{N(t.conversions)}</td>
                <td style={{padding:'9px 12px'}}>{P(t.ctr)}</td>
                <td style={{padding:'9px 12px'}}>{$(t.cpc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── ROAS History ──────────────────────────────────────────
  if(block.type==='roas_history'){
    const hist=bdata?.history||[];
    if(!hist.length) return <div style={{padding:30,textAlign:'center',color:'var(--muted)',fontSize:13}}>Sin histórico disponible</div>;
    return(
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr>{['Mes','ROAS','Inversión','Conversiones','Revenue'].map(h=>(<th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)'}}>{h}</th>))}</tr></thead>
        <tbody>
          {hist.map((r,i)=>(
            <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
              <td style={{padding:'9px 12px',fontWeight:500}}>{r.month_label}</td>
              <td style={{padding:'9px 12px',color:Number(r.roas)>=4?'#34C78A':Number(r.roas)>0?'#E8A020':'var(--muted)',fontWeight:700}}>{R(r.roas)}</td>
              <td style={{padding:'9px 12px'}}>{$(r.spend)}</td>
              <td style={{padding:'9px 12px'}}>{N(r.conversions)}</td>
              <td style={{padding:'9px 12px'}}>{$(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // ── Comparison Table ──────────────────────────────────────
  if(block.type==='comparison'){
    const pa=bdata?.period_a,pb=bdata?.period_b;
    if(!pa||!pb) return <div style={{padding:30,textAlign:'center',color:'var(--muted)',fontSize:13}}>Configurá los dos períodos en el panel de configuración</div>;
    const metrics2=['spend','roas','conversions','ctr','cpa','clicks','impressions','revenue'];
    return(
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr>
            <th style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)'}}>Métrica</th>
            <th style={{padding:'8px 12px',textAlign:'right',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)'}}>{pa.start} → {pa.end}</th>
            <th style={{padding:'8px 12px',textAlign:'right',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)'}}>{pb.start} → {pb.end}</th>
            <th style={{padding:'8px 12px',textAlign:'right',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)'}}>Variación</th>
          </tr>
        </thead>
        <tbody>
          {metrics2.map(k=>{
            const m=METRICS[k]; if(!m) return null;
            const va=parseFloat(pa[k]||0),vb=parseFloat(pb[k]||0);
            return(
              <tr key={k} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'9px 12px',fontWeight:500}}>{m.label}</td>
                <td style={{padding:'9px 12px',textAlign:'right',fontWeight:600}}>{m.fmt(va)}</td>
                <td style={{padding:'9px 12px',textAlign:'right',color:'var(--muted)'}}>{m.fmt(vb)}</td>
                <td style={{padding:'9px 12px',textAlign:'right'}}><Delta curr={va} prev={vb} invert={m.invert}/></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  // ── Custom Text ───────────────────────────────────────────
  if(block.type==='custom_text'){
    return(
      <div style={{fontSize:14,lineHeight:1.8,color:'var(--text)',whiteSpace:'pre-wrap'}}>
        {cfg.text||<span style={{color:'var(--muted)',fontStyle:'italic'}}>Hacé clic en "Configurar" para agregar tu texto o conclusión.</span>}
      </div>
    );
  }

  // ── AI Summary ────────────────────────────────────────────
  if(block.type==='ai_summary'){
    return <AIBlock clientId={clientId} rangeStart={rangeStart} rangeEnd={rangeEnd}/>;
  }

  return <div style={{padding:20,color:'var(--muted)',fontSize:13}}>Bloque no disponible aún</div>;
}

// ── Block Config Panel ──────────────────────────────────────
function BlockConfigPanel({block,onChange,onClose}){
  const [cfg,setCfg]=useState(block.config||{});
  const save=()=>{onChange({...block,config:cfg});onClose();};
  const upd=(k,v)=>setCfg(p=>({...p,[k]:v}));

  const allMetrics=Object.entries(METRICS);
  const allCols=['name','platform','status','spend','clicks','impressions','conversions','ctr','cpc','cpm','roas','revenue','cpa'];
  const selectedM=cfg.metrics||['spend','roas','conversions','ctr'];
  const selectedC=cfg.columns||['name','platform','spend','conversions','roas','ctr'];

  return(
    <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:14,padding:20,width:340,maxHeight:'80vh',overflow:'auto',border:'1px solid var(--border)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:14}}>Configurar: {block.label}</div>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:18}}>✕</button>
      </div>

      {/* Title override */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>TÍTULO DEL BLOQUE</div>
        <input value={cfg.title||''} onChange={e=>upd('title',e.target.value)} placeholder={block.label}
          style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}/>
      </div>

      {/* KPI metrics selector */}
      {block.type==='kpi_grid'&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>MÉTRICAS A MOSTRAR</div>
          {allMetrics.map(([k,m])=>(
            <label key={k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer'}}>
              <input type="checkbox" checked={selectedM.includes(k)} onChange={()=>upd('metrics',selectedM.includes(k)?selectedM.filter(x=>x!==k):[...selectedM,k])}/>
              <span style={{fontSize:12}}>{m.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Campaign columns */}
      {block.type==='campaigns'&&(
        <>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>FILTRAR CAMPAÑAS</div>
            <select value={cfg.statusFilter||'all'} onChange={e=>upd('statusFilter',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              <option value="all">Todas las campañas</option>
              <option value="active">Solo activas</option>
              <option value="paused">Solo pausadas</option>
              <option value="with_spend">Solo con inversión</option>
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>PLATAFORMA</div>
            <select value={cfg.platform||'both'} onChange={e=>upd('platform',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              <option value="both">Todas</option><option value="google">Solo Google</option><option value="meta">Solo Meta</option>
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>COLUMNAS DE LA TABLA</div>
            {[
              ['name','Campaña'],['platform','Plataforma'],['status','Estado'],
              ['spend','Inversión'],['impressions','Impresiones'],['clicks','Clics'],
              ['ctr','CTR'],['purchases','Compras'],['purchase_value','Valor de compras'],
              ['add_to_cart','Ag. al carrito'],['checkout_initiated','Checkout iniciado'],
              ['cost_per_purchase','Costo por compra'],['roas','ROAS'],
              ['frequency','Frecuencia'],['cpm','CPM'],['cpc','CPC'],['reach','Alcance'],
            ].map(([k,l])=>(
              <label key={k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer'}}>
                <input type="checkbox" checked={selectedC.includes(k)} onChange={()=>upd('columns',selectedC.includes(k)?selectedC.filter(x=>x!==k):[...selectedC,k])}/>
                <span style={{fontSize:12}}>{l}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {/* Timeseries options */}
      {block.type==='timeseries'&&(
        <>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>MÉTRICA</div>
            <select value={cfg.metric||'spend'} onChange={e=>upd('metric',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              {allMetrics.map(([k,m])=><option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>TIPO DE GRÁFICO</div>
            <div style={{display:'flex',gap:6}}>
              {[['line','Líneas'],['bar','Barras']].map(([v,l])=>(
                <button key={v} onClick={()=>upd('chartKind',v)} style={{flex:1,padding:'7px',borderRadius:6,border:'1px solid var(--border)',background:cfg.chartKind===v?'#E8A020':'var(--bg)',color:cfg.chartKind===v?'#fff':'var(--text)',cursor:'pointer',fontSize:12}}>{l}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Meta Ads options */}
      {block.type==='meta_ads'&&(
        <>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>VISTA</div>
            <div style={{display:'flex',gap:6}}>
              {[['table','Tabla'],['grid','Grilla']].map(([v,l])=>(
                <button key={v} onClick={()=>upd('viewMode',v)} style={{flex:1,padding:'7px',borderRadius:6,border:'1px solid var(--border)',background:(cfg.viewMode||'table')===v?'#E8A020':'var(--bg)',color:(cfg.viewMode||'table')===v?'#fff':'var(--text)',cursor:'pointer',fontSize:12}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>TAMAÑO DE IMAGEN</div>
            <div style={{display:'flex',gap:6}}>
              {[['small','Chica'],['medium','Mediana'],['large','Grande']].map(([v,l])=>(
                <button key={v} onClick={()=>upd('thumbSize',v)} style={{flex:1,padding:'6px 2px',borderRadius:6,border:'1px solid var(--border)',background:(cfg.thumbSize||'medium')===v?'#E8A020':'var(--bg)',color:(cfg.thumbSize||'medium')===v?'#fff':'var(--text)',cursor:'pointer',fontSize:11}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>COLUMNAS A MOSTRAR</div>
            {[
              ['impressions','Impresiones'],
              ['clicks','Clics'],
              ['ctr','CTR'],
              ['spend','Inversión / Importe gastado'],
              ['purchases','Compras'],
              ['purchase_value','Valor de compras'],
              ['add_to_cart','Agregados al carrito'],
              ['checkout_initiated','Pagos iniciados / Checkout'],
              ['frequency','Frecuencia'],
              ['cost_per_purchase','Costo por compra'],
              ['roas','ROAS'],
              ['ig_follows','Seguidores Instagram'],
              ['cpm','CPM'],
              ['reach','Alcance'],
              ['cpc','CPC'],
            ].map(([k,l])=>{
              const def=['impressions','clicks','ctr','spend','purchases','purchase_value','add_to_cart','checkout_initiated','frequency','cost_per_purchase','roas'];
              const cur=cfg.visibleCols||def;
              return(
                <label key={k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer'}}>
                  <input type="checkbox" checked={cur.includes(k)} onChange={()=>upd('visibleCols',cur.includes(k)?cur.filter(x=>x!==k):[...cur,k])}/>
                  <span style={{fontSize:12}}>{l}</span>
                </label>
              );
            })}
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>ORDENAR POR</div>
            <select value={cfg.sort||'roas'} onChange={e=>upd('sort',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              {[['roas','ROAS'],['spend','Inversión'],['conversions','Conversiones'],['ctr','CTR'],['clicks','Clics'],['cpm','CPM'],['reach','Alcance']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>ORDEN</div>
            <div style={{display:'flex',gap:6}}>
              {[['desc','Mayor primero'],['asc','Menor primero']].map(([v,l])=>(
                <button key={v} onClick={()=>upd('order',v)} style={{flex:1,padding:'7px',borderRadius:6,border:'1px solid var(--border)',background:(cfg.order||'desc')===v?'#E8A020':'var(--bg)',color:(cfg.order||'desc')===v?'#fff':'var(--text)',cursor:'pointer',fontSize:11}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>CANTIDAD</div>
            <select value={cfg.limit||10} onChange={e=>upd('limit',Number(e.target.value))} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              {[5,10,15,20,30,50].map(n=><option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
        </>
      )}

      {/* Demographics */}
      {block.type==='demographics'&&(
        <>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>PLATAFORMA</div>
            <select value={cfg.platform||'meta'} onChange={e=>upd('platform',e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              <option value="meta">Meta Ads</option><option value="google">Google Ads</option>
            </select>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>GRÁFICOS A MOSTRAR</div>
            {[['age','Por edad'],['gender','Por género'],['device','Por dispositivo']].map(([k,l])=>(
              <label key={k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer'}}>
                <input type="checkbox" checked={(cfg.show||['age','gender','device']).includes(k)}
                  onChange={()=>{const s=cfg.show||['age','gender','device'];upd('show',s.includes(k)?s.filter(x=>x!==k):[...s,k]);}}/>
                <span style={{fontSize:12}}>{l}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {/* Search terms */}
      {block.type==='search_terms'&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>CANTIDAD DE TÉRMINOS</div>
          <select value={cfg.limit||50} onChange={e=>upd('limit',Number(e.target.value))} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
            {[10,25,50,100].map(n=><option key={n} value={n}>Top {n}</option>)}
          </select>
        </div>
      )}

      {/* Custom text */}
      {block.type==='custom_text'&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:5}}>TEXTO / CONCLUSIÓN</div>
          <textarea value={cfg.text||''} onChange={e=>upd('text',e.target.value)}
            placeholder="Escribí tu análisis, conclusiones o notas..."
            style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'8px 10px',color:'var(--text)',fontSize:13,outline:'none',minHeight:120,resize:'vertical',fontFamily:'inherit'}}/>
        </div>
      )}

      <button onClick={save} style={{width:'100%',padding:'10px',borderRadius:8,border:'none',background:'#E8A020',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,marginTop:4}}>
        Guardar configuración
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────
export default function ReportBuilder(){
  const [clients,setClients]=useState([]);
  const [clientId,setClientId]=useState('');
  const [preset,setPreset]=useState('30d');
  const [customS,setCustomS]=useState(ago(29));
  const [customE,setCustomE]=useState(today());
  const [compType,setCompType]=useState('prev');
  const [compCustomS,setCompCustomS]=useState(ago(59));
  const [compCustomE,setCompCustomE]=useState(ago(30));
  const [useComp,setUseComp]=useState(true);

  const [blocks,setBlocks]=useState([]);
  const [dashData,setDashData]=useState(null);
  const [prevData,setPrevData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [generated,setGenerated]=useState(false);

  const [configBlock,setConfigBlock]=useState(null); // block being configured
  const [dragIdx,setDragIdx]=useState(null);
  const [dragOver,setDragOver]=useState(null);

  const [reportName,setReportName]=useState('');
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [shareUrl,setShareUrl]=useState('');
  const [sharing,setSharing]=useState(false);
  const [savedReportId,setSavedReportId]=useState(null);

  const [catalogOpen,setCatalogOpen]=useState(false);

  useEffect(()=>{
    clientsAPI.list().then(r=>{
      const list=r.data||[];
      setClients(list);
      if(list.length) setClientId(String(list[0].id));
    });
  },[]);

  const getRange=()=>preset==='custom'?{s:customS,e:customE}:presetRange(preset);

  const generate=useCallback(async()=>{
    if(!clientId) return;
    setLoading(true);setGenerated(false);
    try{
      const {s,e}=getRange();
      const r=await dashboardAPI.overview(clientId,s,e);
      setDashData(r.data);
      if(useComp&&compType!=='none'){
        const cr=compRange(compType,s,e,compCustomS,compCustomE);
        if(cr){
          const pr=await dashboardAPI.overview(clientId,cr.s,cr.e);
          setPrevData(pr.data);
        }
      }else{setPrevData(null);}
      setGenerated(true);
    }catch(e2){console.error(e2);}finally{setLoading(false);}
  },[clientId,preset,customS,customE,useComp,compType,compCustomS,compCustomE]);

  const addBlock=(cat)=>{
    const def=BLOCK_CATALOG.find(b=>b.id===cat);
    if(!def) return;
    const newBlock={...def,uid:Date.now()+'_'+Math.random().toString(36).slice(2),label:def.label,type:def.id,config:{}};
    setBlocks(p=>[...p,newBlock]);
    setCatalogOpen(false);
  };

  const removeBlock=(uid)=>setBlocks(p=>p.filter(b=>b.uid!==uid));
  const moveUp=(i)=>{ if(i===0) return; setBlocks(p=>{const n=[...p];[n[i-1],n[i]]=[n[i],n[i-1]];return n;}); };
  const moveDown=(i)=>{ if(i===blocks.length-1) return; setBlocks(p=>{const n=[...p];[n[i],n[i+1]]=[n[i+1],n[i]];return n;}); };

  const updateBlock=(uid,updated)=>setBlocks(p=>p.map(b=>b.uid===uid?{...updated,uid}:b));

  const handleDragStart=(i)=>setDragIdx(i);
  const handleDragOver=(e,i)=>{e.preventDefault();setDragOver(i);};
  const handleDrop=(i)=>{
    if(dragIdx==null||dragIdx===i){setDragIdx(null);setDragOver(null);return;}
    setBlocks(p=>{const n=[...p];const [m]=n.splice(dragIdx,1);n.splice(i,0,m);return n;});
    setDragIdx(null);setDragOver(null);
  };

  const handleSave=async()=>{
    if(!reportName.trim()||!clientId) return;
    setSaving(true);
    try{
      const {s,e}=getRange();
      const res=await reportsAPI.create({client_id:clientId,name:reportName,config:{
        start_date:s,end_date:e,preset,comp_type:compType,
        blocks:blocks.map(b=>({type:b.type,label:b.label,config:b.config})),
      }});
      // POST /reports devuelve el row directamente
      const newId=res.data?.id||res.data?.report?.id;
      setSavedReportId(newId);
      setSaved(true);
      setTimeout(()=>setSaved(false),3000);
    }catch(e){
      console.error('Error guardando reporte:',e);
      alert('Error al guardar el informe: '+(e.response?.data?.error||e.message));
    }finally{setSaving(false);}
  };

  const handleShare=async()=>{
    if(!savedReportId){
      alert('Primero guardá el informe con un nombre y hacé clic en Guardar');
      return;
    }
    setSharing(true);
    try{
      const res=await reportsAPI.share(savedReportId);
      const url=res.data?.share_url||res.data?.url||'';
      setShareUrl(url);
      if(url) navigator.clipboard.writeText(url).catch(()=>{});
    }catch(e){
      console.error('Error generando link:',e);
      alert('Error al generar el link: '+(e.response?.data?.error||e.message));
    }finally{setSharing(false);}
  };

  const copyShareUrl=()=>{
    if(!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    alert('Link copiado al portapapeles');
  };

  const handlePrint=()=>{
    const {s,e}=getRange();
    const clientName=clients.find(c=>String(c.id)===clientId)?.name||'Cliente';
    // Print preview opens the current view
    window.print();
  };

  const {s:rangeStart,e:rangeEnd}=getRange();
  const compR=useComp&&compType!=='none'?compRange(compType,rangeStart,rangeEnd,compCustomS,compCustomE):null;

  const CATEGORIES=[...new Set(BLOCK_CATALOG.map(b=>b.cat))];

  return(
    <div style={{display:'flex',height:'calc(100vh - 60px)',overflow:'hidden'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}} @media print{.no-print{display:none!important;} .print-area{padding:20px;}}`}</style>

      {/* ── LEFT PANEL ── */}
      <div className="no-print" style={{width:268,flexShrink:0,background:'var(--surface)',borderRight:'1px solid var(--border)',overflow:'auto',display:'flex',flexDirection:'column',fontSize:13}}>
        <div style={{padding:'14px 14px 0'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>Constructor de informes</div>
          <div style={{fontSize:11,color:'var(--muted)',marginBottom:14}}>Armá el informe con los bloques que necesitás</div>

          {/* Cliente */}
          <div style={{marginBottom:11}}>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Cliente</div>
            <select value={clientId} onChange={e=>setClientId(e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Período */}
          <div style={{marginBottom:11}}>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Período</div>
            <select value={preset} onChange={e=>setPreset(e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              {PRESETS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {preset==='custom'&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginTop:5}}>
                <input type="date" value={customS} onChange={e=>setCustomS(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:5,padding:'5px 7px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
                <input type="date" value={customE} onChange={e=>setCustomE(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:5,padding:'5px 7px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
              </div>
            )}
          </div>

          {/* Comparación */}
          <div style={{marginBottom:14}}>
            <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',marginBottom:7}}>
              <div onClick={()=>setUseComp(!useComp)} style={{width:32,height:18,borderRadius:9,background:useComp?'#E8A020':'var(--border)',position:'relative',cursor:'pointer',flexShrink:0}}>
                <div style={{width:14,height:14,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:useComp?16:2,transition:'left 0.2s'}}/>
              </div>
              <span style={{fontSize:12,color:'var(--text)'}}>Comparar períodos</span>
            </label>
            {useComp&&(
              <>
                <select value={compType} onChange={e=>setCompType(e.target.value)} style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:12,outline:'none',marginBottom:5}}>
                  {COMP_OPTIONS.filter(o=>o.v!=='none').map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                {compType==='custom'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
                    <input type="date" value={compCustomS} onChange={e=>setCompCustomS(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:5,padding:'5px 7px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
                    <input type="date" value={compCustomE} onChange={e=>setCompCustomE(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:5,padding:'5px 7px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
                  </div>
                )}
              </>
            )}
          </div>

          <button onClick={generate} disabled={loading||!clientId} style={{width:'100%',padding:'10px',borderRadius:8,border:'none',background:'#E8A020',color:'#fff',cursor:loading?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:loading?0.6:1,marginBottom:14}}>
            {loading?'Cargando…':'▶ Cargar datos'}
          </button>
        </div>

        {/* Bloques en el informe */}
        <div style={{borderTop:'1px solid var(--border)',padding:'12px 14px 0',flex:1,overflow:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Bloques ({blocks.length})</div>
            <button onClick={()=>setCatalogOpen(true)} style={{padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',cursor:'pointer',fontSize:11,fontWeight:600}}>+ Agregar</button>
          </div>

          {blocks.length===0&&(
            <div style={{textAlign:'center',padding:'20px 10px',color:'var(--muted)',fontSize:12}}>
              Hacé clic en <strong>+ Agregar</strong> para agregar bloques al informe
            </div>
          )}

          {blocks.map((b,i)=>(
            <div key={b.uid}
              draggable onDragStart={()=>handleDragStart(i)} onDragOver={e=>handleDragOver(e,i)} onDrop={()=>handleDrop(i)} onDragEnd={()=>{setDragIdx(null);setDragOver(null);}}
              style={{background:dragOver===i?'rgba(232,160,32,0.1)':'var(--bg)',border:`1px solid ${dragOver===i?'#E8A020':'var(--border)'}`,borderRadius:8,padding:'8px 10px',marginBottom:6,cursor:'grab',transition:'border-color 0.15s'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:14,flexShrink:0}}>{b.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.config?.title||b.label}</div>
                  <div style={{fontSize:10,color:'var(--muted)'}}>{b.cat}</div>
                </div>
                <div style={{display:'flex',gap:3,flexShrink:0}}>
                  <button onClick={()=>moveUp(i)} disabled={i===0} style={{padding:'2px 5px',borderRadius:4,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'var(--muted)',fontSize:10,opacity:i===0?0.3:1}}>↑</button>
                  <button onClick={()=>moveDown(i)} disabled={i===blocks.length-1} style={{padding:'2px 5px',borderRadius:4,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'var(--muted)',fontSize:10,opacity:i===blocks.length-1?0.3:1}}>↓</button>
                  <button onClick={()=>setConfigBlock(b)} style={{padding:'2px 5px',borderRadius:4,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'#E8A020',fontSize:10}}>⚙</button>
                  <button onClick={()=>removeBlock(b.uid)} style={{padding:'2px 5px',borderRadius:4,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'#FF4D6A',fontSize:10}}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Save / Export */}
        <div style={{padding:14,borderTop:'1px solid var(--border)'}}>
          <input type="text" placeholder="Nombre del informe…" value={reportName} onChange={e=>setReportName(e.target.value)}
            style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:12,outline:'none',marginBottom:8}}/>
          <div style={{display:'flex',gap:6,marginBottom:6}}>
            <button onClick={handleSave} disabled={saving||!generated||!reportName.trim()} style={{flex:1,padding:'8px',borderRadius:7,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',cursor:'pointer',fontSize:11,opacity:(!generated||!reportName.trim())?0.4:1}}>
              {saved?'✓ Guardado':saving?'…':'💾 Guardar'}
            </button>
            <button onClick={handlePrint} disabled={!generated} style={{flex:1,padding:'8px',borderRadius:7,border:'none',background:'#0A1628',color:'#fff',cursor:generated?'pointer':'not-allowed',fontSize:11,opacity:generated?1:0.4}}>
              ⬇ PDF
            </button>
          </div>
          <button onClick={handleShare} disabled={sharing} style={{width:'100%',padding:'9px',borderRadius:7,border:'1px solid rgba(55,138,221,0.4)',background:'rgba(55,138,221,0.08)',color:'#378ADD',cursor:'pointer',fontSize:12,fontWeight:500,marginBottom:shareUrl?6:0,opacity:sharing?0.6:1}}>
            {sharing?'Generando link…':'🔗 Compartir con link'}
          </button>
          {!savedReportId&&<div style={{fontSize:10,color:'var(--muted)',textAlign:'center',marginBottom:4}}>Guardá primero el informe</div>}
          {shareUrl&&(
            <div style={{background:'rgba(52,199,138,0.08)',border:'1px solid rgba(52,199,138,0.3)',borderRadius:7,padding:'10px 12px',marginTop:4}}>
              <div style={{fontSize:11,color:'#34C78A',marginBottom:6,fontWeight:600}}>✓ Link generado — válido 30 días</div>
              <div style={{fontSize:10,color:'var(--muted)',wordBreak:'break-all',marginBottom:8,lineHeight:1.5}}>{shareUrl}</div>
              <button onClick={copyShareUrl} style={{width:'100%',padding:'6px',borderRadius:5,border:'1px solid rgba(52,199,138,0.4)',background:'rgba(52,199,138,0.1)',color:'#34C78A',cursor:'pointer',fontSize:11,fontWeight:600}}>
                Copiar link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{flex:1,overflow:'auto',background:'var(--bg)'}}>
        {!generated&&!loading&&(
          <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'var(--muted)',padding:40}}>
            <div style={{fontSize:52,marginBottom:16}}>📊</div>
            <div style={{fontWeight:700,fontSize:20,color:'var(--text)',marginBottom:10}}>Construí tu informe</div>
            <p style={{fontSize:14,textAlign:'center',maxWidth:400,lineHeight:1.7}}>
              1. Elegí el cliente y el período<br/>
              2. Hacé clic en <strong>▶ Cargar datos</strong><br/>
              3. Agregá los bloques que querés con <strong>+ Agregar</strong><br/>
              4. Configurá cada bloque según tus necesidades
            </p>
          </div>
        )}

        {loading&&(
          <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'var(--muted)'}}>
            <div style={{width:36,height:36,border:'3px solid var(--border)',borderTopColor:'#E8A020',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            <div style={{fontSize:14}}>Cargando datos de la cuenta…</div>
          </div>
        )}

        {generated&&!loading&&(
          <div className="print-area" style={{padding:28,maxWidth:1200,margin:'0 auto'}}>
            {/* Header del informe */}
            <div style={{marginBottom:24,paddingBottom:16,borderBottom:'2px solid #E8A020',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
              <div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>
                  {clients.find(c=>String(c.id)===clientId)?.name}
                  {useComp&&compR&&<span style={{marginLeft:10,padding:'2px 8px',background:'rgba(232,160,32,0.1)',borderRadius:4,color:'#E8A020',fontSize:11}}>vs {COMP_OPTIONS.find(o=>o.v===compType)?.l}</span>}
                </div>
                <div style={{fontSize:22,fontWeight:700}}>{reportName||'Informe de performance'}</div>
                <div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>{rangeStart} → {rangeEnd}</div>
              </div>
              <div style={{fontSize:11,color:'var(--muted)',textAlign:'right'}}>
                <div>Generado {format(new Date(),'dd/MM/yyyy HH:mm')}</div>
                <div style={{marginTop:2,fontWeight:600,color:'#E8A020'}}>PTI Analytics</div>
              </div>
            </div>

            {blocks.length===0&&(
              <div style={{textAlign:'center',padding:'60px 20px',color:'var(--muted)',background:'var(--surface)',borderRadius:14,border:'2px dashed var(--border)'}}>
                <div style={{fontSize:36,marginBottom:12}}>🧩</div>
                <div style={{fontWeight:600,fontSize:16,marginBottom:8,color:'var(--text)'}}>El informe está vacío</div>
                <p style={{fontSize:13}}>Usá el panel izquierdo para agregar bloques al informe</p>
              </div>
            )}

            {blocks.map((block,i)=>(
              <div key={block.uid} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',marginBottom:18}}>
                {/* Block header */}
                <div className="no-print" style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--bg)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:16}}>{block.icon}</span>
                    <div>
                      <span style={{fontWeight:600,fontSize:14}}>{block.config?.title||block.label}</span>
                      <span style={{fontSize:11,color:'var(--muted)',marginLeft:8}}>{block.cat}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>setConfigBlock(block)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'#E8A020',fontSize:12}}>⚙ Configurar</button>
                    <button onClick={()=>removeBlock(block.uid)} style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'#FF4D6A',fontSize:12}}>✕</button>
                  </div>
                </div>
                {/* Block title (print) */}
                <div style={{padding:'12px 18px 0',fontWeight:700,fontSize:14,display:'none'}} className="print-title">{block.config?.title||block.label}</div>
                {/* Block content */}
                <div style={{padding:18}}>
                  <BlockRenderer
                    block={block} clientId={clientId}
                    rangeStart={rangeStart} rangeEnd={rangeEnd}
                    compStart={compR?.s} compEnd={compR?.e}
                    useComp={useComp&&compType!=='none'}
                    dashData={dashData} prevData={prevData}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CATALOG MODAL ── */}
      {catalogOpen&&(
        <div onClick={()=>setCatalogOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:18,padding:24,width:'100%',maxWidth:700,maxHeight:'85vh',overflow:'auto',border:'1px solid var(--border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
              <div style={{fontWeight:700,fontSize:17}}>Agregar bloque</div>
              <button onClick={()=>setCatalogOpen(false)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--muted)'}}>✕</button>
            </div>
            {CATEGORIES.map(cat=>(
              <div key={cat} style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:10,paddingBottom:6,borderBottom:'1px solid var(--border)'}}>{cat}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
                  {BLOCK_CATALOG.filter(b=>b.cat===cat).map(b=>(
                    <button key={b.id} onClick={()=>addBlock(b.id)}
                      style={{padding:'12px 14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',textAlign:'left',transition:'border-color 0.15s'}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor='#E8A020'}
                      onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
                      <div style={{fontSize:20,marginBottom:6}}>{b.icon}</div>
                      <div style={{fontSize:13,fontWeight:600,marginBottom:3}}>{b.label}</div>
                      <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.4}}>{b.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BLOCK CONFIG MODAL ── */}
      {configBlock&&(
        <div onClick={()=>setConfigBlock(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:600,padding:20}}>
          <BlockConfigPanel
            block={configBlock}
            onChange={(updated)=>updateBlock(configBlock.uid,updated)}
            onClose={()=>setConfigBlock(null)}
          />
        </div>
      )}
    </div>
  );
}
